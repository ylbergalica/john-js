// Goblin projectile: flies straight, hurts the player on contact, breaks on walls.
// Parrying it punishes the ability that threw it.
import { Sprite } from 'pixi.js';
import { Entity } from '../game/entity.js';
import { Body, circleVsCircle, circleVsCapsule } from '../engine/physics.js';
import { tex } from '../render/assets.js';
import { ORB_PAD } from '../render/sprites.js';

export class Projectile extends Entity {
  // opts: { dir, speed, lifetime, damage, size, color }
  constructor(world, sourceAbility, x, y, opts) {
    super(world);
    this.sourceAbility = sourceAbility;
    this.dir = opts.dir;
    this.speed = opts.speed;
    this.damage = opts.damage;
    this.expiresAt = world.time + opts.lifetime;
    this.body = world.physics.add(new Body({ x, y, radius: opts.size / 2, solid: false }));
    this.body.rotation = Math.atan2(opts.dir.y, opts.dir.x);
    this.sprite = new Sprite(tex.orb);
    this.sprite.anchor.set(0.5);
    this.sprite.width = this.sprite.height = opts.size * ORB_PAD;
    this.sprite.tint = opts.color;
    this.sprite.position.set(x, y);
    world.layers.projectiles.addChild(this.sprite);
    world.hostileAttacks.add(this);
  }

  step() {
    if (this.world.time >= this.expiresAt) { this.destroy(); return; }
    this.body.vel.x = this.dir.x * this.speed;
    this.body.vel.y = this.dir.y * this.speed;
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
    if (this.world.physics.circleHitsWall(b.pos.x, b.pos.y, b.radius)) { this.destroy(); return; }
    const p = this.world.livePlayer;
    if (!p || !this.overlapsCircle(p.body.pos.x, p.body.pos.y, p.body.radius)) return;
    if (p.tryParryIncoming(this) || this.dead) return;
    const dx = b.pos.x - p.body.pos.x, dy = b.pos.y - p.body.pos.y, l = Math.hypot(dx, dy) || 1;
    const hitPoint = { x: p.body.pos.x + (dx / l) * p.body.radius, y: p.body.pos.y + (dy / l) * p.body.radius };
    p.takeDamage(this.damage, hitPoint, { ...b.pos });
    this.destroy();
  }

  render(alpha) {
    const p = this.body.lerpPos(alpha);
    this.sprite.position.set(p.x, p.y);
  }

  dispose() {
    this.world.hostileAttacks.delete(this);
    this.world.physics.remove(this.body);
    this.sprite.destroy();
  }
}
