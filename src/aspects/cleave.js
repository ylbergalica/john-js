// Cleave: each melee hit launches a slash that flies forward and damages every
// enemy it passes through once.
import { Sprite } from 'pixi.js';
import { Aspect } from './aspect.js';
import { Entity } from '../game/entity.js';
import { Body, circleVsBox } from '../engine/physics.js';
import { clamp01, norm } from '../engine/math.js';
import { tex } from '../render/assets.js';

export class CleaveAspect extends Aspect {
  constructor(player, data) {
    super(player, data);
    this.readyAt = 0;
  }

  get cooldownFraction() {
    return this.data.cooldown > 0 ? clamp01((this.readyAt - this.now) / this.data.cooldown) : 0;
  }

  onHitEnemy(_enemy, hitPoint) {
    if (this.now < this.readyAt) return;
    const origin = { ...this.player.body.pos };
    let dir = this.player.facing;
    if (dir.x * dir.x + dir.y * dir.y <= 0.0001) dir = { x: hitPoint.x - origin.x, y: hitPoint.y - origin.y };
    if (dir.x * dir.x + dir.y * dir.y <= 0.0001) return;
    dir = norm(dir);
    const damage = this.data.damage * this.world.adrenaline.damageMultiplier;
    const o = this.data.spawnForwardOffset;
    this.world.sound('cleave');
    this.world.add(new CleaveSlash(this.world, this.data, origin.x + dir.x * o, origin.y + dir.y * o, dir, damage));
    this.readyAt = this.now + Math.max(0, this.data.cooldown);
  }

  refreshCooldown() { this.readyAt = 0; }
}

class CleaveSlash extends Entity {
  constructor(world, data, x, y, dir, damage) {
    super(world);
    this.data = data;
    this.damage = damage;
    this.angle = Math.atan2(dir.y, dir.x);
    this.hit = new Set();
    this.body = world.physics.add(new Body({ x, y, radius: 0.1, solid: false }));
    this.body.vel.x = dir.x * data.speed;
    this.body.vel.y = dir.y * data.speed;
    this.expiresAt = world.time + (data.speed > 0.0001 ? Math.max(0, data.travelDistance) / data.speed : 0);
    this.sprite = new Sprite(tex.cleave_slash);
    this.sprite.anchor.set(0.5);
    this.sprite.width = this.sprite.height = data.spriteSize;
    this.sprite.alpha = data.alpha;
    this.sprite.rotation = this.angle;
    this.sprite.position.set(x, y);
    world.layers.fx.addChild(this.sprite);
  }

  step() { if (this.world.time >= this.expiresAt) this.destroy(); }

  afterPhysics() {
    const b = this.body;
    const box = { x: b.pos.x, y: b.pos.y, hw: this.data.hitboxDepth / 2, hh: this.data.hitboxWidth / 2, angle: this.angle };
    for (const e of this.world.enemies) {
      if (e.dead || this.hit.has(e) || !circleVsBox(e.body.pos.x, e.body.pos.y, e.body.radius, box)) continue;
      this.hit.add(e);
      const src = { ...b.pos };
      e.takeDamage(this.damage, e.closestPoint(src), src, this.data.id);
      if (!e.dead) e.applyKnockback(this.data.enemyKnockbackForce, src);
    }
  }

  render(alpha) {
    const p = this.body.lerpPos(alpha);
    this.sprite.position.set(p.x, p.y);
  }

  dispose() {
    this.world.physics.remove(this.body);
    this.sprite.destroy();
  }
}
