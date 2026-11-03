// Enemy projectile: flies straight (or, given a turnRate, steers toward the player; given a
// curve, swings round a circle for a while first), hurts
// the player on contact, breaks on walls unless it passesWalls. Parrying it punishes the
// ability that threw it.
import { Entity } from '../game/entity.js';
import { Body, circleVsCircle, circleVsCapsule } from '../engine/physics.js';
import { clamp, deltaAngle, fromAngle, TAU } from '../engine/math.js';
import { ATTACK_FX, TYRANT } from '../data/config.js';
import { tex } from '../render/assets.js';
import { PROJECTILE_LOOKS, renderTime } from './attackView.js';

export class Projectile extends Entity {
  // opts: { dir, speed, lifetime, damage, size, passesWalls = false,
  //         turnRate = 0 (rad/s), homingDelay = 0, homingTime = Infinity (s after launch),
  //         curve = 0 (rad/s, + turning the way rotation grows), curveTime = 0 (s),
  //         look = 'orb' (PROJECTILE_LOOKS), spin = 1 (the way a spinning look turns),
  //         variant (which one of a look's kinds, e.g. which of the Alembic's canisters) }
  constructor(world, sourceAbility, x, y, opts) {
    super(world);
    this.sourceAbility = sourceAbility;
    this.dir = opts.dir;
    this.speed = opts.speed;
    this.damage = opts.damage;
    this.size = opts.size;
    this.passesWalls = opts.passesWalls ?? false;
    this.turnRate = opts.turnRate ?? 0;
    this.homingFrom = world.time + (opts.homingDelay ?? 0);
    this.homingUntil = world.time + (opts.homingTime ?? Infinity);
    this.curve = opts.curve ?? 0;
    this.curveUntil = world.time + (opts.curveTime ?? 0);
    this.spawnedAt = world.time;
    this.parried = false;
    this.expiresAt = world.time + opts.lifetime;
    this.body = world.physics.add(new Body({ x, y, radius: opts.size / 2, solid: false }));
    this.body.rotation = Math.atan2(opts.dir.y, opts.dir.x);
    this.look = new PROJECTILE_LOOKS[opts.look ?? 'orb'](world.layers.projectiles, { spin: opts.spin, variant: opts.variant });
    this.look.render(world.time, x, y, this.body.rotation, this.size);
    world.hostileAttacks.add(this);
  }

  step(dt) {
    if (this.world.time >= this.expiresAt) { this.spent(); this.destroy(); return; }
    let heading = this.dir;
    if (this.curve && this.world.time < this.curveUntil) heading = this.bend(dt);
    else if (this.turnRate > 0) this.home(dt);
    this.body.vel.x = heading.x * this.speed;
    this.body.vel.y = heading.y * this.speed;
  }

  // Turns `curve` rad/s, flying this step along the heading halfway through the turn so it
  // keeps to its circle.
  bend(dt) {
    const b = this.body, turn = this.curve * dt;
    b.rotation += turn;
    this.dir = fromAngle(b.rotation);
    return fromAngle(b.rotation - turn / 2);
  }

  // Turns toward the player (or what enemies hunt in their place), at most turnRate radians a second.
  home(dt) {
    const p = this.world.quarry, b = this.body;
    if (!p || this.world.time < this.homingFrom || this.world.time >= this.homingUntil) return;
    const want = Math.atan2(p.body.pos.y - b.pos.y, p.body.pos.x - b.pos.x), max = this.turnRate * dt;
    b.rotation += clamp(deltaAngle(b.rotation, want), -max, max);
    this.dir = fromAngle(b.rotation);
  }

  worldShape() { return { type: 'circle', x: this.body.pos.x, y: this.body.pos.y, r: this.body.radius }; }
  overlapsCircle(x, y, r) { return circleVsCircle(x, y, r, this.body.pos.x, this.body.pos.y, this.body.radius); }
  overlapsCapsule(cap) { return circleVsCapsule(this.body.pos.x, this.body.pos.y, this.body.radius, cap); }
  closestPoint() { return { x: this.body.pos.x, y: this.body.pos.y }; }

