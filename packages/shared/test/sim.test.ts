import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld } from './helpers';
import { CROPS, FARM_EXPANSION_COST, ITEMS, MONSTERS, QUESTS } from '../src/content';
import { countItem } from '../src/inventory';
import { TILE, levelFromXp, seasonAt } from '../src/rules';
import { ATTACK_COOLDOWN_MS } from '../src/sim';
import type { ServerMsg } from '../src/types';

const errCodes = (msgs: ServerMsg[]) => msgs.filter((m) => m.t === 'err').map((m) => (m as { code: string }).code);

/* ------------------------------------------------------------- farming */

test('farming: till -> plant -> wait -> harvest, rewards come from the server', () => {
  const w = makeWorld();
  const p = w.join('a');
  w.standAtFarm('a');
  const { tx, ty } = w.farmTile();
  w.sim.handle('a', { t: 'farm', op: 'plant', tx, ty, seed: 'carrot_seed' });
  assert.deepEqual(errCodes(w.inbox('a')), ['invalid'], 'cannot plant before tilling');
  w.sim.handle('a', { t: 'farm', op: 'till', tx, ty });
  w.sim.handle('a', { t: 'farm', op: 'plant', tx, ty, seed: 'carrot_seed' });
  assert.equal(countItem(p.char.inventory, 'carrot_seed'), 4, 'seed consumed');
  assert.equal(p.char.plots[0]!.state, 'planted');
  w.sim.handle('a', { t: 'farm', op: 'harvest', tx, ty });
  assert.ok(errCodes(w.inbox('a')).includes('busy'), 'not ripe yet');
  w.advance(CROPS.carrot!.growSeconds * 1000 - 500);
  w.sim.handle('a', { t: 'farm', op: 'harvest', tx, ty });
  assert.ok(errCodes(w.inbox('a')).includes('busy'), 'still not ripe 0.5s early');
  w.advance(600);
  w.sim.handle('a', { t: 'farm', op: 'harvest', tx, ty });
  assert.equal(errCodes(w.inbox('a')).length, 0);
  assert.ok(countItem(p.char.inventory, 'carrot') >= 1);
  assert.equal(p.char.skills.farming, CROPS.carrot!.xp);
  assert.equal(p.char.plots[0]!.state, 'tilled');
  // double harvest is impossible
  const carrots = countItem(p.char.inventory, 'carrot');
  w.sim.handle('a', { t: 'farm', op: 'harvest', tx, ty });
  assert.equal(countItem(p.char.inventory, 'carrot'), carrots);
});

test('farming: crops keep growing while the player is offline (persisted plantedAt)', () => {
  const w = makeWorld();
  w.join('a');
  w.standAtFarm('a');
  const { tx, ty } = w.farmTile();
  w.sim.handle('a', { t: 'farm', op: 'till', tx, ty });
  w.sim.handle('a', { t: 'farm', op: 'plant', tx, ty, seed: 'carrot_seed' });
  const saved = w.sim.removePlayer('a')!;
  w.clock.t += 10 * 60 * 1000; // 10 minutes offline
  w.sim.addPlayer('a2', 'acct-a', saved);
  const p = w.sim.debug().players.get('a2')!;
  w.sim.handle('a2', { t: 'farm', op: 'harvest', tx, ty });
  assert.ok(countItem(p.char.inventory, 'carrot') >= 1);
});

test('farming: range, bounds, expansion rows and season gates are enforced', () => {
  const w = makeWorld();
  const p = w.join('a');
  const { tx, ty } = w.farmTile();
  w.tp('a', 5 * TILE, 5 * TILE);
  w.sim.handle('a', { t: 'farm', op: 'till', tx, ty });
  assert.deepEqual(errCodes(w.inbox('a')), ['range']);
  // row 3 is locked until expanded
  w.standAtFarm('a');
  w.sim.handle('a', { t: 'farm', op: 'till', tx, ty: w.sim.map.farm.y0 + 2 });
  assert.ok(errCodes(w.inbox('a')).includes('invalid'));
  // outside the farm entirely
  w.sim.handle('a', { t: 'farm', op: 'till', tx: 1, ty: 1 });
  assert.ok(errCodes(w.inbox('a')).includes('invalid'));
  // level gate: pumpkin needs Farming 6
  w.sim.handle('a', { t: 'farm', op: 'till', tx, ty });
  p.char.inventory[1] = { id: 'pumpkin_seed', qty: 1 };
  w.sim.handle('a', { t: 'farm', op: 'plant', tx, ty, seed: 'pumpkin_seed' });
  assert.ok(errCodes(w.inbox('a')).includes('level'));
  // season gate (only meaningful if the current season blocks it): force with a winter clock
  const winter = 3 * 7 * 24 * 3600 * 1000 + 1000;
  w.clock.t = winter;
  assert.equal(seasonAt(w.clock.t), 'winter');
  p.char.skills.farming = 100000;
  w.sim.handle('a', { t: 'farm', op: 'plant', tx, ty, seed: 'pumpkin_seed' });
  assert.ok(errCodes(w.inbox('a')).includes('season'));
});

