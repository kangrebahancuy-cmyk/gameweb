import { type GameMap, isBlockedTile } from './map';
import { TILE } from './rules';

export const WALK_SPEED = 64; // px/s
export const RUN_SPEED = 104;
export const HALF_W = 5; // collision box half width (px)
export const BOX_H = 6; // collision box height above the feet (px)

export function collides(map: GameMap, x: number, y: number): boolean {
  const x0 = Math.floor((x - HALF_W) / TILE), x1 = Math.floor((x + HALF_W) / TILE);
  const y0 = Math.floor((y - BOX_H) / TILE), y1 = Math.floor(y / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (isBlockedTile(map, tx, ty)) return true;
  return false;
}

/** Moves a point by (dx,dy) (any magnitude, normalised here) at `speed` px/s for `dt` seconds with axis-separated collision. */
export function stepMove(map: GameMap, x: number, y: number, dx: number, dy: number, speed: number, dt: number) {
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x, y, moved: false };
  const vx = (dx / len) * speed * dt, vy = (dy / len) * speed * dt;
  let nx = x, ny = y;
  if (!collides(map, x + vx, y)) nx = x + vx;
  if (!collides(map, nx, y + vy)) ny = y + vy;
  return { x: nx, y: ny, moved: nx !== x || ny !== y };
}

export type Dir = 'down' | 'up' | 'left' | 'right';
export function dirFromVector(dx: number, dy: number, prev: Dir): Dir {
  if (dx === 0 && dy === 0) return prev;
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}
