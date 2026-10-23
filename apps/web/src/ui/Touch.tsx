import { useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { controller, input } from '../game/input';
import { useGame } from '../state/store';

export const isTouchDevice = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window);

const RADIUS = 56;

/** Virtual joystick (lower-left). Drives the same `input` object as WASD. Tracks one pointer id so touches can't double-fire. */
export function Joystick() {
  const base = useRef<HTMLDivElement>(null);
  const activeId = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const update = (e: RPointerEvent) => {
    const r = base.current!.getBoundingClientRect();
    let x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
    const m = Math.hypot(x, y);
    if (m > RADIUS) { x = (x / m) * RADIUS; y = (y / m) * RADIUS; }
    setKnob({ x, y });
    input.joy = { x: x / RADIUS, y: y / RADIUS, active: true };
  };
  const end = (e: RPointerEvent) => {
    if (activeId.current !== e.pointerId) return;
    activeId.current = null;
    setKnob({ x: 0, y: 0 });
    input.joy = { x: 0, y: 0, active: false };
  };

  return (
    <div
      ref={base}
      className="joystick"
      onPointerDown={(e) => {
        if (activeId.current !== null) return;
        activeId.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault(); e.stopPropagation();
        update(e);
      }}
      onPointerMove={(e) => { if (activeId.current === e.pointerId) update(e); }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
    >
      <div className="joystick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}

/** Interaction + attack buttons (lower-right). They fire on pointerdown only, never on click as well. */
export function ActionButtons() {
  const label = useGame((s) => s.actLabel);
  const press = (fn: () => void) => (e: RPointerEvent) => { e.preventDefault(); e.stopPropagation(); fn(); };
  return (
    <div className="action-buttons">
      <button className="act-btn attack" onPointerDown={press(() => controller.attack())} aria-label="Attack">Hit</button>
      <button className="act-btn interact" onPointerDown={press(() => controller.interact())} aria-label="Interact">{label || 'Use'}</button>
    </div>
  );
}
