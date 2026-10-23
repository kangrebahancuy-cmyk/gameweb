import Phaser from 'phaser';
import { useEffect, useRef } from 'react';
import { BootScene } from '../game/scenes/BootScene';
import { WorldScene } from '../game/scenes/WorldScene';
import type { GameSocket } from '../net/socket';

/** Mounts the Phaser game into a full-size div and tears it down on unmount (frees WebGL context + listeners). */
export function GameCanvas({ socket }: { socket: GameSocket }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current!,
      width: '100%',
      height: '100%',
      backgroundColor: '#1b2a1f',
      pixelArt: true,
      roundPixels: true,
      antialias: false,
      disableContextMenu: true,
      scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.NO_CENTER },
      input: { keyboard: false, gamepad: false },
      render: { powerPreference: 'high-performance' },
      scene: [BootScene, WorldScene],
      callbacks: { preBoot: (g: Phaser.Game) => { g.registry.set('socket', socket); } },
    });
    return () => game.destroy(true);
  }, [socket]);
  return <div ref={host} className="canvas-host" />;
}
