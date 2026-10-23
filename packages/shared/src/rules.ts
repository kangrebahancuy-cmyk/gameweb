/** Pure game rules shared by client (prediction/UI) and server (authority). No dependencies. */

export const TILE = 16;
export const MAX_LEVEL = 99;

const XP_TABLE: number[] = (() => {
  // OSRS-style curve (original implementation of the public formula).
  const t = [0, 0];
  let points = 0;
  for (let lvl = 1; lvl < MAX_LEVEL; lvl++) {
    points += Math.floor(lvl + 300 * Math.pow(2, lvl / 7));
    t[lvl + 1] = Math.floor(points / 4);
  }
  return t;
})();

export function xpForLevel(level: number): number {
  const l = Math.min(MAX_LEVEL, Math.max(1, Math.floor(level)));
  return XP_TABLE[l]!;
}

export function levelFromXp(xp: number): number {
  let lvl = 1;
  while (lvl < MAX_LEVEL && xp >= XP_TABLE[lvl + 1]!) lvl++;
  return lvl;
}

export const maxHpForLevel = (hitpointsLevel: number) => hitpointsLevel * 3;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export type Season = 'spring' | 'summer' | 'fall' | 'winter';
export const SEASONS: Season[] = ['spring', 'summer', 'fall', 'winter'];
export const SEASON_LENGTH_MS = 7 * 24 * 60 * 60 * 1000;

/** The world clock is the server clock, so season (and crop growth) cannot be changed from a browser. */
export function seasonAt(nowMs: number): Season {
  const idx = Math.floor(nowMs / SEASON_LENGTH_MS);
  return SEASONS[((idx % 4) + 4) % 4]!;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randInt = (rng: () => number, min: number, max: number) => min + Math.floor(rng() * (max - min + 1));

/** Chance that an attacker with `attackLevel` lands a hit on a target with `defenceLevel`. */
export function hitChance(attackLevel: number, defenceLevel: number): number {
  return clamp(0.55 + (attackLevel - defenceLevel) * 0.03, 0.3, 0.95);
}

/** Player's max melee hit (bare-handed in the vertical slice). */
export function playerMaxHit(strengthLevel: number): number {
  return 3 + Math.floor(strengthLevel / 3);
}

/** Chance that a monster hit lands on a player with `defenceLevel`. */
export function monsterHitChance(monsterAccuracy: number, defenceLevel: number): number {
  return clamp(monsterAccuracy - (defenceLevel - 1) * 0.02, 0.25, 0.9);
}
