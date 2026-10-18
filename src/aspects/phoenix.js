// Phoenix: every dash bursts out as fire and unfurls a wing of it on each side of the player,
// across the dash. They sweep open and flap forward, curling around in front, then flap back,
// sweeping behind, and fold at the player's back and sides as they shrink and go out.
// Every enemy and prop the wings or the dashing player touch catches fire (Burns): catching
// is a small hit, and the burn eats away at it quietly, interrupting nothing. Catching fire
// again starts the burn over.
// The wings are nothing but fire in the shape of wings: a blazing arm trailing tongues of
// flame, wreathed in flames licking off them that ride along with the player, more left
// behind with embers. While they're out the player burns too.
import { Container, Sprite } from 'pixi.js';
import { Aspect } from './aspect.js';
import { Entity } from '../game/entity.js';
import { hurtByPoly, hurtBySegment } from '../game/hurtbox.js';
import { FIXED_DT } from '../data/config.js';
import { clamp01, lerp, randRange, seededRandom, TAU } from '../engine/math.js';
import { tex } from '../render/assets.js';
import { Plume, Strand } from '../render/fx.js';

const DEG = Math.PI / 180;
const pick = ([min, max]) => randRange(min, max);
const easeOut = (t) => 1 - (1 - t) ** 3;
// A stroke: speeding up over the first `rise` of it, sweeping on at full speed, and braking to a
// stop over the last `stop` (0 … 1 → 0 … 1).
function stroke(t, [rise, stop]) {
  const top = 1 / (1 - rise / 2 - stop / 2);
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  if (t < rise) return (top * t * t) / (2 * rise);
  if (t <= 1 - stop) return top * (rise / 2 + t - rise);
  return 1 - (top * (1 - t) ** 2) / (2 * stop);
}
// Stochastic rounding, so low rates still spawn at the right average.
const spawnCount = (rate, dt) => Math.floor(rate * dt + Math.random());

// The right wing, in its own units around the player's centre: x along the dash, y out to
// the side (the left wing mirrors it). Scaled so its furthest point is `length` out. An arm
// reaching out from the shoulder across the dash, swept back a little at the hand.
const JOINTS = [{ x: -0.05, y: 0.3 }, { x: 0.08, y: 1 }, { x: 0.02, y: 1.75 }, { x: -0.22, y: 2.35 }];
const SHOULDER = JOINTS[0];
const ARM_POINTS = 16, TONGUE_POINTS = 8;
// Tongues of flame trailing off the arm: how many, the stretch of arm (0 shoulder … 1 hand)
// they leave from, their angle (degrees from straight ahead; 180 trails straight back) and
// length from the shoulder end to the hand, half-width as a fraction of length, and how far
// each curls outward toward its tip (degrees).
const TONGUES = { count: 14, from: 0.02, to: 1, deg: [192, 162], length: [1.35, 1.5], width: 0.42, curl: 10 };
// Folded, every point swings back along the body and pulls in toward the shoulder.
const FOLD_ANGLE = 170 * DEG, FOLD_REACH = 0.25;

const polar = ({ x, y }) => ({ a: Math.atan2(y - SHOULDER.y, x - SHOULDER.x), r: Math.hypot(x - SHOULDER.x, y - SHOULDER.y) });
// The arm as a Catmull-Rom curve through its joints, with the arc length up to each sample.
const ARM_REST = (() => {
  const k = JOINTS, spans = k.length - 1, out = [];
  for (let i = 0; i < ARM_POINTS; i++) {
    const s = (i / (ARM_POINTS - 1)) * spans, j = Math.min(spans - 1, Math.floor(s)), t = s - j;
    const p0 = k[Math.max(0, j - 1)], p1 = k[j], p2 = k[j + 1], p3 = k[Math.min(spans, j + 2)];
    const cr = (a, b, c, d) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
    out.push({ x: cr(p0.x, p1.x, p2.x, p3.x), y: cr(p0.y, p1.y, p2.y, p3.y) });
  }
  return out;
})();
const ARM_DIST = ARM_REST.reduce((d, p, i) => (d.push(i ? d[i - 1] + Math.hypot(p.x - ARM_REST[i - 1].x, p.y - ARM_REST[i - 1].y) : 0), d), []);
const ARM_POLAR = ARM_REST.map(polar);

