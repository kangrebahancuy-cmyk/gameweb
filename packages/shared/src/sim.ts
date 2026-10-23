/**
 * Authoritative world simulation. Pure TypeScript with no I/O so the exact same code runs
 * inside a Cloudflare Durable Object and inside unit tests. Clients only send *intents*;
 * every reward (XP, loot, crops, coins, quest progress) is decided here.
 */
import {
  ACTIVE_SKILLS, CROPS, CROP_BY_SEED, FARM_EXPANSION_COST, ITEMS, MONSTERS, NPCS, QUESTS, SHOP_STOCK,
  STARTING_COINS, STARTING_ITEMS, type ActiveSkillId, type MonsterDef, type QuestDef,
} from './content';
import { addItem, canAdd, canAddAll, countItem, emptyInventory, removeItem } from './inventory';
import { type GameMap, buildStarterMap } from './map';
import { RUN_SPEED, WALK_SPEED, collides, dirFromVector, stepMove, type Dir } from './movement';
import {
  TILE, clamp, hitChance, levelFromXp, maxHpForLevel, monsterHitChance, mulberry32, playerMaxHit, randInt, seasonAt, xpForLevel,
} from './rules';
import type {
  CharacterData, ClientAction, GameEvent, MonsterView, PlayerView, SelfState, ServerMsg,
} from './types';

export interface Outgoing { to: string; msg: ServerMsg }
export interface SimOptions { now?: () => number; rng?: () => number; map?: GameMap }

export const INTEREST_RADIUS = 480;
export const ATTACK_REACH = 30;
export const ATTACK_COOLDOWN_MS = 1200;
export const FARM_REACH = 44;
export const NPC_REACH = 60;
export const SHOP_REACH = 80;
const INPUT_STALE_MS = 700;
const DEAD_VISIBLE_MS = 1600;

interface Player {
  id: string;
  accountId: string;
  char: CharacterData;
  x: number; y: number;
  dir: Dir;
  moving: boolean;
  input: { dx: number; dy: number; run: boolean; at: number };
  ack: number;
  energy: number;
  lastAttack: number;
  lastDamaged: number;
  lastRegen: number;
  stateDirty: boolean;
  persistDirty: boolean;
}

interface Monster {
  id: string;
  def: MonsterDef;
  zone: { cx: number; cy: number; radius: number };
  x: number; y: number;
  homeX: number; homeY: number;
  hp: number;
  dir: Dir;
  st: MonsterView['st'];
  target: string | null;
  nextAttack: number;
  hurtUntil: number;
  attackUntil: number;
  nextWander: number;
  wanderUntil: number;
  wx: number; wy: number;
  respawnAt: number;
  diedAt: number;
  damage: Map<string, number>;
}

export function newCharacter(name: string, map: GameMap): CharacterData {
  const skills = Object.fromEntries(ACTIVE_SKILLS.map((s) => [s, s === 'hitpoints' ? xpForLevel(10) : 0])) as Record<ActiveSkillId, number>;
  const inventory = emptyInventory();
  for (const it of STARTING_ITEMS) addItem(inventory, it.id, it.qty);
  return {
    name, x: map.spawn.x, y: map.spawn.y, hp: maxHpForLevel(10), coins: STARTING_COINS, skills, inventory,
    plots: [], farmRows: 2, quests: {},
  };
}

export class WorldSim {
  readonly map: GameMap;
  private now: () => number;
  private rng: () => number;
  private players = new Map<string, Player>();
  private monsters = new Map<string, Monster>();
  private out: Outgoing[] = [];
  private lastTick: number;

  constructor(opts: SimOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.rng = opts.rng ?? Math.random;
    this.map = opts.map ?? buildStarterMap();
    this.lastTick = this.now();
    for (const z of this.map.monsterZones) {
      const def = MONSTERS[z.monster]!;
      for (let i = 0; i < z.max; i++) {
        const id = `${z.id}-${i}`;
        const pos = this.pickSpawn(z);
        this.monsters.set(id, {
          id, def, zone: z, x: pos.x, y: pos.y, homeX: pos.x, homeY: pos.y, hp: def.hp, dir: 'down', st: 'idle', target: null,
          nextAttack: 0, hurtUntil: 0, attackUntil: 0, nextWander: this.now() + randInt(this.rng, 500, 3000), wanderUntil: 0, wx: 0, wy: 0,
          respawnAt: 0, diedAt: 0, damage: new Map(),
        });
      }
    }
  }

