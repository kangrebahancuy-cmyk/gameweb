import { useEffect } from 'react';
import { actionFor, controller, input } from '../game/input';
import { ownedSeeds } from '../game/interaction';
import { useGame } from '../state/store';

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');

/** Desktop keyboard: movement keys feed `input`, everything else maps to UI/gameplay actions. */
export function useKeyboard() {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTyping(e.target)) {
        if (e.code === 'Escape') { (e.target as HTMLElement).blur(); useGame.setState({ chatOpen: false }); }
        return;
      }
      const g = useGame.getState();
      if (/^Digit[1-9]$/.test(e.code)) {
        const seeds = g.self ? ownedSeeds(g.self.inventory) : [];
        const seed = seeds[Number(e.code.slice(5)) - 1];
        if (seed) g.set({ selectedSeed: seed });
        return;
      }
      const a = actionFor(e.code);
      if (!a) return;
      e.preventDefault();
      switch (a) {
        case 'up': case 'down': case 'left': case 'right': case 'run': input.keys.add(e.code); break;
        case 'interact': if (!e.repeat) controller.interact(); break;
        case 'attack': if (!e.repeat) controller.attack(); break;
        case 'inventory': if (!e.repeat) g.togglePanel('inventory'); break;
        case 'skills': if (!e.repeat) g.togglePanel('skills'); break;
        case 'journal': if (!e.repeat) g.togglePanel('journal'); break;
        case 'map': if (!e.repeat) g.togglePanel('map'); break;
        case 'chat': if (!e.repeat) g.set({ chatOpen: true }); break;
        case 'close': g.closeAll(); break;
      }
    };
    const up = (e: KeyboardEvent) => { input.keys.delete(e.code); };
    const blur = () => input.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      input.clear();
    };
  }, []);
}
