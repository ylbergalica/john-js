// Exalted state visuals around the player: tattered fallen-angel wings that burst open from
// the sides on entry and dissolve within a second into falling feathers, then for the rest
// of the state flames licking up off the body, rising embers, a low crimson haze and fiery ribbons
// circling the player. Entering the state also sets off the screen ripple, a spark burst
// and a smoke ring, and the burning sound loops for as long as the state lasts.
// Driven from PlayerView.render, so it watches the adrenaline state for edges itself.
import { Container, MeshSimple, Sprite } from 'pixi.js';
import { EXALTED_FX as X, PLAYER_DEATH } from '../data/config.js';
import { clamp01, lerp, randRange, seededRandom, TAU } from '../engine/math.js';
import { tex } from '../render/assets.js';
import { FEATHER_ROWS } from '../render/sprites.js';
import { Plume } from '../render/fx.js';
import { sfx } from '../audio/sfx.js';

const W = X.wings, THROES = PLAYER_DEATH.exalted.throes, DEG = Math.PI / 180;

// The right wing in world units around the player's centre (mirrored for the left): an arm
// sweeping up from the shoulder in one smooth curve through the elbow and wrist out to the
// hand, and behind it a broad wing, never drawn, that layers of short feathers are rooted
// all over: the back layers rooted deepest, their tips making the trailing edge, the front
// ones overlapping them up to the arm. Fallen and messy: the layers overlap out of order,
// the feathers sag and splay unevenly, some are broken short and some are gone.
const SHOULDER = { x: 0.2, y: -0.06 };
const ARM = [[0.58, -0.58], [1.02, -0.86], [1.46, -0.8]]; // elbow, wrist, hand
const ARM_WIDTH = [0.2, 0.05]; // the arm strand's width at the shoulder and at the hand
// The wing's shape along the arm, as keys of [t along the arm (0 shoulder … 1 hand), the
// feathers' angle (degrees, 90 hanging straight down), the wing's depth from the arm to its
// trailing edge], run between linearly.
const KEYS = [[0, 104, 0.6], [0.55, 80, 0.74], [0.68, 64, 0.82], [0.9, 26, 0.95], [1, 10, 0.86]];
// Feather layers, back to front: how many, the stretch of arm they cover, how deep into the
// wing they're rooted and how long they are (fractions of its depth there), half-width as a
// fraction of length, extra angle (degrees), and how loosely they're placed. `gone` and
// `broken` are the chances a feather is missing or snapped to 40-65% of its length.
const LAYERS = [
  { count: 34, from: 0.02, to: 1, depth: [0.44, 0.54], length: 0.5, width: 0.2, tilt: 0, jitter: { t: 0.7, deg: 9, length: [0.82, 1.08] }, gone: 0.08, broken: 0.1 },
  { count: 32, from: 0.02, to: 0.99, depth: [0.33, 0.43], length: 0.47, width: 0.21, tilt: -3, jitter: { t: 0.8, deg: 10, length: [0.8, 1.1] }, gone: 0.06, broken: 0.08 },
  { count: 30, from: 0.03, to: 0.97, depth: [0.22, 0.32], length: 0.44, width: 0.22, tilt: -6, jitter: { t: 0.85, deg: 11, length: [0.8, 1.1] }, gone: 0.05, broken: 0.06 },
  { count: 28, from: 0.03, to: 0.95, depth: [0.12, 0.22], length: 0.4, width: 0.23, tilt: -10, jitter: { t: 0.9, deg: 12, length: [0.8, 1.12] }, gone: 0.04, broken: 0.05 },
  { count: 24, from: 0.04, to: 0.92, depth: [0.04, 0.12], length: 0.34, width: 0.24, tilt: -14, jitter: { t: 0.95, deg: 13, length: [0.8, 1.15] }, gone: 0.03, broken: 0.03 },
  { count: 20, from: 0.05, to: 0.88, depth: [0, 0.04], length: 0.26, width: 0.25, tilt: -20, jitter: { t: 1, deg: 15, length: [0.8, 1.2] }, gone: 0, broken: 0 },
];
const LAYER_MIX = 0.9; // how far feathers stray into the layers around their own when drawn
// Folded, every point swings down beside the body and pulls in toward the shoulder.
const FOLD_ANGLE = 95 * DEG, FOLD_REACH = 0.2;
const ARM_POINTS = 24, FEATHER_POINTS = 7;