  /* ----------------------------------------------------------------- lifecycle */

  get playerCount() { return this.players.size; }
  hasPlayer(id: string) { return this.players.has(id); }

  addPlayer(id: string, accountId: string, char: CharacterData): void {
    let { x, y } = char;
    if (!Number.isFinite(x) || !Number.isFinite(y) || collides(this.map, x, y)) ({ x, y } = this.map.spawn);
    const maxHp = maxHpForLevel(levelFromXp(char.skills.hitpoints));
    char.hp = clamp(Math.round(char.hp) || maxHp, 1, maxHp);
    const p: Player = {
      id, accountId, char, x, y, dir: 'down', moving: false, input: { dx: 0, dy: 0, run: false, at: 0 }, ack: 0, energy: 100,
      lastAttack: 0, lastDamaged: 0, lastRegen: this.now(), stateDirty: false, persistDirty: false,
    };
    this.players.set(id, p);
    this.send(id, { t: 'welcome', id, state: this.selfState(p), now: this.now() });
  }

  removePlayer(id: string): CharacterData | undefined {
    const p = this.players.get(id);
    if (!p) return undefined;
    const data = this.snapshotCharacter(id)!;
    this.players.delete(id);
    for (const m of this.monsters.values()) {
      if (m.target === id) m.target = null;
      m.damage.delete(id);
    }
    return data;
  }

  snapshotCharacter(id: string): CharacterData | undefined {
    const p = this.players.get(id);
    if (!p) return undefined;
    p.char.x = Math.round(p.x * 10) / 10;
    p.char.y = Math.round(p.y * 10) / 10;
    return structuredClone(p.char);
  }

  /** Ids of players whose persistent data changed since the last call. */
  takeDirty(): string[] {
    const ids: string[] = [];
    for (const p of this.players.values()) if (p.persistDirty) { ids.push(p.id); p.persistDirty = false; }
    return ids;
  }

  drain(): Outgoing[] {
    this.flushState();
    const o = this.out;
    this.out = [];
    return o;
  }

  /* ------------------------------------------------------------------ actions */

  handle(id: string, a: ClientAction): void {
    const p = this.players.get(id);
    if (!p) return;
    switch (a.t) {
      case 'input': return this.onInput(p, a);
      case 'farm': return this.onFarm(p, a);
      case 'attack': return this.onAttack(p, a.target);
      case 'talk': return this.onTalk(p, a.npc);
      case 'shop': return this.onShop(p, a);
      case 'expand_farm': return this.onExpand(p);
      case 'rest': return this.onRest(p);
      case 'chat': return this.onChat(p, a.text);
    }
  }

  private onInput(p: Player, a: Extract<ClientAction, { t: 'input' }>) {
    if (!Number.isFinite(a.dx) || !Number.isFinite(a.dy)) return;
    p.input = { dx: clamp(a.dx, -1, 1), dy: clamp(a.dy, -1, 1), run: !!a.run, at: this.now() };
    if (Number.isInteger(a.seq) && a.seq > p.ack) p.ack = a.seq;
  }

  private nearTile(p: Player, tx: number, ty: number, reach: number) {
    return Math.hypot(p.x - (tx * TILE + TILE / 2), p.y - (ty * TILE + TILE / 2)) <= reach;
  }

  private farmTileValid(p: Player, tx: number, ty: number) {
    const f = this.map.farm;
    return Number.isInteger(tx) && Number.isInteger(ty) && tx >= f.x0 && tx < f.x0 + f.cols && ty >= f.y0 && ty < f.y0 + p.char.farmRows;
  }

