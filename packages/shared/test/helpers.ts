import { WorldSim, newCharacter } from '../src/sim';
import { mulberry32, TILE } from '../src/rules';
import type { ServerMsg } from '../src/types';

export function makeWorld(seed = 7) {
  const clock = { t: 1_760_000_000_000 };
  const sim = new WorldSim({ now: () => clock.t, rng: mulberry32(seed) });
  const advance = (ms: number, step = 100) => {
    for (let left = ms; left > 0; left -= step) { clock.t += Math.min(step, left); sim.tick(); }
  };
  const join = (id: string, name = id) => {
    sim.addPlayer(id, `acct-${id}`, newCharacter(name, sim.map));
    return sim.debug().players.get(id)!;
  };
  const inbox = (to: string): ServerMsg[] => {
    const all = sim.drain();
    return all.filter((o) => o.to === to).map((o) => o.msg);
  };
  const tp = (id: string, x: number, y: number) => { const p = sim.debug().players.get(id)!; p.x = x; p.y = y; };
  const farmTile = (i = 0) => ({ tx: sim.map.farm.x0 + (i % sim.map.farm.cols), ty: sim.map.farm.y0 + Math.floor(i / sim.map.farm.cols) });
  const standAtFarm = (id: string, i = 0) => { const { tx, ty } = farmTile(i); tp(id, tx * TILE + 8, (ty + 1) * TILE - 2); };
  return { sim, clock, advance, join, inbox, tp, farmTile, standAtFarm };
}
