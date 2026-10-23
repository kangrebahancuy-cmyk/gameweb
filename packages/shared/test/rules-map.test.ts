import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levelFromXp, xpForLevel, seasonAt, maxHpForLevel, TILE } from '../src/rules';
import { buildStarterMap, isBlockedTile } from '../src/map';
import { collides, stepMove } from '../src/movement';

test('xp curve matches the published breakpoints', () => {
  assert.equal(xpForLevel(2), 83);
  assert.equal(xpForLevel(10), 1154);
  assert.equal(xpForLevel(99), 13034431);
  assert.equal(levelFromXp(82), 1);
  assert.equal(levelFromXp(83), 2);
  assert.equal(levelFromXp(1154), 10);
  assert.equal(maxHpForLevel(10), 30);
});

test('season is derived purely from the supplied (server) clock', () => {
  assert.equal(seasonAt(0), 'spring');
  assert.equal(seasonAt(7 * 24 * 3600 * 1000), 'summer');
  assert.equal(seasonAt(28 * 24 * 3600 * 1000), 'spring');
});

function reachable(map: ReturnType<typeof buildStarterMap>, from: [number, number]) {
  const seen = new Set<number>();
  const q: [number, number][] = [from];
  const key = (x: number, y: number) => y * map.width + x;
  seen.add(key(...from));
  while (q.length) {
    const [x, y] = q.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy;
      if (isBlockedTile(map, nx, ny) || seen.has(key(nx, ny))) continue;
      seen.add(key(nx, ny));
      q.push([nx, ny]);
    }
  }
  return (tx: number, ty: number) => seen.has(key(tx, ty));
}

test('starter map is deterministic and well-formed', () => {
  const a = buildStarterMap(), b = buildStarterMap();
  assert.deepEqual(a.blocked, b.blocked);
  assert.equal(a.ground.length, b.ground.length);
  assert.equal(collides(a, a.spawn.x, a.spawn.y), false);
  // every plot cell is walkable
  for (let r = 0; r < a.farm.maxRows; r++) for (let c = 0; c < a.farm.cols; c++) {
    assert.equal(isBlockedTile(a, a.farm.x0 + c, a.farm.y0 + r), false, `plot ${c},${r}`);
  }
  // NPC tiles are solid so players cannot stand inside them
  for (const n of a.npcs) assert.equal(isBlockedTile(a, Math.floor(n.x / TILE), Math.floor(n.y / TILE)), true);
});

test('spawn can reach the farm, the shop keeper, Bram, the house door and the slime forest', () => {
  const m = buildStarterMap();
  const ok = reachable(m, [Math.floor(m.spawn.x / TILE), Math.floor(m.spawn.y / TILE)]);
  assert.ok(ok(m.farm.x0, m.farm.y0), 'farm');
  assert.ok(ok(m.farm.x0 + m.farm.cols - 1, m.farm.y0 + m.farm.maxRows - 1), 'farm far corner');
  for (const n of m.npcs) assert.ok(ok(Math.floor(n.x / TILE), Math.floor(n.y / TILE) + 1), `npc ${n.id}`);
  const door = m.interactables[0]!;
  assert.ok(ok(Math.floor(door.x / TILE), Math.floor(door.y / TILE)), 'house door');
  const z = m.monsterZones[0]!;
  assert.ok(ok(Math.floor(z.cx / TILE), Math.floor(z.cy / TILE)), 'slime clearing');
});

test('collision stops movement into solid tiles and normalises diagonal speed', () => {
  const m = buildStarterMap();
  // walk left from spawn forever: must stop at a blocked tile, never leave the map
  let x = m.spawn.x, y = m.spawn.y;
  for (let i = 0; i < 4000; i++) ({ x, y } = stepMove(m, x, y, -1, 0, 100, 0.05));
  assert.ok(x > 0 && x < m.width * TILE);
  assert.equal(collides(m, x, y), false);
  const d = stepMove(m, m.spawn.x, m.spawn.y, 1, 1, 100, 1);
  const dist = Math.hypot(d.x - m.spawn.x, d.y - m.spawn.y);
  assert.ok(dist <= 100.001, `diagonal moved ${dist}`);
});
