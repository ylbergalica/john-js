// The gameplay world: builds floors, owns the entity list, physics, navigation,
// camera and render layers, and advances everything on the fixed simulation step.
import { Container } from 'pixi.js';
import { Physics } from '../engine/physics.js';
import { randInt, pickWeighted, clamp, clamp01, lerp, dist, smoothStep01, TAU } from '../engine/math.js';
import { Camera } from '../render/camera.js';
import { LevelView } from '../render/levelView.js';
import { Effects } from '../render/fx.js';
import { DeathFx } from '../render/deathFx.js';
import { ScreenRipple } from '../render/screenRipple.js';
import { tex } from '../render/assets.js';
import { RING_RADIUS } from '../render/sprites.js';
import { ADRENALINE, AUDIO, BASE_LEVEL_CONFIG, ENEMY_COMBAT, ENEMY_TYPES, EXIT_FX, EXIT_TRAIL, EXIT_WARP, GAME, GUARDIAN_INTRO as GI, MUSIC, PICKUPS, PLAYER, PROPS, STAR_PULSE } from '../data/config.js';
import { sfx } from '../audio/sfx.js';
import { generateLayout, randomFloorInRoom } from '../level/generator.js';
import { playgroundLayout } from '../level/playground.js';
import { attackersOn, scaleConfig } from '../level/difficulty.js';
import { NavField } from '../level/navField.js';
import { Player } from '../player/player.js';
import { Enemy } from '../enemies/enemy.js';
import { AIState } from '../enemies/ai.js';
import { Exit } from './pickups.js';
import { Prop, scatterProps } from './props.js';
import { Debris } from '../render/debris.js';
import { ExitTrail } from './exitTrail.js';
import { GuardianTrail } from './guardianTrail.js';
import { GuardianRage } from './guardianRage.js';
import { Spawner, placeSpawners } from './spawner.js';
import { RunMode } from './session.js';