// Point `t` (0 shoulder … 1 hand, by distance) along the resting arm.
function armAt(t) {
  const d = clamp01(t) * ARM_DIST[ARM_POINTS - 1];
  let i = 0;
  while (i < ARM_POINTS - 2 && d > ARM_DIST[i + 1]) i++;
  const k = clamp01((d - ARM_DIST[i]) / (ARM_DIST[i + 1] - ARM_DIST[i]));
  return { x: lerp(ARM_REST[i].x, ARM_REST[i + 1].x, k), y: lerp(ARM_REST[i].y, ARM_REST[i + 1].y, k) };
}

// Every tongue at rest, from the shoulder out: a line from its root on the arm through ctrl to
// its tip, kept as polar points around the shoulder so it folds and flaps like the arm.
const FLAMES = (() => {
  const T = TONGUES, rand = seededRandom(41), out = [];
  for (let i = 0; i < T.count; i++) {
    const t = clamp01(lerp(T.from, T.to, (i + (rand() - 0.5) * 0.5) / (T.count - 1)));
    const a = (lerp(T.deg[0], T.deg[1], t) + (rand() - 0.5) * 8) * DEG, curl = a - T.curl * DEG;
    const length = lerp(T.length[0], T.length[1], t) * lerp(0.85, 1.1, rand());
    const root = armAt(t);
    const ctrl = { x: root.x + Math.cos(a) * length * 0.5, y: root.y + Math.sin(a) * length * 0.5 };
    const tip = { x: root.x + Math.cos(curl) * length, y: root.y + Math.sin(curl) * length };
    out.push({ t, length, half: length * T.width, rest: [root, ctrl, tip].map(polar), seed: rand() * 100 });
  }
  return out;
})();
// The furthest any point gets from the player's centre, and from the shoulder (for the bend).
const FAR = Math.max(...ARM_REST.map((p) => Math.hypot(p.x, p.y)), ...FLAMES.map((f) => {
  const { a, r } = f.rest[2];
  return Math.hypot(SHOULDER.x + Math.cos(a) * r, SHOULDER.y + Math.sin(a) * r);
}));
const REACH = Math.max(...ARM_POLAR.map((p) => p.r), ...FLAMES.map((f) => f.rest[2].r));

// Point `u` along a tongue: a quadratic from the root through ctrl to the tip.
function lineAt([a, c, b], u, out = { x: 0, y: 0 }) {
  const v = 1 - u;
  out.x = v * v * a.x + 2 * v * u * c.x + u * u * b.x;
  out.y = v * v * a.y + 2 * v * u * c.y + u * u * b.y;
  return out;
}

