/**
 * Single source of truth for movement input. Keyboard and the on-screen joystick both write here, and the Phaser
 * scene reads it once per frame, so both control schemes drive the SAME authoritative character.
 */
export type Action =
  | 'up' | 'down' | 'left' | 'right' | 'run' | 'interact' | 'attack'
  | 'inventory' | 'skills' | 'journal' | 'map' | 'chat' | 'close';

export const DEFAULT_KEYMAP: Record<Action, string[]> = {
  up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'], interact: ['KeyE'], attack: ['Space', 'KeyF'],
  inventory: ['KeyI'], skills: ['KeyK'], journal: ['KeyJ'], map: ['KeyM'], chat: ['Enter'], close: ['Escape'],
};

const STORAGE_KEY = 'ero.keymap.v1';

/** Player-configurable bindings (persisted per browser). Unknown/invalid entries fall back to the defaults. */
export function loadKeymap(): Record<Action, string[]> {
  const km = structuredClone(DEFAULT_KEYMAP);
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Record<Action, unknown>> | null;
    if (raw && typeof raw === 'object') {
      for (const a of Object.keys(km) as Action[]) {
        const v = raw[a];
        if (Array.isArray(v) && v.length > 0 && v.every((k) => typeof k === 'string' && k.length < 24)) km[a] = v as string[];
      }
    }
  } catch { /* storage unavailable: defaults */ }
  return km;
}
export const keymap = loadKeymap();
export function rebind(action: Action, codes: string[]) {
  keymap[action] = codes;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(keymap)); } catch { /* ignore */ }
}
export function actionFor(code: string): Action | undefined {
  return (Object.keys(keymap) as Action[]).find((a) => keymap[a].includes(code));
}

const held = (keys: Set<string>, a: Action) => keymap[a].some((c) => keys.has(c));

export const input = {
  keys: new Set<string>(),
  joy: { x: 0, y: 0, active: false },
  /** Held run modifier from the touch UI (Shift on desktop). */
  touchRun: false,
  vector(): { dx: number; dy: number; run: boolean } {
    if (this.joy.active) {
      const m = Math.hypot(this.joy.x, this.joy.y);
      if (m > 0.18) return { dx: this.joy.x / Math.max(1, m), dy: this.joy.y / Math.max(1, m), run: this.touchRun || m > 0.92 };
      return { dx: 0, dy: 0, run: false };
    }
    const k = this.keys;
    const dx = (held(k, 'right') ? 1 : 0) - (held(k, 'left') ? 1 : 0);
    const dy = (held(k, 'down') ? 1 : 0) - (held(k, 'up') ? 1 : 0);
    return { dx, dy, run: held(k, 'run') };
  },
  clear() { this.keys.clear(); this.joy = { x: 0, y: 0, active: false }; this.touchRun = false; },
};

/** Handlers the Phaser scene registers; keyboard shortcuts and touch buttons call these. */
export const controller = {
  interact: (): void => undefined,
  attack: (): void => undefined,
};
