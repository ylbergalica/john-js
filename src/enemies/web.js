// The Weaver's silk (looks in WEB). Silk is an anchor spat into a wall (WeaverWeave),
// paying out its line behind it: hitting the player on the way it hurts them and its line
// falls slack; reaching the wall, it sticks, and its Weaver spins a Thread from there as it
// walks across to the far wall, the thread paying out of its spinnerets until it fastens
// it. A Thread stays strung until cut, hurting whoever touches it (once as they touch it,
// and again every while they stay in it), the one being spun too; anything of the player's
// that deals damage cuts it (it sits in world.props, struck like a prop), and a parry breaks
// it and hurts its Weaver. Its halves spring back to their knots.
// A WebBall is thrown on a line (WeaverReel): catching the player, it hands them to its
// ability to reel in; missing, it is drawn back. ReelView draws the line out to it, the ball
// as it forms or is drawn back, the web wound round the player it caught, shaking as they
// struggle, and the line snapping or falling slack.
import { Container, Graphics, Sprite } from 'pixi.js';
import { Entity } from '../game/entity.js';
import { segmentPointDistSq } from '../engine/physics.js';
import { clamp01, lerp, randRange, smoothStep01, TAU } from '../engine/math.js';
import { ATTACK_FX, WEB as W } from '../data/config.js';
import { tex } from '../render/assets.js';
import { clearGraphics } from '../render/fx.js';
import { DEW_TIP } from '../render/sprites.js';
import { Projectile } from './projectile.js';
import { SilkLook, renderTime } from './attackView.js';

const easeOut = (t) => 1 - (1 - t) ** 2;
// Silk is drawn this many times larger and scaled back down, so its fine lines and dots
// come out smooth.
const U = 32;
// A thread's twang this far across or less reads as still (well under a pixel), so a
// strung thread is drawn once it settles and not again until it's struck or changes.
const STILL = 0.002;
// How far past its ends a thread is drawn (its knots, glow and twang), for leaving off
// threads out of sight.
const REACH = 0.5;

// The point on segment a–b nearest p, and how far along it (0 → 1).
function nearestOn(a, b, p) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? clamp01(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2) : 0;
  return { x: a.x + dx * t, y: a.y + dy * t, t };
}

// How close segments a–b and c–d come.
export function segmentsDist(a, b, c, d) {
  const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  if (Math.sign(cross(a, b, c)) !== Math.sign(cross(a, b, d)) && Math.sign(cross(c, d, a)) !== Math.sign(cross(c, d, b))) return 0;
  return Math.sqrt(Math.min(
    segmentPointDistSq(a.x, a.y, b.x, b.y, c.x, c.y), segmentPointDistSq(a.x, a.y, b.x, b.y, d.x, d.y),
    segmentPointDistSq(c.x, c.y, d.x, d.y, a.x, a.y), segmentPointDistSq(c.x, c.y, d.x, d.y, b.x, b.y),
  ));
}

// A pair of Graphics drawing silk: its glow (added on) under its core.
class SilkGfx {
  constructor(parent) {
    this.container = new Container();
    this.glow = new Graphics();
    this.glow.blendMode = 'add';
    this.core = new Graphics();
    this.container.addChild(this.glow, this.core);
    this.container.scale.set(1 / U);
    parent.addChild(this.container);
  }

  clear() { clearGraphics(this.glow); clearGraphics(this.core); }

  set visible(on) { this.container.visible = on; }