export class PhoenixAspect extends Aspect {
  constructor(player, data) {
    super(player, data);
    this.scale = data.length / FAR;
    player.fieryDash = true;
    // From a dash until its wings are gone: { born, dir, caught: what has caught fire from
    // them, dissolving: whether they've started burning away }.
    this.wing = null;
    this.burns = null; // what's burning (made when something first catches fire)
    const F = data.fx, X = F.tongue, { playerBack, fx } = player.world.layers;
    // Under the body: the wings, drawn in world space (the glow under each, the arm's glow, the
    // tongues, then the arm), and the flames riding with the player, in a layer that moves with
    // them. Over it, the flames it burns with.
    this.view = new Container({ zIndex: -21 });
    this.riding = new Container({ zIndex: -19 });
    this.over = new Container();
    playerBack.addChild(this.view, this.riding);
    fx.addChild(this.over);
    this.under = [1, -1].map(() => this.view.addChild(new Sprite({ texture: tex.mist, anchor: 0.5, blendMode: 'add', tint: F.under.color, visible: false })));
    this.armGlows = [1, -1].map((side) => ({ side, strand: new Strand(this.view, ARM_POINTS, 0.2, 1, F.arm.glow) }));
    const tongues = (look) => [1, -1].flatMap((side) => FLAMES.map((_, i) => ({ side, i, look, strand: new Strand(this.view, TONGUE_POINTS, 1, 0.1, look.color) })));
    this.tongues = [...tongues(X.outer), ...tongues(X.core)];
    this.arms = [1, -1].map((side) => ({ side, strand: new Strand(this.view, ARM_POINTS, 0.35, 1, F.arm.color) }));
    this.flames = new Plume(this.riding, tex.flame, { drag: 3, lift: 1 });
    this.bodyFire = new Plume(this.over, tex.flame, { drag: 3, lift: 2 });
    this.trail = new Plume(playerBack, tex.flame, { drag: 2.5, lift: 1, zIndex: -20 });
    this.embers = new Plume(fx, tex.spark, { drag: 1.2, lift: 0.8 });
    this.plumes = [this.flames, this.bodyFire, this.trail, this.embers];
    this.pose = [1, -1].map(() => ({ arm: ARM_REST.map(() => ({ x: 0, y: 0 })), tongues: FLAMES.map(() => [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }]) }));
    this.point = { x: 0, y: 0 };
    this.time = 0; // render clock; stands still while paused
  }

  get lifetime() { return this.data.fadeAt + this.data.fadeTime; }

  onDash(dir) {
    this.wing = { born: this.now, dir: { ...dir }, caught: new Set(), dissolving: false };
    this.used();
    this.world.sound('phoenix');
    this.launch(this.player.body.pos, dir);
  }

  // The dash bursting out as fire: a flash, and flames and sparks thrown out the back.
  launch(p, dir) {
    const L = this.data.fx.launch, Fl = this.data.fx.flames, back = Math.atan2(-dir.y, -dir.x), s = this.player.sizeScale;
    const x = p.x - dir.x * 0.25 * s, y = p.y - dir.y * 0.25 * s;
    this.world.deathFx.flare(tex.mist, x, y, 0, {
      time: L.flash.time, w0: L.flash.size, h0: L.flash.size, w1: L.flash.size * 1.8, h1: L.flash.size * 1.8, alpha: L.flash.alpha, color0: 0xffffff, color1: L.flash.color,
    });
    this.world.effects.burst(x, y, back, L.sparks);
    for (let i = 0; i < L.flames.count; i++) {
      const a = back + randRange(-L.flames.spreadDeg, L.flames.spreadDeg) * DEG, speed = pick(L.flames.speed);
      this.trail.spawn({
        x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, size: pick(L.flames.size) * s, grow: 0.6,
        life: pick(L.flames.life), color: Fl.color, fade: Fl.fade, alpha: Fl.alpha, sway: 3, orient: true,
      });
    }
  }

  // The wings at `e` seconds into them: how far open (0 folded … 1 open), through the forward
  // flap (0 … 1, undone as they flap back) and through the flap back (0 … 1), how big
  // (shrinking as they flap back) and how far gone (0 … 1).
  phase(e) {
    const d = this.data, foldAt = d.flapAt + d.flapTime, fold = stroke((e - foldAt) / d.foldTime, d.foldEase);
    return {
      open: easeOut(clamp01(e / d.openTime)),
      flap: stroke((e - d.flapAt) / d.flapTime, d.flapEase) * (1 - fold),
      fold,
      size: lerp(1, d.foldScale, fold),
      fade: clamp01((e - d.fadeAt) / d.fadeTime),
    };
  }

  // A resting polar point posed by a phase, into `out` (wing units): swung open from the fold,
  // turned toward the dash by the forward flap and away from it by the flap back, both the
  // further the further it is from the shoulder, so the tips lead each stroke's curve.
  place({ a, r }, { open, flap, fold, size }, out) {
    const d = this.data, far = (r / REACH) ** 1.6;
    const bend = (d.flapDeg + d.bendDeg * far) * flap - (d.foldDeg + d.foldBendDeg * far) * fold;
    const ang = lerp(FOLD_ANGLE, a, open) - bend * DEG, reach = r * lerp(FOLD_REACH, 1, open) * size;
    out.x = SHOULDER.x + Math.cos(ang) * reach;
    out.y = SHOULDER.y + Math.sin(ang) * reach;
    return out;
  }

  // Wing units → the world around a player at `p`, for the wing on `side`.
  toWorld(q, side, p, out = { x: 0, y: 0 }) {
    const f = this.wing.dir, k = this.scale * this.player.sizeScale, x = q.x * k, y = q.y * k * side;
    out.x = p.x + f.x * x - f.y * y;
    out.y = p.y + f.y * x + f.x * y;
    return out;
  }

  // The wing's outline in the world at `e` seconds in: out along the arm, back in along the
  // tips of its tongues.
  outline(e, side, p) {
    const ph = this.phase(e), q = { x: 0, y: 0 };
    const pts = ARM_POLAR.map((pp) => this.toWorld(this.place(pp, ph, q), side, p));
    for (let i = FLAMES.length - 1; i >= 0; i--) pts.push(this.toWorld(this.place(FLAMES[i].rest[2], ph, q), side, p));
    return pts;
  }

  afterPhysics() {
    const w = this.wing, d = this.data;
    if (!w || this.player.death) return;
    const e = this.now - w.born;
    if (e > d.fadeAt + d.fadeTime * d.burnUntil) return;
    const targets = [...this.world.enemies, ...this.world.props].filter((t) => !t.dead && !t.dying && !w.caught.has(t));
    if (!targets.length) return;
    const b = this.player.body, { pos: p, prev: q } = b;
    // The body, swept over the whole step.
    if (this.player.dashing) {
      const r = b.radius * this.player.sizeScale + d.bodyReach;
      for (const t of targets) {
        if (hurtBySegment(t, q.x, q.y, p.x, p.y, r)) this.catch(t);
      }
    }
    // The wings, at a few moments through the step, so nothing slips between their strokes.
    for (const k of [0, 1 / 3, 2 / 3]) {
      if (e - k * FIXED_DT < 0) break;
      const at = { x: lerp(p.x, q.x, k), y: lerp(p.y, q.y, k) };
      for (const side of [1, -1]) {
        const poly = this.outline(e - k * FIXED_DT, side, at);
        for (const t of targets) if (!w.caught.has(t) && !t.dead && hurtByPoly(t, poly)) this.catch(t);
      }
    }
  }

  // `target` catches fire: a small hit, and a burn (started over if it's burning already).
  catch(target) {
    const d = this.data, C = d.fx.catch, w = this.world, p = target.body.pos, mult = w.adrenaline.damageMultiplier;
    const from = { ...this.player.body.pos };
    this.wing.caught.add(target);
    if (!this.burns || this.burns.dead) this.burns = w.add(new Burns(w, d));
    this.burns.light(target, (d.burn * mult) / d.burnTime, from);
    target.takeDamage(d.catchDamage * mult, target.closestPoint(from), from, d.id);
    w.deathFx.flare(tex.mist, p.x, p.y, 0, { time: C.flash.time, w0: C.flash.size, h0: C.flash.size, w1: C.flash.size * 0.4, h1: C.flash.size * 0.4, alpha: C.flash.alpha, color0: 0xffe8a0, color1: C.flash.color });
    w.effects.burst(p.x, p.y, Math.random() * TAU, { ...C.sparks, coneDeg: 180 });
    w.sound('ignite', p);
  }

  render(alpha, dt) {
    this.time += dt;
    for (const pl of this.plumes) pl.update(dt);
    const w = this.wing;
    const e = w ? this.world.time - (1 - alpha) * FIXED_DT - w.born : Infinity;
    const p = this.player.body.lerpPos(alpha);
    this.riding.position.set(p.x, p.y);
    this.over.position.set(p.x, p.y);
    if (!w || e >= this.lifetime || this.player.death || this.player.hidden) {
      if (w && e >= this.lifetime) this.wing = null;
      this.hide();
      return;
    }
    const F = this.data.fx, ph = this.phase(e), k = (1 - ph.fade ** 1.4) * clamp01((e / this.data.openTime) * 1.5);
    this.pose.forEach((pose) => {
      ARM_POLAR.forEach((pp, i) => this.place(pp, ph, pose.arm[i]));
      FLAMES.forEach((f, i) => f.rest.forEach((pp, j) => this.place(pp, ph, pose.tongues[i][j])));
    });
    this.drawArms(p, k);
    this.drawTongues(p, k, ph.fade);
    this.under.forEach((s, j) => {
      const mid = this.toWorld(this.pose[j].arm[ARM_POINTS >> 1], j ? -1 : 1, p, this.point);
      s.visible = true;
      s.position.set(mid.x, mid.y);
      s.width = s.height = F.under.size * this.scale * this.player.sizeScale;
      s.alpha = F.under.alpha * k * (0.8 + 0.2 * Math.sin(this.time * 23 + j));
    });
    if (dt <= 0) return;
    if (!w.dissolving && ph.fade > 0) {
      w.dissolving = true;
      for (const side of [1, -1]) this.dissolve(side, p);
    }
    for (const side of [1, -1]) this.blaze(side, p, k, dt);
    this.engulf(k, dt);
  }

  // A flickering strand of fire along each arm under a wide glow, thinning toward the hand.
  drawArms(p, k) {
    const A = this.data.fx.arm, s = this.scale * this.player.sizeScale;
    for (const [list, widen, alpha] of [[this.armGlows, A.glowWidth, A.glowAlpha], [this.arms, 1, A.alpha]]) {
      list.forEach(({ side, strand }) => {
        const pose = this.pose[side > 0 ? 0 : 1].arm, n = strand.n;
        strand.mesh.visible = true;
        // Index 0 is the hand, so the texture's faint end lands there.
        for (let q = 0; q < n; q++) {
          const u = 1 - q / (n - 1), pt = this.toWorld(pose[n - 1 - q], side, p, this.point);
          strand.pts[2 * q] = pt.x;
          strand.pts[2 * q + 1] = pt.y;
          strand.widths[q] = lerp(A.width[0], A.width[1], u) * 0.5 * s * widen * (0.8 + 0.2 * Math.sin(this.time * 31 + u * 7 + side));
        }
        strand.build();
        strand.mesh.alpha = alpha * k;
      });
    }
  }

  // Every tongue of flame: a streak solid at the root, fading and tapering to its tip, rippling
  // and flickering, and shrinking back as the wings burn away.
  drawTongues(p, k, fade) {
    const X = this.data.fx.tongue, s = this.scale * this.player.sizeScale, t = this.time, q2 = { x: 0, y: 0 };
    for (const { side, i, look, strand } of this.tongues) {
      strand.mesh.visible = k > 0.01;
      if (!strand.mesh.visible) continue;
      const f = FLAMES[i], pts = this.pose[side > 0 ? 0 : 1].tongues[i], n = strand.n;
      const reach = (1 - 0.6 * fade) * (0.88 + 0.12 * Math.sin(t * 21 + f.seed)), [a, , b] = pts;
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1, nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
      for (let q = 0; q < n; q++) {
        const u = q / (n - 1), at = lineAt(pts, u * reach, this.point);
        const wave = Math.sin(u * 6 - t * X.waveSpeed + f.seed) * X.wave * f.length * u;
        q2.x = at.x + nx * wave;
        q2.y = at.y + ny * wave;
        const pt = this.toWorld(q2, side, p, this.point);
        strand.pts[2 * q] = pt.x;
        strand.pts[2 * q + 1] = pt.y;
        const taper = Math.sin((Math.PI / 2) * Math.min(1, u / 0.15 + 0.2)) * (1 - u) ** 0.7;
        strand.widths[q] = f.half * s * look.width * taper * (1 + X.flicker * Math.sin(t * 37 + f.seed + u * 5));
      }
      strand.build();
      strand.mesh.alpha = look.alpha * k;
    }
  }

  // A random spot on wing `side` (its arm or a tongue), relative to the player, and the way
  // out along it.
  spot(side) {
    const j = side > 0 ? 0 : 1, origin = { x: 0, y: 0 };
    if (Math.random() < 0.3) {
      const i = Math.floor(Math.random() * ARM_POINTS), pt = this.toWorld(this.pose[j].arm[i], side, origin);
      const prev = this.toWorld(this.pose[j].arm[Math.max(0, i - 1)], side, origin), l = Math.hypot(pt.x - prev.x, pt.y - prev.y) || 1;
      return { x: pt.x, y: pt.y, ox: (pt.x - prev.x) / l, oy: (pt.y - prev.y) / l };
    }
    const pts = this.pose[j].tongues[Math.floor(Math.random() * FLAMES.length)];
    const at = this.toWorld(lineAt(pts, Math.random()), side, origin), root = this.toWorld(pts[0], side, origin);
    const dx = at.x - root.x, dy = at.y - root.y, l = Math.hypot(dx, dy) || 1;
    return { x: at.x, y: at.y, ox: dx / l, oy: dy / l };
  }

  // Flames licking off the wing, riding with the player, and more left behind with embers.
  blaze(side, p, k, dt) {
    const { flames: Fl, trail: T, embers: E } = this.data.fx, f = this.wing.dir, s = this.player.sizeScale;
    for (let n = spawnCount(Fl.rate * k, dt); n > 0; n--) {
      const o = this.spot(side), speed = pick(Fl.speed), back = randRange(0.2, 1);
      this.flames.spawn({
        x: o.x, y: o.y, vx: (o.ox - f.x * back) * speed, vy: (o.oy - f.y * back) * speed,
        size: pick(Fl.size) * s, grow: 0.5, life: pick(Fl.life), color: Fl.color, fade: Fl.fade, alpha: Fl.alpha * k, sway: 4, orient: true,
      });
    }
    for (let n = spawnCount(T.rate * k, dt); n > 0; n--) {
      const o = this.spot(side), speed = pick(T.speed);
      this.trail.spawn({
        x: p.x + o.x, y: p.y + o.y, vx: o.ox * speed, vy: o.oy * speed,
        size: pick(T.size) * s, grow: 0.6, life: pick(T.life), color: T.color, fade: T.fade, alpha: T.alpha * k, sway: 3, orient: true,
      });
    }
    for (let n = spawnCount(E.rate * k, dt); n > 0; n--) this.ember(this.spot(side), p, pick(E.speed));
  }

  // Going out, the wing gives off a last flurry of flame and embers.
  dissolve(side, p) {
    const { flames: Fl, trail: T, embers: E, dissolve: D } = this.data.fx, s = this.player.sizeScale;
    for (let n = 0; n < D.flames; n++) {
      const o = this.spot(side), speed = pick(T.speed) * 3;
      this.trail.spawn({
        x: p.x + o.x, y: p.y + o.y, vx: o.ox * speed + randRange(-1, 1), vy: o.oy * speed + randRange(-1, 1),
        size: pick(T.size) * s, grow: 0.6, life: pick(T.life), color: Fl.color, fade: T.fade, alpha: 0.8, sway: 4, orient: true,
      });
    }
    for (let n = 0; n < D.embers; n++) this.ember(this.spot(side), p, pick(E.speed) * 1.3);
  }

  ember(o, p, speed) {
    const E = this.data.fx.embers, a = Math.atan2(o.oy, o.ox) + randRange(-0.8, 0.8);
    this.embers.spawn({
      x: p.x + o.x, y: p.y + o.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      size: pick(E.size), grow: 0.5, life: pick(E.life), color: E.color, fade: E.fade, sway: 6, orient: true,
    });
  }

  // The player burning while the wings are out: flames licking up and back off the body.
  engulf(k, dt) {
    const B = this.data.fx.body, f = this.wing.dir, s = this.player.sizeScale;
    for (let n = spawnCount(B.rate * k, dt); n > 0; n--) {
      const a = Math.random() * TAU, r = B.radius * s * Math.sqrt(Math.random()), speed = pick(B.speed);
      this.bodyFire.spawn({
        x: Math.cos(a) * r, y: Math.sin(a) * r * 0.8, vx: Math.cos(a) * 0.5 - f.x * speed * 0.6, vy: -speed - f.y * speed * 0.6,
        size: pick(B.size) * s, grow: 0.4, life: pick(B.life), color: B.color, fade: B.fade, alpha: B.alpha * k, sway: 4, orient: true,
      });
    }
  }

  hide() {
    for (const s of this.under) s.visible = false;
    for (const { strand } of [...this.arms, ...this.armGlows, ...this.tongues]) strand.mesh.visible = false;
  }

  dispose() {
    this.player.fieryDash = false;
    this.view.destroy({ children: true });
    this.riding.destroy({ children: true });
    this.over.destroy({ children: true });
    this.trail.destroy();
    this.embers.destroy();
  }
}

