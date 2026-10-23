import Phaser from 'phaser';
import {
  ATTACK_COOLDOWN_MS, CROPS, ITEMS, NPCS, QUESTS, RUN_SPEED, SKILL_NAMES, TILE, WALK_SPEED,
  buildStarterMap, dirFromVector, stepMove, type Dir, type GameEvent, type MonsterView, type PlayerView,
} from '@ero/shared';
import type { GameSocket } from '../../net/socket';
import { useGame, world } from '../../state/store';
import { FARMER, PLAYER, SLIME, WOMAN, playerAnim, slimeAnim } from '../assets';
import { controller, input } from '../input';
import {
  chooseAttack, chooseIntent, cropStage, describeIntent, farmIntentForTile, inFarm, intentToAction, targetFarmTile,
  type Intent, type IntentContext,
} from '../interaction';

interface RemotePlayer { sprite: Phaser.GameObjects.Sprite; label: Phaser.GameObjects.Text; tx: number; ty: number; dir: Dir; moving: boolean }
interface MonsterEntity { sprite: Phaser.GameObjects.Sprite; tx: number; ty: number; dir: Dir; st: MonsterView['st']; view: MonsterView }
interface PlotView { soil: Phaser.GameObjects.Image; crop?: Phaser.GameObjects.Image; soilFrame: string; cropFrame?: string }

const SOIL_TILLED = [0, 2] as const; // details.png cell (0,2): dry tilled soil
const SOIL_PLANTED = [0, 3] as const; // details.png cell (0,3): darker (worked) soil

export class WorldScene extends Phaser.Scene {
  private map = buildStarterMap();
  private socket!: GameSocket;

  private me?: Phaser.GameObjects.Sprite;
  private px = 0; private py = 0;
  private dir: Dir = 'down';
  private moving = false;
  private serverX = 0; private serverY = 0;

  private remotes = new Map<string, RemotePlayer>();
  private monsters = new Map<string, MonsterEntity>();
  private plots = new Map<string, PlotView>();
  private lastPlotsRef: unknown;
  private lastPlotSync = 0;
  private lastFarmRows = -1;
  private seenVersion = -1;
  private lastActCheck = 0;
  private questMarker?: Phaser.GameObjects.Text;

  private farmGfx!: Phaser.GameObjects.Graphics;
  private markerGfx!: Phaser.GameObjects.Graphics;
  private barGfx!: Phaser.GameObjects.Graphics;

  constructor() { super('World'); }

  /* ------------------------------------------------------------------ setup */

  create() {
    this.socket = this.game.registry.get('socket') as GameSocket;
    this.buildGround();
    this.buildProps();
    this.buildNpcs();
    this.farmGfx = this.add.graphics().setDepth(-900);
    this.markerGfx = this.add.graphics().setDepth(5000);
    this.barGfx = this.add.graphics().setDepth(9000);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.map.width * TILE, this.map.height * TILE);
    cam.setBackgroundColor('#1b2a1f');
    this.applyZoom();
    this.scale.on('resize', this.applyZoom, this);
    this.input.on('pointerdown', this.onPointer, this);

    controller.interact = () => this.interact();
    controller.attack = () => this.attackNearest();

