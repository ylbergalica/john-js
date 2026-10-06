// Exalted state visuals around the player: misty fire wings that burst open from the sides
// on entry and dissolve within a second, then for the rest of the state flames licking up off the body, rising embers, a low crimson haze and fiery ribbons
// circling the player. Entering the state also sets off the screen ripple, a spark burst
// and a smoke ring, and the burning sound loops for as long as the state lasts.
// Driven from PlayerView.render, so it watches the adrenaline state for edges itself.
import { Container, MeshSimple, Sprite } from 'pixi.js';
import { EXALTED_FX as X } from '../data/config.js';
import { clamp01, lerp, randRange, TAU } from '../engine/math.js';
import { tex } from '../render/assets.js';
import { Plume } from '../render/fx.js';
import { sfx } from '../audio/sfx.js';

const W = X.wings, DEG = Math.PI / 180;

// The right wing in world units around the player's centre (mirrored for the left): an arm
// from the shoulder up to the wrist, a horn above it, fingers fanning out and drooping from
// the wrist, and a root where the membrane rejoins the body.
const SHOULDER = { x: 0.22, y: -0.08 };
const WING_POINTS = [
  [1.1, -1.0], // 0 wrist
  [1.32, -1.62], // 1 horn
  [2.25, -0.95], [2.42, -0.2], [1.95, 0.5], [1.05, 0.82], // 2-5 finger tips
  [0.32, 0.38], // 6 root
];
// Bones as [from, to, bow, width]: point indices (-1 = shoulder), how far the bone bends
// off the straight line (fraction of its length; positive bends clockwise), and the
// strand's width at its base.
const BONES = [[-1, 0, -0.12, 0.26], [0, 1, 0.12, 0.17], [0, 2, 0.12, 0.2], [0, 3, 0.1, 0.2], [0, 4, 0.08, 0.18], [0, 5, 0.06, 0.16]];
const PANELS = [[1, 2], [2, 3], [3, 4], [4, 5], [5, 6]]; // membrane edges, each spanning back to the wrist
// Folded, every point swings down beside the body and pulls in toward the shoulder.
const FOLD_ANGLE = 95 * DEG, FOLD_REACH = 0.2;
const STRAND_POINTS = 14;

const POLAR = WING_POINTS.map(([x, y]) => ({ a: Math.atan2(y - SHOULDER.y, x - SHOULDER.x), r: Math.hypot(x - SHOULDER.x, y - SHOULDER.y) }));
const MAX_REACH = Math.max(...POLAR.map((p) => p.r));
const BONE_LENGTHS = BONES.map(([a, b]) => {
  const pa = a < 0 ? SHOULDER : { x: WING_POINTS[a][0], y: WING_POINTS[a][1] };
  return Math.hypot(WING_POINTS[b][0] - pa.x, WING_POINTS[b][1] - pa.y);
});
const BONE_TOTAL = BONE_LENGTHS.reduce((s, l) => s + l, 0);
// Membrane panels are picked in proportion to their area so the mist spreads evenly.
const PANEL_AREAS = PANELS.map(([a, b]) => {
  const [hx, hy] = WING_POINTS[0], [ax, ay] = WING_POINTS[a], [bx, by] = WING_POINTS[b];
  return Math.abs((ax - hx) * (by - hy) - (bx - hx) * (ay - hy)) / 2;
});
const PANEL_TOTAL = PANEL_AREAS.reduce((s, x) => s + x, 0);

