import { ServerMsgGuard } from './guard';
import type { ClientAction, ServerMsg } from '@ero/shared';
import { pushChat, useGame, world } from '../state/store';

export interface SocketOptions {
  url: string;
  getToken: () => Promise<string>;
}

/** Close codes after which reconnecting is pointless (auth failure, replaced by another tab, conflict). */
const FATAL_CODES = new Set([4000, 4009, 4401]);

/**
 * WebSocket client with automatic reconnection. Everything the server says is funnelled into the zustand store
 * (UI state) or the `world` object (per-frame data for Phaser).
 */
export class GameSocket {
  private ws: WebSocket | undefined;
  private name: string | undefined;
  private closedByUs = false;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private seq = 0;
  private lastSent = { dx: 0, dy: 0, run: false, at: 0 };

  constructor(private opts: SocketOptions) {}

  connect(name?: string) {
    if (name) this.name = name;
    this.closedByUs = false;
    clearTimeout(this.retryTimer);
    useGame.getState().set({ conn: this.attempt === 0 ? 'connecting' : 'reconnecting', needName: null });
    let ws: WebSocket;
    try { ws = new WebSocket(this.opts.url); } catch { return this.scheduleRetry(); }
    this.ws = ws;
    ws.onopen = async () => {
      try {
        const token = await this.opts.getToken();
        ws.send(JSON.stringify({ t: 'join', token, ...(this.name ? { name: this.name } : {}) }));
      } catch (e) {
        useGame.getState().set({ fatal: (e as Error).message, conn: 'closed' });
        this.close();
      }
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return;
      let msg: ServerMsg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (!ServerMsgGuard(msg)) return;
      this.onMessage(msg);
    };
    ws.onclose = (ev) => {
      if (this.ws === ws) this.ws = undefined;
      if (this.closedByUs) return;
      if (FATAL_CODES.has(ev.code)) {
        const s = useGame.getState();
        if (!s.fatal) s.set({ fatal: ev.code === 4000 ? 'You signed in from another place.' : 'Disconnected by the server.', conn: 'closed' });
        return;
      }
      if (useGame.getState().needName) return; // waiting for the player to choose a name
      this.scheduleRetry();
    };
    ws.onerror = () => { /* onclose follows */ };
  }

  /** Called by the name prompt. The server keeps the socket open waiting for a second `join`; if it timed out, reconnect. */
  async submitName(name: string) {
    this.name = name;
    useGame.getState().set({ needName: null, conn: 'connecting' });
    if (this.ws?.readyState === WebSocket.OPEN) {
      try { this.ws.send(JSON.stringify({ t: 'join', token: await this.opts.getToken(), name })); return; } catch { /* fall through */ }
    }
    this.connect(name);
  }

  private scheduleRetry() {
    this.attempt += 1;
    useGame.getState().set({ conn: 'reconnecting' });
    const delay = Math.min(8000, 400 * 2 ** Math.min(this.attempt, 5)) + Math.random() * 300;
    this.retryTimer = setTimeout(() => { if (!this.closedByUs) this.connect(); }, delay);
  }

  private onMessage(m: ServerMsg) {
    const g = useGame.getState();
    switch (m.t) {
      case 'welcome':
        this.attempt = 0;
        world.reset();
        world.serverNow = m.now; world.receivedAt = performance.now();
        g.set({ conn: 'online', playerId: m.id, self: m.state, needName: null, fatal: null, dialog: null });
        break;
      case 'snap':
        world.players = m.players; world.monsters = m.monsters;
        world.serverNow = m.now; world.receivedAt = performance.now(); world.version++;
        break;
      case 'state': g.set({ self: m.state }); break;
      case 'ev':
        world.events.push(m.ev);
        if (world.events.length > 64) world.events.splice(0, world.events.length - 64);
        if (m.ev.k === 'toast') g.toast(m.ev.text);
        else if (m.ev.k === 'quest') g.toast(m.ev.text, 'good');
        else if (m.ev.k === 'level') g.toast(`Level up! ${m.ev.skill} is now ${m.ev.level}`, 'good');
        else if (m.ev.k === 'died') g.toast('You were knocked out and woke up at the village square.', 'error');
        break;
      case 'dialog': g.set({ dialog: { npc: m.npc, name: m.name, lines: m.lines, ...(m.shop ? { shop: true } : {}) }, panel: null }); break;
      case 'chat': pushChat(m.from, m.text); break;
      case 'err':
        if (m.code === 'need_name' || m.code === 'name_taken') g.set({ needName: m.msg, conn: 'idle' });
        else if (m.code === 'auth') g.set({ fatal: 'Authentication failed. Please sign in again.', conn: 'closed' });
        else if (m.code === 'replaced' || m.code === 'session_conflict') g.set({ fatal: m.msg, conn: 'closed' });
        else if (m.code !== 'bad_message') g.toast(m.msg, 'error');
        break;
    }
  }

  send(a: ClientAction) {
    if (this.ws?.readyState === WebSocket.OPEN && useGame.getState().conn === 'online') this.ws.send(JSON.stringify(a));
  }

  /** Movement intent: sent on change, and refreshed periodically so the server's stale-input guard never stops us. */
  sendInput(dx: number, dy: number, run: boolean, now = performance.now()) {
    const l = this.lastSent;
    const changed = dx !== l.dx || dy !== l.dy || run !== l.run;
    const moving = dx !== 0 || dy !== 0;
    if (!changed && !(moving && now - l.at > 250)) return;
    this.lastSent = { dx, dy, run, at: now };
    this.send({ t: 'input', dx, dy, run, seq: ++this.seq });
  }

  close() {
    this.closedByUs = true;
    clearTimeout(this.retryTimer);
    this.ws?.close(1000, 'bye');
    this.ws = undefined;
  }
}
