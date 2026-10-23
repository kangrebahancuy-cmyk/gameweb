import { TILE, mulberry32 } from './rules';

export type SheetKey = 'terrain' | 'details' | 'buildings';

/** A rectangular crop of a tileset image placed in the world (pixel coordinates). */
export interface Stamp {
  sheet: SheetKey;
  sx: number; sy: number; sw: number; sh: number;
  x: number; y: number;
  /** Depth-sorting baseline in world pixels (props only). */
  depth: number;
}

export interface NpcPlacement { id: string; x: number; y: number; sprite: 'farmer' | 'woman'; facing: 'down' }
export interface MonsterZone { id: string; monster: string; cx: number; cy: number; radius: number; max: number }
export interface Interactable { id: string; kind: 'rest'; x: number; y: number; label: string }

export const TERRAIN = { GRASS: 0, SAND: 1, WATER: 2, SOLID: 3, FENCE: 4 } as const;

export interface GameMap {
  width: number;
  height: number;
  tile: number;
  /** Drawn once into a static layer, bottom to top. */
  ground: Stamp[];
  /** Depth-sorted sprites (buildings, trees, rocks, fences...). */
  props: Stamp[];
  /** 1 = not walkable. */
  blocked: Uint8Array;
  /** Coarse terrain code per tile for the minimap. */
  terrain: Uint8Array;
  farm: { x0: number; y0: number; cols: number; maxRows: number };
  spawn: { x: number; y: number };
  npcs: NpcPlacement[];
  monsterZones: MonsterZone[];
  interactables: Interactable[];
}

export const MAP_W = 64;
export const MAP_H = 48;

const T = (sheet: SheetKey, cx: number, cy: number, tx: number, ty: number, depth = -1): Stamp => ({
  sheet, sx: cx * TILE, sy: cy * TILE, sw: TILE, sh: TILE, x: tx * TILE, y: ty * TILE, depth,
});

export function isBlockedTile(map: GameMap, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return true;
  return map.blocked[ty * map.width + tx] === 1;
}

