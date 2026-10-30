// The light binding a Binary's two stars (looks in BINARY, the pair's spacing in its type's
// `pair`). While both live it keeps them circling each other (steer), and between them it
// is a faint thread, flaring up as a beam attack of theirs winds up (prime) and burning
// while it strikes (light), hurting whoever it touches. Parried while it burns, it breaks:
// its halves fall away and it can't burn again for `relight` seconds (its attack stuns
// them both, see PairAbility). With one of them gone it snaps loose and the other is
// widowed (widow); it lingers only to show its halves falling away.
// It is drawn by itself; a widowed star's lash is drawn by its own LashView.
import { Graphics } from 'pixi.js';
import { Entity } from '../game/entity.js';
import { segmentPointDistSq } from '../engine/physics.js';
import { clamp01, clampLength, lerp, lerpColor, smoothStep01 } from '../engine/math.js';
import { BINARY as B } from '../data/config.js';
import { rectContainsCircle } from '../render/camera.js';
import { clearGraphics } from '../render/fx.js';
import { renderTime } from './attackView.js';
import { segmentsDist } from './web.js';

// The point on segment a–b nearest p, and how far along it (0 → 1).
function nearestOn(a, b, p) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? clamp01(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2) : 0;
  return { x: a.x + dx * t, y: a.y + dy * t, t };
}

// Draws light from `a` to `b` on `g` (added on), shading from colour c0 to c1 along it:
// `width` across at full strength, `alpha` as strong, its core whiter by `heat` (0 → 1).
// Faint (`core` false), only its coloured band.
export function drawLight(g, a, b, look) {
  const n = B.segments;
  drawLightAlong(g, Array.from({ length: n + 1 }, (_, i) => ({ x: lerp(a.x, b.x, i / n), y: lerp(a.y, b.y, i / n) })), look);
}

// drawLight along a line through `points`, a piece between each two.
export function drawLightAlong(g, points, { width, alpha, heat = 0, c0, c1, core = true }) {
  if (alpha <= 0 || width <= 0) return;
  const n = points.length - 1;
  for (let i = 0; i < n; i++) {
    const color = lerpColor(c0, c1, (i + 0.5) / n), p = points[i], q = points[i + 1];
    if (core) g.moveTo(p.x, p.y).lineTo(q.x, q.y).stroke({ width: width * B.glowWidth, color, alpha: alpha * 0.18 });
    g.moveTo(p.x, p.y).lineTo(q.x, q.y).stroke({ width: width * B.width, color: lerpColor(color, 0xffffff, heat * 0.5), alpha: alpha * 0.6 });
  }
  if (!core) return;
  g.moveTo(points[0].x, points[0].y);
  for (let i = 1; i <= n; i++) g.lineTo(points[i].x, points[i].y);
  g.stroke({ width: width * B.coreWidth, color: 0xffffff, alpha: alpha * 0.9, cap: 'round', join: 'round' });
}

export class Tether extends Entity {
  constructor(world, a, b) {
    super(world);
    this.a = a;
    this.b = b;
    a.tether = b.tether = this;
    this.pair = a.type.pair;
    this.state = 'bound'; // bound, or gone once one of them is
    this.primedBy = null; // the attack winding up to light it
    this.litBy = null; // the attack it burns for
    this.width = 0; // how wide it burns (world units)
    this.damage = 0;
    this.touching = false; // whether the player touched it last step
    this.litAt = -Infinity;
    this.dousedAt = -Infinity;
    this.brokenAt = -Infinity; // when it last broke (parried) or snapped (one of them gone)
    this.brokenUntil = -Infinity; // when it can burn again
    this.snap = null; // { a, b }: where it was when it broke, its halves falling away from there
    this.moteAt = world.time + Math.random() * B.calm.moteEvery; // when a mote of light last set off along it
    this.lastSparkAt = -Infinity;
    this.gfx = new Graphics();
    this.gfx.blendMode = 'add';
    world.layers.projectiles.addChild(this.gfx);
  }

  get stars() { return [this.a, this.b]; }
  // Both still in the fight.
  get intact() { return this.state === 'bound' && this.stars.every((e) => !e.dead && !e.dying); }
  // Able to burn: intact and not broken.
  get ready() { return this.intact && this.world.time >= this.brokenUntil; }
  get burning() { return !!this.litBy; }
  // Who a parry of it is against (Astral's blades go for them): the star whose attack lit it.
  get enemy() { return this.litBy?.enemy ?? this.a; }

  // The velocity `star`'s AI steers toward, (vx, vy), plus a pull toward its place beside its
  // twin: `apart` from it across their middle, circling it at `spin`, both going round the
  // player the same way.
  steer(star, vx, vy) {
    if (!this.intact) return { x: vx, y: vy };
    const P = this.pair, other = star === this.a ? this.b : this.a, s = star.body.pos, o = other.body.pos;
    if (star === this.b) star.ai.orbitDirection = this.a.ai.orbitDirection;
    const dx = s.x - o.x, dy = s.y - o.y, l = Math.hypot(dx, dy) || 1e-6, ux = dx / l, uy = dy / l;
    const out = (P.apart - l) / 2; // how far it is from its place, out from their middle
    const turn = (P.apart / 2) * P.spin * this.a.ai.orbitDirection;
    const pull = clampLength({ x: ux * out * P.pull - uy * turn, y: uy * out * P.pull + ux * turn }, P.apart * P.pull);
    return { x: vx + pull.x, y: vy + pull.y };
  }