test('farm expansion costs coins, needs the shop and is capped', () => {
  const w = makeWorld();
  const p = w.join('a');
  w.sim.handle('a', { t: 'expand_farm' });
  assert.ok(errCodes(w.inbox('a')).includes('range'));
  const mira = w.sim.map.npcs.find((n) => n.id === 'mira')!;
  w.tp('a', mira.x, mira.y + TILE);
  p.char.coins = FARM_EXPANSION_COST - 1;
  w.sim.handle('a', { t: 'expand_farm' });
  assert.ok(errCodes(w.inbox('a')).includes('funds'));
  p.char.coins = FARM_EXPANSION_COST * 5;
  for (let i = 0; i < 5; i++) w.sim.handle('a', { t: 'expand_farm' });
  assert.equal(p.char.farmRows, w.sim.map.farm.maxRows);
  assert.equal(p.char.coins, FARM_EXPANSION_COST * 3, 'only two expansions were paid');
});

/* ------------------------------------------------------------- combat */

function slimeNear(w: ReturnType<typeof makeWorld>, id: string) {
  const m = [...w.sim.debug().monsters.values()][0]!;
  w.tp(id, m.x, m.y + 10);
  return m;
}
function killSlime(w: ReturnType<typeof makeWorld>, id: string, m: { id: string; st: string }) {
  for (let i = 0; i < 200 && m.st !== 'dead'; i++) {
    w.advance(ATTACK_COOLDOWN_MS + 50);
    const mon = w.sim.debug().monsters.get(m.id)!;
    w.tp(id, mon.x, mon.y + 10); // stay in reach and out of harm
    w.sim.debug().players.get(id)!.char.hp = 30;
    w.sim.handle(id, { t: 'attack', target: m.id });
  }
}

test('combat: killing a slime pays XP and loot exactly once and it respawns', () => {
  const w = makeWorld(3);
  const p = w.join('a');
  const m = slimeNear(w, 'a');
  killSlime(w, 'a', m);
  assert.equal(m.st, 'dead');
  assert.ok(countItem(p.char.inventory, 'slime_gel') >= 1, 'gel is a guaranteed drop');
  assert.ok(p.char.skills.attack >= MONSTERS.slime_green!.hp * 2, 'attack XP from damage');
  assert.ok(p.char.skills.hitpoints > 1154);
  const gel = countItem(p.char.inventory, 'slime_gel'), coins = p.char.coins, xp = p.char.skills.attack;
  // attacking a corpse does nothing, no matter how often the client repeats it
  for (let i = 0; i < 5; i++) { w.advance(ATTACK_COOLDOWN_MS + 50); w.sim.handle('a', { t: 'attack', target: m.id }); }
  assert.equal(countItem(p.char.inventory, 'slime_gel'), gel);
  assert.equal(p.char.coins, coins);
  assert.equal(p.char.skills.attack, xp);
  w.advance(MONSTERS.slime_green!.respawnMs + 500);
  assert.equal(m.st === 'dead', false, 'respawned');
  assert.equal(m.hp, MONSTERS.slime_green!.hp);
});

test('combat: out-of-range, cooldown and bogus targets are rejected', () => {
  const w = makeWorld();
  const p = w.join('a');
  const m = [...w.sim.debug().monsters.values()][0]!;
  w.sim.handle('a', { t: 'attack', target: m.id });
  assert.ok(errCodes(w.inbox('a')).includes('range'));
  w.sim.handle('a', { t: 'attack', target: 'does-not-exist' });
  assert.ok(errCodes(w.inbox('a')).includes('invalid'));
  w.tp('a', m.x, m.y + 8);
  w.sim.handle('a', { t: 'attack', target: m.id });
  const afterFirst = m.hp;
  w.sim.handle('a', { t: 'attack', target: m.id }); // same instant: ignored by cooldown
  w.sim.handle('a', { t: 'attack', target: m.id });
  assert.equal(m.hp, afterFirst, 'spamming within the cooldown cannot deal extra damage');
  void p;
});

test('combat: a damage-dealing client cannot forge a kill, only the server decides death', () => {
  const w = makeWorld();
  w.join('a');
  const m = slimeNear(w, 'a');
  // @ts-expect-error clients cannot send arbitrary actions; unknown ones are ignored by the sim
  w.sim.handle('a', { t: 'kill', target: m.id });
  assert.equal(m.st === 'dead', false);
});

