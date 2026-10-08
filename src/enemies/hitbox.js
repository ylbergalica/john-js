// An enemy attack's damage area, attached to the enemy's position and facing.
// While active it is parryable and hurts the player once per activation, or, if
// `continuous`, whenever the player touches it (their invincibility spaces the hits).
// It draws nothing itself; the ability's AttackView shows it.
import { ContactSet, circleVsBox, circleVsCircle, circleVsCapsule, segmentPointDistSq } from '../engine/physics.js';

// The point on capsule `s`'s spine nearest (px, py).
function nearestOnSpine(s, px, py) {
  const abx = s.bx - s.ax, aby = s.by - s.ay, l2 = abx * abx + aby * aby;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - s.ax) * abx + (py - s.ay) * aby) / l2)) : 0;
  return { x: s.ax + abx * t, y: s.ay + aby * t };
}

export class EnemyHitbox {
  // shape (in enemy-local units, +x forward):
  //   { type: 'circle', r, forward }     centred `forward` ahead (default 0)
  //   { type: 'box', forward, hw, hh }
  //   { type: 'beam', from, length, r }  a capsule from `from` to `from + length` ahead
  constructor(enemy, ability, shape, { continuous = false } = {}) {
    this.enemy = enemy;
    this.ability = ability;
    this.shape = shape;
    this.continuous = continuous;
    this.anchor = null; // { x, y, rotation }: pins the shape to a spot instead of the enemy
    this.active = false;
    this.parried = false;
    this.contacts = new ContactSet();
  }

  get world() { return this.enemy.world; }

  setActive(on) {
    if (on === this.active) return;
    this.active = on;
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
    const b = this.enemy.body, s = this.shape;
    const { x, y, rotation } = this.anchor ?? { x: b.pos.x, y: b.pos.y, rotation: b.rotation };
    const c = Math.cos(rotation), sn = Math.sin(rotation);
    if (s.type === 'circle') {
      const f = s.forward ?? 0;
      return { type: 'circle', x: x + c * f, y: y + sn * f, r: s.r };
    }
    if (s.type === 'beam') {
      const to = s.from + s.length;
      return { type: 'capsule', ax: x + c * s.from, ay: y + sn * s.from, bx: x + c * to, by: y + sn * to, r: s.r };
    }
    return { type: 'box', x: x + c * s.forward, y: y + sn * s.forward, hw: s.hw, hh: s.hh, angle: rotation };
  }

  overlapsCircle(x, y, r) {
    const s = this.worldShape();
    if (s.type === 'capsule') return circleVsCapsule(x, y, r, s);
    return s.type === 'circle' ? circleVsCircle(x, y, r, s.x, s.y, s.r) : circleVsBox(x, y, r, s);
  }

  overlapsCapsule(cap) {
    const s = this.worldShape();
    if (s.type === 'circle') return circleVsCapsule(s.x, s.y, s.r, cap);
    // Box or beam vs capsule: test circles along the capsule's spine.
    const hits = s.type === 'capsule' ? (x, y) => circleVsCapsule(x, y, cap.r, s) : (x, y) => circleVsBox(x, y, cap.r, s);
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      if (hits(cap.ax + (cap.bx - cap.ax) * t, cap.ay + (cap.by - cap.ay) * t)) return true;
    }
    return false;
  }

  // Approximate contact point toward a capsule (for the parry spark).
  closestPoint(cap) {
    const s = this.worldShape();
    if (s.type === 'capsule') return nearestOnSpine(s, cap.cx, cap.cy);
    const d = Math.sqrt(segmentPointDistSq(cap.ax, cap.ay, cap.bx, cap.by, s.x, s.y));
    const dx = cap.cx - s.x, dy = cap.cy - s.y, l = Math.hypot(dx, dy) || 1;
    const reach = Math.min(s.type === 'box' ? Math.max(s.hw, s.hh) : s.r, d);
    return { x: s.x + (dx / l) * reach, y: s.y + (dy / l) * reach };
  }

  afterPhysics() {
    if (!this.active || this.enemy.dead) return;
    const p = this.world.livePlayer;
    const touching = p && this.overlapsCircle(p.body.pos.x, p.body.pos.y, p.body.radius);
    if (this.continuous) {
      if (touching) this.strike(p);
    } else {
      this.contacts.update(touching ? [p] : [], (player) => this.strike(player));
    }
  }

  strike(player) {
    if (this.parried || player.tryParryIncoming(this) || this.parried) return;
    const s = this.worldShape();
    const b = player.body.pos;
    const src = s.type === 'capsule' ? nearestOnSpine(s, b.x, b.y) : { x: s.x, y: s.y };
    const dx = src.x - b.x, dy = src.y - b.y, l = Math.hypot(dx, dy) || 1;
    const hitPoint = { x: b.x + (dx / l) * player.body.radius, y: b.y + (dy / l) * player.body.radius };
    player.takeDamage(this.enemy.damage * this.ability.data.damageMultiplier, hitPoint, src);
  }

  destroy() {
    this.world.hostileAttacks.delete(this);
  }
}
