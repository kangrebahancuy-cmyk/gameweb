import { useEffect, useRef, useState } from 'react';
import { CROP_BY_SEED, ITEMS, MAX_LEVEL, countItem, xpForLevel } from '@ero/shared';
import { ownedSeeds } from '../game/interaction';
import { sendAction } from '../net/instance';
import { useGame, type Panel } from '../state/store';
import { CoinIcon, ItemIcon } from './Icon';
import { DialogBox } from './DialogShop';
import { InventoryPanel, JournalPanel, MapPanel, SkillsPanel } from './Panels';
import { ActionButtons, Joystick, isTouchDevice } from './Touch';

export function Hud({ onLogout }: { onLogout: () => void }) {
  const panel = useGame((s) => s.panel);
  const dialog = useGame((s) => s.dialog);
  const touch = useRef(isTouchDevice()).current;
  return (
    <div className="hud">
      <StatusBars />
      <MenuButtons onLogout={onLogout} />
      <Toasts />
      <ChatBox />
      <Hotbar />
      {panel === 'inventory' && <InventoryPanel />}
      {panel === 'skills' && <SkillsPanel />}
      {panel === 'journal' && <JournalPanel />}
      {panel === 'map' && <MapPanel />}
      {dialog && <DialogBox />}
      {touch && <><Joystick /><ActionButtons /></>}
      {!touch && <KeyHints />}
    </div>
  );
}

/** Pack HUD frame (86x30 source px). Bar widths: hp 50, energy 42, farming xp 36 source px at 100%. */
const BAR = { hp: 50, en: 42, xp: 36 };
const U = 'var(--u)';

function StatusBars() {
  const self = useGame((s) => s.self);
  const conn = useGame((s) => s.conn);
  if (!self) return null;
  const f = self.skills.farming;
  const lo = xpForLevel(f.level), hi = f.level >= MAX_LEVEL ? lo : xpForLevel(f.level + 1);
  const xpPct = hi > lo ? Math.min(1, Math.max(0, (f.xp - lo) / (hi - lo))) : 1;
  const w = (full: number, pct: number) => `calc(${Math.round(full * Math.min(1, Math.max(0, pct)) * 100) / 100} * ${U})`;
  return (
    <div className="status">
      <div className="hudframe" title={`HP ${self.hp}/${self.maxHp}  Energy ${Math.round(self.energy)}%  Farming ${f.level}`}>
        <div className="portrait"><i /></div>
        <img className="frame" src="/assets/ui/hud.png" alt="" draggable={false} />
        <div className="fill hp" style={{ width: w(BAR.hp, self.hp / self.maxHp) }} />
        <div className="fill en" style={{ width: w(BAR.en, self.energy / 100) }} />
        <div className="fill xp" style={{ width: w(BAR.xp, xpPct) }} />
      </div>
      <div className="info">
        <span className="name">{self.name}</span><span className={`dot ${conn}`} title={conn} />
        <span className="small">HP {self.hp}/{self.maxHp}</span>
        <span className="line"><CoinIcon size={14} /> {self.coins.toLocaleString()}</span>
        <span className="season">{self.season}</span>
        <span className="small">Combat {Math.floor((self.skills.attack.level + self.skills.strength.level + self.skills.defence.level) / 3)} / {MAX_LEVEL}</span>
      </div>
    </div>
  );
}

function MenuButtons({ onLogout }: { onLogout: () => void }) {
  const toggle = useGame((s) => s.togglePanel);
  const [open, setOpen] = useState(false);
  const btn = (p: Exclude<Panel, null>, label: string) => <button key={p} onClick={() => toggle(p)}>{label}</button>;
  return (
    <div className="menu">
      {btn('inventory', 'Bag')}{btn('skills', 'Skills')}{btn('journal', 'Quests')}{btn('map', 'Map')}
      <button onClick={() => setOpen(!open)} aria-label="Menu">...</button>
      {open && <div className="dropdown"><button onClick={onLogout}>Sign out</button></div>}
    </div>
  );
}

function Toasts() {
  const toasts = useGame((s) => s.toasts);
  return <div className="toasts" aria-live="polite">{toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}</div>;
}

function Hotbar() {
  const self = useGame((s) => s.self);
  const selected = useGame((s) => s.selectedSeed);
  const set = useGame((s) => s.set);
  if (!self) return null;
  const seeds = ownedSeeds(self.inventory);
  const active = selected && seeds.includes(selected) ? selected : seeds[0];
  if (seeds.length === 0) return null;
  return (
    <div className="hotbar" aria-label="Seeds">
      {seeds.map((id, i) => (
        <button key={id} className={`slot${id === active ? ' selected' : ''}`} onClick={() => set({ selectedSeed: id })}
          title={`${ITEMS[id]?.name} (${CROP_BY_SEED[id]?.name}, ${CROP_BY_SEED[id]?.growSeconds}s)`}>
          <ItemIcon id={id} /><span className="qty">{countItem(self.inventory, id)}</span><span className="key">{i + 1}</span>
        </button>
      ))}
    </div>
  );
}

function ChatBox() {
  const chat = useGame((s) => s.chat);
  const open = useGame((s) => s.chatOpen);
  const set = useGame((s) => s.set);
  const [text, setText] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => { logRef.current?.scrollTo(0, 1e6); }, [chat]);
  return (
    <div className="chat">
      <div className="log" ref={logRef}>{chat.slice(-30).map((l) => <div key={l.id}><b>{l.from}:</b> {l.text}</div>)}</div>
      {open ? (
        <form onSubmit={(e) => { e.preventDefault(); const t = text.trim(); if (t) sendAction({ t: 'chat', text: t }); setText(''); set({ chatOpen: false }); }}>
          <input autoFocus maxLength={140} value={text} onChange={(e) => setText(e.target.value)} placeholder="Say something (Enter to send, Esc to cancel)" />
        </form>
      ) : <button className="chat-open" onClick={() => set({ chatOpen: true })}>Chat</button>}
    </div>
  );
}

function KeyHints() {
  return <div className="keyhints">WASD move - Shift run - E use - Space attack - I bag - K skills - J quests - M map - Enter chat</div>;
}