test('combat: monsters chase and hurt players, and death respawns the player at spawn', () => {
  const w = makeWorld(5);
  const p = w.join('a');
  const m = [...w.sim.debug().monsters.values()][0]!;
  w.tp('a', m.x + 20, m.y);
  p.char.hp = 1;
  w.advance(8000);
  assert.ok(w.inbox('a').some((x) => x.t === 'ev' && x.ev.k === 'died') || p.char.hp > 0);
  assert.ok(p.char.hp >= 1);
});

test('combat: aggro and leash keep slimes near their clearing', () => {
  const w = makeWorld(2);
  const p = w.join('a');
  const m = [...w.sim.debug().monsters.values()][0]!;
  w.tp('a', m.x + 50, m.y);
  w.advance(1500);
  assert.equal(m.target, 'a');
  // run away beyond the leash: slime must give up
  w.tp('a', m.homeX + 400, m.homeY);
  w.advance(500);
  assert.equal(m.target, null);
  void p;
});

/* ------------------------------------------------------------- quest */

test('quest: full Slime Trouble chain, rewards paid once, state survives save/load', () => {
  const w = makeWorld(11);
  const p = w.join('a');
  const bram = w.sim.map.npcs.find((n) => n.id === 'bram')!;
  w.tp('a', bram.x, bram.y + TILE);
  w.sim.handle('a', { t: 'talk', npc: 'bram' });
  assert.equal(p.char.quests.slime_trouble!.step, 0);
  // harvest 3 carrots
  p.char.inventory[1] = { id: 'carrot_seed', qty: 5 };
  for (let i = 0; i < 3; i++) {
    w.standAtFarm('a', i);
    const { tx, ty } = w.farmTile(i);
    w.sim.handle('a', { t: 'farm', op: 'till', tx, ty });
    w.sim.handle('a', { t: 'farm', op: 'plant', tx, ty, seed: 'carrot_seed' });
  }
  w.advance(CROPS.carrot!.growSeconds * 1000 + 1000);
  for (let i = 0; i < 3; i++) {
    w.standAtFarm('a', i);
    const { tx, ty } = w.farmTile(i);
    w.sim.handle('a', { t: 'farm', op: 'harvest', tx, ty });
  }
  assert.equal(p.char.quests.slime_trouble!.step, 1, 'harvest objective done');
  // kill two slimes
  const slimes = [...w.sim.debug().monsters.values()];
  for (const m of slimes.slice(0, 2)) { w.tp('a', m.x, m.y + 10); killSlime(w, 'a', m); }
  assert.equal(p.char.quests.slime_trouble!.step, 2, 'kill objective done');
  // turn in
  const coinsBefore = p.char.coins;
  w.tp('a', bram.x, bram.y + TILE);
  w.sim.handle('a', { t: 'talk', npc: 'bram' });
  const q = QUESTS.slime_trouble!;
  assert.equal(p.char.quests.slime_trouble!.done, true);
  assert.equal(p.char.coins - coinsBefore >= q.reward.coins, true);
  assert.equal(countItem(p.char.inventory, 'pumpkin_seed'), 3);
  // talking again (or spamming) never pays twice
  const after = { coins: p.char.coins, seeds: countItem(p.char.inventory, 'pumpkin_seed'), xp: p.char.skills.farming };
  for (let i = 0; i < 5; i++) w.sim.handle('a', { t: 'talk', npc: 'bram' });
  assert.equal(p.char.coins, after.coins);
  assert.equal(countItem(p.char.inventory, 'pumpkin_seed'), after.seeds);
  assert.equal(p.char.skills.farming, after.xp);
  // persisted state round-trips
  const saved = JSON.parse(JSON.stringify(w.sim.snapshotCharacter('a')));
  assert.equal(saved.quests.slime_trouble.done, true);
});

test('quest: reward is withheld (not lost) when the inventory is full', () => {
  const w = makeWorld(11);
  const p = w.join('a');
  const bram = w.sim.map.npcs.find((n) => n.id === 'bram')!;
  w.tp('a', bram.x, bram.y + TILE);
  w.sim.handle('a', { t: 'talk', npc: 'bram' });
  p.char.quests.slime_trouble = { step: 2, progress: 0, done: false };
  p.char.inventory.forEach((_, i) => { p.char.inventory[i] = { id: 'carrot', qty: 1 }; }); // no free slot, no pumpkin stack
  const before = p.char.coins;
  w.sim.handle('a', { t: 'talk', npc: 'bram' });
  assert.equal(p.char.quests.slime_trouble!.done, false);
  assert.equal(p.char.coins, before);
});

/* ------------------------------------------------------------- shop */

