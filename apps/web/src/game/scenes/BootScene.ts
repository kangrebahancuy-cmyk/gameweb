import Phaser from 'phaser';
import { FARMER, PLAYER, SLIME, TILESETS, WOMAN, dirs, playerAnim, slimeAnim, slimeKey } from '../assets';

/** Loads every texture, builds the animations from the verified sheet layouts, then starts the world. */
export class BootScene extends Phaser.Scene {
  private failed: string[] = [];

  constructor() { super('Boot'); }

  preload() {
    const { width, height } = this.scale;
    const label = this.add.text(width / 2, height / 2, 'Loading...', { fontFamily: 'monospace', fontSize: '14px', color: '#d8e8c8' }).setOrigin(0.5);
    this.load.on('progress', (p: number) => label.setText(`Loading ${Math.round(p * 100)}%`));
    this.load.on('loaderror', (f: { src: string }) => this.failed.push(f.src));

    for (const [key, url] of Object.entries(TILESETS)) this.load.image(key, url);
    this.load.spritesheet(PLAYER.key, PLAYER.url, { frameWidth: PLAYER.frame, frameHeight: PLAYER.frame });
    for (const state of Object.keys(SLIME.states)) this.load.spritesheet(slimeKey(state), SLIME.url(state), { frameWidth: SLIME.frame, frameHeight: SLIME.frame });
    this.load.spritesheet(FARMER.key, FARMER.url, { frameWidth: FARMER.w, frameHeight: FARMER.h });
    this.load.spritesheet(WOMAN.key, WOMAN.url, { frameWidth: WOMAN.w, frameHeight: WOMAN.h });
  }

  create() {
    if (this.failed.length) {
      const { width, height } = this.scale;
      this.add.text(width / 2, height / 2, `Missing game art:\n${this.failed.join('\n')}\n\nRun: python3 scripts/import_assets.py <folder-with-the-4-zips>\n(see docs/ASSET_CREDITS.md)`,
        { fontFamily: 'monospace', fontSize: '12px', color: '#ffb0a0', align: 'center', wordWrap: { width: Math.max(200, width - 40) } }).setOrigin(0.5);
      return;
    }
    this.makeAnims();
    this.scene.start('World');
  }

  private makeAnims() {
    const a = this.anims;
    for (const d of dirs) {
      const c = PLAYER.col[d];
      a.create({ key: playerAnim('walk', d), frames: PLAYER.walkRows.map((r) => ({ key: PLAYER.key, frame: r * PLAYER.columns + c })), frameRate: 8, repeat: -1 });
      a.create({ key: playerAnim('idle', d), frames: PLAYER.idleRows.map((r) => ({ key: PLAYER.key, frame: r * PLAYER.columns + c })), frameRate: 2, repeat: -1 });
    }
    for (const [state, def] of Object.entries(SLIME.states)) {
      for (const d of dirs) {
        const start = SLIME.rows[d] * def.frames;
        a.create({
          key: slimeAnim(state, d),
          frames: a.generateFrameNumbers(slimeKey(state), { start, end: start + def.frames - 1 }),
          frameRate: def.fps, repeat: def.loop ? -1 : 0,
        });
      }
    }
    a.create({ key: 'woman-idle', frames: a.generateFrameNumbers(WOMAN.key, { start: 0, end: WOMAN.frames - 1 }), frameRate: 5, repeat: -1 });
  }
}
