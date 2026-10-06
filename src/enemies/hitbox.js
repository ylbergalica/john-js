// An enemy attack's damage area, attached to the enemy's position and facing.
// While active it is parryable and hurts the player once per activation.
import { Graphics } from 'pixi.js';
import { ContactSet, circleVsBox, circleVsCircle, circleVsCapsule, segmentPointDistSq } from '../engine/physics.js';
import { HITBOX_COLORS } from '../data/config.js';

export class EnemyHitbox {
  // shape: { type: 'circle', r } | { type: 'box', forward, hw, hh } (in enemy-local units)
  constructor(enemy, ability, shape, colorKey) {
    this.enemy = enemy;
    this.ability = ability;
    this.shape = shape;
    this.active = false;
    this.parried = false;
    this.contacts = new ContactSet();
    const c = HITBOX_COLORS[colorKey];
    this.gfx = new Graphics();
    if (shape.type === 'circle') this.gfx.circle(0, 0, shape.r);
    else this.gfx.rect(shape.forward - shape.hw, -shape.hh, shape.hw * 2, shape.hh * 2);
    this.gfx.fill({ color: c.color, alpha: c.alpha });
    this.gfx.visible = false;
    enemy.world.layers.hitboxes.addChild(this.gfx);
  }

  get world() { return this.enemy.world; }

  setActive(on) {
    if (on === this.active) return;
    this.active = on;
    this.gfx.visible = on;
    if (on) {
      this.parried = false;
      this.world.hostileAttacks.add(this);
    } else {
      this.world.hostileAttacks.delete(this);
      this.contacts.clear();
    }
  }

  // Player parry hook.
  parry() {
    this.parried = true;
    this.ability.onParry();
    return true;
  }

  worldShape() {
    const b = this.enemy.body;
    if (this.shape.type === 'circle') return { type: 'circle', x: b.pos.x, y: b.pos.y, r: this.shape.r };
    const a = b.rotation;
    return {
      type: 'box',
      x: b.pos.x + Math.cos(a) * this.shape.forward,
      y: b.pos.y + Math.sin(a) * this.shape.forward,
      hw: this.shape.hw, hh: this.shape.hh, angle: a,
    };
  }

  overlapsCircle(x, y, r) {
    const s = this.worldShape();
    return s.type === 'circle' ? circleVsCircle(x, y, r, s.x, s.y, s.r) : circleVsBox(x, y, r, s);
  }

  overlapsCapsule(cap) {
    const s = this.worldShape();
    if (s.type === 'circle') return circleVsCapsule(s.x, s.y, s.r, cap);
    // Box vs capsule: test circles along the capsule's spine.
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      if (circleVsBox(cap.ax + (cap.bx - cap.ax) * t, cap.ay + (cap.by - cap.ay) * t, cap.r, s)) return true;
    }
    return false;
  }

  // Approximate contact point toward a capsule (for the parry spark).
  closestPoint(cap) {
    const s = this.worldShape();
    const d = Math.sqrt(segmentPointDistSq(cap.ax, cap.ay, cap.bx, cap.by, s.x, s.y));
    const dx = cap.cx - s.x, dy = cap.cy - s.y, l = Math.hypot(dx, dy) || 1;
    const reach = Math.min(s.type === 'circle' ? s.r : Math.max(s.hw, s.hh), d);
    return { x: s.x + (dx / l) * reach, y: s.y + (dy / l) * reach };
  }

  afterPhysics() {
    if (!this.active || this.enemy.dead) return;
    const p = this.world.livePlayer;
    const touching = p && this.overlapsCircle(p.body.pos.x, p.body.pos.y, p.body.radius);
    this.contacts.update(touching ? [p] : [], (player) => {
      if (this.parried || player.tryParryIncoming(this) || this.parried) return;
      const s = this.worldShape();
      const b = player.body.pos;
      const dx = s.x - b.x, dy = s.y - b.y, l = Math.hypot(dx, dy) || 1;
      const hitPoint = { x: b.x + (dx / l) * player.body.radius, y: b.y + (dy / l) * player.body.radius };
      player.takeDamage(this.enemy.damage * this.ability.data.damageMultiplier, hitPoint, { x: s.x, y: s.y });
    });
  }

  render(alpha) {
    if (!this.active) return;
    const p = this.enemy.body.lerpPos(alpha);
    this.gfx.position.set(p.x, p.y);
    this.gfx.rotation = this.enemy.body.lerpRotation(alpha);
  }

  destroy() {
    this.world.hostileAttacks.delete(this);
    this.gfx.destroy();
  }
}
