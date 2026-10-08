// The gameplay world: builds floors, owns the entity list, physics, navigation,
// camera and render layers, and advances everything on the fixed simulation step.
import { Container } from 'pixi.js';
import { Physics } from '../engine/physics.js';
import { randInt, pickWeighted, clamp, clamp01, lerp, dist } from '../engine/math.js';
import { Camera } from '../render/camera.js';
import { LevelView } from '../render/levelView.js';
import { Effects } from '../render/fx.js';
import { DeathFx } from '../render/deathFx.js';
import { ScreenRipple } from '../render/screenRipple.js';
import { AUDIO, BASE_LEVEL_CONFIG, ENEMY_COMBAT, GAME, GUARDIAN_INTRO as GI, PLAYER } from '../data/config.js';
import { sfx } from '../audio/sfx.js';
import { generateLayout, randomFloorInRoom } from '../level/generator.js';
import { scaleConfig } from '../level/difficulty.js';
import { NavField } from '../level/navField.js';
import { Player } from '../player/player.js';
import { Enemy } from '../enemies/enemy.js';
import { Exit } from './pickups.js';
import { RunMode } from './session.js';

const easeOut = (t) => 1 - (1 - t) ** 3;
const easeInOut = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

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
    this.deathFx = new DeathFx(this); // enemies bursting apart as they die
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
    this.intro = null; // guardian intro in progress (see GUARDIAN_INTRO); the world is frozen meanwhile
    this.nextFloorRequested = false;
    this.floorHeal = null; // health streaming in at the start of a floor (see carryHealth)
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
    this.floorStartedAt = this.time; // the clock is frozen through the guardian intro, so this still holds after it
    this.intro = null;
    const guardian = this.enemies.find((e) => e.type.isChaser);
    if (guardian && this.session.mode === RunMode.Run && this.session.floor <= GI.floors) this.startIntro(guardian);
    else sfx.play('floor');
  }

  // ── guardian intro ───────────────────────────────────────────────
  // Opens on the floor's guardian, then glides to the player. Runs on render time, so the
  // camera moves smoothly at any frame rate; pausing (dt = 0) holds it.
  startIntro(guardian) {
    const panTime = clamp(dist(guardian.body.pos, this.player.body.pos) * GI.panPerUnit, GI.minPan, GI.maxPan);
    this.intro = { guardian, t: 0, panTime, focus: 1, fade: 1 }; // focus: vignette strength, fade: black overlay
    this.camera.snapTo(guardian.body.pos);
    sfx.play('guardian');
  }

  updateIntro(dt, alpha) {
    const it = this.intro, cam = this.camera;
    it.t += dt;
    const from = it.guardian.body.lerpPos(alpha), to = this.player.body.lerpPos(alpha);
    if (it.t < GI.hold) {
      cam.snapTo(from);
      cam.zoom = lerp(1, GI.zoom, easeOut(it.t / GI.hold));
      it.fade = 1 - clamp01(it.t / GI.fadeIn);
      return;
    }
    const p = clamp01((it.t - GI.hold) / it.panTime), e = easeInOut(p);
    cam.snapTo({ x: lerp(from.x, to.x, e), y: lerp(from.y, to.y, e) });
    cam.zoom = lerp(GI.zoom, 1, e);
    it.focus = 1 - e;
    it.fade = 0;
    if (p >= 1) {
      this.intro = null;
      cam.zoom = 1;
      sfx.play('floor');
    }
  }

  clearFloor() {
    for (const e of this.entities) e.destroy();
    this.entities = [];
    this.enemies = [];
    this.hostileAttacks.clear();
    this.navFields.clear();
    this.activeAttackers = 0;
    this.effects.clear();
    this.deathFx.clear();
    this.floorHeal = null;
  }

  // ── floor heal ───────────────────────────────────────────────────
  // Health carried in from the last floor, plus PLAYER.health.floorHeal of max streamed in
  // once play starts; the HUD draws it as astral light pouring into the health bar.
  carryHealth(health) {
    const p = this.player, H = PLAYER.health;
    p.health = health;
    const amount = Math.min(p.maxHealth - health, p.maxHealth * H.floorHeal);
    if (amount > 0) this.floorHeal = { amount, applied: 0, t: 0 };
  }

  stepFloorHeal(dt) {
    const fh = this.floorHeal, p = this.livePlayer, H = PLAYER.health;
    if (!fh) return;
    if (!p) { this.floorHeal = null; return; }
    if (fh.t === 0) sfx.play('astralHeal');
    fh.t += dt;
    const healed = fh.amount * easeInOut(clamp01((fh.t - H.floorHealDelay) / H.floorHealDuration));
    p.heal(healed - fh.applied);
    fh.applied = healed;
    if (healed >= fh.amount) this.floorHeal = null;
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
    if (this.intro) return;
    this.time += dt;
    // Entities spawned during this step start stepping next step.
    const n = this.entities.length;
    for (let i = 0; i < n; i++) if (!this.entities[i].dead) this.entities[i].step(dt);
    this.physics.step(dt);
    for (let i = 0; i < n; i++) if (!this.entities[i].dead) this.entities[i].afterPhysics();
    this.adrenaline.step(dt);
    this.stepFloorHeal(dt);

    compact(this.entities);
    compact(this.enemies);

    if (this.nextFloorRequested) {
      this.nextFloorRequested = false;
      this.session.floorCleared();
      if (this.session.scalesDifficulty) this.session.floor++;
      const health = this.player.health; // the player is rebuilt each floor
      this.startFloor();
      if (health > 0) this.carryHealth(health);
    }
  }

  render(alpha, dt, screenW, screenH) {
    const cam = this.camera;
    if (this.intro) this.updateIntro(dt, alpha);
    cam.resize(screenW, screenH);
    cam.update(dt, this.intro ? null : this.livePlayer?.body.lerpPos(alpha));
    const view = cam.viewRect(2);
    for (const e of this.entities) if (!e.dead) e.render(alpha, dt, view);
    this.effects.update(dt);
    this.deathFx.update(dt);
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