  private onFarm(p: Player, a: Extract<ClientAction, { t: 'farm' }>) {
    const { tx, ty } = a;
    if (!this.farmTileValid(p, tx, ty)) return this.err(p, 'invalid', 'That is not part of your farm.');
    if (!this.nearTile(p, tx, ty, FARM_REACH)) return this.err(p, 'range', 'Too far away.');
    const plot = p.char.plots.find((q) => q.x === tx && q.y === ty);
    const now = this.now();
    if (a.op === 'till') {
      if (plot) return this.err(p, 'invalid', 'Already tilled.');
      p.char.plots.push({ x: tx, y: ty, state: 'tilled' });
    } else if (a.op === 'plant') {
      if (!plot || plot.state !== 'tilled') return this.err(p, 'invalid', 'Till the soil first.');
      const crop = a.seed ? CROP_BY_SEED[a.seed] : undefined;
      if (!crop) return this.err(p, 'invalid', 'Unknown seed.');
      if (levelFromXp(p.char.skills.farming) < crop.levelReq) return this.err(p, 'level', `Requires Farming level ${crop.levelReq}.`);
      if (!crop.seasons.includes(seasonAt(now))) return this.err(p, 'season', `${crop.name} will not grow in ${seasonAt(now)}.`);
      if (!removeItem(p.char.inventory, crop.seedItem, 1)) return this.err(p, 'invalid', `You have no ${ITEMS[crop.seedItem]!.name}.`);
      plot.state = 'planted';
      plot.cropId = crop.id;
      plot.plantedAt = now;
    } else if (a.op === 'harvest') {
      const crop = plot?.cropId ? CROPS[plot.cropId] : undefined;
      if (!plot || plot.state !== 'planted' || !crop || plot.plantedAt === undefined) return this.err(p, 'invalid', 'Nothing to harvest.');
      if (now - plot.plantedAt < crop.growSeconds * 1000) return this.err(p, 'busy', 'Not ripe yet.');
      const qty = randInt(this.rng, crop.yieldMin, crop.yieldMax);
      if (!canAdd(p.char.inventory, crop.produceItem, qty)) return this.err(p, 'space', 'Your inventory is full.');
      addItem(p.char.inventory, crop.produceItem, qty);
      plot.state = 'tilled';
      delete plot.cropId;
      delete plot.plantedAt;
      this.giveXp(p, 'farming', crop.xp);
      this.questEvent(p, 'harvest', crop.id, qty);
      this.event(p.id, { k: 'loot', items: [{ id: crop.produceItem, qty }], coins: 0 });
    } else return;
    this.touch(p);
  }

  private onAttack(p: Player, targetId: string) {
    const m = this.monsters.get(targetId);
    if (!m || m.st === 'dead') return this.err(p, 'invalid', 'Nothing to attack.');
    if (Math.hypot(m.x - p.x, m.y - p.y) > ATTACK_REACH) return this.err(p, 'range', 'Too far away.');
    const now = this.now();
    if (now - p.lastAttack < ATTACK_COOLDOWN_MS) return; // silently ignore: client cooldown UI covers this
    p.lastAttack = now;
    p.dir = dirFromVector(m.x - p.x, m.y - p.y, p.dir);
    m.target = p.id;
    const atk = levelFromXp(p.char.skills.attack), str = levelFromXp(p.char.skills.strength);
    let dmg = 0;
    if (this.rng() < hitChance(atk, m.def.defence)) dmg = randInt(this.rng, 1, playerMaxHit(str));
    dmg = Math.min(dmg, m.hp);
    this.nearEvent(m.x, m.y, { k: 'hit', from: p.id, to: m.id, dmg, x: m.x, y: m.y });
    if (dmg > 0) {
      m.hp -= dmg;
      m.hurtUntil = now + 350;
      m.damage.set(p.id, (m.damage.get(p.id) ?? 0) + dmg);
      // "controlled" combat style: shared XP per damage point
      this.giveXp(p, 'attack', dmg * 2);
      this.giveXp(p, 'strength', dmg * 2);
      this.giveXp(p, 'defence', dmg * 2);
      this.giveXp(p, 'hitpoints', dmg);
      if (m.hp <= 0) this.killMonster(m, p);
    }
    this.touch(p);
  }