    this.events.once('shutdown', () => {
      this.scale.off('resize', this.applyZoom, this);
      this.input.off('pointerdown', this.onPointer, this);
      controller.interact = () => undefined;
      controller.attack = () => undefined;
    });
  }

  private applyZoom() {
    const { width, height } = this.scale;
    const zoom = Math.max(2, Math.min(6, Math.floor(Math.min(width / 320, height / 200))));
    this.cameras.main.setZoom(zoom);
  }

  private frame(sheet: string, sx: number, sy: number, sw: number, sh: number): string {
    const name = `${sx},${sy},${sw},${sh}`;
    const tex = this.textures.get(sheet);
    if (!tex.has(name)) tex.add(name, 0, sx, sy, sw, sh);
    return name;
  }

  /** Bakes all ground stamps into one canvas texture: one draw call for the whole terrain. */
  private buildGround() {
    const m = this.map;
    const canvas = document.createElement('canvas');
    canvas.width = m.width * TILE; canvas.height = m.height * TILE;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    for (const s of m.ground) {
      const img = this.textures.get(s.sheet).getSourceImage() as CanvasImageSource;
      ctx.drawImage(img, s.sx, s.sy, s.sw, s.sh, s.x, s.y, s.sw, s.sh);
    }
    if (this.textures.exists('ground')) this.textures.remove('ground');
    this.textures.addCanvas('ground', canvas);
    this.add.image(0, 0, 'ground').setOrigin(0, 0).setDepth(-1000);
  }

  private buildProps() {
    for (const p of this.map.props) {
      this.add.image(p.x, p.y, p.sheet, this.frame(p.sheet, p.sx, p.sy, p.sw, p.sh)).setOrigin(0, 0).setDepth(p.depth);
    }
  }

  private buildNpcs() {
    for (const n of this.map.npcs) {
      const def = NPCS[n.id];
      let sprite: Phaser.GameObjects.Sprite;
      if (n.sprite === 'woman') {
        sprite = this.add.sprite(n.x, n.y, WOMAN.key, 0).setOrigin(0.5, 1).setScale(WOMAN.scale);
        sprite.play('woman-idle');
      } else {
        sprite = this.add.sprite(n.x, n.y, FARMER.key, FARMER.rows[n.facing] * 3 + 1).setOrigin(0.5, 1);
      }
      sprite.setDepth(n.y);
      this.label(n.x, n.y - (n.sprite === 'woman' ? 22 : 24), def?.name ?? n.id, '#ffe9a8');
      if (n.id === 'bram') {
        this.questMarker = this.add.text(n.x, n.y - 36, '!', { fontFamily: 'monospace', fontSize: '12px', color: '#ffd84a', stroke: '#000', strokeThickness: 3 })
          .setOrigin(0.5).setDepth(9500).setResolution(4);
        this.tweens.add({ targets: this.questMarker, y: n.y - 40, yoyo: true, repeat: -1, duration: 500 });
      }
    }
  }

  private label(x: number, y: number, text: string, color = '#ffffff') {
    return this.add.text(x, y, text, { fontFamily: 'monospace', fontSize: '8px', color, stroke: '#000000', strokeThickness: 2 })
      .setOrigin(0.5, 1).setDepth(9000).setResolution(4);
  }

  /* ------------------------------------------------------------------- frame */

  update(time: number, delta: number) {
    const dt = Math.min(0.05, delta / 1000);
    const g = useGame.getState();
    this.syncSnapshot();
    if (this.me) this.moveSelf(dt, g.chatOpen);
    this.updateRemotes(dt);
    this.updateMonsters(dt);
    this.syncPlots(time);
    this.drawOverlays();
    this.consumeEvents();
    if (time - this.lastActCheck > 150) { this.lastActCheck = time; this.refreshActLabel(); }
    if (this.questMarker) this.questMarker.setVisible(!g.self?.quests.some((q) => q.id === Object.keys(QUESTS)[0]));
  }

  private moveSelf(dt: number, chatOpen: boolean) {
    const me = this.me!;
    const v = chatOpen ? { dx: 0, dy: 0, run: false } : input.vector();
    const energy = useGame.getState().self?.energy ?? 0;
    const run = v.run && energy > 3 && (v.dx !== 0 || v.dy !== 0);
    // client-side prediction with the exact shared movement code the server runs
    const r = stepMove(this.map, this.px, this.py, v.dx, v.dy, run ? RUN_SPEED : WALK_SPEED, dt);
    this.px = r.x; this.py = r.y; this.moving = r.moved;
    if (v.dx !== 0 || v.dy !== 0) this.dir = dirFromVector(v.dx, v.dy, this.dir);
    this.socket.sendInput(v.dx, v.dy, run);
    if (v.dx === 0 && v.dy === 0) {
      // standing still: ease towards the authoritative position
      this.px += (this.serverX - this.px) * Math.min(1, dt * 6);
      this.py += (this.serverY - this.py) * Math.min(1, dt * 6);
    }
    me.setPosition(this.px, this.py).setDepth(this.py);
    me.play(playerAnim(this.moving ? 'walk' : 'idle', this.dir), true);
  }

  private syncSnapshot() {
    if (this.seenVersion === world.version) return;
    this.seenVersion = world.version;
    const myId = useGame.getState().playerId;

    const seen = new Set<string>();
    for (const p of world.players) {
      if (p.id === myId) { this.onSelfSnapshot(p); continue; }
      seen.add(p.id);
      const r = this.remotes.get(p.id) ?? this.spawnRemote(p);
      r.tx = p.x; r.ty = p.y; r.dir = p.dir; r.moving = p.mv;
    }
    for (const [id, r] of this.remotes) {
      if (!seen.has(id)) { r.sprite.destroy(); r.label.destroy(); this.remotes.delete(id); }
    }

    const mseen = new Set<string>();
    for (const m of world.monsters) {
      mseen.add(m.id);
      const e = this.monsters.get(m.id) ?? this.spawnMonster(m);
      e.tx = m.x; e.ty = m.y; e.dir = m.dir; e.st = m.st; e.view = m;
    }
    for (const [id, e] of this.monsters) {
      if (!mseen.has(id)) { e.sprite.destroy(); this.monsters.delete(id); }
    }
  }

  private onSelfSnapshot(p: PlayerView) {
    this.serverX = p.x; this.serverY = p.y;
    if (!this.me) {
      this.px = p.x; this.py = p.y; this.dir = p.dir;
      this.me = this.add.sprite(p.x, p.y, PLAYER.key, PLAYER.idleRows[0]! * PLAYER.columns + PLAYER.col[p.dir])
        .setOrigin(0.5, PLAYER.originY).setScale(PLAYER.scale);
      this.cameras.main.startFollow(this.me, true, 0.2, 0.2);
      return;
    }
    if (Math.hypot(p.x - this.px, p.y - this.py) > 40) { this.px = p.x; this.py = p.y; } // teleport / correction
  }

  private spawnRemote(p: PlayerView): RemotePlayer {
    const sprite = this.add.sprite(p.x, p.y, PLAYER.key, PLAYER.idleRows[0]! * PLAYER.columns + PLAYER.col[p.dir])
      .setOrigin(0.5, PLAYER.originY).setScale(PLAYER.scale);
    const label = this.label(p.x, p.y - 22, p.name, '#bfe6ff');
    const r: RemotePlayer = { sprite, label, tx: p.x, ty: p.y, dir: p.dir, moving: p.mv };
    this.remotes.set(p.id, r);
    return r;
  }

  private spawnMonster(m: MonsterView): MonsterEntity {
    const sprite = this.add.sprite(m.x, m.y, `${SLIME.prefix}_idle`, 0).setOrigin(0.5, SLIME.originY);
    const e: MonsterEntity = { sprite, tx: m.x, ty: m.y, dir: m.dir, st: m.st, view: m };
    this.monsters.set(m.id, e);
    return e;
  }

  private updateRemotes(dt: number) {
    const k = Math.min(1, dt * 12);
    for (const r of this.remotes.values()) {
      const s = r.sprite;
      s.x += (r.tx - s.x) * k; s.y += (r.ty - s.y) * k;
      s.setDepth(s.y);
      r.label.setPosition(s.x, s.y - 22);
      s.play(playerAnim(r.moving ? 'walk' : 'idle', r.dir), true);
    }
  }

  private updateMonsters(dt: number) {
    const k = Math.min(1, dt * 10);
    for (const e of this.monsters.values()) {
      const s = e.sprite;
      s.x += (e.tx - s.x) * k; s.y += (e.ty - s.y) * k;
      s.setDepth(s.y);
      const state = e.st === 'dead' ? 'death' : e.st;
      s.setTexture(`${SLIME.prefix}_${state}`);
      s.play(slimeAnim(state, e.dir), true);
      s.setAlpha(e.st === 'dead' ? 0.85 : 1);
    }
  }

  /* -------------------------------------------------------------------- farm */

  private syncPlots(time: number) {
    const self = useGame.getState().self;
    if (!self) return;
    if (this.lastFarmRows !== self.farmRows) {
      this.lastFarmRows = self.farmRows;
      const f = this.map.farm;
      this.farmGfx.clear().lineStyle(1, 0xfff3b0, 0.4).strokeRect(f.x0 * TILE + 0.5, f.y0 * TILE + 0.5, f.cols * TILE - 1, self.farmRows * TILE - 1);
    }
    if (self.plots === this.lastPlotsRef && time - this.lastPlotSync < 400) return;
    this.lastPlotsRef = self.plots; this.lastPlotSync = time;
    const keep = new Set<string>();
    const now = world.now();
    for (const p of self.plots) {
      const key = `${p.x},${p.y}`;
      keep.add(key);
      const [sc, sr] = p.state === 'planted' ? SOIL_PLANTED : SOIL_TILLED;
      const soilFrame = this.frame('details', sc * TILE, sr * TILE, TILE, TILE);
      let v = this.plots.get(key);
      if (!v) {
        v = { soil: this.add.image(p.x * TILE, p.y * TILE, 'details', soilFrame).setOrigin(0, 0).setDepth(-800), soilFrame };
        this.plots.set(key, v);
      } else if (v.soilFrame !== soilFrame) { v.soil.setFrame(soilFrame); v.soilFrame = soilFrame; }

      const st = p.state === 'planted' ? cropStage(p, now) : null;
      const def = p.cropId ? CROPS[p.cropId] : undefined;
      if (st && def) {
        const [cx, cy] = def.frames[st.stage]!;
        // draw the cell plus the cell above it: plants grow taller than one tile
        const name = this.frame('crops', cx * TILE, Math.max(0, cy - 1) * TILE, TILE, cy > 0 ? TILE * 2 : TILE);
        if (!v.crop) v.crop = this.add.image(p.x * TILE, (p.y + 1) * TILE, 'crops', name).setOrigin(0, 1).setDepth((p.y + 1) * TILE - 1);
        else if (v.cropFrame !== name) v.crop.setFrame(name);
        v.cropFrame = name;
      } else if (v.crop) { v.crop.destroy(); delete v.crop; delete v.cropFrame; }
    }
    for (const [key, v] of this.plots) {
      if (!keep.has(key)) { v.soil.destroy(); v.crop?.destroy(); this.plots.delete(key); }
    }
  }

  /* --------------------------------------------------------------- overlays */

  private drawOverlays() {
    this.barGfx.clear();
    for (const e of this.monsters.values()) {
      const m = e.view;
      if (m.st === 'dead' || m.hp >= m.maxHp) continue;
      const w = 18, x = e.sprite.x - w / 2, y = e.sprite.y - 25;
      this.barGfx.fillStyle(0x000000, 0.75).fillRect(x - 1, y - 1, w + 2, 4);
      this.barGfx.fillStyle(0xe04848, 1).fillRect(x, y, Math.max(0, (m.hp / m.maxHp) * w), 2);
    }
    this.markerGfx.clear();
    const self = useGame.getState().self;
    if (self && this.me) {
      const t = targetFarmTile(this.map, self.farmRows, this.px, this.py, this.dir);
      if (t) this.markerGfx.lineStyle(1, 0xffffff, 0.8).strokeRect(t.tx * TILE + 0.5, t.ty * TILE + 0.5, TILE - 1, TILE - 1);
    }
  }

  private consumeEvents() {
    const evs = world.events;
    if (evs.length === 0) return;
    world.events = [];
    for (const ev of evs) this.onEvent(ev);
  }

  private onEvent(ev: GameEvent) {
    const myId = useGame.getState().playerId;
    switch (ev.k) {
      case 'hit':
        this.float(ev.x, ev.y - 14, ev.dmg > 0 ? `-${ev.dmg}` : 'miss', ev.dmg > 0 ? '#ff6b6b' : '#cfcfcf');
        if (ev.to === myId && ev.dmg > 0) this.cameras.main.shake(90, 0.004);
        break;
      case 'xp':
        if (this.me) this.float(this.px, this.py - 26 - Math.random() * 6, `+${ev.amount} ${SKILL_NAMES[ev.skill]}`, '#ffd84a');
        break;
      case 'loot': {
        const parts = ev.items.map((i) => `${i.qty}x ${ITEMS[i.id]?.name ?? i.id}`);
        if (ev.coins > 0) parts.push(`${ev.coins} coins`);
        if (parts.length) useGame.getState().toast(`Received: ${parts.join(', ')}`, 'good');
        break;
      }
      default: break;
    }
  }

  private float(x: number, y: number, text: string, color: string) {
    const t = this.add.text(x, y, text, { fontFamily: 'monospace', fontSize: '8px', color, stroke: '#000000', strokeThickness: 2 })
      .setOrigin(0.5).setDepth(10000).setResolution(this.cameras.main.zoom);
    this.tweens.add({ targets: t, y: y - 16, alpha: 0, duration: 900, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  /* ------------------------------------------------------------ interaction */

  private ctx(): IntentContext | null {
    const g = useGame.getState();
    if (!g.self || !this.me) return null;
    return {
      map: this.map, x: this.px, y: this.py, dir: this.dir, self: g.self, monsters: world.monsters,
      selectedSeed: g.selectedSeed, serverNow: world.now(),
    };
  }

  private refreshActLabel() {
    const c = this.ctx();
    const label = c ? describeIntent(chooseIntent(c)) : '';
    if (useGame.getState().actLabel !== label) useGame.setState({ actLabel: label });
  }

  private run(i: Intent) {
    if (i.kind === 'hint') return void useGame.getState().toast(i.text);
    if (i.kind === 'attack') return this.attack(i.target);
    const a = intentToAction(i);
    if (a) this.socket.send(a);
  }

  private attack(target: string) {
    const g = useGame.getState();
    const now = performance.now();
    if (now < g.attackReadyAt) return;
    useGame.setState({ attackReadyAt: now + ATTACK_COOLDOWN_MS });
    this.socket.send({ t: 'attack', target });
  }

  interact() {
    const c = this.ctx();
    if (c) this.run(chooseIntent(c));
  }

  attackNearest() {
    const id = chooseAttack(world.monsters, this.px, this.py);
    if (id) this.attack(id);
    else useGame.getState().toast('No enemy within reach.');
  }

  private onPointer(p: Phaser.Input.Pointer) {
    const c = this.ctx();
    if (!c) return;
    const wx = p.worldX, wy = p.worldY;
    for (const e of this.monsters.values()) {
      if (e.st !== 'dead' && Math.hypot(e.sprite.x - wx, e.sprite.y - 8 - wy) < 12) return this.attack(e.view.id);
    }
    for (const n of this.map.npcs) {
      if (Math.hypot(n.x - wx, n.y - 10 - wy) < 14) {
        const nearby = Math.hypot(n.x - this.px, n.y - this.py) <= 52;
        return nearby ? this.socket.send({ t: 'talk', npc: n.id }) : useGame.getState().toast('Walk closer to talk.');
      }
    }
    const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
    if (inFarm(this.map, c.self.farmRows, tx, ty)) this.run(farmIntentForTile(c, tx, ty));
  }
}