  // A strand through `pts` ([{ x, y }], world units), `alpha` as strong.
  strand(pts, alpha, width = W.width) {
    if (alpha <= 0 || pts.length < 2) return;
    for (const [g, w, color, a] of [[this.glow, W.glowWidth, W.glow, W.glowAlpha], [this.core, width, W.color, W.alpha]]) {
      g.moveTo(pts[0].x * U, pts[0].y * U);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x * U, pts[i].y * U);
      g.stroke({ width: w * U, color, alpha: a * alpha, cap: 'round', join: 'round' });
    }
  }

  // A knot where silk is stuck down: short strands splayed out round a dot.
  knot(p, angles, alpha) {
    if (alpha <= 0) return;
    const K = W.knot;
    for (const a of angles) this.strand([p, { x: p.x + Math.cos(a) * K.length, y: p.y + Math.sin(a) * K.length }], alpha * 0.8, W.width * 0.7);
    this.glow.circle(p.x * U, p.y * U, K.dot * 1.6 * U).fill({ color: W.glow, alpha: W.glowAlpha * alpha });
    this.core.circle(p.x * U, p.y * U, (K.dot / 2) * U).fill({ color: W.color, alpha: alpha });
  }

  // A four-point glint of dew, `r` across.
  glint(p, r, alpha) {
    if (alpha <= 0) return;
    const x = p.x * U, y = p.y * U, R = r * U, k = R * 0.18;
    this.core.poly([x + R, y, x + k, y + k, x, y + R, x - k, y + k, x - R, y, x - k, y - k, x, y - R, x + k, y - k]).fill({ color: 0xffffff, alpha });
  }

  destroy() { this.container.destroy({ children: true }); }
}

// Points along a–b (`n` + 1), each pushed across it by `off(u)` (u: 0 → 1 along it).
function along(a, b, n, off) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1e-6, nx = -dy / len, ny = dx / len, pts = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, o = off(u);
    pts.push({ x: a.x + dx * u + nx * o, y: a.y + dy * u + ny * o });
  }
  return pts;
}

const knotAngles = (toward) => Array.from({ length: W.knot.strands }, (_, i) => toward + Math.PI + ((i + 0.5) / W.knot.strands - 0.5) * 2.6 + randRange(-0.2, 0.2));

// A twang `since` seconds ago, as how far across it has the middle (WEB.twang); none long since.
const twang = (since) => (since >= 0 && since < W.twang.decay * 10 ? W.twang.amount * Math.exp(-since / W.twang.decay) * Math.sin(since * W.twang.freq * TAU) : 0);

export class Thread extends Entity {
  // a, b: { x, y }, its ends, `a` stuck down first. owner: the WeaveAbility that spun it
  // (null for a line falling away), hurt when it is parried. opts: { width, damage, rehit }.
  // `spinning`: still being spun, its far end following its Weaver (spinTo) until it is
  // fastened (fasten); `slack`: falling away from the start, harmless.
  constructor(world, owner, a, b, { width, damage = 0, rehit = 1 }, { slack = false, spinning = false } = {}) {
    super(world);
    this.owner = owner;
    this.a = { ...a };
    this.b = { ...b };
    this.length = Math.hypot(b.x - a.x, b.y - a.y);
    this.width = width;
    this.damage = damage;
    this.rehit = rehit;
    this.state = slack ? 'slack' : 'taut';
    this.spinning = spinning;
    this.changedAt = world.time; // when it was cut or fell slack
    this.cutAt = 0.5; // how far along it was cut
    this.touching = false; // whether the player touched it last step
    this.hitAt = -Infinity; // when it last hurt them
    this.twangAt = spinning ? -Infinity : world.time; // when it last twanged
    this.shimmerAt = world.time + Math.random() * W.shimmer.every;
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    this.knots = [knotAngles(angle + Math.PI), knotAngles(angle)];
    // The line and its knots; the dew on it, as sprites, so their twinkling redraws nothing;
    // and a glint running along it, now and then.
    this.gfx = new SilkGfx(world.layers.telegraphs);
    this.drops = world.layers.telegraphs.addChild(new Container());
    this.shine = new SilkGfx(world.layers.telegraphs);
    this.still = false; // whether gfx holds it strung and settled, as it stays until it twangs again
    this.dew = [];
    if (!spinning) this.wet();
    this.isProp = this.isThread = true;
    if (this.taut) {
      world.hostileAttacks.add(this);
      world.props.push(this);
    }
  }

  get taut() { return this.state === 'taut'; }
  // Cut or fallen slack, it's past striking (it leaves world.props on its next step).
  get dying() { return !this.taut; }
  // Who to blame for it (the parry's listeners look for the enemy behind an attack).
  get sourceAbility() { return this.owner; }

