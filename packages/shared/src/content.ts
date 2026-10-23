import type { Season } from './rules';

/* ------------------------------------------------------------------ skills */

export const ALL_SKILLS = [
  'attack', 'strength', 'defence', 'hitpoints', 'ranged', 'prayer', 'magic', 'mining', 'woodcutting', 'fishing',
  'hunter', 'farming', 'smithing', 'crafting', 'cooking', 'fletching', 'herblore', 'runecraft', 'firemaking',
  'agility', 'thieving', 'slayer', 'construction',
] as const;
export type SkillId = (typeof ALL_SKILLS)[number];

/** Only skills with real server-validated actions are active; the rest are tracked in docs/FEATURE_MATRIX.md. */
export const ACTIVE_SKILLS = ['attack', 'strength', 'defence', 'hitpoints', 'farming'] as const;
export type ActiveSkillId = (typeof ACTIVE_SKILLS)[number];
export const SKILL_NAMES: Record<ActiveSkillId, string> = {
  attack: 'Attack', strength: 'Strength', defence: 'Defence', hitpoints: 'Hitpoints', farming: 'Farming',
};

/* ------------------------------------------------------------------ items */

export type IconSheet = 'veg' | 'seeds' | 'gen';
export const ICON_SHEETS: Record<IconSheet, { url: string; w: number; h: number }> = {
  veg: { url: '/assets/items/vegetables.png', w: 128, h: 224 },
  seeds: { url: '/assets/items/seeds_cereals.png', w: 64, h: 160 },
  gen: { url: '/assets/items/ero_icons.png', w: 64, h: 32 },
};
export interface IconRef { sheet: IconSheet; x: number; y: number; w: number; h: number }

export interface ItemDef {
  id: string;
  name: string;
  icon: IconRef;
  /** Price the general store charges (undefined = not sold). */
  buy?: number;
  /** Price the general store pays (undefined = cannot be sold). */
  sell?: number;
}

export const INVENTORY_SLOTS = 28;
export const MAX_STACK = 2_000_000_000;

export const COIN_ICON: IconRef = { sheet: 'gen', x: 0, y: 0, w: 32, h: 32 };

const seed = (row: number): IconRef => ({ sheet: 'seeds', x: 0, y: row * 32, w: 32, h: 32 });
const veg = (cx: number, cy: number): IconRef => ({ sheet: 'veg', x: cx * 32, y: cy * 32, w: 32, h: 32 });

export const ITEMS: Record<string, ItemDef> = {
  carrot_seed: { id: 'carrot_seed', name: 'Carrot Seeds', icon: seed(4), buy: 10, sell: 4 },
  tomato_seed: { id: 'tomato_seed', name: 'Tomato Seeds', icon: seed(1), buy: 16, sell: 6 },
  eggplant_seed: { id: 'eggplant_seed', name: 'Eggplant Seeds', icon: seed(2), buy: 28, sell: 11 },
  pumpkin_seed: { id: 'pumpkin_seed', name: 'Pumpkin Seeds', icon: seed(0), buy: 45, sell: 18 },
  carrot: { id: 'carrot', name: 'Carrot', icon: veg(2, 1), sell: 22 },
  tomato: { id: 'tomato', name: 'Tomato', icon: veg(1, 0), sell: 38 },
  eggplant: { id: 'eggplant', name: 'Eggplant', icon: veg(2, 2), sell: 70 },
  pumpkin: { id: 'pumpkin', name: 'Pumpkin', icon: { sheet: 'veg', x: 0, y: 96, w: 64, h: 64 }, sell: 130 },
  slime_gel: { id: 'slime_gel', name: 'Slime Gel', icon: { sheet: 'gen', x: 32, y: 0, w: 32, h: 32 }, sell: 9 },
};

/* ------------------------------------------------------------------ crops */

export interface CropDef {
  id: string;
  name: string;
  seedItem: string;
  produceItem: string;
  /** Real (server) seconds from planting until ripe. Short on purpose in the vertical slice. */
  growSeconds: number;
  levelReq: number;
  xp: number;
  yieldMin: number;
  yieldMax: number;
  seasons: Season[];
  /** 4 growth frames (last = ripe) as 16x16 cell coordinates in tilesets/farm/crops.png */
  frames: [number, number][];
}

