import { DurableObject } from 'cloudflare:workers';
import { Client } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { ClientActionSchema, JoinSchema, WorldSim, newCharacter, type CharacterData, type ServerMsg } from '@ero/shared';
import { AuthError, verifyToken } from './auth';
import { PgCharacterStore } from './db/pg-store';
import type { Env } from './env';
import { NameTakenError, VersionConflict, type CharacterStore, type StoredCharacter } from './store';
import { VaultStore } from './vault';

const TICK_MS = 100;
const SAVE_MS = 10_000;
const MAX_MSG = 2048;
const BUCKET_CAP = 80;
const BUCKET_REFILL_PER_SEC = 50;

interface Session {
  ws: WebSocket;
  pid: string;
  accountId?: string;
  charId?: string;
  version: number;
  joined: boolean;
  joining: boolean;
  closed: boolean;
  tokens: number;
  lastRefill: number;
  strikes: number;
  lastChat: number;
  saving: Promise<void>;
  closing?: Promise<void>;
}

/** Opens a short-lived connection per operation; Hyperdrive pools the real Neon connections. */
class HyperdriveStore implements CharacterStore {
  constructor(private hd: Hyperdrive) {}
  private async run<T>(fn: (s: PgCharacterStore) => Promise<T>): Promise<T> {
    const client = new Client({ connectionString: this.hd.connectionString });
    await client.connect();
    try {
      return await fn(new PgCharacterStore(drizzle(client)));
    } finally {
      await client.end().catch(() => undefined);
    }
  }
  load(a: string) { return this.run((s) => s.load(a)); }
  create(a: string, d: CharacterData) { return this.run((s) => s.create(a, d)); }
  save(a: string, id: string, d: CharacterData, v: number) { return this.run((s) => s.save(a, id, d, v)); }
  audit(a: string, c: string | null, action: string, detail: Record<string, unknown>) { return this.run((s) => s.audit(a, c, action, detail)); }
}

/**
 * One authoritative game region/shard. Players of the same region are spread over shards
 * ("starter-1", "starter-2"...) by the Worker, each shard capped at MAX_ROOM_PLAYERS.
 */