  // Dew along it, spaced over its length.
  wet() {
    const drops = Math.max(1, Math.floor(this.length / W.dew.spacing));
    this.dew = Array.from({ length: drops }, (_, i) => ({
      u: (i + 0.5 + randRange(-0.3, 0.3)) / drops, rate: randRange(...W.dew.twinkle), phase: Math.random() * TAU,
    }));
    for (const s of this.drops.removeChildren()) s.destroy();
    for (let i = 0; i < drops; i++) this.drops.addChild(new Sprite(tex.silk_dew)).anchor.set(0.5);
  }

  // Being spun: its far end where its Weaver's spinnerets are now.
  spinTo(p) {
    this.b = { ...p };
    this.length = Math.hypot(p.x - this.a.x, p.y - this.a.y);
  }

  // Fastened at `p`: done spinning, twanging taut.
  fasten(p) {
    this.spinTo(p);
    this.spinning = false;
    this.knots[1] = knotAngles(Math.atan2(p.y - this.a.y, p.x - this.a.x));
    this.wet();
    this.twangAt = this.world.time;
    this.world.sound('threadStrung', p);
  }

  step() {
    if (!this.taut) this.leave();
    if (!this.taut && this.world.time >= this.changedAt + (this.state === 'cut' ? W.snap.time : W.slack)) this.destroy();
  }

  // A sword stroke across it cuts it; touching it hurts, as the player first touches it and
  // again every `rehit` they stay in it (a parry held up to it breaks it instead).
  afterPhysics() {
    if (!this.taut) return;
    const p = this.world.hittablePlayer;
    if (!p) { this.touching = false; return; }
    if (p.attacking) {
      const cap = p.attackCapsule();
      if (this.overlapsCapsule(cap)) { this.cut(nearestOn(this.a, this.b, { x: cap.cx, y: cap.cy }).t); return; }
    }
    const b = p.body, touching = this.overlapsCircle(b.pos.x, b.pos.y, b.radius);
    if (touching && (!this.touching || this.world.time - this.hitAt >= this.rehit)) this.hurt(p);
    this.touching = touching;
  }

  hurt(p) {
    if (p.tryParryIncoming(this) || !this.taut) return;
    const b = p.body, q = nearestOn(this.a, this.b, b.pos), dx = q.x - b.pos.x, dy = q.y - b.pos.y, l = Math.hypot(dx, dy) || 1;
    p.hitBy(this, this.damage, { x: b.pos.x + (dx / l) * b.radius, y: b.pos.y + (dy / l) * b.radius }, { x: q.x, y: q.y });
    if (p.pendingHit?.attack === this) this.hitAt = this.twangAt = this.world.time; // landed, not shrugged off
  }

  // As an attack the player meets: a capsule along it.
  worldShape() { return { type: 'capsule', ax: this.a.x, ay: this.a.y, bx: this.b.x, by: this.b.y, r: this.width / 2 }; }
  overlapsCircle(x, y, r) { return segmentPointDistSq(this.a.x, this.a.y, this.b.x, this.b.y, x, y) < (r + this.width / 2) ** 2; }
  overlapsCapsule(cap) { return segmentsDist(this.a, this.b, { x: cap.ax, y: cap.ay }, { x: cap.bx, y: cap.by }) < cap.r + this.width / 2; }
  // Dragged through it on the Weaver's line, its hurt lands however recently they were hurt.
  ignoresInvincibility(player) { return !!player.reeledBy; }
  // It stays strung after it hurts someone (see Player.hurtBy).
  get lingers() { return true; }

  // As a prop the player's damage strikes (see hurtShape): a body round it, a thin box along
  // it, and cut wherever it's struck. A burn doesn't cut it (the blow lighting it does).
  get body() {
    return { pos: { x: (this.a.x + this.b.x) / 2, y: (this.a.y + this.b.y) / 2 }, radius: this.length / 2 + this.width / 2, rotation: Math.atan2(this.b.y - this.a.y, this.b.x - this.a.x) };
  }
  hurtOutline() {
    const dx = this.b.x - this.a.x, dy = this.b.y - this.a.y, l = Math.hypot(dx, dy) || 1e-6, h = this.width / 2;
    const nx = (-dy / l) * h, ny = (dx / l) * h;
    return [{ x: this.a.x + nx, y: this.a.y + ny }, { x: this.b.x + nx, y: this.b.y + ny }, { x: this.b.x - nx, y: this.b.y - ny }, { x: this.a.x - nx, y: this.a.y - ny }];
  }
  closestPoint(p) { return nearestOn(this.a, this.b, p); }
  takeDamage(damage, hitPoint, source) {
    if (damage > 0) this.cut(nearestOn(this.a, this.b, hitPoint ?? source).t);
  }
  sap() {}

