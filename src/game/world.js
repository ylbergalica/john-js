// The gameplay world: builds floors, owns the entity list, physics, navigation,
// camera and render layers, and advances everything on the fixed simulation step.
import { Container } from 'pixi.js';
import { Physics } from '../engine/physics.js';
import { randInt, pickWeighted } from '../engine/math.js';
import { Camera } from '../render/camera.js';
import { LevelView } from '../render/levelView.js';
import { Effects } from '../render/fx.js';
import { ScreenRipple } from '../render/screenRipple.js';
import { AUDIO, BASE_LEVEL_CONFIG, ENEMY_COMBAT, GAME } from '../data/config.js';
import { sfx } from '../audio/sfx.js';
import { generateLayout, randomFloorInRoom } from '../level/generator.js';
import { scaleConfig } from '../level/difficulty.js';
import { NavField } from '../level/navField.js';
import { Player } from '../player/player.js';
import { Enemy } from '../enemies/enemy.js';
import { Exit } from './pickups.js';

export class World {
  constructor({ session, input }) {
    this.session = session;
    this.input = input;
    this.events = session.events;
    this.adrenaline = session.adrenaline;
    this.time = 0; // simulation clock, seconds

    this.root = new Container();
    this.levelView = new LevelView();
    this.layers = {
      level: this.levelView.root,
      exit: new Container(),
      pickups: new Container(),
      telegraphs: new Container(), // enemy attack areas and afterimages, on the floor
      playerBack: new Container({ sortableChildren: true }),
      enemies: new Container(),
      projectiles: new Container(),
      player: new Container(),
      fx: new Container(),
    };
    this.root.addChild(...Object.values(this.layers));
    this.effects = new Effects(this.layers.fx);
    this.camera = new Camera();
    this.ripple = new ScreenRipple(); // full-screen shockwave on entering Exalted

    this.entities = [];
    this.enemies = [];
    this.hostileAttacks = new Set(); // enemy hitboxes/projectiles the player can parry
    this.player = null;
    this.level = null;
    this.physics = new Physics();
    this.navFields = new Map();
    this.cores = { required: 0, collected: 0 };
    this.activeAttackers = 0;
    this.floorStartedAt = 0;
    this.nextFloorRequested = false;
    this.gameOverAt = Infinity;
  }

  get livePlayer() { return this.player && !this.player.dead ? this.player : null; }
  get isGameOver() { return this.gameOverAt !== Infinity; }
  get finished() { return this.time >= this.gameOverAt; }
  get hasRequiredCores() { return this.cores.collected >= this.cores.required; }

  // ── floors ───────────────────────────────────────────────────────
  startFloor() {
    const cfg = this.session.scalesDifficulty ? scaleConfig(BASE_LEVEL_CONFIG, this.session.floor) : BASE_LEVEL_CONFIG;
    this.clearFloor();

    const layout = (this.level = generateLayout(cfg));
    this.physics = new Physics(layout.grid);
    this.levelView.build(layout.grid);

    this.player = this.add(new Player(this, layout.start.x, layout.start.y));
    this.add(new Exit(this, layout.exit.x, layout.exit.y));
    this.camera.snapTo(layout.start);

    const { rooms, grid } = layout;
    const es = cfg.enemySpawn;
    const first = es.skipFirstRoom ? 1 : 0;
    const last = es.skipLastRoom ? rooms.length - 1 : rooms.length;
    for (let i = first; i < last; i++) {
      const count = randInt(es.minEnemiesPerRoom, es.maxEnemiesPerRoom + 1);
      for (let n = 0; n < count; n++) {
        const pos = randomFloorInRoom(grid, rooms[i]);
        if (pos) this.spawnEnemy(pickWeighted(es.enemies).type, pos);
      }
    }

    // Cores gate the exit; require exactly as many as chasers actually spawned.
    let chasers = 0;
    for (let i = 0; i < cfg.chaserCount; i++) {
      const pos = randomFloorInRoom(grid, rooms[rooms.length - 1]);
      if (!pos) continue;
      this.spawnEnemy(pickWeighted(cfg.chasers).type, pos);
      chasers++;
    }
    this.cores = { required: chasers, collected: 0 };
    this.floorStartedAt = this.time;
    sfx.play('floor');
  }