const polar = ({ x, y }) => ({ a: Math.atan2(y - SHOULDER.y, x - SHOULDER.x), r: Math.hypot(x - SHOULDER.x, y - SHOULDER.y) });
// The arm as a Catmull-Rom curve through its joints, sampled evenly per span, with the arc
// length up to each sample so points can be placed along it by distance.
const ARM_REST = (() => {
  const k = [SHOULDER, ...ARM.map(([x, y]) => ({ x, y }))], spans = k.length - 1, out = [];
  for (let i = 0; i < ARM_POINTS; i++) {
    const s = (i / (ARM_POINTS - 1)) * spans, j = Math.min(spans - 1, Math.floor(s)), t = s - j;
    const p0 = k[Math.max(0, j - 1)], p1 = k[j], p2 = k[j + 1], p3 = k[Math.min(spans, j + 2)];
    const cr = (a, b, c, d) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
    out.push({ x: cr(p0.x, p1.x, p2.x, p3.x), y: cr(p0.y, p1.y, p2.y, p3.y) });
  }
  return out;
})();
const ARM_DIST = ARM_REST.reduce((d, p, i) => (d.push(i ? d[i - 1] + Math.hypot(p.x - ARM_REST[i - 1].x, p.y - ARM_REST[i - 1].y) : 0), d), []);
const ARM_LENGTH = ARM_DIST[ARM_POINTS - 1];
const ARM_POLAR = ARM_REST.map(polar);
const HAND_REACH = ARM_POLAR[ARM_POINTS - 1].r;

// Point `t` (0 shoulder … 1 hand, by distance) along the arm's samples `pts`.
function armAt(pts, t, out = { x: 0, y: 0 }) {
  const d = clamp01(t) * ARM_LENGTH;
  let i = 0;
  while (i < ARM_POINTS - 2 && d > ARM_DIST[i + 1]) i++;
  const k = clamp01((d - ARM_DIST[i]) / (ARM_DIST[i + 1] - ARM_DIST[i]));
  out.x = lerp(pts[i].x, pts[i + 1].x, k);
  out.y = lerp(pts[i].y, pts[i + 1].y, k);
  return out;
}

function keyed(t, col) {
  let i = 0;
  while (i < KEYS.length - 2 && t > KEYS[i + 1][0]) i++;
  return lerp(KEYS[i][col], KEYS[i + 1][col], clamp01((t - KEYS[i][0]) / (KEYS[i + 1][0] - KEYS[i][0])));
}

// One feather in the open pose, rooted `depth` back from the arm along `deg`: it leaves its
// root that way and sags toward hanging straight down by the tip. Kept as polar points
// around the shoulder so it folds like the arm.
function makeFeather(t, deg, depth, length, width, rand, delay, flutter) {
  const arm = armAt(ARM_REST, t), a = deg * DEG, sag = lerp(a, 90 * DEG, W.droop);
  const root = { x: arm.x + Math.cos(a) * depth, y: arm.y + Math.sin(a) * depth };
  const ctrl = { x: root.x + Math.cos(a) * length * 0.55, y: root.y + Math.sin(a) * length * 0.55 };
  const tip = { x: root.x + Math.cos(sag) * length, y: root.y + Math.sin(sag) * length };
  return {
    rest: [root, ctrl, tip].map(polar), length, half: length * width, row: Math.floor(rand() * FEATHER_ROWS),
    seed: rand() * 100, delay, flutter,
  };
}

