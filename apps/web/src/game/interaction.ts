/**
 * Pure client-side interaction logic: decides which action the "interact" key/button means right now.
 * It only chooses an *intent* to send; the server re-validates everything (range, ripeness, level, season...).
 * No Phaser / DOM imports so it can be unit-tested with plain Node.
 */
import {
  ATTACK_REACH, CROPS, CROP_BY_SEED, FARM_REACH, NPC_REACH, TILE, countItem,
  type Dir, type GameMap, type MonsterView, type PlotState, type SelfState,
} from '@ero/shared';

export type Intent =
  | { kind: 'talk'; npc: string }
  | { kind: 'rest' }
  | { kind: 'farm'; op: 'till' | 'plant' | 'harvest'; tx: number; ty: number; seed?: string }
  | { kind: 'attack'; target: string }
  | { kind: 'hint'; text: string };

export interface IntentContext {
  map: GameMap;
  x: number;
  y: number;
  dir: Dir;
  self: Pick<SelfState, 'plots' | 'farmRows' | 'inventory'>;
  monsters: readonly MonsterView[];
  selectedSeed: string | null;
  /** Estimated server epoch ms (display/intent only; the server decides ripeness). */
  serverNow: number;
}

const DIR_VEC: Record<Dir, [number, number]> = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };

export function inFarm(map: GameMap, farmRows: number, tx: number, ty: number): boolean {
  const f = map.farm;
  return tx >= f.x0 && tx < f.x0 + f.cols && ty >= f.y0 && ty < f.y0 + farmRows;
}

/** The farm tile the player is "aiming" at: the tile just in front of the feet, else the tile under them. */
export function targetFarmTile(map: GameMap, farmRows: number, x: number, y: number, dir: Dir): { tx: number; ty: number } | null {
  const [vx, vy] = DIR_VEC[dir];
  const candidates: [number, number][] = [
    [x + vx * 10, y - 4 + vy * 10],
    [x, y - 4],
  ];
  for (const [px, py] of candidates) {
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
    if (inFarm(map, farmRows, tx, ty) && Math.hypot(x - (tx * TILE + TILE / 2), y - (ty * TILE + TILE / 2)) <= FARM_REACH) return { tx, ty };
  }
  return null;
}

export function cropStage(plot: PlotState, serverNow: number): { stage: 0 | 1 | 2 | 3; ripe: boolean; secondsLeft: number } | null {
  const crop = plot.cropId ? CROPS[plot.cropId] : undefined;
  if (!crop || plot.plantedAt === undefined) return null;
  const total = crop.growSeconds * 1000;
  const elapsed = Math.max(0, serverNow - plot.plantedAt);
  if (elapsed >= total) return { stage: 3, ripe: true, secondsLeft: 0 };
  const stage = Math.min(2, Math.floor((elapsed / total) * 3)) as 0 | 1 | 2;
  return { stage, ripe: false, secondsLeft: Math.ceil((total - elapsed) / 1000) };
}

export function nearestMonster(monsters: readonly MonsterView[], x: number, y: number, reach = ATTACK_REACH): MonsterView | null {
  let best: MonsterView | null = null;
  let bd = reach;
  for (const m of monsters) {
    if (m.st === 'dead') continue;
    const d = Math.hypot(m.x - x, m.y - y);
    if (d <= bd) { bd = d; best = m; }
  }
  return best;
}

/** Seeds the player owns, in crop order (drives the hotbar). */
export function ownedSeeds(inventory: SelfState['inventory']): string[] {
  return Object.keys(CROP_BY_SEED).filter((s) => countItem(inventory, s) > 0);
}

/** What to do with one specific farm tile (also used for mouse clicks). */
export function farmIntentForTile(c: IntentContext, tx: number, ty: number): Intent {
  if (!inFarm(c.map, c.self.farmRows, tx, ty)) return { kind: 'hint', text: 'That is not part of your farm.' };
  if (Math.hypot(c.x - (tx * TILE + TILE / 2), c.y - (ty * TILE + TILE / 2)) > FARM_REACH) return { kind: 'hint', text: 'Too far away.' };
  const plot = c.self.plots.find((p) => p.x === tx && p.y === ty);
  if (!plot) return { kind: 'farm', op: 'till', tx, ty };
  if (plot.state === 'tilled') {
    const seed = c.selectedSeed && countItem(c.self.inventory, c.selectedSeed) > 0 ? c.selectedSeed : ownedSeeds(c.self.inventory)[0];
    if (!seed) return { kind: 'hint', text: 'You have no seeds. Buy some from Mira in the general store.' };
    return { kind: 'farm', op: 'plant', tx, ty, seed };
  }
  const st = cropStage(plot, c.serverNow);
  if (st?.ripe) return { kind: 'farm', op: 'harvest', tx, ty };
  return { kind: 'hint', text: st ? `Still growing (${st.secondsLeft}s left).` : 'Nothing to do here.' };
}

export function chooseIntent(c: IntentContext): Intent {
  for (const n of c.map.npcs) {
    if (Math.hypot(n.x - c.x, n.y - c.y) <= NPC_REACH - 8) return { kind: 'talk', npc: n.id };
  }
  const door = c.map.interactables.find((i) => i.kind === 'rest');
  if (door && Math.hypot(door.x - c.x, door.y - c.y) <= 40) return { kind: 'rest' };

  const t = targetFarmTile(c.map, c.self.farmRows, c.x, c.y, c.dir);
  if (t) return farmIntentForTile(c, t.tx, t.ty);
  const m = nearestMonster(c.monsters, c.x, c.y);
  if (m) return { kind: 'attack', target: m.id };
  return { kind: 'hint', text: 'Nothing to interact with here.' };
}

/** Attack button: nearest living monster in reach, otherwise null. */
export function chooseAttack(monsters: readonly MonsterView[], x: number, y: number): string | null {
  return nearestMonster(monsters, x, y)?.id ?? null;
}

export function intentToAction(i: Intent) {
  switch (i.kind) {
    case 'talk': return { t: 'talk' as const, npc: i.npc };
    case 'rest': return { t: 'rest' as const };
    case 'farm': return { t: 'farm' as const, op: i.op, tx: i.tx, ty: i.ty, ...(i.seed ? { seed: i.seed } : {}) };
    case 'attack': return { t: 'attack' as const, target: i.target };
    case 'hint': return null;
  }
}

/** Short label for the context button / hint ("" = nothing to do). */
export function describeIntent(i: Intent): string {
  switch (i.kind) {
    case 'talk': return 'Talk';
    case 'rest': return 'Rest';
    case 'attack': return 'Attack';
    case 'farm': return i.op === 'till' ? 'Till soil' : i.op === 'plant' ? 'Plant' : 'Harvest';
    case 'hint': return '';
  }
}
