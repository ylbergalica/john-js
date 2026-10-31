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

// Circle (x, y, r) vs a world shape. Against a circle cut to an arc, the circle's centre
// must be inside the arc (as seen from the shape's centre): brushing it from the side
// doesn't count. A circle with a hole `inner` across doesn't reach one wholly inside that.
function circleVsShape(x, y, r, s) {
  if (s.type === 'group') return s.parts.some((p) => circleVsShape(x, y, r, p));
  if (s.type === 'capsule') return circleVsCapsule(x, y, r, s);
  if (s.type === 'box') return circleVsBox(x, y, r, s);
  if (!circleVsCircle(x, y, r, s.x, s.y, s.r)) return false;
  const dx = x - s.x, dy = y - s.y, l = Math.hypot(dx, dy);
  if (s.inner && l + r < s.inner) return false;
  if (s.minCos === undefined) return true;
  return l < 1e-6 || (dx * s.fx + dy * s.fy) / l >= s.minCos;
}

// A shape in an enemy's frame (see EnemyHitbox) → the world, for the enemy at (x, y)
// facing `rotation`.
function toWorld(s, x, y, rotation) {
  const c = Math.cos(rotation), sn = Math.sin(rotation);
  if (s.type === 'group') return { type: 'group', parts: s.parts.map((p) => toWorld(p, x, y, rotation)) };
  if (s.type === 'segment') {
    return { type: 'capsule', ax: x + c * s.ax - sn * s.ay, ay: y + sn * s.ax + c * s.ay, bx: x + c * s.bx - sn * s.by, by: y + sn * s.bx + c * s.by, r: s.r };
  }
  if (s.type === 'circle') {
    const f = s.forward ?? 0, circle = { type: 'circle', x: x + c * f, y: y + sn * f, r: s.r, inner: s.inner ?? 0 };
    return s.arcDeg ? { ...circle, fx: c, fy: sn, minCos: Math.cos((s.arcDeg * Math.PI) / 360) } : circle;
  }
  if (s.type === 'beam') {
    const to = s.from + s.length;
    return { type: 'capsule', ax: x + c * s.from, ay: y + sn * s.from, bx: x + c * to, by: y + sn * to, r: s.r };
  }
  return { type: 'box', x: x + c * s.forward, y: y + sn * s.forward, hw: s.hw, hh: s.hh, angle: rotation };
}

// Approximate point of world shape `s` toward a capsule (for the parry spark); of a group,
// its part's nearest the capsule's centre.
function closestOnShape(s, cap) {
  if (s.type === 'group') {
    const dist = (q) => Math.hypot(q.x - cap.cx, q.y - cap.cy);
    return s.parts.map((p) => closestOnShape(p, cap)).reduce((a, q) => (dist(q) < dist(a) ? q : a));
  }
  if (s.type === 'capsule') return nearestOnSpine(s, cap.cx, cap.cy);
  const d = Math.sqrt(segmentPointDistSq(cap.ax, cap.ay, cap.bx, cap.by, s.x, s.y));
  const dx = cap.cx - s.x, dy = cap.cy - s.y, l = Math.hypot(dx, dy) || 1;
  const reach = Math.min(s.type === 'box' ? Math.max(s.hw, s.hh) : s.r, d);
  return { x: s.x + (dx / l) * reach, y: s.y + (dy / l) * reach };
}