// Every layer's feathers, drawn back to front with each one straying a little out of its
// layer, so the rows overlap untidily.
const FEATHERS = (() => {
  const rand = seededRandom(23), out = [];
  LAYERS.forEach((L, li) => {
    const step = (L.to - L.from) / (L.count - 1);
    for (let i = 0; i < L.count; i++) {
      if (rand() < L.gone) continue;
      const t = clamp01(L.from + step * (i + (rand() - 0.5) * L.jitter.t));
      const deg = keyed(t, 1) + L.tilt + (rand() * 2 - 1) * L.jitter.deg;
      const broken = rand() < L.broken ? lerp(0.4, 0.65, rand()) : 1;
      const reach = keyed(t, 2), depth = reach * lerp(...L.depth, rand());
      const length = reach * L.length * lerp(...L.jitter.length, rand()) * broken;
      const f = makeFeather(t, deg, depth, length, L.width, rand, t * W.stagger + (LAYERS.length - 1 - li) * 0.01, 1 - li * 0.15);
      f.layer = li;
      f.order = li + (rand() - 0.5) * 2 * LAYER_MIX;
      out.push(f);
    }
  });
  return out.sort((a, b) => a.order - b.order);
})();
const MAX_REACH = Math.max(...FEATHERS.map((f) => f.rest[2].r));
const FEATHER_TOTAL = FEATHERS.reduce((s, f) => s + f.length, 0);
const HISTORY = 24; // remembered feather poses, for the afterimages

// Point `u` along a posed feather shaft: a quadratic from the root through ctrl to the tip.
function shaftAt([a, c, b], u, out) {
  const v = 1 - u;
  out.x = v * v * a.x + 2 * v * u * c.x + u * u * b.x;
  out.y = v * v * a.y + 2 * v * u * c.y + u * u * b.y;
  return out;
}