  // Out of world.props: nothing strikes it again.
  leave() {
    const props = this.world.props, i = props.indexOf(this);
    if (i >= 0) props.splice(i, 1);
  }

  // Parried: it breaks where the player met it, and its Weaver is hurt.
  parry() {
    if (!this.taut) return false;
    const p = this.world.livePlayer;
    this.cut(p ? nearestOn(this.a, this.b, p.body.pos).t : 0.5);
    this.owner?.threadParried(this);
    return true;
  }

  cut(t) {
    if (!this.taut) return;
    this.state = 'cut';
    this.changedAt = this.world.time;
    this.cutAt = t;
    this.world.hostileAttacks.delete(this);
    const x = lerp(this.a.x, this.b.x, t), y = lerp(this.a.y, this.b.y, t);
    this.world.effects.burst(x, y, 0, { ...W.snap.sparks, color: W.color });
    this.world.sound('threadSnap', { x, y });
  }

  slacken() {
    if (this.dead || !this.taut) return;
    this.state = 'slack';
    this.changedAt = this.world.time;
    this.world.hostileAttacks.delete(this);
  }

  // Out of sight, it isn't drawn (its glint keeps running along it all the same).
  render(alpha, dt, view) {
    const now = renderTime(this.world, alpha), a = this.a, b = this.b;
    const shown = Math.max(a.x, b.x) + REACH >= view.x0 && Math.min(a.x, b.x) - REACH <= view.x1
      && Math.max(a.y, b.y) + REACH >= view.y0 && Math.min(a.y, b.y) - REACH <= view.y1;
    this.gfx.visible = this.shine.visible = shown;
    this.drops.visible = shown && this.taut;
    if (this.taut) { this.drawTaut(now, shown); return; }
    if (!shown) return;
    this.gfx.clear();
    this.shine.clear();
    this.still = false;
    if (this.state === 'cut') this.drawCut(now);
    else this.drawSlack(now);
  }

  // Taut: quivering as it twangs, dew glinting and now and then a glint running along it.
  // Being spun, just the line paying out. Settled, the line is left as last drawn.
  drawTaut(now, shown) {
    const shimmer = this.spinning ? null : this.shimmer(now);
    if (!shown) return;
    const g = this.gfx, a = this.a, b = this.b, since = now - this.twangAt, quiver = twang(since);
    const still = !this.spinning && !(since >= 0 && W.twang.amount * Math.exp(-since / W.twang.decay) > STILL);
    if (!(still && this.still)) {
      g.clear();
      g.strand(along(a, b, Math.max(6, Math.round(this.length * 3)), (u) => quiver * Math.sin(Math.PI * u)), 1);
      g.knot(a, this.knots[0], 1);
      if (!this.spinning) g.knot(b, this.knots[1], 1);
      this.still = still;
    }
    const unit = 1 / (DEW_TIP * tex.silk_dew.width); // scale for a drop whose tips are one world unit out
    this.dew.forEach((d, i) => {
      const s = this.drops.children[i], tw = 0.5 + 0.5 * Math.sin(now * d.rate * TAU + d.phase), p = this.pointAt(d.u, quiver);
      s.position.set(p.x, p.y);
      s.scale.set(W.dew.size * lerp(0.4, 1, tw) * unit);
      s.alpha = lerp(0.2, 0.9, tw);
    });
    this.shine.clear();
    if (shimmer) {
      const [u0, u1] = shimmer;
      this.shine.strand([this.pointAt(u0, quiver), this.pointAt((u0 + u1) / 2, quiver), this.pointAt(u1, quiver)], 0.9, W.width * 1.8);
    }
  }