export class WorldRoom extends DurableObject<Env> {
  private sim = new WorldSim();
  private sessions = new Set<Session>();
  private byPid = new Map<string, Session>();
  private tickTimer: ReturnType<typeof setInterval> | undefined;
  private saveTimer: ReturnType<typeof setInterval> | undefined;
  private store: CharacterStore;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = env.HYPERDRIVE ? new HyperdriveStore(env.HYPERDRIVE) : new VaultStore(env.CHAR_VAULT);
  }

  private get cap() { return Math.max(1, Number(this.env.MAX_ROOM_PLAYERS ?? 40) || 40); }

  override async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/capacity') return Response.json({ count: this.sessions.size, cap: this.cap });
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    if (this.sessions.size >= this.cap) return Response.json({ error: 'room_full' }, { status: 503 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    server.accept();
    this.attach(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  /* --------------------------------------------------------------- sessions */

  private attach(ws: WebSocket) {
    const s: Session = {
      ws, pid: crypto.randomUUID().slice(0, 8), version: 0, joined: false, joining: false, closed: false,
      tokens: BUCKET_CAP, lastRefill: Date.now(), strikes: 0, lastChat: 0, saving: Promise.resolve(),
    };
    this.sessions.add(s);
    this.byPid.set(s.pid, s);
    const joinDeadline = setTimeout(() => { if (!s.joined) void this.closeSession(s, 4408, 'join timeout'); }, 10_000);
    ws.addEventListener('message', (ev) => { void this.onMessage(s, ev.data).catch((e) => console.error('msg error', e)); });
    ws.addEventListener('close', () => { clearTimeout(joinDeadline); void this.closeSession(s); });
    ws.addEventListener('error', () => { clearTimeout(joinDeadline); void this.closeSession(s); });
  }

  private rawSend(s: Session, msg: ServerMsg) {
    try { s.ws.send(JSON.stringify(msg)); } catch { /* socket already gone */ }
  }

  private strike(s: Session, why: string) {
    s.strikes += 1;
    this.rawSend(s, { t: 'err', code: 'bad_message', msg: why });
    if (s.strikes > 25) void this.closeSession(s, 1008, 'protocol abuse');
  }

  private async onMessage(s: Session, data: unknown) {
    if (s.closed) return;
    const now = Date.now();
    s.tokens = Math.min(BUCKET_CAP, s.tokens + ((now - s.lastRefill) / 1000) * BUCKET_REFILL_PER_SEC);
    s.lastRefill = now;
    if (s.tokens < 1) { s.strikes += 1; if (s.strikes > 200) void this.closeSession(s, 1008, 'rate limit'); return; }
    s.tokens -= 1;
    if (typeof data !== 'string' || data.length > MAX_MSG) return this.strike(s, 'invalid frame');
    let json: unknown;
    try { json = JSON.parse(data); } catch { return this.strike(s, 'invalid json'); }

    if (!s.joined) {
      if (s.joining) return;
      const j = JoinSchema.safeParse(json);
      if (!j.success) return this.strike(s, 'expected join');
      s.joining = true;
      try { await this.join(s, j.data.token, j.data.name); } finally { s.joining = false; }
      return;
    }
    const a = ClientActionSchema.safeParse(json);
    if (!a.success) return this.strike(s, 'invalid action');
    if (a.data.t === 'chat') {
      if (now - s.lastChat < 800) return this.rawSend(s, { t: 'err', code: 'slow_down', msg: 'You are chatting too fast.' });
      s.lastChat = now;
    }
    this.sim.handle(s.pid, a.data);
    this.flush();
  }

  private async join(s: Session, token: string, name?: string) {
    let accountId: string;
    try {
      accountId = (await verifyToken(token, this.env)).sub;
    } catch (e) {
      const kind = e instanceof AuthError ? e.kind : 'invalid';
      console.warn('auth rejected', kind, e instanceof Error ? e.message : String(e)); // never log the token itself
      const msg = e instanceof AuthError && kind !== 'invalid' ? e.message : 'Authentication failed. Please sign in again.';
      this.rawSend(s, { t: 'err', code: 'auth', msg });
      return void this.closeSession(s, 4401, 'auth');
    }
    // One live session per account in this room: finish the old one (incl. its final save) first.
    for (const o of [...this.sessions]) {
      if (o !== s && o.accountId === accountId) {
        this.rawSend(o, { t: 'err', code: 'replaced', msg: 'Signed in from another place.' });
        await this.closeSession(o, 4000, 'replaced');
      }
    }
    let stored: StoredCharacter | null;
    try {
      stored = await this.store.load(accountId);
      if (!stored) {
        if (!name) return this.rawSend(s, { t: 'err', code: 'need_name', msg: 'Choose a character name (3-16 letters/numbers).' });
        stored = await this.store.create(accountId, newCharacter(name, this.sim.map));
        void this.store.audit?.(accountId, stored.id, 'character_created', { name }).catch(() => undefined);
      }
    } catch (e) {
      if (e instanceof NameTakenError) return this.rawSend(s, { t: 'err', code: 'name_taken', msg: 'That name is taken.' });
      console.error('store error', e);
      this.rawSend(s, { t: 'err', code: 'server', msg: 'Could not load your character. Try again.' });
      return void this.closeSession(s, 1011, 'store');
    }
    if (s.closed) return;
    s.accountId = accountId;
    s.charId = stored.id;
    s.version = stored.version;
    s.joined = true;
    this.sim.addPlayer(s.pid, accountId, stored.data);
    this.ensureTimers();
    this.flush();
  }

  private closeSession(s: Session, code = 1000, reason = ''): Promise<void> {
    if (s.closing) return s.closing;
    s.closing = (async () => {
      s.closed = true;
      this.sessions.delete(s);
      this.byPid.delete(s.pid);
      if (s.joined) {
        const data = this.sim.removePlayer(s.pid);
        if (data) await this.persist(s, data);
      }
      try { s.ws.close(code, reason.slice(0, 100)); } catch { /* already closed */ }
      if (this.sessions.size === 0) this.stopTimers();
    })();
    this.ctx.waitUntil(s.closing);
    return s.closing;
  }

  /** Serialised, version-checked save. A conflict means another session wrote this character: stop this one. */
  private persist(s: Session, data: CharacterData): Promise<void> {
    if (!s.accountId || !s.charId) return Promise.resolve();
    s.saving = s.saving.then(async () => {
      try {
        s.version = await this.store.save(s.accountId!, s.charId!, data, s.version);
      } catch (e) {
        if (e instanceof VersionConflict) {
          this.rawSend(s, { t: 'err', code: 'session_conflict', msg: 'This character was changed by another session.' });
          if (!s.closed) void this.closeSession(s, 4009, 'conflict');
        } else console.error('save failed', e);
      }
    });
    return s.saving;
  }

  /* ------------------------------------------------------------------ loops */

  private ensureTimers() {
    if (!this.tickTimer) this.tickTimer = setInterval(() => { this.sim.tick(); this.flush(); }, TICK_MS);
    if (!this.saveTimer) this.saveTimer = setInterval(() => this.saveDirty(), SAVE_MS);
  }
  private stopTimers() {
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.saveTimer) clearInterval(this.saveTimer);
    this.tickTimer = this.saveTimer = undefined;
  }

  private saveDirty() {
    for (const pid of this.sim.takeDirty()) {
      const s = this.byPid.get(pid);
      const data = this.sim.snapshotCharacter(pid);
      if (s && data) void this.persist(s, data);
    }
  }

  private flush() {
    for (const o of this.sim.drain()) {
      const s = this.byPid.get(o.to);
      if (s && !s.closed) this.rawSend(s, o.msg);
    }
  }
}