const easeOut = (t) => 1 - (1 - t) ** 3;
const easeInOut = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const easeOutBack = (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2; // overshoots, then settles

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
      debris: new Container(), // shards of broken props, settling on the floor
      props: new Container(),
      pickups: new Container(),
      telegraphs: new Container(), // enemy afterimages, on the floor
      playerBack: new Container({ sortableChildren: true }),
      enemies: new Container(),
      projectiles: new Container(),
      player: new Container(),
      zones: new Container(), // enemy attack areas, over the bodies so none hide them
      fx: new Container(),
    };
    this.root.addChild(...Object.values(this.layers));
    this.effects = new Effects(this.layers.fx);
    this.deathFx = new DeathFx(this); // enemies bursting apart as they die
    this.debris = new Debris(this.layers.debris, (x, y) => this.physics.isWall(x, y));
    this.camera = new Camera();
    this.ripple = new ScreenRipple(); // full-screen shockwave on entering Exalted
    // Wall stars flare in rings from kills and parries.
    this.offStarPulses = [
      this.events.enemyKilled.on((e) => {
        this.levelView.pulse(e.body.pos.x, e.body.pos.y, e.type.isChaser ? STAR_PULSE.guardianKill : STAR_PULSE.kill);
      }),
      this.events.parried.on(() => {
        const p = this.player.body.pos;
        this.levelView.pulse(p.x, p.y, STAR_PULSE.parry + STAR_PULSE.parryPerStreak * (this.player.parryStreak - 1));
      }),
    ];
    // Blows traded, for the fight music (see fightState).
    this.lastBlowAt = -Infinity;
    const blow = () => { this.lastBlowAt = this.time; };
    this.offBlows = [this.events.enemyDamaged.on(blow), this.events.playerDamaged.on(blow), this.events.parried.on(blow)];

    this.entities = [];
    this.enemies = [];
    this.props = []; // destroyables, for the player's attacks
    this.floorTextures = []; // made for this floor alone (a spawner's art), destroyed with it
    this.hostileAttacks = new Set(); // enemy hitboxes/projectiles the player can parry
    this.player = null;
    this.decoy = null; // { body }: a stand-in the enemies hunt instead of the player (Afterimage)
    this.level = null;
    this.exit = null;
    this.exitTrailAt = Infinity; // when to lay the trail to the exit (see guardianBurst)
    this.physics = new Physics();
    this.navFields = new Map();
    this.cores = { required: 0, collected: 0 };
    this.activeAttackers = 0;
    this.maxAttackers = ENEMY_COMBAT.attackers.playground; // how many may attack at once on this floor (attackersOn)
    this.spawnTable = []; // the floor's enemy mix, weighted (enemySpawn.enemies), for spawners
    this.rage = new GuardianRage(this); // guardians speeding up as the floor drags on
    this.guardianTrail = new GuardianTrail(this); // the red trail to the guardian once the meter's full
    this.floorStartedAt = 0;
    this.intro = null; // guardian intro in progress (see GUARDIAN_INTRO); the world is frozen meanwhile
    this.introPace = 1; // how many times longer the intro's hold and pan take (TUTORIAL.introPace)
    this.guardianType = null; // the type every guardian spawns as, instead of the floor's pick (TUTORIAL.guardian)
    this.farEnds = false; // the player starts and the guardians wait as far apart as the floor allows
    this.startClearance = 0; // no enemy spawns closer than this to the player's start (TUTORIAL.startClearance)
    this.nextFloorRequested = false;
    this.warp = null; // taking the exit (see EXIT_WARP); the world is frozen meanwhile
    this.warpIn = null; // arriving on the floor after it, until the player has appeared
    this.whiteout = 0; // the screen's white wash through a warp, 0…1 (drawn by the HUD)
    this.floorHeal = null; // health streaming in at the start of a floor (see carryHealth)
    this.gameOverAt = Infinity;
    this.respawnAt = Infinity; // playground: when the dead player comes back at the start
  }

  // The player while still in the fight: null once killed, through their death too.
  get livePlayer() { return this.player && !this.player.dead && !this.player.death ? this.player : null; }
  // What enemies hunt: the live player, or a decoy standing in for them while there is one.
  get quarry() { const p = this.livePlayer; return p && this.decoy ? this.decoy : p; }
  // The player as enemy attacks see them: null while intangible or mist, so attacks pass through.
  get hittablePlayer() { const p = this.livePlayer; return p && !p.intangible && !p.shrouded ? p : null; }
  // Scales all damage dealt to enemies and props, all of which is the player's doing (their
  // aspects' damageDealtMultiplier). Dying Exalted, it still scales the blast.
  get damageDealtMultiplier() { return this.player?.aspects.damageDealtMultiplier ?? 1; }
  get isGameOver() { return this.gameOverAt !== Infinity; }
  get finished() { return this.time >= this.gameOverAt; }
  get hasRequiredCores() { return this.cores.collected >= this.cores.required; }

  // ── floors ───────────────────────────────────────────────────────
  startFloor() {
    this.clearFloor();
    if (this.session.mode === RunMode.Playground) {
      const layout = this.buildLevel(playgroundLayout());
      for (const { type, x, y } of layout.props) this.spawnProp(type, { x, y });
      this.cores = { required: 0, collected: 0 };
      this.maxAttackers = ENEMY_COMBAT.attackers.playground;
      this.spawnTable = scaleConfig(BASE_LEVEL_CONFIG, 1).enemySpawn.enemies;
      this.rage.start(false);
      this.floorStartedAt = this.time;
      this.intro = null;
      sfx.play('floor');
      return;
    }

    const cfg = scaleConfig(BASE_LEVEL_CONFIG, this.session.floor);
    const layout = this.buildLevel(generateLayout(cfg, { farEnds: this.farEnds }));
    this.exit = this.add(new Exit(this, layout.exit.x, layout.exit.y));
    this.maxAttackers = attackersOn(this.session.floor, ENEMY_COMBAT.attackers);

    const { rooms, grid } = layout;
    const es = cfg.enemySpawn;
    this.spawnTable = es.enemies;
    placeSpawners(this, layout); // before the enemies, so it finds its corners free
    const first = es.skipFirstRoom ? 1 : 0;
    const last = es.skipLastRoom ? rooms.length - 1 : rooms.length;
    const clear = (p) => Math.hypot(p.x - layout.start.x, p.y - layout.start.y) >= this.startClearance;
    // → the adrenaline points the spawned enemy is sure to drop (0 if none spawned).
    const spawnIn = (room) => {
      let pos = null;
      for (let tries = 0; tries < 10 && !pos; tries++) {
        pos = randomFloorInRoom(grid, room);
        if (!pos) return 0;
        if (!clear(pos)) pos = null;
      }
      if (!pos) return 0; // too near the start
      const key = pickWeighted(es.enemies).type;
      this.spawnEnemy(key, pos);
      return ENEMY_TYPES[key].minAdrenalineDrops * PICKUPS.adrenalineOrb.adrenalineValue * ADRENALINE.basePointValue;
    };
    // Every room gets its minimum, then enemies go into random rooms (up to each room's cap)
    // until killing them all fills es.meterShare of a meter even if each drops only its
    // minimum, so enemies that drop more adrenaline mean fewer enemies. Spawners bring the rest.
    const counts = new Map();
    const spawnCounted = (i) => { counts.set(i, (counts.get(i) ?? 0) + 1); return spawnIn(rooms[i]); };
    let supply = 0;
    for (let i = first; i < last; i++) {
      for (let n = 0; n < es.minEnemiesPerRoom; n++) supply += spawnCounted(i);
    }
    const budget = this.adrenaline.capacity * es.meterShare;
    for (let tries = 0; supply < budget && tries < 200; tries++) {
      const open = [];
      for (let i = first; i < last; i++) if ((counts.get(i) ?? 0) < es.maxEnemiesPerRoom) open.push(i);
      if (!open.length) break;
      supply += spawnCounted(open[randInt(0, open.length)]);
    }

    // Cores gate the exit; require exactly as many as chasers actually spawned.
    let chasers = 0;
    for (let i = 0; i < cfg.chaserCount; i++) {
      const pos = randomFloorInRoom(grid, rooms[rooms.length - 1]);
      if (!pos) continue;
      this.spawnEnemy(this.guardianType ?? pickWeighted(cfg.chasers).type, pos);
      chasers++;
    }
    this.cores = { required: chasers, collected: 0 };
    scatterProps(this, layout); // after the enemies, so they keep clear of them
    this.floorStartedAt = this.time; // the clock is frozen through the guardian intro, so this still holds after it
    this.rage.start(true);
    this.intro = null;
    const guardian = this.enemies.find((e) => e.type.isChaser);
    if (guardian && this.session.floor <= GI.floors) this.startIntro(guardian);
    else sfx.play('floor');
  }

  // Map, physics and the player at its start.
  buildLevel(layout) {
    this.level = layout;
    this.physics = new Physics(layout.grid);
    this.levelView.build(layout.grid, layout.rooms, this.session.floor);
    this.player = this.add(new Player(this, layout.start.x, layout.start.y));
    this.camera.snapTo(layout.start);
    return layout;
  }

  // ── guardian intro ───────────────────────────────────────────────
  // Opens on the floor's guardian, then glides to the player. Runs on render time, so the
  // camera moves smoothly at any frame rate; pausing (dt = 0) holds it.
  startIntro(guardian) {
    const pace = this.introPace;
    const panTime = clamp(dist(guardian.body.pos, this.player.body.pos) * GI.panPerUnit, GI.minPan, GI.maxPan) * pace;
    // focus: vignette strength, fade: black overlay (none when arriving through the exit's white)
    this.intro = { guardian, t: 0, hold: GI.hold * pace, panTime, focus: 1, fade: this.warpIn ? 0 : 1, fadeIn: !this.warpIn };
    this.camera.snapTo(guardian.body.pos);
    sfx.play('guardian');
  }

  updateIntro(dt, alpha) {
    const it = this.intro, cam = this.camera;
    it.t += dt;
    const from = it.guardian.body.lerpPos(alpha), to = this.player.body.lerpPos(alpha);
    if (it.t < it.hold) {
      cam.snapTo(from);
      cam.zoom = lerp(1, GI.zoom, easeOut(it.t / it.hold));
      it.fade = it.fadeIn ? 1 - clamp01(it.t / GI.fadeIn) : 0;
      return;
    }
    const p = clamp01((it.t - it.hold) / it.panTime), e = easeInOut(p);
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
    this.props = [];
    this.exit = null;
    this.exitTrailAt = Infinity;
    this.hostileAttacks.clear();
    this.navFields.clear();
    this.activeAttackers = 0;
    this.guardianTrail.reset();
    this.effects.clear();
    this.deathFx.clear();
    this.debris.clear();
    for (const t of this.floorTextures) t.destroy(true);
    this.floorTextures = [];
    this.floorHeal = null;
    this.respawnAt = Infinity;
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

  advanceFloor() {
    this.session.floorCleared();
    if (this.session.scalesDifficulty) this.session.floor++;
    const health = this.player.health, buffs = this.player.buffs.carry(); // the player is rebuilt each floor
    this.startFloor();
    if (health > 0) this.carryHealth(health);
    this.player.buffs.restore(buffs);
  }

  // ── taking the exit ──────────────────────────────────────────────
  // The world holds still while the camera closes in on the exit and the player is drawn
  // into it; the screen washes white, and the next floor fades in from it with the player
  // appearing there (EXIT_WARP). Runs on render time, like the guardian intro.
  enterExit() {
    if (this.warp) return;
    const p = this.player.body.pos, e = this.exit.pos;
    this.warp = {
      t: 0, cam: { x: this.camera.x, y: this.camera.y },
      r0: dist(p, e), a0: Math.atan2(p.y - e.y, p.x - e.x), absorbed: false,
    };
    this.player.intangible = true;
    sfx.play('exitEnter');
  }

  updateWarp(dt) {
    const W = EXIT_WARP, wp = this.warp, cam = this.camera, e = this.exit.pos, p = this.player;
    wp.t += dt;
    const k = clamp01(wp.t / W.time), g = easeInOut(clamp01(wp.t / W.glide));
    cam.snapTo({ x: lerp(wp.cam.x, e.x, g), y: lerp(wp.cam.y, e.y, g) });
    cam.zoom = lerp(1, W.zoom, easeInOut(k));
    // Drawn in: spiralling to the centre, faster and faster, shrinking away.
    const a = clamp01(k / W.absorbAt), pull = a * a, r = wp.r0 * (1 - pull), ang = wp.a0 + pull * W.turns * TAU;
    const b = p.body;
    b.pos.x = b.prev.x = e.x + Math.cos(ang) * r;
    b.pos.y = b.prev.y = e.y + Math.sin(ang) * r;
    p.sizeScale = Math.max(0.001, 1 - pull);
    p.alight = pull > 0.3;
    if (dt > 0) p.view.recordTrail(); // the tail streams in after it (normally recorded each step)
    this.exit.surge = Math.sin(clamp01(k / W.absorbAt) * Math.PI * 0.5) * (1 - clamp01((k - W.absorbAt) / (1 - W.absorbAt)) * 0.5);
    if (a >= 1 && !wp.absorbed) {
      wp.absorbed = true;
      p.hidden = true;
      this.flareAt(e, W.flare, EXIT_FX.color);
      const sh = W.flare.shake;
      cam.shake(sh.duration, sh.strength, sh.frequency);
    }
    this.whiteout = smoothStep01((k - W.whiteFrom) / (1 - W.whiteFrom));
    if (wp.t < W.time + W.hold) return;
    this.warp = null;
    this.warpIn = { t: 0, arrived: null };
    this.advanceFloor();
    this.player.hidden = true;
    this.player.sizeScale = 0.001;
    if (!this.intro) cam.zoom = W.zoomIn;
  }

  // The new floor fades in from white (easing the camera out unless a guardian intro has
  // it) and, once play can start, the player appears with a flare.
  updateWarpIn(dt) {
    const W = EXIT_WARP, wi = this.warpIn, p = this.player;
    wi.t += dt;
    this.whiteout = 1 - smoothStep01(wi.t / W.fadeIn);
    if (!this.intro) this.camera.zoom = lerp(W.zoomIn, 1, easeInOut(clamp01(wi.t / W.fadeIn)));
    if (wi.arrived === null && !this.intro && wi.t >= W.appearAt) {
      wi.arrived = 0;
      p.hidden = false;
      this.flareAt(p.body.pos, W.arrive, EXIT_FX.color);
    }
    if (wi.arrived !== null) {
      wi.arrived += dt;
      p.sizeScale = Math.max(0.001, easeOutBack(clamp01(wi.arrived / W.arrive.time)));
      p.alight = wi.arrived < W.arrive.time * 0.6; // forms out of light
    }
    if (wi.arrived >= W.arrive.time && wi.t >= W.fadeIn) {
      this.warpIn = null;
      this.whiteout = 0;
      p.sizeScale = 1;
      p.alight = false;
    }
  }

  // A flash, a ring and sparks at `pos`: { flash, ring, time, sparks } (sizes in world units).
  flareAt(pos, F, color) {
    const time = F.time ?? 0.5, ring = F.ring / RING_RADIUS / 2;
    this.deathFx.flare(tex.mist, pos.x, pos.y, 0, { time, w0: F.flash * 0.4, h0: F.flash * 0.4, w1: F.flash, h1: F.flash, color0: 0xffffff, color1: color });
    this.deathFx.flare(tex.ring, pos.x, pos.y, 0, { time: time * 1.3, w0: 0.5, h0: 0.5, w1: ring, h1: ring, color0: 0xffffff, color1: color });
    this.effects.burst(pos.x, pos.y, 0, { ...F.sparks, color });
    this.effects.burst(pos.x, pos.y, 0, { ...F.sparks, count: Math.round(F.sparks.count / 2), color: 0xffffff });
  }

  // Once the floor's last guardian bursts, a trail to the exit is laid from wherever the
  // player is EXIT_TRAIL.delay seconds later.
  guardianBurst(guardian) {
    if (!this.exit) return;
    const another = (e) => e !== guardian && !e.dead && e instanceof Enemy && e.type.isChaser && !e.summoned;
    if (this.entities.some(another)) return;
    this.exitTrailAt = this.time + EXIT_TRAIL.delay;
  }

  // Death ends a run once the player's death has played out (`after` seconds); the
  // playground just puts the player back at the start after a moment.
  playerDied(after = 0) {
    if (this.session.mode === RunMode.Playground) {
      this.respawnAt = this.time + after + GAME.playgroundRespawnDelay;
      return;
    }
    this.gameOver(after);
  }

  // The dying player's body has burst. Its blast's kills still count, so only now does the
  // run bank its coins and stop earning.
  playerBurst() {
    if (this.session.mode === RunMode.Run) this.session.bankCoins();
  }

  respawnPlayer() {
    this.respawnAt = Infinity;
    this.player?.destroy();
    this.camera.zoom = 1;
    const { x, y } = this.level.start;
    this.player = this.add(new Player(this, x, y));
  }

  gameOver(after = 0) {
    if (this.isGameOver) return;
    this.gameOverAt = this.time + after + GAME.returnDelay;
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

  // Spawn menu: drops an enemy on a free spot a few units from the player. Summoned
  // enemies earn nothing and unlock nothing when killed.
  summonEnemy(type) {
    const p = this.livePlayer, r = ENEMY_TYPES[type].radius;
    if (!p) return null;
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2, d = 5 + Math.random() * 4 + i * 0.1;
      const x = p.body.pos.x + Math.cos(a) * d, y = p.body.pos.y + Math.sin(a) * d;
      if (!this.physics.isCircleFree(x, y, r * 1.2)) continue;
      const enemy = this.spawnEnemy(type, { x, y });
      enemy.summoned = true;
      return enemy;
    }
    return null;
  }

  spawnProp(type, pos) {
    const Type = type === 'spawner' ? Spawner : Prop;
    const prop = this.add(new Type(this, type, pos.x, pos.y));
    this.props.push(prop);
    return prop;
  }

  // Spawn menu: sets a prop down on a free spot a couple of units from the player.
  summonProp(type) {
    const p = this.livePlayer;
    if (!p) return null;
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * TAU, d = 1.6 + Math.random() * 1.5 + i * 0.05;
      const x = p.body.pos.x + Math.cos(a) * d, y = p.body.pos.y + Math.sin(a) * d;
      if (this.physics.isCircleFree(x, y, PROPS[type].radius * 1.2)) return this.spawnProp(type, { x, y });
    }
    return null;
  }

  // Removes every enemy without killing it (no drops, no death effects), dying guardians too.
  clearEnemies() {
    for (const e of this.entities) if (e instanceof Enemy) e.destroy();
    this.enemies.length = 0;
  }

  // Shoves the player and enemies within `radius` of `pos` straight away from it, harder the
  // closer they are (see DEATH_FX.guardian.push). No damage.
  shove(pos, { radius, speed, stagger, playerTime }, except = null) {
    const away = (body) => {
      const dx = body.pos.x - pos.x, dy = body.pos.y - pos.y, d = Math.hypot(dx, dy);
      if (d >= radius) return null;
      const v = speed * (1 - (d / radius) ** 2);
      return d > 1e-6 ? { x: (dx / d) * v, y: (dy / d) * v } : { x: v, y: 0 };
    };
    for (const e of this.enemies) {
      if (e === except || e.dead) continue;
      const v = away(e.body);
      if (!v) continue;
      const k = 1 - e.type.knockbackResistance;
      e.body.vel.x += v.x * k; e.body.vel.y += v.y * k;
      e.ai.suppressMovementFor(stagger);
    }
    const p = this.livePlayer, v = p && away(p.body);
    if (v) p.shove(v.x, v.y, playerTime);
  }

  // ── shared services ──────────────────────────────────────────────
  // Flow field toward the player (or what enemies hunt in their place) for actors of the
  // given footprint (tiles).
  navField(footprint, searchRadius, refreshInterval) {
    let field = this.navFields.get(footprint);
    if (!field) this.navFields.set(footprint, (field = new NavField(this.level.grid, footprint)));
    const p = this.quarry;
    if (p) field.update(p.body.pos, this.time, refreshInterval, searchRadius);
    return field;
  }

  // At most a few enemies commit to attacks at once, more on deeper floors (maxAttackers).
  tryAcquireAttackSlot() {
    if (this.activeAttackers >= this.maxAttackers) return false;
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

  // Spawners keep birthing foes until the floor's guardians are down (always in the playground).
  get spawnersActive() {
    return this.session.mode === RunMode.Playground || this.enemies.some((e) => e.type.isChaser && !e.summoned);
  }

  // An enemy winding up or swinging at the player, within its aggro range (a guardian within
  // MUSIC.guardianRange), counts as a blow traded (lastBlowAt), as do hits and parries.
  noteBlows() {
    const p = this.livePlayer;
    if (!p) return;
    for (const e of this.enemies) {
      if (e.ai.state !== AIState.WindUp && e.ai.state !== AIState.Attack) continue;
      const range = e.type.isChaser ? MUSIC.guardianRange : e.type.ai.aggroRange;
      if (dist(e.body.pos, p.body.pos) <= range) { this.lastBlowAt = this.time; return; }
    }
  }

  // For the fight music: how many enemies are fighting the player and whether a guardian
  // is among them, plus what shapes the music. Null while there's no fight to be had.
  // Enemies merely nearby don't count: only while blows are traded (noteBlows) within
  // MUSIC.blowMemory seconds.
  fightState() {
    const p = this.livePlayer;
    if (!p || this.intro || this.warp || this.warpIn) return null;
    let enemies = 0, guardian = false;
    for (const e of this.enemies) {
      if (e.dead || e.dying || e.ai.state === AIState.Idle || e.ai.state === AIState.Dead) continue;
      const range = e.type.isChaser ? MUSIC.guardianRange : e.type.ai.aggroRange;
      if (dist(e.body.pos, p.body.pos) > range) continue;
      if (e.type.isChaser) guardian = true;
      else enemies++;
    }
    if (this.time - this.lastBlowAt > MUSIC.blowMemory) { enemies = 0; guardian = false; }
    return {
      enemies, guardian,
      exalted: this.adrenaline.isExalted,
      danger: p.healthFraction < MUSIC.dangerHealth,
      mood: this.levelView.nebula.palette,
      floor: this.session.floor,
    };
  }

  // ── loop ─────────────────────────────────────────────────────────
  step(dt) {
    if (this.intro || this.warp || (this.warpIn && this.warpIn.arrived === null)) return;
    this.time += dt;
    // Entities spawned during this step start stepping next step.
    const n = this.entities.length;
    for (let i = 0; i < n; i++) if (!this.entities[i].dead) this.entities[i].step(dt);
    this.physics.step(dt);
    for (let i = 0; i < n; i++) if (!this.entities[i].dead) this.entities[i].afterPhysics();
    if (!this.player?.death) this.adrenaline.step(dt); // a dying player's meter is theirs to empty (PlayerDeath)
    this.noteBlows();
    this.rage.step(dt);
    this.guardianTrail.step();
    this.stepFloorHeal(dt);
    if (this.time >= this.respawnAt) this.respawnPlayer();
    if (this.time >= this.exitTrailAt) {
      this.exitTrailAt = Infinity;
      const p = this.livePlayer;
      if (p) ExitTrail.lay(this, p.body.pos, this.exit.pos);
    }

    compact(this.entities);
    compact(this.enemies);
    compact(this.props);

    if (this.nextFloorRequested) {
      this.nextFloorRequested = false;
      this.advanceFloor();
    }
  }

  render(alpha, dt, screenW, screenH) {
    const cam = this.camera;
    if (this.warp) this.updateWarp(dt);
    if (this.intro) this.updateIntro(dt, alpha);
    if (this.warpIn) this.updateWarpIn(dt);
    const p = this.player && !this.player.dead ? this.player : null; // dying too: the camera stays on them
    if (p?.death && !this.intro && !this.warp) cam.zoom = p.death.zoom(this.time);
    cam.resize(screenW, screenH);
    cam.update(dt, this.intro || this.warp ? null : p?.body.lerpPos(alpha));
    const view = cam.viewRect(2);
    for (const e of this.entities) if (!e.dead) e.render(alpha, dt, view);
    this.effects.update(dt);
    this.deathFx.update(dt);
    this.debris.update(dt);
    cam.apply(this.root);
    this.ripple.update(dt, cam, this.root);
    this.levelView.update(dt, view);
  }

  destroy() {
    for (const off of [...this.offStarPulses, ...this.offBlows]) off();
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