  // It has run its course: out of time, broken on a wall or struck home (not parried).
  spent() {}

  // Also once it has struck and gone (a late parry, see Player.hitBy).
  parry() {
    if (this.parried) return false;
    this.parried = true;
    this.sourceAbility.onParry();
    this.destroy();
    return true;
  }

  afterPhysics() {
    const b = this.body;
    if (!this.passesWalls && this.world.physics.circleHitsWall(b.pos.x, b.pos.y, b.radius)) {
      this.world.sound('fizzle', b.pos);
      this.world.effects.burst(b.pos.x, b.pos.y, this.body.rotation + Math.PI, { ...ATTACK_FX.projectile.fizzle, color: this.look.color });
      this.spent();
      this.destroy();
      return;
    }
    const p = this.world.hittablePlayer;
    if (!p || !this.overlapsCircle(p.body.pos.x, p.body.pos.y, p.body.radius)) return;
    if (p.tryParryIncoming(this) || this.dead) return;
    const dx = b.pos.x - p.body.pos.x, dy = b.pos.y - p.body.pos.y, l = Math.hypot(dx, dy) || 1;
    const hitPoint = { x: p.body.pos.x + (dx / l) * p.body.radius, y: p.body.pos.y + (dy / l) * p.body.radius };
    p.hitBy(this, this.damage, hitPoint, { ...b.pos });
    this.spent();
    this.destroy();
  }

  render(alpha) {
    const p = this.body.lerpPos(alpha), now = renderTime(this.world, alpha);
    const trail = Math.min(this.look.maxTrail, Math.max(0, now - this.spawnedAt) * this.speed);
    const fuse = clamp((now - this.spawnedAt) / (this.expiresAt - this.spawnedAt), 0, 1);
    this.look.render(now, p.x, p.y, this.body.rotation, this.size, { trailLength: trail, fuse });
  }

  dispose() {
    this.world.hostileAttacks.delete(this);
    this.world.physics.remove(this.body);
    this.look.destroy();
  }
}

// A shell: goes off in a ring of `shards` when it runs its course, wherever that is, unless
// it's parried. Shards heading straight into a wall right beside it are never fired.
// opts: Projectile's, and shards: { count, speed, lifetime, size, look, damage, sound }.
export class Shell extends Projectile {
  constructor(world, sourceAbility, x, y, opts) {
    super(world, sourceAbility, x, y, opts);
    this.shards = opts.shards;
  }

  spent() {
    const w = this.world, { x, y } = this.body.pos, S = this.shards, B = TYRANT.burst, turn = Math.random() * TAU;
    for (let i = 0; i < S.count; i++) {
      const dir = fromAngle(turn + (TAU * i) / S.count);
      if (w.physics.circleHitsWall(x + dir.x * B.wallClear, y + dir.y * B.wallClear, S.size / 2)) continue;
      w.add(new Projectile(w, this.sourceAbility, x, y, { dir, speed: S.speed, lifetime: S.lifetime, damage: S.damage, size: S.size, look: S.look }));
    }
    w.sound(S.sound, this.body.pos);
    const color = this.look.color;
    w.effects.burst(x, y, 0, { ...B.sparks, color });
    w.deathFx.flare(tex.mist, x, y, 0, { time: B.flash.time, w0: B.flash.from, h0: B.flash.from, w1: B.flash.to, h1: B.flash.to, color0: 0xffffff, color1: color, fade: 1.5 });
    w.deathFx.flare(tex.ring, x, y, 0, { time: B.ring.time, w0: B.ring.from, h0: B.ring.from, w1: B.ring.to, h1: B.ring.to, color0: 0xffffff, color1: color, fade: 1.5 });
  }
}