  private killMonster(m: Monster, killer: Player) {
    if (m.st === 'dead') return; // each death is processed exactly once
    const now = this.now();
    m.st = 'dead';
    m.hp = 0;
    m.diedAt = now;
    m.respawnAt = now + m.def.respawnMs;
    m.target = null;
    const items: { id: string; qty: number }[] = [];
    let coins = 0;
    for (const l of m.def.loot) {
      if (this.rng() >= l.chance) continue;
      const qty = randInt(this.rng, l.min, l.max);
      if (l.coins) coins += qty;
      else if (l.item) items.push({ id: l.item, qty });
    }
    const kept = items.filter((it) => addItem(killer.char.inventory, it.id, it.qty));
    killer.char.coins += coins;
    if (kept.length < items.length) this.event(killer.id, { k: 'toast', text: 'Your inventory is full - some loot was lost.' });
    this.event(killer.id, { k: 'loot', items: kept, coins });
    for (const [pid, dealt] of m.damage) {
      const pl = this.players.get(pid);
      if (pl && dealt > 0) { this.questEvent(pl, 'kill', m.def.id, 1); this.touch(pl); }
    }
    m.damage.clear();
    this.touch(killer);
  }

  private onTalk(p: Player, npcId: string) {
    const npc = NPCS[npcId];
    const place = this.map.npcs.find((n) => n.id === npcId);
    if (!npc || !place) return this.err(p, 'invalid', 'Nobody there.');
    if (Math.hypot(place.x - p.x, place.y - p.y) > NPC_REACH) return this.err(p, 'range', 'Too far away.');
    if (npc.role === 'shop') {
      return this.send(p.id, { t: 'dialog', npc: npcId, name: npc.name, lines: ['Welcome in! Seeds in, produce out - best prices in the valley.'], shop: true });
    }
    const q = Object.values(QUESTS).find((d) => d.giver === npcId && !p.char.quests[d.id]?.done);
    if (!q) return this.send(p.id, { t: 'dialog', npc: npcId, name: npc.name, lines: ['Thanks again for your help, friend.'] });
    const st = p.char.quests[q.id];
    if (!st) {
      p.char.quests[q.id] = { step: 0, progress: 0, done: false };
      this.event(p.id, { k: 'quest', text: `Quest started: ${q.name}` });
      this.touch(p);
      return this.send(p.id, { t: 'dialog', npc: npcId, name: npc.name, lines: q.offer });
    }
    const step = q.steps[st.step];
    if (step?.type === 'talk' && step.npc === npcId) return this.completeQuest(p, q, npcId);
    this.send(p.id, { t: 'dialog', npc: npcId, name: npc.name, lines: q.reminders[st.step] ?? ['Keep at it.'] });
  }

  private completeQuest(p: Player, q: QuestDef, npcId: string) {
    const st = p.char.quests[q.id]!;
    if (st.done) return; // never pay twice
    if (!canAddAll(p.char.inventory, q.reward.items)) {
      return this.send(p.id, { t: 'dialog', npc: npcId, name: NPCS[npcId]!.name, lines: ['Your pack is too full to carry the reward. Make some room and come back.'] });
    }
    st.done = true;
    st.step = q.steps.length;
    st.progress = 0;
    p.char.coins += q.reward.coins;
    for (const it of q.reward.items) addItem(p.char.inventory, it.id, it.qty);
    for (const [skill, xp] of Object.entries(q.reward.xp)) this.giveXp(p, skill as ActiveSkillId, xp!);
    this.event(p.id, { k: 'quest', text: `Quest complete: ${q.name}` });
    this.event(p.id, { k: 'loot', items: q.reward.items, coins: q.reward.coins });
    this.touch(p);
    this.send(p.id, { t: 'dialog', npc: npcId, name: NPCS[npcId]!.name, lines: q.complete });
  }

  private questEvent(p: Player, type: 'harvest' | 'kill', targetId: string, n: number) {
    for (const q of Object.values(QUESTS)) {
      const st = p.char.quests[q.id];
      if (!st || st.done) continue;
      const step = q.steps[st.step];
      if (!step || step.type !== type) continue;
      const want = step.type === 'harvest' ? step.crop : step.type === 'kill' ? step.monster : '';
      if (want !== targetId) continue;
      st.progress = Math.min(step.count, st.progress + n);
      if (st.progress >= step.count) {
        st.step += 1;
        st.progress = 0;
        this.event(p.id, { k: 'quest', text: `Objective complete: ${step.text}` });
      }
    }
  }