  clearFloor() {
    for (const e of this.entities) e.destroy();
    this.entities = [];
    this.enemies = [];
    this.hostileAttacks.clear();
    this.navFields.clear();
    this.activeAttackers = 0;
    this.effects.clear();
  }

  requestNextFloor() { this.nextFloorRequested = true; }

  gameOver() {
    if (this.isGameOver) return;
    this.gameOverAt = this.time + GAME.returnDelay;
    this.session.stats.timeSurvived = this.time;
  }

  // ── entities ─────────────────────────────────────────────────────
  add(entity) {
    this.entities.push(entity);
    return entity;
  }

  spawnEnemy(type, pos) {
    const enemy = this.add(new Enemy(this, type, pos.x, pos.y));
    this.enemies.push(enemy);
    return enemy;
  }

  // ── shared services ──────────────────────────────────────────────
  // Flow field toward the player for actors of the given footprint (tiles).
  navField(footprint, searchRadius, refreshInterval) {
    let field = this.navFields.get(footprint);
    if (!field) this.navFields.set(footprint, (field = new NavField(this.level.grid, footprint)));
    const p = this.livePlayer;
    if (p) field.update(p.body.pos, this.time, refreshInterval, searchRadius);
    return field;
  }

  // At most a few enemies commit to attacks at once.
  tryAcquireAttackSlot() {
    if (this.activeAttackers >= ENEMY_COMBAT.maxActiveAttackers) return false;
    this.activeAttackers++;
    return true;
  }
  releaseAttackSlot() { this.activeAttackers = Math.max(0, this.activeAttackers - 1); }

  // Plays a sound at a world position, panned and faded by its offset from the camera.
  // Without a position it plays centred (sounds that happen to the player).
  sound(name, pos = null, opts = {}) {
    if (!pos) { sfx.play(name, opts); return; }
    const { pan, volume } = this.positional(pos);
    sfx.play(name, { ...opts, pan, volume: (opts.volume ?? 1) * volume });
  }

  // How loud (0…1) and how far panned a sound at `pos` is, from its offset to the camera.
  positional(pos) {
    const cam = this.camera;
    const dx = pos.x - cam.x, dy = pos.y - cam.y;
    const fade = 1 - (Math.hypot(dx, dy) - AUDIO.fullVolumeRange) / (AUDIO.silentRange - AUDIO.fullVolumeRange);
    const halfWidth = cam.viewW / cam.ppu / 2;
    return { pan: Math.max(-1, Math.min(1, dx / halfWidth)) * AUDIO.maxPan, volume: Math.max(0, Math.min(1, fade)) };
  }

  // ── loop ─────────────────────────────────────────────────────────
  step(dt) {
    this.time += dt;
    // Entities spawned during this step start stepping next step.
    const n = this.entities.length;
    for (let i = 0; i < n; i++) if (!this.entities[i].dead) this.entities[i].step(dt);
    this.physics.step(dt);
    for (let i = 0; i < n; i++) if (!this.entities[i].dead) this.entities[i].afterPhysics();
    this.adrenaline.step(dt);

    compact(this.entities);
    compact(this.enemies);

    if (this.nextFloorRequested) {
      this.nextFloorRequested = false;
      this.session.floorCleared();
      if (this.session.scalesDifficulty) this.session.floor++;
      this.startFloor();
    }
  }

  render(alpha, dt, screenW, screenH) {
    const cam = this.camera;
    cam.resize(screenW, screenH);
    cam.update(dt, this.livePlayer?.body.lerpPos(alpha));
    const view = cam.viewRect(2);
    for (const e of this.entities) if (!e.dead) e.render(alpha, dt, view);
    this.effects.update(dt);
    cam.apply(this.root);
    this.ripple.update(dt, cam, this.root);
    this.levelView.update(dt, view);
  }

  destroy() {
    this.clearFloor();
    this.levelView.destroy();
    this.root.destroy({ children: true });
  }
}

function compact(list) {
  let w = 0;
  for (let r = 0; r < list.length; r++) if (!list[r].dead) list[w++] = list[r];
  list.length = w;
}