const ALL: Season[] = ['spring', 'summer', 'fall', 'winter'];
export const CROPS: Record<string, CropDef> = {
  carrot: {
    id: 'carrot', name: 'Carrot', seedItem: 'carrot_seed', produceItem: 'carrot', growSeconds: 60, levelReq: 1, xp: 12,
    yieldMin: 1, yieldMax: 2, seasons: ALL, frames: [[0, 7], [1, 7], [2, 7], [3, 7]],
  },
  tomato: {
    id: 'tomato', name: 'Tomato', seedItem: 'tomato_seed', produceItem: 'tomato', growSeconds: 120, levelReq: 2, xp: 22,
    yieldMin: 1, yieldMax: 2, seasons: ['spring', 'summer', 'fall'], frames: [[0, 9], [1, 9], [2, 9], [3, 9]],
  },
  eggplant: {
    id: 'eggplant', name: 'Eggplant', seedItem: 'eggplant_seed', produceItem: 'eggplant', growSeconds: 180, levelReq: 4, xp: 38,
    yieldMin: 1, yieldMax: 1, seasons: ['summer', 'fall'], frames: [[4, 13], [5, 13], [6, 13], [7, 13]],
  },
  pumpkin: {
    id: 'pumpkin', name: 'Pumpkin', seedItem: 'pumpkin_seed', produceItem: 'pumpkin', growSeconds: 300, levelReq: 6, xp: 70,
    yieldMin: 1, yieldMax: 1, seasons: ['summer', 'fall'], frames: [[0, 15], [1, 15], [2, 15], [3, 15]],
  },
};
export const CROP_BY_SEED: Record<string, CropDef> = Object.fromEntries(Object.values(CROPS).map((c) => [c.seedItem, c]));

export const FARM_EXPANSION_COST = 150;

/* ----------------------------------------------------------------- monsters */

export interface LootEntry { item?: string; coins?: boolean; chance: number; min: number; max: number }
export interface MonsterDef {
  id: string;
  name: string;
  /** Sprite family in assets/monsters/slime (slime1_*.png) */
  sprite: string;
  level: number;
  hp: number;
  maxHit: number;
  accuracy: number;
  defence: number;
  speed: number;
  aggroRange: number;
  attackRange: number;
  attackCooldownMs: number;
  respawnMs: number;
  leash: number;
  loot: LootEntry[];
}

export const MONSTERS: Record<string, MonsterDef> = {
  slime_green: {
    id: 'slime_green', name: 'Green Slime', sprite: 'slime1', level: 2, hp: 10, maxHit: 2, accuracy: 0.7, defence: 1,
    speed: 26, aggroRange: 72, attackRange: 18, attackCooldownMs: 1800, respawnMs: 15000, leash: 170,
    loot: [
      { item: 'slime_gel', chance: 1, min: 1, max: 2 },
      { coins: true, chance: 0.75, min: 2, max: 6 },
      { item: 'carrot_seed', chance: 0.15, min: 1, max: 1 },
    ],
  },
};

/* --------------------------------------------------------------------- NPCs */

export interface NpcDef { id: string; name: string; role: 'quest' | 'shop' }
export const NPCS: Record<string, NpcDef> = {
  bram: { id: 'bram', name: 'Old Bram', role: 'quest' },
  mira: { id: 'mira', name: 'Mira', role: 'shop' },
};

export const SHOP_STOCK: Record<string, string[]> = {
  mira: ['carrot_seed', 'tomato_seed', 'eggplant_seed', 'pumpkin_seed'],
};

/* ------------------------------------------------------------------- quests */

export type QuestStep =
  | { type: 'harvest'; crop: string; count: number; text: string }
  | { type: 'kill'; monster: string; count: number; text: string }
  | { type: 'talk'; npc: string; count: 1; text: string };

export interface QuestDef {
  id: string;
  name: string;
  giver: string;
  steps: QuestStep[];
  offer: string[];
  reminders: string[][]; // one list of lines per step
  complete: string[];
  reward: { coins: number; xp: Partial<Record<ActiveSkillId, number>>; items: { id: string; qty: number }[] };
}

export const QUESTS: Record<string, QuestDef> = {
  slime_trouble: {
    id: 'slime_trouble',
    name: 'Slime Trouble',
    giver: 'bram',
    steps: [
      { type: 'harvest', crop: 'carrot', count: 3, text: 'Harvest 3 carrots from your farm' },
      { type: 'kill', monster: 'slime_green', count: 2, text: 'Defeat 2 green slimes in the eastern forest' },
      { type: 'talk', npc: 'bram', count: 1, text: 'Return to Old Bram in the village square' },
    ],
    offer: [
      'Ah, a new face! The slimes in the east forest have been nibbling my carrot patch.',
      'Grow three carrots on your farm so I know you can handle a hoe, then clear out two of those green blobs.',
      'Follow the path east of the square. Come back when it is done.',
    ],
    reminders: [
      ['Three carrots first. Till a plot, plant carrot seeds and wait for them to ripen.'],
      ['The slimes are along the eastern forest path. Two of them should do.'],
      ['You did it? Tell me everything.'],
    ],
    complete: ['Splendid! The patch is safe again. Take this for your trouble, and some pumpkin seeds for your farm.'],
    reward: { coins: 150, xp: { farming: 100 }, items: [{ id: 'pumpkin_seed', qty: 3 }] },
  },
};

export const STARTING_COINS = 50;
export const STARTING_ITEMS: { id: string; qty: number }[] = [{ id: 'carrot_seed', qty: 5 }];