  private onShop(p: Player, a: Extract<ClientAction, { t: 'shop' }>) {
    const place = this.map.npcs.find((n) => n.id === a.npc);
    const stock = SHOP_STOCK[a.npc];
    if (!place || !stock) return this.err(p, 'invalid', 'No shop there.');
    if (Math.hypot(place.x - p.x, place.y - p.y) > SHOP_REACH) return this.err(p, 'range', 'Too far from the shop.');
    const item = ITEMS[a.item];
    if (!item || !Number.isInteger(a.qty) || a.qty < 1 || a.qty > 999) return this.err(p, 'invalid', 'Invalid request.');
    if (a.op === 'buy') {
      if (!stock.includes(item.id) || item.buy === undefined) return this.err(p, 'invalid', 'Not for sale.');
      const cost = item.buy * a.qty;
      if (p.char.coins < cost) return this.err(p, 'funds', 'Not enough coins.');
      if (!canAdd(p.char.inventory, item.id, a.qty)) return this.err(p, 'space', 'Your inventory is full.');
      p.char.coins -= cost;
      addItem(p.char.inventory, item.id, a.qty);
    } else {
      if (item.sell === undefined) return this.err(p, 'invalid', 'The shop will not buy that.');
      if (!removeItem(p.char.inventory, item.id, a.qty)) return this.err(p, 'invalid', "You don't have that many.");
      p.char.coins += item.sell * a.qty;
    }
    this.touch(p);
  }

  private onExpand(p: Player) {
    const place = this.map.npcs.find((n) => n.id === 'mira')!;
    if (Math.hypot(place.x - p.x, place.y - p.y) > SHOP_REACH) return this.err(p, 'range', 'Too far from the shop.');
    if (p.char.farmRows >= this.map.farm.maxRows) return this.err(p, 'invalid', 'Your farm is fully expanded.');
    if (p.char.coins < FARM_EXPANSION_COST) return this.err(p, 'funds', 'Not enough coins.');
    p.char.coins -= FARM_EXPANSION_COST;
    p.char.farmRows += 1;
    this.event(p.id, { k: 'toast', text: 'Your farm grew by one row!' });
    this.touch(p);
  }

  private onRest(p: Player) {
    const door = this.map.interactables.find((i) => i.kind === 'rest');
    if (!door || Math.hypot(door.x - p.x, door.y - p.y) > 48) return this.err(p, 'range', 'Too far away.');
    p.char.hp = maxHpForLevel(levelFromXp(p.char.skills.hitpoints));
    p.energy = 100;
    this.event(p.id, { k: 'toast', text: 'You feel rested.' });
    this.touch(p);
  }

