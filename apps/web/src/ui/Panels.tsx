import { useEffect, useRef, type ReactNode } from 'react';
import { ACTIVE_SKILLS, CROP_BY_SEED, ITEMS, MAX_LEVEL, SKILL_NAMES, TERRAIN, TILE, xpForLevel } from '@ero/shared';
import { getMap } from '../game/mapSingleton';
import { useGame, world } from '../state/store';
import { CoinIcon, ItemIcon } from './Icon';

function PanelFrame({ title, children }: { title: string; children: ReactNode }) {
  const close = useGame((s) => s.closeAll);
  return (
    <div className="panel" role="dialog" aria-label={title}>
      <header><h2>{title}</h2><button className="x" onClick={close} aria-label="Close">x</button></header>
      <div className="body">{children}</div>
    </div>
  );
}

export function InventoryPanel() {
  const self = useGame((s) => s.self);
  const selected = useGame((s) => s.selectedSeed);
  const set = useGame((s) => s.set);
  if (!self) return null;
  return (
    <PanelFrame title="Backpack">
      <div className="coins"><CoinIcon /> {self.coins.toLocaleString()} coins</div>
      <div className="grid">
        {self.inventory.map((s, i) => {
          const def = s ? ITEMS[s.id] : undefined;
          const isSeed = !!s && !!CROP_BY_SEED[s.id];
          return (
            <button
              key={i}
              className={`slot${s && selected === s.id ? ' selected' : ''}`}
              disabled={!s}
              title={def ? `${def.name}${def.sell !== undefined ? ` - sells for ${def.sell}` : ''}${isSeed ? ' (click to plant)' : ''}` : ''}
              onClick={() => { if (s && isSeed) set({ selectedSeed: s.id }); }}
            >
              {s && <><ItemIcon id={s.id} /><span className="qty">{s.qty}</span></>}
            </button>
          );
        })}
      </div>
      <p className="hint">Click a seed packet to choose what you plant. Sell produce to Mira.</p>
    </PanelFrame>
  );
}

export function SkillsPanel() {
  const self = useGame((s) => s.self);
  if (!self) return null;
  return (
    <PanelFrame title="Skills">
      <ul className="skills">
        {ACTIVE_SKILLS.map((id) => {
          const s = self.skills[id];
          const lo = xpForLevel(s.level), hi = s.level >= MAX_LEVEL ? lo : xpForLevel(s.level + 1);
          const pct = hi > lo ? Math.min(100, ((s.xp - lo) / (hi - lo)) * 100) : 100;
          return (
            <li key={id}>
              <span className="name">{SKILL_NAMES[id]}</span>
              <span className="lvl">{s.level}</span>
              <div className="bar"><div style={{ width: `${pct}%` }} /></div>
              <span className="xp">{s.xp.toLocaleString()} xp</span>
            </li>
          );
        })}
      </ul>
      <p className="hint">More skills (mining, woodcutting, fishing...) are planned. See docs/FEATURE_MATRIX.md.</p>
    </PanelFrame>
  );
}

export function JournalPanel() {
  const self = useGame((s) => s.self);
  if (!self) return null;
  return (
    <PanelFrame title="Quest journal">
      {self.quests.length === 0 && <p className="hint">No quests yet. Old Bram, in the village square, could use some help.</p>}
      <ul className="quests">
        {self.quests.map((q) => (
          <li key={q.id} className={q.done ? 'done' : ''}>
            <strong>{q.name}</strong>
            <span>{q.done ? 'Completed' : `${q.text} (${q.progress}/${q.need})`}</span>
          </li>
        ))}
      </ul>
    </PanelFrame>
  );
}

const TERRAIN_COLOR: Record<number, string> = {
  [TERRAIN.GRASS]: '#4f8a3a', [TERRAIN.SAND]: '#d8c27a', [TERRAIN.WATER]: '#4aa3c8', [TERRAIN.SOLID]: '#7a5a3a', [TERRAIN.FENCE]: '#a07040',
};
const PX = 3;

export function MapPanel() {
  const ref = useRef<HTMLCanvasElement>(null);
  const playerId = useGame((s) => s.playerId);
  useEffect(() => {
    const map = getMap();
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const draw = () => {
      for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
        ctx.fillStyle = TERRAIN_COLOR[map.terrain[y * map.width + x]!] ?? '#4f8a3a';
        ctx.fillRect(x * PX, y * PX, PX, PX);
      }
      const f = map.farm;
      ctx.strokeStyle = '#fff3b0'; ctx.lineWidth = 1;
      ctx.strokeRect(f.x0 * PX + 0.5, f.y0 * PX + 0.5, f.cols * PX, f.maxRows * PX);
      const dot = (wx: number, wy: number, color: string, r = 2) => {
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc((wx / TILE) * PX, (wy / TILE) * PX, r, 0, Math.PI * 2); ctx.fill();
      };
      for (const n of map.npcs) dot(n.x, n.y, '#ffd84a');
      for (const m of world.monsters) if (m.st !== 'dead') dot(m.x, m.y, '#e04848');
      for (const p of world.players) dot(p.x, p.y, p.id === playerId ? '#ffffff' : '#7fd0ff', p.id === playerId ? 3 : 2);
    };
    draw();
    const t = setInterval(draw, 250);
    return () => clearInterval(t);
  }, [playerId]);
  const map = getMap();
  return (
    <PanelFrame title="Map - Starter Valley">
      <canvas ref={ref} className="minimap" width={map.width * PX} height={map.height * PX} />
      <p className="hint">White: you. Blue: other players. Yellow: villagers. Red: slimes. Outline: your farm.</p>
    </PanelFrame>
  );
}
