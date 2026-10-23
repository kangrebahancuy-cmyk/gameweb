import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { WorldSim, newCharacter, CROPS, TILE } from '@ero/shared';
import { PgCharacterStore } from '../src/db/pg-store';
import { NameTakenError, VersionConflict } from '../src/store';

const here = dirname(fileURLToPath(import.meta.url));

async function freshDb() {
  const pg = new PGlite();
  const dir = join(here, '..', 'migrations');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) await pg.exec(readFileSync(join(dir, f), 'utf8'));
  return new PgCharacterStore(drizzle(pg) as never);
}

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

test('character round-trips through real Postgres (migrations + drizzle schema agree)', async () => {
  const store = await freshDb();
  const sim = new WorldSim();
  assert.equal(await store.load(A), null);
  const created = await store.create(A, newCharacter('Alder', sim.map));
  const loaded = (await store.load(A))!;
  assert.equal(loaded.id, created.id);
  assert.deepEqual(loaded.data.inventory.filter(Boolean), [{ id: 'carrot_seed', qty: 5 }]);
  assert.equal(loaded.data.skills.hitpoints, 1154);
  assert.equal(loaded.data.coins, 50);
});

test('farm progress, quests and inventory survive a logout/login cycle', async () => {
  const store = await freshDb();
  let now = 1_760_000_000_000;
  const sim = new WorldSim({ now: () => now });
  let stored = await store.create(A, newCharacter('Alder', sim.map));
  sim.addPlayer('s1', A, stored.data);
  const p = sim.debug().players.get('s1')!;
  const f = sim.map.farm;
  p.x = f.x0 * TILE + 8; p.y = (f.y0 + 1) * TILE - 2;
  sim.handle('s1', { t: 'farm', op: 'till', tx: f.x0, ty: f.y0 });
  sim.handle('s1', { t: 'farm', op: 'plant', tx: f.x0, ty: f.y0, seed: 'carrot_seed' });
  p.char.quests.slime_trouble = { step: 1, progress: 2, done: false };
  const plantedAt = now;
  const saved = sim.removePlayer('s1')!;
  const v1 = await store.save(A, stored.id, saved, stored.version);
  assert.equal(v1, 1);

  // "next day": new process, new sim, same database
  now += 24 * 3600 * 1000;
  const back = (await store.load(A))!;
  assert.deepEqual(back.data.plots, [{ x: f.x0, y: f.y0, state: 'planted', cropId: 'carrot', plantedAt }]);
  assert.deepEqual(back.data.quests.slime_trouble, { step: 1, progress: 2, done: false });
  const sim2 = new WorldSim({ now: () => now });
  sim2.addPlayer('s2', A, back.data);
  const p2 = sim2.debug().players.get('s2')!;
  p2.x = f.x0 * TILE + 8; p2.y = (f.y0 + 1) * TILE - 2;
  sim2.handle('s2', { t: 'farm', op: 'harvest', tx: f.x0, ty: f.y0 });
  assert.ok(p2.char.inventory.some((s) => s?.id === 'carrot'));
  assert.ok(p2.char.skills.farming >= CROPS.carrot!.xp);
});

test('character names are unique case-insensitively', async () => {
  const store = await freshDb();
  const sim = new WorldSim();
  await store.create(A, newCharacter('Alder', sim.map));
  await assert.rejects(() => store.create(B, newCharacter('ALDER', sim.map)), NameTakenError);
});

test('optimistic versioning rejects a second session saving stale data', async () => {
  const store = await freshDb();
  const sim = new WorldSim();
  const s = await store.create(A, newCharacter('Alder', sim.map));
  const v1 = await store.save(A, s.id, { ...s.data, coins: 100 }, 0);
  assert.equal(v1, 1);
  await assert.rejects(() => store.save(A, s.id, { ...s.data, coins: 999999 }, 0), VersionConflict);
  assert.equal((await store.load(A))!.data.coins, 100);
});

test('database constraints refuse negative coins and impossible plots', async () => {
  const pg = new PGlite();
  const dir = join(here, '..', 'migrations');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) await pg.exec(readFileSync(join(dir, f), 'utf8'));
  await pg.exec(`INSERT INTO accounts(id) VALUES ('${A}')`);
  await assert.rejects(() => pg.exec(`INSERT INTO characters(account_id,name,x,y,hp,coins) VALUES ('${A}','x',1,1,10,-5)`));
  await pg.exec(`INSERT INTO characters(id,account_id,name,x,y,hp,coins) VALUES ('${B}','${A}','y',1,1,10,5)`);
  await assert.rejects(() => pg.exec(`INSERT INTO farm_plots(character_id,x,y,state) VALUES ('${B}',1,1,'planted')`));
  await assert.rejects(() => pg.exec(`INSERT INTO inventory_items(character_id,slot,item_id,qty) VALUES ('${B}',0,'carrot',0)`));
});
