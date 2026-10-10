// Enemy projectile: flies straight (or, given a turnRate, steers toward the player), hurts
// the player on contact, breaks on walls unless it passesWalls. Parrying it punishes the
// ability that threw it.
import { Entity } from '../game/entity.js';
import { Body, circleVsCircle, circleVsCapsule } from '../engine/physics.js';
import { clamp, deltaAngle, fromAngle } from '../engine/math.js';
import { ATTACK_FX } from '../data/config.js';
import { PROJECTILE_LOOKS, renderTime } from './attackView.js';

export class Projectile extends Entity {
  // opts: { dir, speed, lifetime, damage, size, passesWalls = false,
  //         turnRate = 0 (rad/s), homingDelay = 0, homingTime = Infinity (s after launch),
  //         look = 'orb' (PROJECTILE_LOOKS) }
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
    this.spawnedAt = world.time;
    this.expiresAt = world.time + opts.lifetime;
    this.body = world.physics.add(new Body({ x, y, radius: opts.size / 2, solid: false }));
    this.body.rotation = Math.atan2(opts.dir.y, opts.dir.x);
    this.look = new PROJECTILE_LOOKS[opts.look ?? 'orb'](world.layers.projectiles);
    this.look.render(world.time, x, y, this.body.rotation, this.size);
    world.hostileAttacks.add(this);
  }

  step(dt) {
    if (this.world.time >= this.expiresAt) { this.destroy(); return; }
    if (this.turnRate > 0) this.home(dt);
    this.body.vel.x = this.dir.x * this.speed;
    this.body.vel.y = this.dir.y * this.speed;
  }

  // Turns toward the player, at most turnRate radians a second.
  home(dt) {
    const p = this.world.livePlayer, b = this.body;
    if (!p || this.world.time < this.homingFrom || this.world.time >= this.homingUntil) return;
    const want = Math.atan2(p.body.pos.y - b.pos.y, p.body.pos.x - b.pos.x), max = this.turnRate * dt;
    b.rotation += clamp(deltaAngle(b.rotation, want), -max, max);
    this.dir = fromAngle(b.rotation);
  }

  overlapsCircle(x, y, r) { return circleVsCircle(x, y, r, this.body.pos.x, this.body.pos.y, this.body.radius); }
  overlapsCapsule(cap) { return circleVsCapsule(this.body.pos.x, this.body.pos.y, this.body.radius, cap); }
  closestPoint() { return { x: this.body.pos.x, y: this.body.pos.y }; }

  parry() {
    if (!this.dead) {
      this.sourceAbility.onParry();
      this.destroy();
    }
    return true;
  }

  afterPhysics() {
    const b = this.body;
    if (!this.passesWalls && this.world.physics.circleHitsWall(b.pos.x, b.pos.y, b.radius)) {
      this.world.sound('fizzle', b.pos);
      this.world.effects.burst(b.pos.x, b.pos.y, this.body.rotation + Math.PI, { ...ATTACK_FX.projectile.fizzle, color: this.look.color });
      this.destroy();
      return;
    }
    const p = this.world.hittablePlayer;
    if (!p || !this.overlapsCircle(p.body.pos.x, p.body.pos.y, p.body.radius)) return;
    if (p.tryParryIncoming(this) || this.dead) return;
    const dx = b.pos.x - p.body.pos.x, dy = b.pos.y - p.body.pos.y, l = Math.hypot(dx, dy) || 1;
    const hitPoint = { x: p.body.pos.x + (dx / l) * p.body.radius, y: p.body.pos.y + (dy / l) * p.body.radius };
    p.takeDamage(this.damage, hitPoint, { ...b.pos });
    this.destroy();
  }

  render(alpha) {
    const p = this.body.lerpPos(alpha), now = renderTime(this.world, alpha);
    const trail = Math.min(this.look.maxTrail, Math.max(0, now - this.spawnedAt) * this.speed);
    this.look.render(now, p.x, p.y, this.body.rotation, this.size, { trailLength: trail });
  }

  dispose() {
    this.world.hostileAttacks.delete(this);
    this.world.physics.remove(this.body);
    this.look.destroy();
  }
}