// Where world shape `s` (any attack's) reaches into walls: for each wall tile bordering the
// floor that it reaches, the tile's point nearest it, deepest first: { x, y, depth, key }.
export function wallContacts(s, physics) {
  const out = [];
  const add = (part) => {
    if (part.type === 'group') { part.parts.forEach(add); return; }
    const reach = part.type === 'capsule' ? part.r : part.type === 'box' ? Math.hypot(part.hw, part.hh) : part.r;
    const x0 = part.type === 'capsule' ? Math.min(part.ax, part.bx) : part.x, x1 = part.type === 'capsule' ? Math.max(part.ax, part.bx) : part.x;
    const y0 = part.type === 'capsule' ? Math.min(part.ay, part.by) : part.y, y1 = part.type === 'capsule' ? Math.max(part.ay, part.by) : part.y;
    const wall = (cx, cy) => physics.isWall(cx, cy);
    for (let cx = Math.floor(x0 - reach); cx <= Math.floor(x1 + reach); cx++) {
      for (let cy = Math.floor(y0 - reach); cy <= Math.floor(y1 + reach); cy++) {
        if (!wall(cx, cy) || (wall(cx - 1, cy) && wall(cx + 1, cy) && wall(cx, cy - 1) && wall(cx, cy + 1))) continue;
        const near = (px, py) => ({ x: Math.max(cx, Math.min(px, cx + 1)), y: Math.max(cy, Math.min(py, cy + 1)) });
        let q = null, depth = 0;
        if (part.type === 'capsule') {
          // The tile's point nearest the spine, found along it.
          const n = Math.max(1, Math.ceil(Math.hypot(part.bx - part.ax, part.by - part.ay) / 0.25));
          let best = Infinity;
          for (let i = 0; i <= n; i++) {
            const px = part.ax + ((part.bx - part.ax) * i) / n, py = part.ay + ((part.by - part.ay) * i) / n;
            const c = near(px, py), d2 = (c.x - px) ** 2 + (c.y - py) ** 2;
            if (d2 < best) { best = d2; q = c; }
          }
          depth = part.r - Math.sqrt(best);
          if (depth <= 0) q = null;
        } else {
          const c = near(part.x, part.y);
          if (circleVsShape(c.x, c.y, 0.001, part)) { q = c; depth = reach - Math.hypot(c.x - part.x, c.y - part.y); }
        }
        if (q) out.push({ x: q.x, y: q.y, depth, key: cx + cy * 65536 });
      }
    }
  };
  add(s);
  return out.sort((a, b) => b.depth - a.depth);
}

export class EnemyHitbox {
  // shape (in enemy-local units, +x forward):
  //   { type: 'circle', r, forward, arcDeg, inner }
  //                                           centred `forward` ahead (default 0); given
  //                                           `arcDeg`, only that much of it across the front;
  //                                           given `inner`, only the band outside that radius
  //   { type: 'box', forward, hw, hh }
  //   { type: 'beam', from, length, r }       a capsule from `from` to `from + length` ahead
  //   { type: 'segment', ax, ay, bx, by, r }  a capsule from (ax, ay) to (bx, by)
  //   { type: 'group', parts }                all of `parts` (any of the above)
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

  // Whether it lands on `player` however recently they were hurt (its ability says).
  ignoresInvincibility(player) { return this.ability.ignoresInvincibility?.(player) ?? false; }

  // Player parry hook (also just after it has struck, see Player.hitBy).
  parry() {
    this.parried = true;
    this.ability.onParry();
    return true;
  }

  worldShape() {
    const b = this.enemy.body;
    const { x, y, rotation } = this.anchor ?? { x: b.pos.x, y: b.pos.y, rotation: b.rotation };
    return toWorld(this.shape, x, y, rotation);
  }

  overlapsCircle(x, y, r) { return circleVsShape(x, y, r, this.worldShape()); }

  overlapsCapsule(cap) {
    const s = this.worldShape();
    if (s.type === 'circle' && s.minCos === undefined) return circleVsCapsule(s.x, s.y, s.r, cap);
    // Anything else vs capsule: test circles along the capsule's spine.
    const hits = (x, y) => circleVsShape(x, y, cap.r, s);
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      if (hits(cap.ax + (cap.bx - cap.ax) * t, cap.ay + (cap.by - cap.ay) * t)) return true;
    }
    return false;
  }

  // Approximate contact point toward a capsule (for the parry spark).
  closestPoint(cap) { return closestOnShape(this.worldShape(), cap); }

  afterPhysics() {
    if (!this.active || this.enemy.dead) return;
    const p = this.world.hittablePlayer;
    const touching = p && this.overlapsCircle(p.body.pos.x, p.body.pos.y, p.body.radius);
    if (this.continuous) {
      if (touching) this.strike(p);
    } else {
      this.contacts.update(touching ? [p] : [], (player) => this.strike(player));
    }
  }

  strike(player) {
    if (this.parried || player.tryParryIncoming(this) || this.parried) return;
    const b = player.body.pos;
    let s = this.worldShape();
    // Of a group, the hit comes from the part that reached the player.
    if (s.type === 'group') s = s.parts.find((part) => circleVsShape(b.x, b.y, player.body.radius, part)) ?? s.parts[0];
    const src = s.type === 'capsule' ? nearestOnSpine(s, b.x, b.y) : { x: s.x, y: s.y };
    const dx = src.x - b.x, dy = src.y - b.y, l = Math.hypot(dx, dy) || 1;
    const hitPoint = { x: b.x + (dx / l) * player.body.radius, y: b.y + (dy / l) * player.body.radius };
    player.hitBy(this, this.enemy.damage * this.ability.data.damageMultiplier, hitPoint, src);
    this.ability.onStruck?.(player); // reached them, whether or not it hurts
  }

  destroy() {
    this.world.hostileAttacks.delete(this);
  }
}
