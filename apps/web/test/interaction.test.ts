import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStarterMap, TILE, CROPS, emptyInventory, addItem, type MonsterView, type PlotState } from '@ero/shared';
import { chooseIntent, cropStage, intentToAction, ownedSeeds, targetFarmTile } from '../src/game/interaction';

const map = buildStarterMap();
const f = map.farm;
const cx = (tx: number) => tx * TILE + TILE / 2;
const inv = (items: Record<string, number>) => { const i = emptyInventory(); for (const [k, v] of Object.entries(items)) addItem(i, k, v); return i; };
const base = (over: Partial<Parameters<typeof chooseIntent>[0]> = {}) => ({
  map, x: cx(f.x0 + 1), y: (f.y0 + 1) * TILE + TILE, dir: 'down' as const,
  self: { plots: [] as PlotState[], farmRows: 2, inventory: inv({ carrot_seed: 3 }) },
  monsters: [] as MonsterView[], selectedSeed: null, serverNow: 1_000_000, ...over,
});

test('empty farm tile in front -> till', () => {
  const i = chooseIntent(base());
  assert.equal(i.kind, 'farm');
  if (i.kind === 'farm') assert.equal(i.op, 'till');
});

test('tilled tile -> plant the selected seed, falling back to the first owned seed', () => {
  const t = targetFarmTile(map, 2, base().x, base().y, 'down')!;
  const plots: PlotState[] = [{ x: t.tx, y: t.ty, state: 'tilled' }];
  const i = chooseIntent(base({ self: { plots, farmRows: 2, inventory: inv({ carrot_seed: 2, tomato_seed: 1 }) }, selectedSeed: 'tomato_seed' }));
  assert.deepEqual(i, { kind: 'farm', op: 'plant', tx: t.tx, ty: t.ty, seed: 'tomato_seed' });
  const j = chooseIntent(base({ self: { plots, farmRows: 2, inventory: inv({ carrot_seed: 2 }) }, selectedSeed: 'tomato_seed' }));
  assert.equal(j.kind === 'farm' && j.seed, 'carrot_seed');
});

test('tilled tile with no seeds gives a hint and sends nothing', () => {
  const t = targetFarmTile(map, 2, base().x, base().y, 'down')!;
  const i = chooseIntent(base({ self: { plots: [{ x: t.tx, y: t.ty, state: 'tilled' }], farmRows: 2, inventory: emptyInventory() } }));
  assert.equal(i.kind, 'hint');
  assert.equal(intentToAction(i), null);
});

test('crop stages follow the server clock and ripen exactly at growSeconds', () => {
  const plot: PlotState = { x: 0, y: 0, state: 'planted', cropId: 'carrot', plantedAt: 0 };
  const ms = CROPS.carrot!.growSeconds * 1000;
  assert.deepEqual(cropStage(plot, 0), { stage: 0, ripe: false, secondsLeft: 60 });
  assert.equal(cropStage(plot, ms / 2)!.stage, 1);
  assert.equal(cropStage(plot, ms - 1)!.ripe, false);
  assert.deepEqual(cropStage(plot, ms), { stage: 3, ripe: true, secondsLeft: 0 });
});

test('ripe crop -> harvest, unripe -> hint', () => {
  const t = targetFarmTile(map, 2, base().x, base().y, 'down')!;
  const plot: PlotState = { x: t.tx, y: t.ty, state: 'planted', cropId: 'carrot', plantedAt: 0 };
  const self = { plots: [plot], farmRows: 2, inventory: emptyInventory() };
  assert.equal(chooseIntent(base({ self, serverNow: 59_000 })).kind, 'hint');
  assert.deepEqual(chooseIntent(base({ self, serverNow: 60_000 })), { kind: 'farm', op: 'harvest', tx: t.tx, ty: t.ty });
});

test('rows beyond the unlocked farm size are not targetable', () => {
  const y = (f.y0 + 2) * TILE + 8; // standing in the third row, only 2 unlocked
  assert.equal(targetFarmTile(map, 2, cx(f.x0 + 1), y, 'down'), null);
  assert.notEqual(targetFarmTile(map, 3, cx(f.x0 + 1), y, 'down'), null);
});

test('NPC in reach wins over everything; monster is attacked when nothing else applies', () => {
  const n = map.npcs[0]!;
  assert.deepEqual(chooseIntent(base({ x: n.x, y: n.y + 10 })), { kind: 'talk', npc: n.id });
  const mon: MonsterView = { id: 'forest_slimes-0', type: 'slime_green', x: 56 * TILE, y: 22 * TILE, dir: 'down', hp: 5, maxHp: 10, st: 'idle' };
  const i = chooseIntent(base({ x: mon.x - 10, y: mon.y, monsters: [mon] }));
  assert.deepEqual(i, { kind: 'attack', target: mon.id });
  assert.equal(chooseIntent(base({ x: mon.x - 10, y: mon.y, monsters: [{ ...mon, st: 'dead' }] })).kind, 'hint');
});

test('ownedSeeds lists only seeds in the pack', () => {
  assert.deepEqual(ownedSeeds(inv({ carrot_seed: 1, pumpkin_seed: 2, carrot: 5 })), ['carrot_seed', 'pumpkin_seed']);
});