  // An attack of theirs winding up: it flares up toward burning.
  prime(ability) { this.primedBy = ability; }

  // Burning for `ability`, `width` across, hurting for `damage`.
  light(ability, width, damage) {
    if (!this.ready) return;
    this.primedBy = null;
    this.litBy = ability;
    this.width = width;
    this.damage = damage;
    this.litAt = this.world.time;
    this.touching = false;
    this.world.hostileAttacks.add(this);
  }

  // Dying down, back to a faint thread.
  douse() {
    if (this.litBy) this.dousedAt = this.world.time;
    this.primedBy = this.litBy = null;
    this.world.hostileAttacks.delete(this);
  }

  // Parried: it breaks, and the attack it burnt for stuns them both.
  parry() {
    const by = this.litBy;
    if (!by) return false;
    this.break();
    this.brokenUntil = this.world.time + this.pair.relight;
    by.beamParried();
    return true;
  }

  // Breaking where it stands: its halves fall away from there.
  break() {
    const a = this.a.body.pos, b = this.b.body.pos, w = this.world;
    this.douse();
    this.dousedAt = -Infinity;
    this.brokenAt = w.time;
    this.snap = { a: { ...a }, b: { ...b } };
    for (let i = 0; i < 4; i++) {
      const t = (i + Math.random()) / 4, x = lerp(a.x, b.x, t), y = lerp(a.y, b.y, t);
      w.effects.burst(x, y, 0, { ...B.snap.sparks, color: lerpColor(B.colors[0], B.colors[1], t) });
    }
    w.sound('binarySnap', { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  }

  // One of them gone: it snaps loose, and the other, if it lives, fights on alone, faster,
  // whipping its broken beam round itself (BinaryLash).
  widow() {
    this.state = 'gone';
    this.break();
    for (const e of this.stars) {
      e.tether = null;
      if (e.dead || e.dying) continue;
      e.widowed = true;
      e.pace = e.type.widowed.pace;
      e.ai.attackRange = Math.max(0, ...e.ai.attacks.filter((at) => at.ability.data.type === 'binaryLash').map((at) => at.ability.data.range));
    }
  }

  step() {
    if (this.state === 'bound' && !this.intact) this.widow();
    if (this.state === 'gone' && this.world.time >= this.brokenAt + B.snap.time) this.destroy();
  }

  // Hurting the player as they first touch it while it burns (a parry held up to it breaks it).
  afterPhysics() {
    const p = this.world.hittablePlayer;
    if (!this.burning || !p) { this.touching = false; return; }
    const b = p.body, touching = this.overlapsCircle(b.pos.x, b.pos.y, b.radius);
    if (touching && !this.touching) this.hurt(p);
    this.touching = touching;
  }

  hurt(p) {
    if (p.tryParryIncoming(this) || !this.burning) return;
    const b = p.body, q = nearestOn(this.a.body.pos, this.b.body.pos, b.pos), dx = q.x - b.pos.x, dy = q.y - b.pos.y, l = Math.hypot(dx, dy) || 1;
    p.hitBy(this, this.damage, { x: b.pos.x + (dx / l) * b.radius, y: b.pos.y + (dy / l) * b.radius }, { x: q.x, y: q.y });
  }

  // As an attack the player meets: a capsule from one star to the other.
  worldShape() {
    const a = this.a.body.pos, b = this.b.body.pos;
    return { type: 'capsule', ax: a.x, ay: a.y, bx: b.x, by: b.y, r: this.width / 2 };
  }
  overlapsCircle(x, y, r) {
    const a = this.a.body.pos, b = this.b.body.pos;
    return segmentPointDistSq(a.x, a.y, b.x, b.y, x, y) < (r + this.width / 2) ** 2;
  }
  overlapsCapsule(cap) { return segmentsDist(this.a.body.pos, this.b.body.pos, { x: cap.ax, y: cap.ay }, { x: cap.bx, y: cap.by }) < cap.r + this.width / 2; }
  closestPoint(cap) { return nearestOn(this.a.body.pos, this.b.body.pos, { x: cap.cx, y: cap.cy }); }

  render(alpha, dt, view) {
    const g = this.gfx, w = this.world, now = renderTime(w, alpha);
    clearGraphics(g);
    const pa = this.a.body.lerpPos(alpha), pb = this.b.body.lerpPos(alpha);
    const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2, half = Math.hypot(pb.x - pa.x, pb.y - pa.y) / 2;
    g.visible = rectContainsCircle(view, mx, my, half + 1);
    if (!g.visible) return;
    const [c0, c1] = B.colors;
    // Broken: its halves falling back into their stars.
    const since = now - this.brokenAt;
    if (this.snap && since >= 0 && since < B.snap.time) {
      const k = smoothStep01(since / B.snap.time), s = this.snap, m = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
      const fall = (from, to) => ({ x: lerp(to.x, from.x, k), y: lerp(to.y, from.y, k) });
      const width = this.width || B.calm.width;
      drawLight(g, s.a, fall(s.a, m), { width, alpha: 1 - k, c0, c1: lerpColor(c0, c1, 0.5) });
      drawLight(g, s.b, fall(s.b, m), { width, alpha: 1 - k, c0: c1, c1: lerpColor(c0, c1, 0.5) });
    }
    if (!this.intact) return;
    // Fading back in once it can burn again.
    const back = clamp01((now - this.brokenUntil + B.relight) / B.relight), C = B.calm;
    if (back <= 0) return;
    let width = C.width, strength = C.alpha, heat = 0, core = false;
    const primed = this.primedBy, P = B.charge, flicker = 1 + B.flicker * Math.sin(now * 53 + Math.sin(now * 17) * 3);
    if (this.litBy) {
      const flash = 1 - clamp01((now - this.litAt) / B.flashTime);
      width = this.width * flicker * (1 + 0.5 * flash);
      strength = 1;
      heat = 0.4 + 0.6 * flash;
      core = true;
      if (now - this.lastSparkAt >= B.sparkEvery && dt > 0) {
        this.lastSparkAt = now;
        const t = Math.random(), x = lerp(pa.x, pb.x, t), y = lerp(pa.y, pb.y, t);
        w.effects.burst(x, y, 0, { ...B.sparks, color: lerpColor(c0, c1, t) });
      }
    } else if (primed?.phase === 'windup') {
      const k = smoothStep01(clamp01((now - primed.phaseStartedAt) / Math.max(1e-3, primed.phaseEndsAt - primed.phaseStartedAt)));
      width = lerp(C.width, primed.data.beamWidth * P.width, k) * flicker;
      strength = lerp(C.alpha, P.alpha, k) * flicker;
      heat = 0.3 * k;
      core = k > 0.3;
    } else {
      const k = 1 - clamp01((now - this.dousedAt) / 0.2); // dying down
      if (k > 0) {
        width = lerp(C.width, this.width, k);
        strength = lerp(C.alpha, 1, k);
        core = true;
      }
    }
    drawLight(g, pa, pb, { width, alpha: strength * back, heat, c0, c1, core });
    if (!this.litBy && !primed) this.drawMote(g, now, pa, pb, back);
  }

  // Calm, a mote of light runs along it now and then, from one star to the other.
  drawMote(g, now, a, b, alpha) {
    const C = B.calm, len = Math.hypot(b.x - a.x, b.y - a.y);
    if (now - this.moteAt > C.moteEvery + len / C.moteSpeed) this.moteAt = now;
    const t = (now - this.moteAt) * C.moteSpeed / Math.max(len, 1e-3);
    if (t < 0 || t > 1) return;
    const x = lerp(a.x, b.x, t), y = lerp(a.y, b.y, t), fade = Math.sin(Math.PI * t) * alpha, color = lerpColor(B.colors[0], B.colors[1], t);
    g.circle(x, y, C.moteSize).fill({ color, alpha: 0.25 * fade });
    g.circle(x, y, C.moteSize * 0.35).fill({ color: 0xffffff, alpha: 0.8 * fade });
  }

  dispose() {
    this.douse();
    for (const e of this.stars) if (e.tether === this) e.tether = null;
    this.gfx.destroy();
  }
}

// A widowed star's lash (LashAbility), bending like a whip: its broken beam growing out of
// it over the wind-up, flaring up, then whipping round at full strength and dying down; dim
// once parried.
export class LashView {
  constructor(ability) {
    this.ability = ability;
    this.gfx = new Graphics();
    this.gfx.blendMode = 'add';
    ability.world.layers.projectiles.addChild(this.gfx);
  }

  strike() {}

  render(now, alpha) {
    const a = this.ability, e = a.enemy, d = a.data, g = this.gfx;
    clearGraphics(g);
    let length = d.length, strength, width = d.width, heat = 0, core = true;
    if (a.phase === 'windup') {
      const k = smoothStep01(clamp01((now - a.phaseStartedAt) / Math.max(1e-3, a.phaseEndsAt - a.phaseStartedAt)));
      length *= k;
      strength = B.charge.alpha * k * (1 + B.flicker * Math.sin(now * 53));
      width *= lerp(B.calm.width / d.width, B.charge.width, k);
      core = k > 0.3;
    } else if (a.phase === 'active') {
      strength = a.hitbox.parried ? 0.35 : 1;
      heat = 1 - clamp01((now - a.strikeAt) / B.flashTime);
    } else strength = 1 - clamp01((now - a.activeEndedAt) / 0.25);
    if (strength <= 0 || !e.view.visible) return;
    const color = e.hitColor;
    drawLightAlong(g, a.points(e.body.lerpPos(alpha), now, length), { width, alpha: strength, heat, c0: color, c1: lerpColor(color, 0xffffff, 0.35), core });
  }

  destroy() { this.gfx.destroy(); }
}