  private onChat(p: Player, text: string) {
    const clean = String(text).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 140);
    if (!clean) return;
    for (const o of this.players.values()) this.send(o.id, { t: 'chat', from: p.char.name, text: clean });
  }

  /* ------------------------------------------------------------------- tick */

  tick(): void {
    const now = this.now();
    const dt = clamp((now - this.lastTick) / 1000, 0, 0.25);
    this.lastTick = now;
    for (const p of this.players.values()) this.tickPlayer(p, dt, now);
    for (const m of this.monsters.values()) this.tickMonster(m, dt, now);
    for (const p of this.players.values()) this.send(p.id, this.snapshotFor(p, now));
  }

  private tickPlayer(p: Player, dt: number, now: number) {
    const stale = now - p.input.at > INPUT_STALE_MS;
    const dx = stale ? 0 : p.input.dx, dy = stale ? 0 : p.input.dy;
    const wantsRun = !stale && p.input.run && (dx !== 0 || dy !== 0) && p.energy > 3;
    const r = stepMove(this.map, p.x, p.y, dx, dy, wantsRun ? RUN_SPEED : WALK_SPEED, dt);
    p.moving = r.moved;
    if (r.moved) { p.x = r.x; p.y = r.y; p.dir = dirFromVector(dx, dy, p.dir); p.persistDirty = true; }
    const prevEnergy = Math.round(p.energy);
    p.energy = clamp(p.energy + (wantsRun && r.moved ? -14 : 8) * dt, 0, 100);
    if (Math.round(p.energy) !== prevEnergy && now % 1000 < 100) p.stateDirty = true;
    const maxHp = maxHpForLevel(levelFromXp(p.char.skills.hitpoints));
    if (p.char.hp < maxHp && now - p.lastDamaged > 8000 && now - p.lastRegen > 6000) {
      p.char.hp += 1; p.lastRegen = now; this.touch(p);
    }
  }

  private tickMonster(m: Monster, dt: number, now: number) {
    if (m.st === 'dead') {
      if (now >= m.respawnAt) {
        const pos = this.pickSpawn(m.zone);
        Object.assign(m, { x: pos.x, y: pos.y, homeX: pos.x, homeY: pos.y, hp: m.def.hp, st: 'idle', target: null });
        m.damage.clear();
      }
      return;
    }
    // choose/validate target
    let target = m.target ? this.players.get(m.target) : undefined;
    if (target && (Math.hypot(target.x - m.homeX, target.y - m.homeY) > m.def.leash)) target = undefined;
    if (!target) {
      m.target = null;
      let best = m.def.aggroRange;
      for (const p of this.players.values()) {
        const d = Math.hypot(p.x - m.x, p.y - m.y);
        if (d < best && Math.hypot(p.x - m.homeX, p.y - m.homeY) <= m.def.leash) { best = d; target = p; }
      }
      m.target = target?.id ?? null;
    }
    if (target) {
      const d = Math.hypot(target.x - m.x, target.y - m.y);
      m.dir = dirFromVector(target.x - m.x, target.y - m.y, m.dir);
      if (d <= m.def.attackRange) {
        m.st = now < m.attackUntil ? 'attack' : 'idle';
        if (now >= m.nextAttack) this.monsterAttack(m, target, now);
      } else {
        const r = stepMove(this.map, m.x, m.y, target.x - m.x, target.y - m.y, m.def.speed, dt);
        m.x = r.x; m.y = r.y;
        m.st = r.moved ? 'walk' : 'idle';
      }
    } else if (now >= m.wanderUntil && now >= m.nextWander) {
      const a = this.rng() * Math.PI * 2;
      // drift back towards home when far away
      const far = Math.hypot(m.x - m.homeX, m.y - m.homeY) > 60;
      m.wx = far ? m.homeX - m.x : Math.cos(a);
      m.wy = far ? m.homeY - m.y : Math.sin(a);
      m.wanderUntil = now + randInt(this.rng, 500, 1400);
      m.nextWander = m.wanderUntil + randInt(this.rng, 1000, 3500);
    }
    if (!target) {
      if (now < m.wanderUntil) {
        const r = stepMove(this.map, m.x, m.y, m.wx, m.wy, m.def.speed * 0.6, dt);
        m.x = r.x; m.y = r.y; m.st = r.moved ? 'walk' : 'idle';
        m.dir = dirFromVector(m.wx, m.wy, m.dir);
      } else m.st = 'idle';
    }
    if (now < m.hurtUntil) m.st = 'hurt';
  }

  private monsterAttack(m: Monster, p: Player, now: number) {
    m.nextAttack = now + m.def.attackCooldownMs;
    m.attackUntil = now + 450;
    m.st = 'attack';
    let dmg = 0;
    if (this.rng() < monsterHitChance(m.def.accuracy, levelFromXp(p.char.skills.defence))) dmg = randInt(this.rng, 1, m.def.maxHit);
    dmg = Math.min(dmg, p.char.hp);
    this.nearEvent(p.x, p.y, { k: 'hit', from: m.id, to: p.id, dmg, x: p.x, y: p.y });
    if (dmg === 0) return;
    p.char.hp -= dmg;
    p.lastDamaged = now;
    this.touch(p);
    if (p.char.hp <= 0) this.killPlayer(p);
  }

  private killPlayer(p: Player) {
    p.x = this.map.spawn.x; p.y = this.map.spawn.y;
    p.char.hp = maxHpForLevel(levelFromXp(p.char.skills.hitpoints));
    p.moving = false;
    p.input = { dx: 0, dy: 0, run: false, at: 0 };
    for (const m of this.monsters.values()) if (m.target === p.id) m.target = null;
    this.event(p.id, { k: 'died' });
    this.touch(p);
  }

  /* ----------------------------------------------------------------- helpers */

  private pickSpawn(z: { cx: number; cy: number; radius: number }) {
    for (let i = 0; i < 40; i++) {
      const a = this.rng() * Math.PI * 2, r = Math.sqrt(this.rng()) * z.radius;
      const x = z.cx + Math.cos(a) * r, y = z.cy + Math.sin(a) * r;
      if (!collides(this.map, x, y)) return { x, y };
    }
    return { x: z.cx, y: z.cy };
  }

  private giveXp(p: Player, skill: ActiveSkillId, amount: number) {
    if (amount <= 0) return;
    const before = levelFromXp(p.char.skills[skill]);
    p.char.skills[skill] += amount;
    this.event(p.id, { k: 'xp', skill, amount });
    const after = levelFromXp(p.char.skills[skill]);
    if (after > before) this.event(p.id, { k: 'level', skill, level: after });
  }

  private touch(p: Player) { p.stateDirty = true; p.persistDirty = true; }
  private err(p: Player, code: string, msg: string) { this.send(p.id, { t: 'err', code, msg }); }
  private send(to: string, msg: ServerMsg) { this.out.push({ to, msg }); }
  private event(to: string, ev: GameEvent) { this.send(to, { t: 'ev', ev }); }
  private nearEvent(x: number, y: number, ev: GameEvent) {
    for (const p of this.players.values()) if (Math.hypot(p.x - x, p.y - y) <= INTEREST_RADIUS) this.event(p.id, ev);
  }

  private flushState() {
    for (const p of this.players.values()) {
      if (!p.stateDirty) continue;
      p.stateDirty = false;
      this.out.push({ to: p.id, msg: { t: 'state', state: this.selfState(p) } });
    }
  }

  selfState(p: Player): SelfState {
    const skills = Object.fromEntries(ACTIVE_SKILLS.map((s) => [s, { xp: p.char.skills[s], level: levelFromXp(p.char.skills[s]) }])) as SelfState['skills'];
    const quests = Object.values(QUESTS).flatMap((q) => {
      const st = p.char.quests[q.id];
      if (!st) return [];
      const step = q.steps[st.step];
      return [{
        id: q.id, name: q.name, done: st.done,
        text: st.done ? 'Completed' : step?.text ?? '',
        progress: st.progress, need: step && 'count' in step ? step.count : 1,
      }];
    });
    return {
      name: p.char.name, hp: p.char.hp, maxHp: maxHpForLevel(skills.hitpoints.level), energy: Math.round(p.energy),
      coins: p.char.coins, skills, inventory: p.char.inventory, plots: p.char.plots, farmRows: p.char.farmRows, quests,
      season: seasonAt(this.now()),
    };
  }

  private snapshotFor(p: Player, now: number): ServerMsg {
    const players: PlayerView[] = [];
    for (const o of this.players.values()) {
      if (Math.hypot(o.x - p.x, o.y - p.y) > INTEREST_RADIUS) continue;
      players.push({
        id: o.id, name: o.char.name, x: round1(o.x), y: round1(o.y), dir: o.dir, mv: o.moving,
        hp: o.char.hp, maxHp: maxHpForLevel(levelFromXp(o.char.skills.hitpoints)),
      });
    }
    const monsters: MonsterView[] = [];
    for (const m of this.monsters.values()) {
      if (m.st === 'dead' && now - m.diedAt > DEAD_VISIBLE_MS) continue;
      if (Math.hypot(m.x - p.x, m.y - p.y) > INTEREST_RADIUS) continue;
      monsters.push({ id: m.id, type: m.def.id, x: round1(m.x), y: round1(m.y), dir: m.dir, hp: m.hp, maxHp: m.def.hp, st: m.st });
    }
    return { t: 'snap', ack: p.ack, now, players, monsters };
  }

  /** Test/diagnostic accessors */
  debug() {
    return { players: this.players, monsters: this.monsters };
  }
}

const round1 = (n: number) => Math.round(n * 10) / 10;
export { countItem };