const easeOutBack = (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;
// Stochastic rounding, so low rates still spawn at the right average.
const spawnCount = (rate, dt) => Math.floor(rate * dt + Math.random());
const pick = ([min, max]) => randRange(min, max);

export class ExaltedView {
  constructor(player) {
    this.player = player;
    this.world = player.world;
    const { playerBack, fx } = this.world.layers;
    // playerBack sorts by zIndex: haze < halo < wings < ribbons < body flames < tail followers.
    this.haze = new Plume(playerBack, tex.mist, { drag: 1.5, lift: 0.15, zIndex: -30 });
    this.halo = new Sprite({ texture: tex.mist, anchor: 0.5, blendMode: 'add', tint: X.halo.color, zIndex: -25, visible: false });
    playerBack.addChild(this.halo);
    this.wings = new Container();
    this.wings.zIndex = -20;
    playerBack.addChild(this.wings);
    this.wingMist = new Plume(this.wings, tex.mist, { drag: 1.5, lift: 0.4 });
    this.bones = [1, -1].flatMap((side) => BONES.map(() => ({ side, strand: new Strand(this.wings, STRAND_POINTS, 0.35, 1, W.strandColor) })));
    this.wingFire = new Plume(this.wings, tex.flame, { drag: 2, lift: 1.2 });
    this.ribbons = X.ribbons.orbits.map((o) => ({ orbit: o, strand: new Strand(playerBack, X.ribbons.points, 0, 1, o.color, -10) }));
    this.flames = new Plume(playerBack, tex.flame, { drag: 1.5, lift: 2.5, zIndex: -5 });
    this.embers = new Plume(fx, tex.spark, { drag: 0.8, lift: 1.2 });
    this.plumes = [this.haze, this.wingMist, this.wingFire, this.flames, this.embers];
    this.pose = WING_POINTS.map(() => ({ x: 0, y: 0 }));
    this.curve = { x0: 0, y0: 0, cx: 0, cy: 0, x1: 0, y1: 0 };

    this.time = 0; // local clock; stands still while paused
    this.intensity = 0; // 0…1 strength of the whole effect
    this.glow = 0; // intensity with the end-of-state flicker, for the player's outline
    this.spread = 0; // wing opening: 0 folded … 1 open (overshoots while opening)
    this.wingFade = 0; // 1 while the wings are shown, dropping to 0 as they dissolve
    this.openedAt = -Infinity;
    this.exalted = false;
    this.burning = null; // sfx loop handle
    // Carried over from the previous floor: no fanfare, no wings.
    if (this.world.adrenaline.isExalted) this.enter(null);
  }

  render(p, dt) {
    const a = this.world.adrenaline;
    if (a.isExalted !== this.exalted) {
      if (a.isExalted) this.enter(p);
      else this.exit(p);
    }
    this.burning?.setLevel(dt > 0 ? 1 : 0); // hushed while paused
    if (dt <= 0) return;
    this.time += dt;

    const target = a.isExalted ? 1 : 0;
    const step = dt / (target > this.intensity ? X.fadeIn : X.fadeOut);
    this.intensity = target > this.intensity ? Math.min(target, this.intensity + step) : Math.max(target, this.intensity - step);
    const warn = a.isExalted && a.exaltedRemaining < X.warnTime ? 0.55 + 0.45 * Math.cos(this.time * 18) : 1;
    this.glow = this.intensity * warn;
    // The wings are only the entrance: they burst open, hold a moment, then dissolve.
    const since = this.time - this.openedAt;
    this.spread = easeOutBack(clamp01(since / W.openTime));
    this.wingFade = 1 - clamp01((since - W.openTime - W.holdTime) / W.fadeTime);

    const k = this.intensity, scale = this.player.sizeScale, vel = this.player.body.vel;
    this.wings.position.set(p.x, p.y);
    this.wings.scale.set(scale * W.size * (1 + 0.2 * (1 - this.wingFade))); // billowing out as they go
    const wingsOut = this.wingFade > 0 && this.spread > 0.02;
    if (wingsOut) this.emitWings(this.wingFade, dt, vel);
    this.drawBones(wingsOut ? W.strandAlpha * this.wingFade * clamp01(this.spread * 2) : 0);
    this.halo.visible = k > 0;
    if (k > 0) {
      const H = X.halo;
      this.halo.position.set(p.x, p.y);
      this.halo.width = this.halo.height = H.size * scale * (1 + 0.08 * Math.sin(this.time * H.pulseSpeed));
      this.halo.alpha = H.alpha * this.glow * (1 - H.pulse + H.pulse * Math.sin(this.time * H.pulseSpeed));
      this.emitAura(p, k, dt, scale, vel);
    }
    for (const r of this.ribbons) this.drawRibbon(r, p, vel, scale);
    for (const pl of this.plumes) pl.update(dt);
  }

  enter(p) {
    this.exalted = true;
    if (p) this.openedAt = this.time;
    else this.intensity = 1;
    this.burning?.stop(0.2);
    this.burning = sfx.loop('burning');
    if (!p) return;

    const w = this.world, E = X.entry, ring = E.smokeRing;
    w.ripple.play(p);
    w.camera.shake(E.shake.duration, E.shake.strength, E.shake.frequency);
    w.effects.burst(p.x, p.y, 0, E.sparks);
    for (let i = 0; i < ring.count; i++) {
      const ang = (i / ring.count) * TAU + randRange(-0.1, 0.1), c = Math.cos(ang), s = Math.sin(ang);
      const speed = ring.speed * randRange(0.8, 1);
      this.haze.spawn({
        x: p.x + c * 0.3, y: p.y + s * 0.3, vx: c * speed, vy: s * speed,
        size: ring.size, grow: ring.grow, life: ring.life * randRange(0.8, 1), color: ring.color, fade: ring.fade, alpha: ring.alpha,
      });
    }
  }

  exit(p) {
    this.exalted = false;
    this.burning?.stop(0.8);
    this.burning = null;
    this.world.effects.burst(p.x, p.y, 0, X.exit.sparks);
  }

  // Right-wing points at the current spread and flap, in the wings' local units. The left
  // wing mirrors them in x.
  posed() {
    const s = this.spread, flap = Math.sin(this.time * W.flapSpeed) * W.flapDeg * DEG;
    POLAR.forEach(({ a, r }, i) => {
      const ang = lerp(FOLD_ANGLE, a, s) + flap * (r / MAX_REACH);
      const reach = r * lerp(FOLD_REACH, 1, s);
      this.pose[i].x = SHOULDER.x + Math.cos(ang) * reach;
      this.pose[i].y = SHOULDER.y + Math.sin(ang) * reach;
    });
    return this.pose;
  }

  // Quadratic curve of bone `i` on the posed right wing.
  boneCurve(pts, i) {
    const [ia, ib, bow] = BONES[i];
    const from = ia < 0 ? SHOULDER : pts[ia], to = pts[ib], c = this.curve;
    c.x0 = from.x; c.y0 = from.y; c.x1 = to.x; c.y1 = to.y;
    c.cx = (from.x + to.x) / 2 - (to.y - from.y) * bow * 2;
    c.cy = (from.y + to.y) / 2 + (to.x - from.x) * bow * 2;
    return c;
  }

  // A flickering, shimmering strand of fire along every bone, fading toward the tips.
  drawBones(alpha) {
    const pts = alpha > 0.01 ? this.posed() : null;
    this.bones.forEach(({ side, strand }, j) => {
      strand.mesh.visible = !!pts;
      if (!pts) return;
      const i = j % BONES.length, c = this.boneCurve(pts, i), n = strand.n, seed = j * 1.7;
      const len = BONE_LENGTHS[i] * Math.max(0.3, this.spread);
      // Index 0 is the tip, so the texture's faint end lands there.
      for (let q = 0; q < n; q++) {
        const u = 1 - q / (n - 1), v = 1 - u;
        let x = v * v * c.x0 + 2 * v * u * c.cx + u * u * c.x1;
        let y = v * v * c.y0 + 2 * v * u * c.cy + u * u * c.y1;
        // Heat shimmer travelling outward, stronger toward the tip.
        const wave = Math.sin(u * len * 6 - this.time * 8 + seed) * 0.05 * u;
        x += wave; y -= wave;
        strand.pts[2 * q] = side * x;
        strand.pts[2 * q + 1] = y;
        strand.widths[q] = BONES[i][3] * 0.5 * (1 - u) ** 0.6 * (0.75 + 0.25 * Math.sin(this.time * 11 + u * 6 + seed));
      }
      strand.build();
      strand.mesh.alpha = alpha * (0.85 + 0.15 * Math.sin(this.time * 7 + seed));
    });
  }

  // A fiery line circling the player. Its head orbits on a squashed, bobbing ellipse and its
  // body is the path the head took over the last `span` seconds, streamed back while moving.
  drawRibbon({ orbit, strand }, p, vel, scale) {
    strand.mesh.visible = this.glow > 0.01;
    if (!strand.mesh.visible) return;
    const R = X.ribbons, { radius, speed, phase } = orbit, n = strand.n;
    for (let i = 0; i < n; i++) {
      const age = (1 - i / (n - 1)) * R.span, t = this.time - age;
      const ang = t * speed + phase;
      const r = radius * scale * (1 + 0.15 * Math.sin(t * 1.7 + phase));
      const lift = (0.3 + 0.3 * Math.sin(t * 0.9 + phase)) * scale;
      strand.pts[2 * i] = p.x + Math.cos(ang) * r - vel.x * age * R.stream;
      strand.pts[2 * i + 1] = p.y + Math.sin(ang) * r * 0.5 - lift - vel.y * age * R.stream;
      strand.widths[i] = R.width * scale * 0.5 * Math.sqrt(i / (n - 1));
    }
    strand.build();
    strand.mesh.alpha = this.glow * (0.5 + 0.5 * (0.5 + 0.5 * Math.sin(this.time * 1.3 + phase)) ** 2);
  }

  // Mist and a few flame tongues streaming off the bones, and dense mist filling the
  // membrane between them. Particles live in the wings' local space; moving makes them
  // stream back a little.
  emitWings(k, dt, vel) {
    const b = W.bone, m = W.membrane, pts = this.posed();
    const dvx = -vel.x * W.drift, dvy = -vel.y * W.drift;
    for (const side of [1, -1]) {
      for (let n = spawnCount(W.boneRate * 0.5 * k, dt); n > 0; n--) {
        let roll = Math.random() * BONE_TOTAL, i = 0;
        while (roll > BONE_LENGTHS[i] && i < BONES.length - 1) roll -= BONE_LENGTHS[i++];
        // Biased toward the tips: every bone meets at the wrist, which would otherwise glare.
        const c = this.boneCurve(pts, i), u = Math.sqrt(Math.random()), v = 1 - u;
        const x = v * v * c.x0 + 2 * v * u * c.cx + u * u * c.x1 + randRange(-0.06, 0.06);
        const y = v * v * c.y0 + 2 * v * u * c.cy + u * u * c.y1 + randRange(-0.06, 0.06);
        const dx = x - SHOULDER.x, dy = y - SHOULDER.y, d = Math.hypot(dx, dy) || 1, out = randRange(0.2, 0.6);
        const fire = Math.random() < W.flameShare;
        (fire ? this.wingFire : this.wingMist).spawn({
          x: side * x, y, vx: side * (dx / d) * out + dvx, vy: (dy / d) * out - randRange(0.3, 0.8) + dvy,
          size: pick(b.size) * (fire ? 0.6 : 1), grow: b.grow, life: pick(b.life), color: b.color, fade: b.fade, alpha: b.alpha * k,
          sway: 2, orient: fire,
        });
      }
      const hub = pts[0];
      for (let n = spawnCount(W.membraneRate * 0.5 * k, dt); n > 0; n--) {
        let roll = Math.random() * PANEL_TOTAL, pi = 0;
        while (roll > PANEL_AREAS[pi] && pi < PANELS.length - 1) roll -= PANEL_AREAS[pi++];
        const [ia, ib] = PANELS[pi];
        const u = Math.random(), A = pts[ia], B = pts[ib];
        // Even over the panel's area (sqrt), with a scalloped trailing edge: the middle of
        // each span sags back toward the wrist.
        const sag = 0.3 * Math.sin(Math.PI * u), depth = sag + (1 - sag) * (1 - Math.sqrt(Math.random()));
        const x = lerp(lerp(A.x, B.x, u), hub.x, depth), y = lerp(lerp(A.y, B.y, u), hub.y, depth);
        const dx = x - SHOULDER.x, dy = y - SHOULDER.y, d = Math.hypot(dx, dy) || 1;
        this.wingMist.spawn({
          x: side * x, y, vx: side * (dx / d) * 0.25 + dvx, vy: (dy / d) * 0.25 - 0.2 + dvy,
          size: pick(m.size), grow: m.grow, life: pick(m.life), color: m.color, fade: m.fade, alpha: m.alpha * k, sway: 1,
        });
      }
    }
  }

  // World-space fire around the body: flames rising off it, embers, and a low haze. These
  // inherit some of the player's velocity and get left behind as a trail.
  emitAura(p, k, dt, scale, vel) {
    const B = X.body, E = X.embers, H = X.haze;
    for (let n = spawnCount(B.rate * k, dt); n > 0; n--) {
      const ang = Math.random() * TAU, c = Math.cos(ang), s = Math.sin(ang), r = B.radius * randRange(0.6, 1) * scale;
      this.flames.spawn({
        x: p.x + c * r, y: p.y + s * r * 0.8, vx: c * 0.6 + vel.x * 0.3, vy: s * 0.3 - pick(B.speed) + vel.y * 0.3,
        size: pick(B.size) * scale, grow: 0.4, life: pick(B.life), color: B.color, fade: B.fade, alpha: 0.85, sway: 4, orient: true,
      });
    }
    for (let n = spawnCount(E.rate * k, dt); n > 0; n--) {
      this.embers.spawn({
        x: p.x + randRange(-0.5, 0.5) * scale, y: p.y + randRange(-0.4, 0.3) * scale,
        vx: randRange(-0.8, 0.8), vy: -pick(E.speed), size: pick(E.size), grow: 0.5, life: pick(E.life),
        color: E.color, fade: E.fade, sway: 5, orient: true,
      });
    }
    for (let n = spawnCount(H.rate * k, dt); n > 0; n--) {
      const ang = Math.random() * TAU, r = Math.random() * 0.4;
      this.haze.spawn({
        x: p.x + Math.cos(ang) * r, y: p.y + Math.sin(ang) * r, vx: randRange(-0.25, 0.25), vy: randRange(-0.25, 0.25),
        size: pick(H.size) * scale, grow: H.grow, life: pick(H.life), color: H.color, fade: H.fade, alpha: H.alpha * k,
      });
    }
  }

  destroy() {
    this.burning?.stop(0.3);
    this.burning = null;
    for (const pl of this.plumes) pl.destroy();
    for (const r of this.ribbons) r.strand.destroy();
    this.wings.destroy({ children: true });
    this.halo.destroy();
  }
}

// A tapered, additive glowing strip along a path of `n` points, as one mesh. The ribbon
// texture's u runs from `u0` at the first point to `u1` at the last (its alpha ramps up
// along u). Fill `pts` (x, y pairs) and `widths` (half-widths), then build().
class Strand {
  constructor(parent, n, u0, u1, color, zIndex = 0) {
    this.n = n;
    const uvs = new Float32Array(n * 4), idx = [];
    for (let i = 0; i < n; i++) {
      const u = lerp(u0, u1, i / (n - 1));
      uvs.set([u, 0, u, 1], i * 4);
    }
    for (let i = 0; i < n - 1; i++) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
    this.mesh = new MeshSimple({ texture: tex.ribbon, vertices: new Float32Array(n * 4), uvs, indices: new Uint32Array(idx) });
    this.mesh.blendMode = 'add';
    this.mesh.tint = color;
    this.mesh.zIndex = zIndex;
    this.mesh.visible = false;
    parent.addChild(this.mesh);
    this.pts = new Float32Array(n * 2);
    this.widths = new Float32Array(n);
  }

  // Offsets each point both ways along the path's normal.
  build() {
    const { n, pts, widths } = this, v = this.mesh.vertices;
    for (let i = 0; i < n; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
      const tx = pts[2 * i1] - pts[2 * i0], ty = pts[2 * i1 + 1] - pts[2 * i0 + 1];
      const w = widths[i] / (Math.hypot(tx, ty) || 1);
      v[4 * i] = pts[2 * i] - ty * w; v[4 * i + 1] = pts[2 * i + 1] + tx * w;
      v[4 * i + 2] = pts[2 * i] + ty * w; v[4 * i + 3] = pts[2 * i + 1] - tx * w;
    }
  }

  destroy() { this.mesh.destroy(); }
}