// How far open the wings (or a feather, `delay` behind) are: pushing out past the open pose
// to `extend`, slowing only as they turn around, then pulled back in by `fold`.
const opening = (since, delay, fold) => W.extend * (1 - (1 - clamp01((since - delay) / W.openTime)) ** 2) - fold;
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
    // Inside the wings: glowing mist behind the feathers, the feathers, their afterimages,
    // fire along the arm, and wisps streaming off the feather tips.
    this.wingMist = new Plume(this.wings, tex.mist, { drag: 1.5, lift: 0.4 });
    const featherStrand = (f, color, blendMode) => new Strand(this.wings, FEATHER_POINTS, 0, 1, color, 0,
      { texture: tex.feathers, blendMode, v0: f.row / FEATHER_ROWS, v1: (f.row + 1) / FEATHER_ROWS });
    this.featherMeshes = [1, -1].flatMap((side) => FEATHERS.map((f, i) => ({ side, i, strand: featherStrand(f, W.feather.color, 'normal') })));
    // Afterimages of the back layers' feathers, glowing where they were a moment ago.
    const echoed = FEATHERS.flatMap((f, i) => (f.layer < W.echo.layers ? [i] : []));
    this.echoes = W.echo.lags.flatMap((lag, e) => [1, -1].flatMap((side) => echoed.map((i) => ({ e, side, i, strand: featherStrand(FEATHERS[i], W.echo.color, 'add') }))));
    this.arms = [1, -1].map((side) => ({ side, strand: new Strand(this.wings, ARM_POINTS, 0.35, 1, W.strandColor) }));
    this.wisps = new Plume(this.wings, tex.flame, { drag: 1.5, lift: 0.3 });
    this.wingFire = new Plume(this.wings, tex.flame, { drag: 2, lift: 1.2 });
    this.shed = new Plume(playerBack, tex.feather, { blendMode: 'normal', drag: 2.5, lift: -0.8, zIndex: -19 });
    this.ribbons = X.ribbons.orbits.map((o) => ({ orbit: o, strand: new Strand(playerBack, X.ribbons.points, 0, 1, o.color, -10) }));
    this.flames = new Plume(playerBack, tex.flame, { drag: 1.5, lift: 2.5, zIndex: -5 });
    this.embers = new Plume(fx, tex.spark, { drag: 0.8, lift: 1.2 });
    this.plumes = [this.haze, this.wingMist, this.wisps, this.wingFire, this.shed, this.flames, this.embers];
    this.pose = ARM_REST.map(() => ({ x: 0, y: 0 }));
    this.featherPoses = FEATHERS.map(() => ({ spread: 0, pts: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }] }));
    this.point = { x: 0, y: 0 };
    this.echoPts = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
    this.history = Array.from({ length: HISTORY }, () => ({ time: -Infinity, spread: new Float32Array(FEATHERS.length), pts: new Float32Array(FEATHERS.length * 6) }));
    this.historyAt = 0;

    this.time = 0; // local clock; stands still while paused
    this.intensity = 0; // 0…1 strength of the whole effect
    this.glow = 0; // intensity with the end-of-state flicker, for the player's outline
    this.spread = 0; // wing opening: 0 folded … 1 open, past it at full stretch
    this.fold = 0; // how far the wings have folded back in as they fade
    this.spreadVel = 0; // how fast the spread is changing (per second, smoothed), for the drag bend
    this.lastSpread = 0;
    this.wingFade = 0; // 1 while the wings are shown, dropping to 0 as they dissolve
    this.openedAt = -Infinity;
    this.exalted = false;
    this.burning = null; // sfx loop handle
    this.throes = 0; // 0…1 dying Exalted: the fire roars up (PLAYER_DEATH.exalted.throes); set by PlayerView
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
    // The wings are only the entrance: they burst open, then dissolve.
    const since = this.time - this.openedAt;
    // They stretch open, then turn straight around and fold back in as they fade, gone
    // before they finish folding.
    const out = clamp01((since - W.openTime - W.holdTime) / W.fadeTime);
    this.fold = W.foldBack * out ** 1.3;
    this.spread = opening(since, 0, this.fold);
    const spreading = (this.spread - this.lastSpread) / dt;
    this.spreadVel += (spreading - this.spreadVel) * (1 - Math.exp(-dt / W.drag.smooth));
    this.lastSpread = this.spread;
    this.wingFade = 1 - out;

    const k = this.intensity, scale = this.player.sizeScale, vel = this.player.body.vel;
    this.wings.position.set(p.x, p.y);
    this.wings.scale.set(scale * W.size);
    const wingsOut = this.wingFade > 0 && this.spread > 0.02;
    if (wingsOut) {
      this.poseWings(since);
      this.remember();
      this.emitWings(this.wingFade, dt, vel);
      this.shedFeathers(p, dt);
    }
    this.drawArms(wingsOut ? W.strandAlpha * this.wingFade * clamp01(this.spread * 2) : 0);
    this.drawFeathers(wingsOut ? this.wingFade : 0);
    this.drawEchoes(wingsOut ? this.wingFade : 0);
    this.halo.visible = k > 0;
    if (k > 0) {
      const H = X.halo;
      this.halo.position.set(p.x, p.y);
      this.halo.width = this.halo.height = H.size * scale * (1 + 0.08 * Math.sin(this.time * H.pulseSpeed)) * (1 + THROES.halo * this.throes);
      this.halo.alpha = H.alpha * this.glow * (1 - H.pulse + H.pulse * Math.sin(this.time * H.pulseSpeed));
      this.emitAura(p, k, dt, scale, vel);
    }
    for (const r of this.ribbons) this.drawRibbon(r, p, vel, scale);
    for (const pl of this.plumes) pl.update(dt);
  }

  enter(p) {
    this.exalted = true;
    if (p) this.openWings();
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

  // Dying Exalted: the wings tear open once more.
  flareWings() { this.openWings(); }

  openWings() {
    this.openedAt = this.time;
    this.lastSpread = this.spreadVel = 0;
    for (const h of this.history) h.time = -Infinity;
  }

  // Keeps the feathers' current pose for the afterimages to replay.
  remember() {
    this.historyAt = (this.historyAt + 1) % HISTORY;
    const h = this.history[this.historyAt];
    h.time = this.time;
    this.featherPoses.forEach((fp, i) => {
      h.spread[i] = fp.spread;
      fp.pts.forEach((q, j) => { h.pts[i * 6 + j * 2] = q.x; h.pts[i * 6 + j * 2 + 1] = q.y; });
    });
  }

  // The newest remembered pose at least `lag` old, or the oldest there is.
  recall(lag) {
    let best = null, oldest = null;
    for (const h of this.history) {
      if (h.time === -Infinity) continue;
      if (!oldest || h.time < oldest.time) oldest = h;
      if (h.time <= this.time - lag && (!best || h.time > best.time)) best = h;
    }
    return best ?? oldest;
  }

  exit(p) {
    this.exalted = false;
    this.burning?.stop(0.8);
    this.burning = null;
    this.world.effects.burst(p.x, p.y, 0, X.exit.sparks);
  }

  // The arm and every feather at the current opening and flap, in the wings' local units
  // (the right wing; the left mirrors it in x). Each feather opens a little after the arm,
  // the outer and deeper ones last, and trembles about its root.
  poseWings(since) {
    const flap = Math.sin(this.time * W.flapSpeed) * W.flapDeg * DEG;
    // Drag: the further out, the more a point trails the stroke, so the arm bows back as it
    // opens, straightens at full stretch and arches the other way as it folds down.
    const drag = W.drag.deg * DEG * Math.tanh(this.spreadVel / W.drag.speed);
    const place = ({ a, r }, s, out) => {
      const trail = drag * Math.min(W.drag.max, (r / HAND_REACH) ** 2.2);
      const ang = lerp(FOLD_ANGLE, a, s) + flap * (r / MAX_REACH) + trail, reach = r * lerp(FOLD_REACH, 1, s);
      out.x = SHOULDER.x + Math.cos(ang) * reach;
      out.y = SHOULDER.y + Math.sin(ang) * reach;
    };
    ARM_POLAR.forEach((pp, i) => place(pp, this.spread, this.pose[i]));
    FEATHERS.forEach((f, i) => {
      const fp = this.featherPoses[i], [root, ctrl, tip] = fp.pts;
      fp.spread = opening(since, f.delay, this.fold);
      f.rest.forEach((pp, j) => place(pp, fp.spread, fp.pts[j]));
      const turn = Math.sin(this.time * W.flutter.speed + f.seed) * W.flutter.deg * DEG * f.flutter;
      const c = Math.cos(turn), s = Math.sin(turn);
      for (const q of [ctrl, tip]) {
        const dx = q.x - root.x, dy = q.y - root.y;
        q.x = root.x + dx * c - dy * s;
        q.y = root.y + dx * s + dy * c;
      }
    });
  }

  // A flickering, shimmering strand of fire along each arm, thinning and fading toward the hand.
  drawArms(alpha) {
    const pts = alpha > 0.01 ? this.pose : null;
    this.arms.forEach(({ side, strand }, j) => {
      strand.mesh.visible = !!pts;
      if (!pts) return;
      const n = strand.n, seed = j * 1.7, len = ARM_LENGTH * Math.max(0.3, this.spread);
      // Index 0 is the hand, so the texture's faint end lands there.
      for (let q = 0; q < n; q++) {
        const u = 1 - q / (n - 1), { x, y } = pts[n - 1 - q];
        // Heat shimmer travelling outward, stronger toward the hand.
        const wave = Math.sin(u * len * 6 - this.time * 8 + seed) * 0.04 * u;
        strand.pts[2 * q] = side * (x + wave);
        strand.pts[2 * q + 1] = y - wave;
        strand.widths[q] = lerp(...ARM_WIDTH, u) * 0.5 * (0.8 + 0.2 * Math.sin(this.time * 11 + u * 6 + seed));
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

  // Every feather as a strip of the feather texture bent along its shaft.
  drawFeathers(fade) {
    for (const { side, i, strand } of this.featherMeshes) {
      const fp = this.featherPoses[i], alpha = W.feather.alpha * fade * clamp01(fp.spread * 2);
      strand.mesh.visible = alpha > 0.01;
      if (!strand.mesh.visible) continue;
      this.layFeather(strand, side, i, fp.pts, fp.spread, 1);
      strand.mesh.alpha = alpha;
    }
  }

  // The back feathers again where they were `lags` ago, glowing, and fainter the older.
  drawEchoes(fade) {
    const E = W.echo, frames = fade > 0.01 ? E.lags.map((lag) => this.recall(lag)) : null, pts = this.echoPts;
    for (const { e, side, i, strand } of this.echoes) {
      const h = frames?.[e], alpha = h ? E.alpha[e] * fade * clamp01(h.spread[i] * 2) : 0;
      strand.mesh.visible = alpha > 0.01;
      if (!strand.mesh.visible) continue;
      pts.forEach((q, j) => { q.x = h.pts[i * 6 + j * 2]; q.y = h.pts[i * 6 + j * 2 + 1]; });
      this.layFeather(strand, side, i, pts, h.spread[i], E.widen);
      strand.mesh.alpha = alpha;
    }
  }

  // Lays feather `i`'s strip along the posed shaft `pts`, rippling like smoke toward the tip.
  layFeather(strand, side, i, pts, spread, widen) {
    const f = FEATHERS[i], F = W.feather, n = strand.n, half = f.half * lerp(0.5, 1, clamp01(spread)) * widen;
    const [a, , b] = pts, len = Math.hypot(b.x - a.x, b.y - a.y) || 1, nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
    for (let q = 0; q < n; q++) {
      const u = q / (n - 1), { x, y } = shaftAt(pts, u, this.point);
      const wave = Math.sin(u * 5 - this.time * F.waveSpeed + f.seed) * F.wave * f.length * u;
      strand.pts[2 * q] = side * (x + nx * wave);
      strand.pts[2 * q + 1] = y + ny * wave;
      strand.widths[q] = half * (1 + 0.15 * Math.sin(this.time * 5 + u * 4 + f.seed));
    }
    strand.build();
  }

  // Mist and a few flame tongues streaming off the arm, mist glowing behind the feathers,
  // mostly toward their tips, and wisps off the tips. Particles live in the wings' local
  // space, so they stay put as the feathers sweep on, leaving trails; moving makes them
  // stream back a little.
  emitWings(k, dt, vel) {
    const b = W.bone, g = W.glow, w = W.wisp, pts = this.pose;
    const dvx = -vel.x * W.drift, dvy = -vel.y * W.drift;
    for (const side of [1, -1]) {
      for (let n = spawnCount(W.boneRate * 0.5 * k, dt); n > 0; n--) {
        const { x: ax, y: ay } = armAt(pts, Math.random(), this.point);
        const x = ax + randRange(-0.05, 0.05), y = ay + randRange(-0.05, 0.05);
        const dx = x - SHOULDER.x, dy = y - SHOULDER.y, d = Math.hypot(dx, dy) || 1, out = randRange(0.2, 0.6);
        const fire = Math.random() < W.flameShare;
        (fire ? this.wingFire : this.wingMist).spawn({
          x: side * x, y, vx: side * (dx / d) * out + dvx, vy: (dy / d) * out - randRange(0.3, 0.8) + dvy,
          size: pick(b.size) * (fire ? 0.6 : 1), grow: b.grow, life: pick(b.life), color: b.color, fade: b.fade, alpha: b.alpha * k,
          sway: 2, orient: fire,
        });
      }
      for (let n = spawnCount(W.glowRate * 0.5 * k, dt); n > 0; n--) {
        let roll = Math.random() * FEATHER_TOTAL, i = 0;
        while (roll > FEATHERS[i].length && i < FEATHERS.length - 1) roll -= FEATHERS[i++].length;
        const { x, y } = shaftAt(this.featherPoses[i].pts, Math.sqrt(Math.random()), this.point);
        const dx = x - SHOULDER.x, dy = y - SHOULDER.y, d = Math.hypot(dx, dy) || 1;
        this.wingMist.spawn({
          x: side * x + randRange(-0.08, 0.08), y: y + randRange(-0.08, 0.08), vx: side * (dx / d) * 0.25 + dvx, vy: (dy / d) * 0.25 - 0.2 + dvy,
          size: pick(g.size), grow: g.grow, life: pick(g.life), color: g.color, fade: g.fade, alpha: g.alpha * k, sway: 1,
        });
      }
      for (let n = spawnCount(w.rate * 0.5 * k, dt); n > 0; n--) {
        const fp = this.featherPoses[Math.floor(Math.random() * FEATHERS.length)].pts;
        const { x, y } = shaftAt(fp, randRange(0.7, 1), this.point);
        const dx = fp[2].x - fp[0].x, dy = fp[2].y - fp[0].y, d = Math.hypot(dx, dy) || 1, out = randRange(0.15, 0.45);
        this.wisps.spawn({
          x: side * x, y, vx: side * (dx / d) * out + dvx, vy: (dy / d) * out + dvy,
          size: pick(w.size), grow: 1.3, life: pick(w.life), color: w.color, fade: w.fade, alpha: w.alpha * k, sway: 2, orient: true,
        });
      }
    }
  }

  // Loose feathers tearing off and tumbling away, left behind in world space: a trickle
  // while the wings hold, a flurry as they dissolve.
  shedFeathers(p, dt) {
    const S = W.shed, ws = this.wings.scale.x;
    for (let n = spawnCount(S.rate * (this.wingFade < 1 ? 1 : S.hold), dt); n > 0; n--) {
      const i = Math.floor(Math.random() * FEATHERS.length), side = Math.random() < 0.5 ? 1 : -1;
      const { x, y } = shaftAt(this.featherPoses[i].pts, randRange(0.3, 1), this.point);
      const dx = x - SHOULDER.x, dy = y - SHOULDER.y, d = Math.hypot(dx, dy) || 1, speed = pick(S.speed);
      this.shed.spawn({
        x: p.x + side * x * ws, y: p.y + y * ws, vx: side * (dx / d) * speed, vy: (dy / d) * speed,
        size: pick(S.size) * ws, life: pick(S.life), color: S.color, fade: S.fade, alpha: S.alpha, sway: 3, orient: true,
      });
    }
  }

  // World-space fire around the body: flames rising off it, embers, and a low haze. These
  // inherit some of the player's velocity and get left behind as a trail.
  emitAura(p, k, dt, scale, vel) {
    const B = X.body, E = X.embers, H = X.haze;
    const t = this.throes;
    for (let n = spawnCount(B.rate * k * (1 + THROES.flames * t), dt); n > 0; n--) {
      const ang = Math.random() * TAU, c = Math.cos(ang), s = Math.sin(ang), r = B.radius * randRange(0.6, 1) * scale;
      this.flames.spawn({
        x: p.x + c * r, y: p.y + s * r * 0.8, vx: c * 0.6 + vel.x * 0.3, vy: s * 0.3 - pick(B.speed) + vel.y * 0.3,
        size: pick(B.size) * scale, grow: 0.4, life: pick(B.life), color: B.color, fade: B.fade, alpha: 0.85, sway: 4, orient: true,
      });
    }
    for (let n = spawnCount(E.rate * k * (1 + THROES.embers * t), dt); n > 0; n--) {
      this.embers.spawn({
        x: p.x + randRange(-0.5, 0.5) * scale, y: p.y + randRange(-0.4, 0.3) * scale,
        vx: randRange(-0.8, 0.8), vy: -pick(E.speed), size: pick(E.size), grow: 0.5, life: pick(E.life),
        color: E.color, fade: E.fade, sway: 5, orient: true,
      });
    }
    for (let n = spawnCount(H.rate * k * (1 + THROES.haze * t), dt); n > 0; n--) {
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

// A tapered strip along a path of `n` points, as one mesh: by default an additive glowing
// ribbon. The texture's u runs from `u0` at the first point to `u1` at the last (the
// ribbon's alpha ramps up along u), and v from `v0` on one side to `v1` on the other.
// Fill `pts` (x, y pairs) and `widths` (half-widths), then build().
class Strand {
  constructor(parent, n, u0, u1, color, zIndex = 0, { texture = tex.ribbon, blendMode = 'add', v0 = 0, v1 = 1 } = {}) {
    this.n = n;
    const uvs = new Float32Array(n * 4), idx = [];
    for (let i = 0; i < n; i++) {
      const u = lerp(u0, u1, i / (n - 1));
      uvs.set([u, v0, u, v1], i * 4);
    }
    for (let i = 0; i < n - 1; i++) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
    this.mesh = new MeshSimple({ texture, vertices: new Float32Array(n * 4), uvs, indices: new Uint32Array(idx) });
    this.mesh.blendMode = blendMode;
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