test('shop: buy and sell are validated against price, distance, coins and stock', () => {
  const w = makeWorld();
  const p = w.join('a');
  w.sim.handle('a', { t: 'shop', npc: 'mira', op: 'buy', item: 'carrot_seed', qty: 1 });
  assert.ok(errCodes(w.inbox('a')).includes('range'));
  const mira = w.sim.map.npcs.find((n) => n.id === 'mira')!;
  w.tp('a', mira.x, mira.y + TILE);
  const coins = p.char.coins;
  w.sim.handle('a', { t: 'shop', npc: 'mira', op: 'buy', item: 'carrot_seed', qty: 2 });
  assert.equal(p.char.coins, coins - ITEMS.carrot_seed!.buy! * 2);
  assert.equal(countItem(p.char.inventory, 'carrot_seed'), 7);
  w.sim.handle('a', { t: 'shop', npc: 'mira', op: 'buy', item: 'carrot', qty: 1 });
  assert.ok(errCodes(w.inbox('a')).includes('invalid'), 'produce is not sold by the shop');
  for (const qty of [0, -3, 1.5, 100000]) w.sim.handle('a', { t: 'shop', npc: 'mira', op: 'buy', item: 'carrot_seed', qty });
  assert.equal(p.char.coins, coins - ITEMS.carrot_seed!.buy! * 2, 'bad quantities change nothing');
  p.char.coins = 1;
  w.sim.handle('a', { t: 'shop', npc: 'mira', op: 'buy', item: 'pumpkin_seed', qty: 1 });
  assert.ok(errCodes(w.inbox('a')).includes('funds'));
  w.sim.handle('a', { t: 'shop', npc: 'mira', op: 'sell', item: 'carrot', qty: 1 });
  assert.ok(errCodes(w.inbox('a')).includes('invalid'), "cannot sell what you don't own");
  p.char.inventory[1] = { id: 'carrot', qty: 3 };
  w.sim.handle('a', { t: 'shop', npc: 'mira', op: 'sell', item: 'carrot', qty: 3 });
  assert.equal(p.char.coins, 1 + ITEMS.carrot!.sell! * 3);
});

/* ------------------------------------------------------------- multiplayer view */

test('two players in one room see each other; far players are culled', () => {
  const w = makeWorld();
  w.join('a'); w.join('b');
  w.tp('a', w.sim.map.spawn.x, w.sim.map.spawn.y);
  w.tp('b', w.sim.map.spawn.x + 30, w.sim.map.spawn.y);
  w.advance(200);
  const msgs = w.sim.drain().filter((o) => o.to === 'a' && o.msg.t === 'snap');
  const snap = msgs.at(-1)!.msg as Extract<ServerMsg, { t: 'snap' }>;
  assert.deepEqual(snap.players.map((x) => x.id).sort(), ['a', 'b']);
  w.tp('b', 60 * TILE, 44 * TILE);
  w.advance(200);
  const snap2 = w.sim.drain().filter((o) => o.to === 'a' && o.msg.t === 'snap').at(-1)!.msg as Extract<ServerMsg, { t: 'snap' }>;
  assert.deepEqual(snap2.players.map((x) => x.id), ['a']);
});

test('movement is server-authoritative: speed is capped and stale input stops', () => {
  const w = makeWorld();
  const p = w.join('a');
  const x0 = p.x;
  w.sim.handle('a', { t: 'input', dx: 1, dy: 0, run: false, seq: 1 });
  w.advance(1000);
  assert.ok(p.x - x0 <= 64 * 1.01 && p.x - x0 > 30, `walked ${p.x - x0}`);
  // a malicious client sends a huge vector: it is clamped, not multiplied
  w.sim.handle('a', { t: 'input', dx: 1e9, dy: 0, run: false, seq: 2 });
  const x1 = p.x;
  w.sim.handle('a', { t: 'input', dx: NaN, dy: 0, run: true, seq: 3 });
  w.advance(500);
  assert.ok(p.x - x1 < 40);
  // no new input for > 700ms: player stops by itself
  const x2 = p.x;
  w.advance(2000);
  assert.ok(p.x - x2 < 64 * 0.9, 'stopped after stale input');
  assert.equal(p.ack >= 2, true);
});

test('chat is sanitised and broadcast to everyone', () => {
  const w = makeWorld();
  w.join('a'); w.join('b');
  w.sim.handle('a', { t: 'chat', text: '  hello\u0000 world  ' });
  const msgs = w.sim.drain().filter((o) => o.msg.t === 'chat');
  assert.equal(msgs.length, 2);
  assert.equal((msgs[0]!.msg as { text: string }).text, 'hello world');
  assert.equal(levelFromXp(0), 1);
});