  // The span ([from, to] of the way along) of the glint running along it now, or null
  // between runs, when the next is set going.
  shimmer(now) {
    const S = W.shimmer, run = ((now - this.shimmerAt) * S.speed) / this.length;
    if (run > 1 + S.length / this.length) {
      this.shimmerAt = now + randRange(0.5, 1.5) * S.every;
      return null;
    }
    const u0 = Math.max(0, run - S.length / this.length), u1 = Math.min(1, run);
    return run > 0 && u1 > u0 ? [u0, u1] : null;
  }

  // The point `u` of the way along it, pushed `quiver` across at its middle.
  pointAt(u, quiver) {
    const a = this.a, b = this.b, dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1e-6, o = quiver * Math.sin(Math.PI * u);
    return { x: a.x + dx * u - (dy / len) * o, y: a.y + dy * u + (dx / len) * o };
  }

  // Cut: each half springing back to its knot, wriggling, fading.
  drawCut(now) {
    const k = clamp01((now - this.changedAt) / W.snap.time), back = easeOut(k), fade = 1 - k, g = this.gfx;
    const c = { x: lerp(this.a.x, this.b.x, this.cutAt), y: lerp(this.a.y, this.b.y, this.cutAt) };
    for (const [knot, angles, sign] of [[this.a, this.knots[0], 1], [this.b, this.knots[1], -1]]) {
      const end = { x: lerp(c.x, knot.x, back), y: lerp(c.y, knot.y, back) }, len = Math.hypot(end.x - knot.x, end.y - knot.y);
      if (len > 0.02) g.strand(along(knot, end, 8, (u) => sign * Math.sin(u * Math.PI * 3 + now * 40) * 0.08 * u * fade), fade);
      g.knot(knot, angles, fade);
    }
  }

  // Slack: sagging away to one side, rippling, fading.
  drawSlack(now) {
    const k = clamp01((now - this.changedAt) / W.slack), fade = 1 - k, g = this.gfx;
    const sag = 0.35 * easeOut(k), n = Math.max(6, Math.round(this.length * 3));
    g.strand(along(this.a, this.b, n, (u) => Math.sin(Math.PI * u) * sag * Math.min(1, this.length / 3) + Math.sin(u * 9 + now * 12) * 0.03 * fade), fade);
    g.knot(this.a, this.knots[0], fade);
  }

  dispose() {
    this.world.hostileAttacks.delete(this);
    this.gfx.destroy();
    this.drops.destroy({ children: true });
    this.shine.destroy();
  }
}

// An anchor of silk (WeaverWeave), paying out its line behind it from `root`.
// opts: Projectile's.
export class Silk extends Projectile {
  constructor(world, sourceAbility, root, opts) {
    super(world, sourceAbility, root.x, root.y, { ...opts, look: 'silk' });
    this.root = { ...root };
    this.line = new SilkGfx(world.layers.telegraphs);
  }

  step(dt) {
    if (this.world.time >= this.expiresAt) { this.land({ ...this.body.pos }); return; }
    super.step(dt);
  }

  afterPhysics() {
    const b = this.body, w = this.world;
    if (w.physics.circleHitsWall(b.pos.x, b.pos.y, b.radius)) {
      this.land({ x: b.pos.x - this.dir.x * b.radius, y: b.pos.y - this.dir.y * b.radius });
      return;
    }
    const p = w.hittablePlayer;
    if (!p || !this.overlapsCircle(p.body.pos.x, p.body.pos.y, p.body.radius)) return;
    if (p.tryParryIncoming(this) || this.dead) return;
    const dx = b.pos.x - p.body.pos.x, dy = b.pos.y - p.body.pos.y, l = Math.hypot(dx, dy) || 1;
    p.hitBy(this, this.damage, { x: p.body.pos.x + (dx / l) * p.body.radius, y: p.body.pos.y + (dy / l) * p.body.radius }, { ...b.pos });
    this.fall();
    this.destroy();
  }

  parry() {
    if (!this.parried) this.fall();
    return super.parry();
  }

  // Stuck where it landed: the ability spins its thread from there.
  land(at) {
    this.sourceAbility.anchored(at);
    this.destroy();
  }

