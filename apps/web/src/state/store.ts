import { create } from 'zustand';
import type { MonsterView, PlayerView, SelfState, GameEvent } from '@ero/shared';

export type Panel = 'inventory' | 'skills' | 'journal' | 'map' | null;
export type Conn = 'idle' | 'connecting' | 'online' | 'reconnecting' | 'closed';
export interface Toast { id: number; text: string; kind: 'info' | 'error' | 'good' }
export interface ChatLine { id: number; from: string; text: string }
export interface Dialog { npc: string; name: string; lines: string[]; shop?: boolean }

interface GameStore {
  conn: Conn;
  fatal: string | null;
  needName: string | null; // message to show on the name prompt
  playerId: string | null;
  self: SelfState | null;
  dialog: Dialog | null;
  panel: Panel;
  chatOpen: boolean;
  toasts: Toast[];
  chat: ChatLine[];
  selectedSeed: string | null;
  attackReadyAt: number;
  /** Label of what the interact button would do right now ('' = nothing). */
  actLabel: string;
  set: (p: Partial<GameStore>) => void;
  toast: (text: string, kind?: Toast['kind']) => void;
  togglePanel: (p: Exclude<Panel, null>) => void;
  closeAll: () => void;
}

let uid = 1;
export const useGame = create<GameStore>((set, get) => ({
  conn: 'idle', fatal: null, needName: null, playerId: null, self: null, dialog: null, panel: null, chatOpen: false,
  toasts: [], chat: [], selectedSeed: null, attackReadyAt: 0, actLabel: '',
  set: (p) => set(p),
  toast: (text, kind = 'info') => {
    const id = uid++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3600);
  },
  togglePanel: (p) => set({ panel: get().panel === p ? null : p, dialog: null }),
  closeAll: () => set({ panel: null, dialog: null, chatOpen: false }),
}));

export function pushChat(from: string, text: string) {
  useGame.setState((s) => ({ chat: [...s.chat.slice(-39), { id: uid++, from, text }] }));
}

/**
 * High-frequency world data lives OUTSIDE React state: the Phaser scene reads it every frame,
 * React never re-renders for a snapshot.
 */
export const world = {
  players: [] as PlayerView[],
  monsters: [] as MonsterView[],
  /** server epoch ms of the last snapshot and the local performance.now() when it arrived */
  serverNow: 0,
  receivedAt: 0,
  version: 0,
  events: [] as GameEvent[],
  reset() { this.players = []; this.monsters = []; this.serverNow = 0; this.receivedAt = 0; this.version = 0; this.events = []; },
  /** Estimated current server time (ms since epoch). */
  now(): number { return this.serverNow === 0 ? Date.now() : this.serverNow + (performance.now() - this.receivedAt); },
};
