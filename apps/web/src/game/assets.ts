/** Verified layouts of the supplied asset packs (see docs/ASSET_MANIFEST.json for the measured sizes). */
import type { Dir } from '@ero/shared';

export const A = '/assets';

export const TILESETS = {
  terrain: `${A}/tilesets/farm/terrain.png`,
  details: `${A}/tilesets/farm/details.png`,
  buildings: `${A}/tilesets/farm/buildings.png`,
  crops: `${A}/tilesets/farm/crops.png`,
} as const;

/**
 * Pixel Art Character (CC0, acasas): 640x640 sheet of 64x64 frames, 10 columns.
 * Columns 0..3 = left, up, down, right. Rows 0..3 = 4 walk frames, rows 5..8 = 4 idle frames (row 7 is a blink).
 */
export const PLAYER = {
  key: 'player', url: `${A}/characters/player/boy.png`, frame: 64, columns: 10,
  col: { left: 0, up: 1, down: 2, right: 3 } as Record<Dir, number>,
  walkRows: [0, 1, 2, 3], idleRows: [5, 6, 7, 8],
  /** Source art is 64px chibi (~39x60 of content); drawn at 1/3 so it stands about 1.25 tiles tall next to 16px tiles. */
  scale: 1 / 3, originY: 63 / 64,
};

/** Free Slime Mobs (CraftPix): per-state sheets, 64x64 frames, rows = down, up, left, right. */
export const SLIME = {
  prefix: 'slime1',
  states: { idle: { frames: 6, fps: 6, loop: true }, walk: { frames: 8, fps: 10, loop: true }, attack: { frames: 10, fps: 16, loop: false },
    hurt: { frames: 5, fps: 14, loop: false }, death: { frames: 10, fps: 10, loop: false } },
  rows: { down: 0, up: 1, left: 2, right: 3 } as Record<Dir, number>,
  frame: 64,
  /** feet sit at y=40 of the 64px frame */
  originY: 40 / 64,
  url: (state: string) => `${A}/monsters/slime/slime1_${state}.png`,
};

/** Vectoraith $farmer: 3 columns x 4 rows of 16x32 (rows = down, left, right, up). Middle column is the standing pose. */
export const FARMER = { key: 'npc_farmer', url: `${A}/characters/npc/farmer.png`, w: 16, h: 32, rows: { down: 0, left: 1, right: 2, up: 3 } as Record<Dir, number> };
/** Farming Set (CC0, ScratchIO) "Slavic Woman": six 33x33 idle frames. */
export const WOMAN = { key: 'npc_woman', url: `${A}/characters/npc/woman_idle.png`, w: 33, h: 33, frames: 6, scale: 0.6 };

export const dirs: Dir[] = ['down', 'up', 'left', 'right'];
export const slimeKey = (state: string) => `${SLIME.prefix}_${state}`;
export const slimeAnim = (state: string, dir: Dir) => `${SLIME.prefix}-${state}-${dir}`;
export const playerAnim = (kind: 'walk' | 'idle', dir: Dir) => `player-${kind}-${dir}`;