  // Its line falls slack.
  fall() {
    const b = this.body.pos;
    if (Math.hypot(b.x - this.root.x, b.y - this.root.y) > 0.3) this.world.add(new Thread(this.world, null, this.root, b, { width: W.width }, { slack: true }));
  }

  // The line paying out behind it, rippling.
  render(alpha) {
    super.render(alpha);
    const p = this.body.lerpPos(alpha), now = renderTime(this.world, alpha), P = W.payout;
    const len = Math.hypot(p.x - this.root.x, p.y - this.root.y);
    this.line.clear();
    if (len < 0.05) return;
    this.line.strand(along(this.root, p, Math.max(4, Math.round(len * 3)), (u) => Math.sin(u * P.waves * TAU - now * 30) * P.amount * Math.sin(Math.PI * u)), 1);
  }

  dispose() {
    super.dispose();
    this.line.destroy();
  }
}

// A ball of web thrown on a line (WeaverReel), flying straight out `reach` before it is
// drawn back. opts: { dir, speed, reach, size }
export class WebBall extends Projectile {
  constructor(world, sourceAbility, from, { dir, speed, reach, size }) {
    super(world, sourceAbility, from.x, from.y, { dir, speed, lifetime: reach / speed, damage: 0, size, look: 'silk' });
  }

  step(dt) {
    if (this.world.time >= this.expiresAt) { this.miss(false); return; }
    super.step(dt);
  }

  afterPhysics() {
    const b = this.body, w = this.world;
    if (w.physics.circleHitsWall(b.pos.x, b.pos.y, b.radius)) { this.miss(true); return; }
    const p = w.hittablePlayer;
    if (!p || !this.overlapsCircle(p.body.pos.x, p.body.pos.y, p.body.radius)) return;
    if (p.tryParryIncoming(this) || this.dead) return;
    this.world.effects.burst(p.body.pos.x, p.body.pos.y, b.rotation + Math.PI, { ...W.snare.wrap, color: W.color });
    this.sourceAbility.caught(p);
    this.destroy();
  }

  miss(wall) {
    const b = this.body;
    if (wall) {
      this.world.effects.burst(b.pos.x, b.pos.y, b.rotation + Math.PI, { ...W.snare.splat, color: W.color });
      this.world.sound('webSplat', b.pos);
    }
    this.sourceAbility.missed({ ...b.pos });
    this.destroy();
  }
}

// A few strands of web wound round the player it caught (WEB.snare.cocoon), each a loop
// `span` radians of an ellipse round them, turned its own way and slowly turning: winding
// on over `wrap` seconds, shaken (`shake`, × their radius, dying away over `settle`) each
// time the player struggles, a strand torn off each time, and falling away once let go.
function cocoonLoops() {
  const C = W.snare.cocoon;
  return Array.from({ length: C.loops }, () => ({
    turn: Math.random() * TAU, from: Math.random() * TAU, span: randRange(...C.span), squash: randRange(0.4, 0.8), spin: randRange(-0.8, 0.8),
  }));
}

// WeaverReel's line, from the Weaver's mouth out to its ball of web: the ball forming at its
// mouth through the wind-up, the line paid out to it in flight, the player wound in web at
// its end as it reels them in (or as the line drags the Weaver to them, parried), the line
// and the web jerking and a strand tearing off each time they struggle, the ball drawn back
// to its mouth when it misses; let go after the bite, the web falls away and the line
// slack, and broken (torn free), it springs back to the Weaver.
export class ReelView {
  constructor(ability) {
    this.ability = ability;
    this.line = new SilkGfx(ability.world.layers.projectiles);
    this.web = new SilkGfx(ability.world.layers.fx);
    this.ball = new SilkLook(ability.world.layers.projectiles, { trail: false });
    this.ball.container.visible = false;
    this.loops = cocoonLoops();
    this.caughtAt = null; // when it last caught the player, so the web winds on afresh
  }

  strike() {}