export function buildStarterMap(): GameMap {
  const W = MAP_W, H = MAP_H;
  const rng = mulberry32(20261020);
  const blocked = new Uint8Array(W * H);
  const terrain = new Uint8Array(W * H);
  const keepOut = new Uint8Array(W * H); // no random trees/decor
  const ground: Stamp[] = [];
  const props: Stamp[] = [];
  const idx = (x: number, y: number) => y * W + x;
  const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  const block = (x: number, y: number, w = 1, h = 1) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (inb(i, j)) blocked[idx(i, j)] = 1;
  };
  const keep = (x: number, y: number, w: number, h: number) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (inb(i, j)) keepOut[idx(i, j)] = 1;
  };

  // --- 1. grass base (variants from terrain sheet row 0-1)
  const grass: [number, number][] = [[0, 1], [1, 1], [2, 1]];
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    const r = rng();
    const [cx, cy] = r < 0.8 ? grass[0]! : r < 0.92 ? grass[1]! : r < 0.97 ? grass[2]! : ([1, 0] as [number, number]);
    ground.push(T('terrain', cx, cy, tx, ty));
  }

  // --- 2. sand (plaza + paths) with a 9-slice autotiler
  const sand = new Set<number>();
  const rect = (set: Set<number>, x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set.add(idx(x, y));
  };
  rect(sand, 24, 18, 38, 25); // plaza
  rect(sand, 30, 26, 32, 37); // south path to farm gate
  rect(sand, 28, 35, 29, 37); // gate connector
  rect(sand, 39, 20, 52, 22); // east path to forest
  rect(sand, 9, 20, 23, 22); // west path to house
  rect(sand, 30, 12, 32, 17); // north path to store
  for (const c of sand) {
    const x = c % W, y = Math.floor(c / W);
    const n = sand.has(idx(x, y - 1)), s = sand.has(idx(x, y + 1)), w = sand.has(idx(x - 1, y)), e = sand.has(idx(x + 1, y));
    const col = !w && e ? 0 : w && !e ? 2 : 1;
    const row = !n && s ? 0 : n && !s ? 2 : 1;
    ground.push(T('terrain', col, 2 + row, x, y));
    terrain[c] = TERRAIN.SAND;
    keepOut[c] = 1;
  }

  // --- 3. pond (9-slice, opaque)
  const pond = { x0: 44, y0: 31, x1: 49, y1: 35 };
  for (let y = pond.y0; y <= pond.y1; y++) for (let x = pond.x0; x <= pond.x1; x++) {
    const col = x === pond.x0 ? 0 : x === pond.x1 ? 2 : 1;
    const row = y === pond.y0 ? 0 : y === pond.y1 ? 2 : 1;
    ground.push(T('terrain', col, 8 + row, x, y));
    terrain[idx(x, y)] = TERRAIN.WATER;
  }
  block(pond.x0, pond.y0, pond.x1 - pond.x0 + 1, pond.y1 - pond.y0 + 1);
  keep(pond.x0 - 1, pond.y0 - 1, 8, 7);

  // --- 4. buildings
  const building = (sx: number, sy: number, sw: number, sh: number, tx: number, ty: number, solid = true) => {
    props.push({ sheet: 'buildings', sx, sy, sw, sh, x: tx * TILE, y: ty * TILE, depth: ty * TILE + sh });
    const tw = sw / TILE, th = sh / TILE;
    if (solid) block(tx, ty, tw, th);
    keep(tx - 1, ty - 1, tw + 2, th + 2);
    for (let j = ty; j < ty + th; j++) for (let i = tx; i < tx + tw; i++) if (inb(i, j)) terrain[idx(i, j)] = TERRAIN.SOLID;
  };
  building(0, 0, 80, 96, 9, 14); // player house  (door at tile 10,19)
  building(128, 176, 80, 80, 29, 7); // general store (door at tile 30,11)
  building(128, 0, 112, 160, 35, 29); // barn
  building(0, 128, 64, 128, 4, 14); // silo
  building(208, 160, 48, 32, 24, 38); // hay pile (decor)
  building(80, 32, 32, 32, 25, 32); // storage chest (decor)

  // --- 5. farm: fence ring with a gate on the east side
  const farm = { x0: 16, y0: 33, cols: 8, maxRows: 4 };
  const fx0 = 14, fy0 = 31, fx1 = 27, fy1 = 41;
  keep(fx0, fy0, fx1 - fx0 + 1, fy1 - fy0 + 1);
  for (let x = fx0; x <= fx1; x++) for (const y of [fy0, fy1]) {
    props.push({ sheet: 'details', sx: 10 * TILE, sy: 3 * TILE, sw: TILE, sh: TILE, x: x * TILE, y: y * TILE, depth: y * TILE + TILE });
    block(x, y); terrain[idx(x, y)] = TERRAIN.FENCE;
  }
  for (let y = fy0 + 1; y < fy1; y++) for (const x of [fx0, fx1]) {
    if (x === fx1 && y >= 35 && y <= 37) continue; // gate
    props.push({ sheet: 'details', sx: 8 * TILE, sy: 1 * TILE, sw: TILE, sh: TILE, x: x * TILE, y: y * TILE, depth: y * TILE + TILE });
    block(x, y); terrain[idx(x, y)] = TERRAIN.FENCE;
  }

  // --- 6. trees
  const treeCrops = { green: [80, 96], pine: [16, 144], blossom: [16, 96] } as const;
  const canTree = (tx: number, ty: number) => {
    for (let j = ty; j < ty + 3; j++) for (let i = tx; i < tx + 3; i++) {
      if (!inb(i, j)) continue;
      if (keepOut[idx(i, j)] || blocked[idx(i, j)]) return false;
    }
    return true;
  };
  const tree = (tx: number, ty: number, kind: keyof typeof treeCrops) => {
    const [sx, sy] = treeCrops[kind];
    props.push({ sheet: 'details', sx, sy, sw: 48, sh: 48, x: tx * TILE, y: ty * TILE, depth: (ty + 3) * TILE - 2 });
    block(tx + 1, ty + 2); // trunk only
  };
  // border ring (outer 2 tiles are impassable regardless)
  for (let i = -1; i < W; i += 2) {
    tree(i, -1, 'pine');
    tree(i, H - 3, 'pine');
  }
  for (let j = 1; j < H - 3; j += 2) {
    tree(-1, j, 'pine');
    tree(W - 2, j, 'pine');
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) blocked[idx(x, y)] = 1;

  // monster clearing in the forest
  const zone = { id: 'forest_slimes', monster: 'slime_green', cx: 56 * TILE, cy: 22 * TILE, radius: 7 * TILE, max: 4 };
  keep(48, 14, 14, 17);

  // scattered trees: village sparse, forest denser
  for (let ty = 2; ty < H - 5; ty++) for (let tx = 2; tx < W - 5; tx++) {
    const forest = tx >= 44;
    const p = forest ? 0.05 : 0.012;
    if (rng() < p && canTree(tx, ty)) {
      const kind = forest ? (rng() < 0.7 ? 'pine' : 'green') : rng() < 0.5 ? 'green' : 'blossom';
      tree(tx, ty, kind);
    }
  }

  // --- 7. NPCs (their tile is blocked)
  const npcs: NpcPlacement[] = [
    { id: 'mira', x: 32 * TILE + 8, y: 13 * TILE + 14, sprite: 'woman', facing: 'down' },
    { id: 'bram', x: 35 * TILE + 8, y: 22 * TILE + 14, sprite: 'farmer', facing: 'down' },
  ];
  for (const n of npcs) block(Math.floor(n.x / TILE), Math.floor(n.y / TILE));

  // --- 8. small decor: flowers, rocks, mushrooms (ground layer, not blocked)
  const flowers: [number, number][] = [[0, 6], [0, 7], [0, 8], [4, 6], [4, 7], [4, 8], [8, 12], [9, 12], [10, 12]];
  for (let n = 0; n < 160; n++) {
    const tx = 2 + Math.floor(rng() * (W - 4)), ty = 2 + Math.floor(rng() * (H - 4));
    if (blocked[idx(tx, ty)] || keepOut[idx(tx, ty)]) continue;
    const [cx, cy] = flowers[Math.floor(rng() * flowers.length)]!;
    ground.push(T('details', cx, cy, tx, ty));
  }
  const rocks: [number, number][] = [[6, 40], [38, 26], [58, 10], [50, 40], [12, 26]];
  for (const [tx, ty] of rocks) {
    if (!inb(tx, ty) || blocked[idx(tx, ty)]) continue;
    props.push({ sheet: 'details', sx: 16, sy: 64, sw: 32, sh: 32, x: tx * TILE, y: ty * TILE, depth: (ty + 2) * TILE });
    block(tx, ty, 2, 1);
  }
  // lamp posts at plaza corners
  for (const [tx, ty] of [[24, 18], [38, 18], [24, 24], [38, 24]] as [number, number][]) {
    props.push({ sheet: 'buildings', sx: 112, sy: 0, sw: TILE, sh: 32, x: tx * TILE, y: (ty - 1) * TILE, depth: (ty + 1) * TILE });
    block(tx, ty);
  }

  props.sort((a, b) => a.depth - b.depth);

  return {
    width: W, height: H, tile: TILE, ground, props, blocked, terrain,
    farm,
    spawn: { x: 31 * TILE + 8, y: 27 * TILE },
    npcs,
    monsterZones: [zone],
    interactables: [{ id: 'home_door', kind: 'rest', x: 10 * TILE + 8, y: 20 * TILE, label: 'Rest at home' }],
  };
}
