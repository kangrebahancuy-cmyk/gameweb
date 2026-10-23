import type { ActiveSkillId } from './content';
import type { ItemStack } from './inventory';
import type { Dir } from './movement';
import type { Season } from './rules';

export interface PlotState {
  x: number; // tile coords
  y: number;
  state: 'tilled' | 'planted';
  cropId?: string;
  /** Server epoch ms at planting. Growth is computed from the SERVER clock only. */
  plantedAt?: number;
}

export interface QuestState { step: number; progress: number; done: boolean }

/** Everything that is persisted for a character (see apps/worker/src/db). */
export interface CharacterData {
  name: string;
  x: number;
  y: number;
  hp: number;
  coins: number;
  skills: Record<ActiveSkillId, number>; // xp per skill
  inventory: (ItemStack | null)[];
  plots: PlotState[];
  farmRows: number;
  quests: Record<string, QuestState>;
}

/* --------------------------------------------------------------- client -> server */
export type ClientAction =
  | { t: 'input'; dx: number; dy: number; run: boolean; seq: number }
  | { t: 'farm'; op: 'till' | 'plant' | 'harvest'; tx: number; ty: number; seed?: string }
  | { t: 'attack'; target: string }
  | { t: 'talk'; npc: string }
  | { t: 'shop'; npc: string; op: 'buy' | 'sell'; item: string; qty: number }
  | { t: 'expand_farm' }
  | { t: 'rest' }
  | { t: 'chat'; text: string };

/* --------------------------------------------------------------- server -> client */
export interface SkillView { xp: number; level: number }
export interface QuestView { id: string; name: string; text: string; progress: number; need: number; done: boolean }
export interface SelfState {
  name: string;
  hp: number;
  maxHp: number;
  energy: number;
  coins: number;
  skills: Record<ActiveSkillId, SkillView>;
  inventory: (ItemStack | null)[];
  plots: PlotState[];
  farmRows: number;
  quests: QuestView[];
  season: Season;
}
export interface PlayerView { id: string; name: string; x: number; y: number; dir: Dir; mv: boolean; hp: number; maxHp: number }
export interface MonsterView { id: string; type: string; x: number; y: number; dir: Dir; hp: number; maxHp: number; st: 'idle' | 'walk' | 'attack' | 'hurt' | 'dead' }

export type GameEvent =
  | { k: 'hit'; from: string; to: string; dmg: number; x: number; y: number }
  | { k: 'xp'; skill: ActiveSkillId; amount: number }
  | { k: 'level'; skill: ActiveSkillId; level: number }
  | { k: 'loot'; items: ItemStack[]; coins: number }
  | { k: 'toast'; text: string }
  | { k: 'died' }
  | { k: 'quest'; text: string };

export type ServerMsg =
  | { t: 'welcome'; id: string; state: SelfState; now: number }
  | { t: 'snap'; ack: number; now: number; players: PlayerView[]; monsters: MonsterView[] }
  | { t: 'state'; state: SelfState }
  | { t: 'ev'; ev: GameEvent }
  | { t: 'dialog'; npc: string; name: string; lines: string[]; shop?: boolean }
  | { t: 'chat'; from: string; text: string }
  | { t: 'err'; code: string; msg: string };