// Everything burning: each takes its burn's damage a little every step, quietly (no hit, no
// flinch), wreathed in flames, embers and an orange haze that die down over the last `ebb`. Lives in the
// world, so burns run on if the player dies, and it's gone once nothing is left burning.
class Burns extends Entity {
  constructor(world, data) {
    super(world);
    this.data = data;
    this.burning = new Map(); // enemy or prop → { until, rate (damage a second), source }
    this.haze = new Plume(world.layers.fx, tex.mist, { drag: 2, lift: 0.6 });
    this.flames = new Plume(world.layers.fx, tex.flame, { drag: 2, lift: 2.2 });
    this.embers = new Plume(world.layers.fx, tex.spark, { drag: 1, lift: 1.4 });
  }

  // Sets `target` burning for a full burnTime at `rate`; `source` is where a prop burst from.
  light(target, rate, source) {
    this.burning.set(target, { until: this.world.time + this.data.burnTime, rate, source: { ...source } });
  }

  step(dt) {
    const now = this.world.time;
    for (const [t, b] of this.burning) {
      const left = Math.min(dt, b.until - (now - dt));
      if (!t.dead && left > 0) {
        if (t.isProp) t.sap(b.rate * left, b.source);
        else {
          t.sap(b.rate * left, this.data.id);
          this.world.session.countAspect(this.data.id, 'tally', left); // enemy-seconds burned
        }
      }
      if (t.dead || t.dying || now >= b.until) this.burning.delete(t);
    }
    if (!this.burning.size && !this.haze.count && !this.flames.count && !this.embers.count) this.destroy();
  }