  render(now, alpha) {
    const a = this.ability, d = a.data, e = a.enemy, rot = e.view.rotation, mouth = e.attackFx.toWorld({ x: d.muzzle, y: 0 });
    let end = null, ballAt = null, size = d.projectileSize, glow = 1, quiver = 0;
    this.line.clear();
    this.web.clear();
    if (a.phase === 'windup' && !a.held) {
      const t = clamp01((now - a.phaseStartedAt) / Math.max(1e-3, a.phaseEndsAt - a.phaseStartedAt));
      ballAt = mouth;
      size *= lerp(ATTACK_FX.projectile.chargeFrom, 1, t);
      glow = clamp01((now - a.phaseStartedAt) / 0.1) * lerp(0.4, 1, t);
    } else if (a.ball && !a.ball.dead) {
      end = a.ball.body.lerpPos(alpha);
    } else if (a.held) {
      const p = a.held.body.lerpPos(alpha), dx = p.x - mouth.x, dy = p.y - mouth.y, l = Math.hypot(dx, dy) || 1, r = a.held.body.radius;
      end = { x: p.x - (dx / l) * r, y: p.y - (dy / l) * r };
      quiver = twang(now - a.struggledAt) * 1.5;
      if (this.caughtAt !== a.caughtAt) { this.caughtAt = a.caughtAt; this.loops = cocoonLoops(); }
      this.drawCocoon(now, p, r, 1);
    } else if (a.loose && now - a.loose.at < (a.loose.snap ? W.snap.time : W.slack)) {
      this.drawLoose(now, mouth);
    } else if (a.retract) {
      const k = (now - a.retract.at) / d.retractTime;
      if (k >= 0 && k < 1) {
        const f = a.retract.from, ease = smoothStep01(k);
        ballAt = end = { x: lerp(f.x, mouth.x, ease), y: lerp(f.y, mouth.y, ease) };
      }
    }
    if (end) this.line.strand(quiver ? along(mouth, end, 10, (u) => quiver * Math.sin(Math.PI * u)) : [mouth, end], 1, W.snare.line);
    this.ball.container.visible = !!ballAt;
    if (ballAt) this.ball.render(now, ballAt.x, ballAt.y, rot, size, { glow });
  }

  // The web wound round the player at `p` (radius `r`), `alpha` as strong: the strands
  // they haven't yet torn off.
  drawCocoon(now, p, r, alpha) {
    const C = W.snare.cocoon, a = this.ability, since = now - a.struggledAt;
    const wound = easeOut(clamp01((now - a.caughtAt) / C.wrap));
    const shake = since >= 0 && since < C.settle ? C.shake * r * (1 - since / C.settle) : 0;
    for (const L of this.loops.slice(a.struggles)) {
      const j = shake ? { x: randRange(-shake, shake), y: randRange(-shake, shake) } : { x: 0, y: 0 };
      const turn = L.turn + now * L.spin, c = Math.cos(turn), s = Math.sin(turn), R = r * C.reach, pts = [];
      for (let i = 0; i <= 12; i++) {
        const t = L.from + (L.span * wound * i) / 12, x = Math.cos(t) * R, y = Math.sin(t) * R * L.squash;
        pts.push({ x: p.x + j.x + c * x - s * y, y: p.y + j.y + s * x + c * y });
      }
      this.web.strand(pts, alpha, W.width * 0.8);
    }
  }

  // Let go: the web falling away and the line slack from where it was, or broken: the line
  // springing back to the Weaver, wriggling.
  drawLoose(now, mouth) {
    const L = this.ability.loose, k = clamp01((now - L.at) / (L.snap ? W.snap.time : W.slack)), fade = 1 - k;
    if (L.player) this.drawCocoon(now, L.player.body.pos, L.player.body.radius * (1 + 0.4 * easeOut(k)), fade);
    const end = L.snap ? { x: lerp(L.from.x, mouth.x, easeOut(k)), y: lerp(L.from.y, mouth.y, easeOut(k)) } : L.from;
    const len = Math.hypot(end.x - mouth.x, end.y - mouth.y);
    if (len < 0.05) return;
    const off = L.snap
      ? (u) => Math.sin(u * Math.PI * 3 + now * 40) * 0.08 * u * fade
      : (u) => Math.sin(Math.PI * u) * 0.3 * easeOut(k) * Math.min(1, len / 3);
    this.line.strand(along(mouth, end, 8, off), fade, W.snare.line);
  }

  destroy() {
    this.line.destroy();
    this.web.destroy();
    this.ball.destroy();
  }
}