  render(alpha, dt) {
    this.haze.update(dt);
    this.flames.update(dt);
    this.embers.update(dt);
    if (dt <= 0) return;
    const B = this.data.fx.burning, Fl = B.flames, E = B.embers, H = B.haze, now = this.world.time;
    for (const [t, b] of this.burning) {
      if (t.dead) continue;
      const p = t.body.lerpPos(alpha), r = t.body.radius, k = clamp01((b.until - now) / B.ebb);
      for (let n = spawnCount(H.rate * k, dt); n > 0; n--) {
        this.haze.spawn({
          x: p.x + randRange(-0.3, 0.3) * r, y: p.y + randRange(-0.3, 0.3) * r, vx: 0, vy: -0.3,
          size: pick(H.size) * r, grow: 1.3, life: pick(H.life), color: H.color, fade: H.fade, alpha: H.alpha * k,
        });
      }
      // Licking up off its edge.
      for (let n = spawnCount(Fl.rate * k, dt); n > 0; n--) {
        const a = Math.random() * TAU, d = r * randRange(0.5, 1);
        this.flames.spawn({
          x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d * 0.8, vx: Math.cos(a) * 0.4, vy: -pick(Fl.speed),
          size: pick(Fl.size) * lerp(0.6, 1, k), grow: 0.4, life: pick(Fl.life), color: Fl.color, fade: Fl.fade, alpha: Fl.alpha, sway: 4, orient: true,
        });
      }
      for (let n = spawnCount(E.rate * k, dt); n > 0; n--) {
        this.embers.spawn({
          x: p.x + randRange(-r, r) * 0.7, y: p.y + randRange(-r, r) * 0.5, vx: randRange(-0.8, 0.8), vy: -pick(E.speed),
          size: pick(E.size), grow: 0.5, life: pick(E.life), color: E.color, fade: E.fade, sway: 5, orient: true,
        });
      }
    }
  }

  dispose() {
    this.burning.clear();
    this.haze.destroy();
    this.flames.destroy();
    this.embers.destroy();
  }
}
