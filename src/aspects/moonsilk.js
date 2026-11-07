// Moonsilk: the slot key flings strands of white silk fanning out along the aim, each a loose
// rope paid out behind its head, weaving as it flies and draping over walls and round bodies;
// whatever a strand's head touches is stunned, wound in silk and hauled in toward the player.
// Pressed just after a parry instead, it twirls a lasso and throws it at the enemy parried,
// however far, drops it over it, cinches it tight, striking and stunning it, and reels it right
// in, at no cost and even on cooldown.
import { Container, Graphics } from 'pixi.js';
import { Aspect } from './aspect.js';
import { Entity } from '../game/entity.js';
import { FIXED_DT } from '../data/config.js';
import { clamp, clamp01, deltaAngle, dist, fromAngle, lerp, randRange, randSign, TAU } from '../engine/math.js';
import { tex } from '../render/assets.js';
import { clearGraphics } from '../render/fx.js';
import { hurtByPoly, hurtBySegment } from '../game/hurtbox.js';

const DEG = Math.PI / 180;
const SILK = 0xffffff;
const easeOut = (t) => 1 - (1 - t) ** 3;
const alive = (t) => !t.dead && !t.dying;
// Silk is drawn this many times larger and scaled back down, so its fine lines come out smooth.
const U = 32;
// How far a rope keeps its points off walls and bodies.
const SKIN = 0.06;
// Anything this heavy is rooted (a spawner): caught but never hauled.
const ROOTED = 1e5;

const targets = (w) => [...w.enemies, ...w.props].filter(alive);

export class MoonsilkAspect extends Aspect {
  constructor(player, data) {
    super(player, data);
    this.remaining = 0;
    this.parried = null; // the enemy last parried, while a reel can still be thrown at it
    this.parriedAt = -Infinity;
  }

  get cooldownFraction() { return clamp01(this.remaining / this.data.cooldown); }

  step(dt) { this.remaining = Math.max(0, this.remaining - dt); }

  onParry(attack) {
    this.parried = attack?.enemy ?? attack?.sourceAbility?.enemy ?? null;
    this.parriedAt = this.now;
  }

  // The enemy a reel would go for just now: the one parried, within reel.window of it.
  get reelTarget() {
    const e = this.parried;
    if (!e || !alive(e) || this.now - this.parriedAt > this.data.reel.window) return null;
    return e;
  }

  tryActivate() {
    const target = this.reelTarget;
    if (target) {
      this.parried = null;
      this.world.add(new MoonsilkLasso(this, target));
      this.world.sound('moonsilkReel', this.player.body.pos);
      return true;
    }
    if (this.remaining > 0) return false;
    this.world.add(new MoonsilkWeb(this, this.player.aim));
    this.world.sound('moonsilkCast', this.player.body.pos);
    this.remaining = this.data.cooldown;
    return true;
  }

  // Bound in silk: struck for `damage` from `from` at `hit`, then an enemy that lives through it
  // is stunned for `seconds` (counted toward its summary stat); a prop just takes the blow. An
  // enemy it kills ends the cooldown, like any other kill (the aspect isn't told of its own).
  bind(t, damage, seconds, hit, from) {
    this.strike(t, damage, hit, from);
    if (!alive(t) || !t.stun || t.isProp) return;
    t.stun(seconds);
    this.tally(seconds);
  }

  // Struck for `damage` (none if it's 0), ending the cooldown if it kills an enemy.
  strike(t, damage, hit, from) {
    if (damage <= 0 || !alive(t)) return;
    t.takeDamage(damage * this.world.adrenaline.damageMultiplier, hit, from, this.data.id);
    if (!t.isProp && !alive(t)) this.refreshCooldown();
  }

  onEnemyKilled() { this.refreshCooldown(); }
  refreshCooldown() { this.remaining = 0; }
}

// Hauls an enemy or prop in toward the player with a steady `force`: each step it's pushed
// toward them, so the heavier it is the slower it picks up speed (a guardian barely shifts),
// and its own damping and walls work against it as they would any shove. Its speed toward the
// player is held to `maxSpeed`. It pulls until it has come `pull` toward them, it's `gap` from
// them (where the line goes slack, taking its speed in toward them off so it doesn't
// crash into them), it stops moving (a wall), or `maxTime` runs out. Its owner steps it after the
// enemies (it's added to the world after them), so its push comes after their own moving, which
// it holds off meanwhile. A Moray in its wall and anything rooted stay put.
class Haul {
  constructor(world, t, { pull, gap, force, maxSpeed, maxTime }) {
    this.world = world;
    this.t = t;
    const rooted = t.lair || (t.isProp && (t.type?.mass ?? Infinity) >= ROOTED) || t.hurtOutline?.();
    this.left = rooted ? 0 : pull;
    this.gap = gap;
    this.force = force;
    this.maxSpeed = maxSpeed;
    this.until = world.time + maxTime;
    this.last = null; // where it was last step
    this.stuck = 0;
    this.done = false;
  }

  step(dt) {
    if (this.done) return;
    const t = this.t, b = t.body, p = this.world.livePlayer;
    if (!alive(t) || !p) { this.finish(); return; }
    const to = p.body.pos, d = dist(b.pos, to) || 1e-6, ux = (to.x - b.pos.x) / d, uy = (to.y - b.pos.y) / d;
    if (this.last) {
      const moved = (b.pos.x - this.last.x) * ux + (b.pos.y - this.last.y) * uy; // how far it came in
      this.left -= Math.max(0, moved);
      this.stuck = moved < 0.004 ? this.stuck + 1 : 0;
    }
    const room = d - p.body.radius - b.radius - this.gap;
    if (room <= 0.01) { this.finish(true); return; }
    if (this.left <= 0.01 || this.stuck >= 4 || this.world.time >= this.until) { this.finish(); return; }
    b.addImpulse(ux * this.force * dt, uy * this.force * dt);
    const inward = b.vel.x * ux + b.vel.y * uy;
    if (inward > this.maxSpeed) { b.vel.x -= ux * (inward - this.maxSpeed); b.vel.y -= uy * (inward - this.maxSpeed); }
    t.ai?.suppressMovementFor(0.15);
    this.last = { ...b.pos };
  }

  // `arrived`: it's in, and comes to rest beside the player rather than crashing into them.
  finish(arrived = false) {
    if (this.done) return;
    this.done = true;
    const t = this.t, p = this.world.livePlayer;
    if (!arrived || !alive(t) || !p) return;
    const b = t.body, d = dist(b.pos, p.body.pos) || 1e-6, ux = (p.body.pos.x - b.pos.x) / d, uy = (p.body.pos.y - b.pos.y) / d;
    const inward = b.vel.x * ux + b.vel.y * uy;
    if (inward > 0) { b.vel.x -= ux * inward; b.vel.y -= uy * inward; }
  }
}

// A rope of silk: a chain of `n` points from the hand (the first, pinned there) to its end,
// `length` of it paid out. It's loose: its links only pull taut, never push, so it hangs in
// curves, and it's kept off walls and bodies, so it drapes over them.
class Rope {
  constructor(world, from, n) {
    this.world = world;
    this.n = n;
    this.pts = Array.from({ length: n }, () => ({ x: from.x, y: from.y, px: from.x, py: from.y }));
    this.prev = this.pts.map((p) => ({ x: p.x, y: p.y })); // where they were last step, for drawing between steps
    this.length = 0;
  }

  get end() { return this.pts[this.n - 1]; }

  // `hand`: where its first point is pinned; `end`: where its last is, or null for loose;
  // `drag`: how much of its motion it keeps a step; `ignore`: bodies it may lie on; `wave`:
  // { amp, at }, a ripple running down it from the hand (`at` its phase), pushing it side to
  // side by up to `amp` a step, most at its far end, so it whips as it's drawn in.
  step(hand, end, { drag = 0.86, ignore = null, wave = null } = {}) {
    const P = this.pts, n = this.n, w = this.world;
    for (let i = 0; i < n; i++) { this.prev[i].x = P[i].x; this.prev[i].y = P[i].y; }
    for (let i = 1; i < n; i++) {
      const p = P[i], vx = (p.x - p.px) * drag, vy = (p.y - p.py) * drag;
      p.px = p.x; p.py = p.y;
      p.x += vx; p.y += vy;
      if (wave) {
        const q = P[i - 1], dx = p.x - q.x, dy = p.y - q.y, l = Math.hypot(dx, dy) || 1;
        const push = wave.amp * (i / (n - 1)) * Math.sin(i * 0.9 - wave.at);
        p.x += (-dy / l) * push; p.y += (dx / l) * push;
      }
    }
    const L = this.length / (n - 1);
    const pin = () => {
      P[0].x = hand.x; P[0].y = hand.y;
      if (end) { P[n - 1].x = end.x; P[n - 1].y = end.y; }
    };
    for (let k = 0; k < 6; k++) {
      pin();
      for (let i = 0; i < n - 1; i++) {
        const a = P[i], b = P[i + 1], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (d <= L || d < 1e-6) continue;
        const fixA = i === 0, fixB = i + 1 === n - 1 && end;
        const share = fixA ? (fixB ? 0 : 1) : fixB ? 0 : 0.5, over = (d - L) / d;
        if (!fixA) { const s = fixB ? 1 : 1 - share; a.x += dx * over * s; a.y += dy * over * s; }
        if (!fixB) { const s = fixA ? 1 : share; b.x -= dx * over * s; b.y -= dy * over * s; }
      }
    }
    pin();
    // Kept off walls and bodies.
    const bodies = targets(w).filter((t) => !t.isThread && !ignore?.has(t)).map((t) => t.body);
    for (let i = 1; i < (end ? n - 1 : n); i++) {
      const p = P[i];
      if (w.physics.circleHitsWall(p.x, p.y, SKIN)) {
        const q = w.physics.wallPoint(p.x, p.y, SKIN);
        const dx = p.x - (q?.x ?? p.x), dy = p.y - (q?.y ?? p.y), d = Math.hypot(dx, dy);
        if (q && d > 1e-5) { p.x = q.x + (dx / d) * SKIN; p.y = q.y + (dy / d) * SKIN; } else { p.x = p.px; p.y = p.py; }
      }
      for (const b of bodies) {
        const dx = p.x - b.pos.x, dy = p.y - b.pos.y, r = b.radius + SKIN, d2 = dx * dx + dy * dy;
        if (d2 >= r * r || d2 < 1e-8) continue;
        const d = Math.sqrt(d2);
        p.x = b.pos.x + (dx / d) * r; p.y = b.pos.y + (dy / d) * r;
      }
    }
  }

  // Its points between the last step and this one, at render `alpha`, smoothed into a curve
  // (`sub` points between each two), from the hand at `hand` to `end` (null: where it lies).
  curve(alpha, hand, end = null, sub = 3) {
    const n = this.n, raw = this.pts.map((p, i) => ({ x: lerp(this.prev[i].x, p.x, alpha), y: lerp(this.prev[i].y, p.y, alpha) }));
    raw[0] = hand;
    if (end) raw[n - 1] = end;
    const out = [raw[0]];
    for (let i = 0; i < n - 1; i++) {
      const p0 = raw[Math.max(0, i - 1)], p1 = raw[i], p2 = raw[i + 1], p3 = raw[Math.min(n - 1, i + 2)];
      for (let s = 1; s <= sub; s++) {
        const t = s / sub, t2 = t * t, t3 = t2 * t;
        const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        out.push({ x: cr(p0.x, p1.x, p2.x, p3.x), y: cr(p0.y, p1.y, p2.y, p3.y) });
      }
    }
    return out;
  }
}

// Draws moonsilk: a fine white thread over a faint white haze.
class SilkGfx {
  constructor(parent) {
    this.container = new Container();
    this.haze = new Graphics();
    this.haze.blendMode = 'add';
    this.core = new Graphics();
    this.container.addChild(this.haze, this.core);
    this.container.scale.set(1 / U);
    parent.addChild(this.container);
  }

  clear() { clearGraphics(this.haze); clearGraphics(this.core); }

  // A thread through `pts`, `alpha` as strong, `look`: { width, haze, hazeAlpha, alpha }.
  thread(pts, alpha, look) {
    if (alpha <= 0.003 || pts.length < 2) return;
    for (const [g, w, a] of [[this.haze, look.haze, look.hazeAlpha], [this.core, look.width, look.alpha]]) {
      g.moveTo(pts[0].x * U, pts[0].y * U);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x * U, pts[i].y * U);
      g.stroke({ width: w * U, color: SILK, alpha: a * alpha, cap: 'round', join: 'round' });
    }
  }

  dot(p, r, alpha) {
    if (alpha <= 0.003) return;
    this.haze.circle(p.x * U, p.y * U, r * 2.2 * U).fill({ color: SILK, alpha: 0.12 * alpha });
    this.core.circle(p.x * U, p.y * U, r * U).fill({ color: SILK, alpha });
  }

  // A four-point glint, `r` across, in a soft white haze.
  glint(p, r, alpha, rot = 0) {
    if (alpha <= 0.003) return;
    const x = p.x * U, y = p.y * U, R = r * U, k = R * 0.16, c = Math.cos(rot), s = Math.sin(rot);
    const pts = [[R, 0], [k, k], [0, R], [-k, k], [-R, 0], [-k, -k], [0, -R], [k, -k]].flatMap(([u, v]) => [x + c * u - s * v, y + s * u + c * v]);
    for (const [k2, a2] of [[0.7, 0.05], [0.4, 0.08], [0.22, 0.12]]) this.haze.circle(x, y, R * k2).fill({ color: SILK, alpha: a2 * alpha });
    this.core.poly(pts).fill({ color: SILK, alpha });
  }
}

// How far along a line each of its points lies.
function lengths(pts) {
  const out = [0];
  for (let i = 1; i < pts.length; i++) out.push(out[i - 1] + dist(pts[i - 1], pts[i]));
  return out;
}

// The point `at` along a line (its lengths in `lens`).
function pointAlong(pts, lens, at) {
  let j = 1;
  while (j < pts.length - 1 && lens[j] < at) j++;
  const k = clamp01((at - lens[j - 1]) / (lens[j] - lens[j - 1] || 1));
  return { x: lerp(pts[j - 1].x, pts[j].x, k), y: lerp(pts[j - 1].y, pts[j].y, k) };
}

// A thread from `a` to `b`, sagging `sag` of its span toward `hub`.
function sagging(a, b, hub, sag) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, l = dist(a, b), hx = hub.x - mx, hy = hub.y - my, hl = Math.hypot(hx, hy) || 1;
  const c = { x: mx + (hx / hl) * l * sag, y: my + (hy / hl) * l * sag }, pts = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8, u = 1 - t;
    pts.push({ x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y });
  }
  return pts;
}

// Silk wound round a body at `c`, radius `r`: `loops` loops starting at `from` (radians), wound
// `wound` of the way on (0 → 1), each tilted its own way (`tilts`) so they cross, loosened
// `loose` (0 → 1: swelling and fading as they slip off).
function windings(c, r, from, loops, wound, tilts, loose) {
  const pts = [], total = loops * TAU * wound, steps = Math.max(2, Math.ceil(total / (TAU / 36)));
  for (let i = 0; i <= steps; i++) {
    const a = from + (total * i) / steps, k = Math.min(loops - 1, Math.floor((a - from) / TAU)), tilt = tilts[k];
    const squash = 0.62 + 0.38 * Math.abs(Math.cos(a - tilt)); // an ellipse tipped `tilt`, so the loops cross
    const R = r * squash * (1 + 0.07 * k) * (1 + loose * 0.7);
    pts.push({ x: c.x + Math.cos(a) * R, y: c.y + Math.sin(a) * R });
  }
  return pts;
}

// The strands flung out for a cast: one homing on everything in the cone the player can see,
// more strung between them, each paying out a loose rope that weaves as it flies.
class MoonsilkWeb extends Entity {
  constructor(aspect, aim) {
    const w = aspect.world, d = aspect.data, W = d.web;
    super(w);
    this.aspect = aspect;
    this.data = d;
    this.born = w.time;
    this.struck = new Set();
    const o = { ...aspect.player.body.pos }, a0 = Math.atan2(aim.y, aim.x), half = (W.angleDeg / 2) * DEG;

    // The cone, its edge stopping at walls, and everything in it in sight.
    const fan = [o];
    for (let i = 0; i <= 12; i++) {
      const v = fromAngle(a0 + (i / 12 - 0.5) * 2 * half), l = w.physics.rayLength(o.x, o.y, v.x, v.y, W.reach);
      fan.push({ x: o.x + v.x * l, y: o.y + v.y * l });
    }
    const inSight = (t) => {
      const q = t.closestPoint(o), l = dist(q, o);
      return l < 0.05 || w.physics.rayLength(o.x, o.y, (q.x - o.x) / l, (q.y - o.y) / l, l) >= l - 0.1;
    };
    const aimed = targets(w).filter((t) => !t.isThread && hurtByPoly(t, fan) && inSight(t)).slice(0, W.max);
    const angles = aimed.map((t) => clamp(deltaAngle(a0, Math.atan2(t.body.pos.y - o.y, t.body.pos.x - o.x)), -half, half));
    // Strands between them, wherever the cone is left bare.
    const fill = [];
    const want = Math.min(W.max, Math.max(W.strands, aimed.length + 3)) - aimed.length;
    for (let i = 0; i < W.strands && fill.length < want; i++) {
      const off = (i / (W.strands - 1) - 0.5) * 2 * half;
      if ([...angles, ...fill].every((a) => Math.abs(a - off) > half / W.strands)) fill.push(off);
    }
    this.a0 = a0;
    this.strands = [
      ...aimed.map((t, i) => this.strand(o, a0 + angles[i], t)),
      ...fill.map((off) => this.strand(o, a0 + off + randRange(-3, 3) * DEG, null)),
    ].sort((a, b) => a.off - b.off); // side by side, so each is spun to the next
    // How far off its place each thread across from one strand to the next lies, and which have snapped.
    const R = d.fx.web;
    this.rings = this.strands.slice(1).map(() => R.rings.map((r) => r + randRange(-R.jitter, R.jitter)));
    this.snapped = new Set();
    this.view = new Container();
    w.layers.fx.addChild(this.view);
    this.gfx = new SilkGfx(this.view);
  }

  strand(o, heading, target) {
    const S = this.data.strand, W = this.data.web;
    return {
      rope: new Rope(this.world, o, S.points), head: { ...o }, heading, target, off: deltaAngle(this.a0, heading),
      launchAt: this.born + Math.random() * W.delay, travelled: 0, reach: W.reach * randRange(0.92, 1.04),
      weave: { amp: S.weave * randRange(0.5, 1) * randSign(), rate: randRange(9, 15), phase: Math.random() * TAU },
      whip: randSign() * randRange(0.6, 1), phase: 'wait', caught: null, haul: null, caughtAt: 0, releasedAt: null, holdUntil: 0,
      tilts: Array.from({ length: this.data.fx.wrap.loops }, () => Math.random() * Math.PI),
    };
  }

  get player() { return this.aspect.player; }

  step(dt) {
    const w = this.world, hand = this.player.body.pos;
    for (const s of this.strands) {
      if (s.phase === 'gone') continue;
      if (s.phase === 'wait') { if (w.time < s.launchAt) continue; s.phase = 'fly'; }
      if (s.phase === 'fly') this.fly(s, dt);
      else if (s.phase === 'caught') this.hold(s, dt);
      else if (s.phase === 'slack' && w.time >= s.holdUntil) {
        s.rope.length = Math.max(0, s.rope.length - this.data.strand.retract * dt);
        if (s.rope.length <= 0.05) s.phase = 'gone';
      }
      if (s.phase === 'gone') continue;
      const end = s.phase === 'fly' ? s.head : s.phase === 'caught' ? this.tie(s) : null;
      const slack = s.phase === 'slack';
      s.rope.step(hand, end, { ignore: s.caught ? new Set([s.caught]) : null, drag: slack ? 0.8 : 0.86, wave: slack ? { amp: this.data.strand.whip * s.whip, at: w.time * 26 } : null });
    }
    if (this.strands.every((s) => s.phase === 'gone')) this.destroy();
  }

  // Flying: on along its heading (turning for its target, if it has one), weaving as it goes,
  // slowing toward its reach; its head catching whatever it touches, or stopped by a wall.
  fly(s, dt) {
    const w = this.world, S = this.data.strand, age = w.time - s.launchAt;
    if (s.target && alive(s.target)) {
      const to = s.target.body.pos, want = Math.atan2(to.y - s.head.y, to.x - s.head.x), turn = S.turn * dt;
      s.heading += clamp(deltaAngle(s.heading, want), -turn, turn);
    }
    const k = clamp01(s.travelled / s.reach), fade = 1 - k;
    const dir = s.heading + s.weave.amp * fade * Math.sin(age * s.weave.rate + s.weave.phase);
    const step = S.speed * lerp(1, S.slow, k) * dt, prev = { ...s.head };
    s.head.x += Math.cos(dir) * step;
    s.head.y += Math.sin(dir) * step;
    s.travelled += step;
    s.rope.length = s.travelled * 0.96;
    for (const t of targets(w)) {
      if (this.struck.has(t) || !hurtBySegment(t, prev.x, prev.y, s.head.x, s.head.y, S.head)) continue;
      // A Weaver's thread is flown on through (cut, if the web does damage); anything else is caught.
      if (t.isThread) { this.struck.add(t); if (this.data.web.damage > 0) t.takeDamage(this.data.web.damage, s.head, this.player.body.pos, this.data.id); continue; }
      this.catch(s, t);
      return;
    }
    if (w.physics.circleHitsWall(s.head.x, s.head.y, 0.05)) {
      s.head = prev;
      this.slacken(s, S.hold);
      return;
    }
    if (s.travelled >= s.reach) this.slacken(s, 0.03);
  }

  // Caught: struck (if the web does damage), stunned, wound round, and hauled in (unless the blow
  // killed it).
  catch(s, t) {
    const w = this.world, d = this.data, o = this.player.body.pos;
    this.struck.add(t);
    s.caught = t;
    s.caughtAt = w.time;
    s.phase = 'caught';
    const hit = t.closestPoint(o);
    this.aspect.bind(t, d.web.damage, d.web.stun, hit, o);
    w.effects.burst(hit.x, hit.y, Math.atan2(o.y - hit.y, o.x - hit.x), d.fx.catch.sparks);
    w.sound('moonsilkCatch', hit, { volume: 0.7 });
    s.haul = new Haul(w, t, d.web);
  }

  // Hauling in, taut, until it's in; then let go.
  hold(s, dt) {
    const t = s.caught;
    if (!alive(t)) { this.slacken(s, 0); return; }
    if (this.world.time - s.caughtAt >= this.data.fx.wrap.time * 0.5) s.haul.step(dt);
    s.rope.length = Math.min(s.rope.length, dist(this.player.body.pos, this.tie(s)));
    if (s.haul.done) this.slacken(s, 0.05);
  }

  slacken(s, hold) {
    s.haul?.finish();
    if (s.caught) s.releasedAt = this.world.time;
    s.phase = 'slack';
    s.holdUntil = this.world.time + hold;
  }

  // Where its rope is tied on what it caught: the side facing the player.
  tie(s, at = null) {
    const t = s.caught, c = at ?? t.body.pos, h = this.player.body.pos, r = t.body.radius + this.data.fx.wrap.pad;
    const dx = h.x - c.x, dy = h.y - c.y, l = Math.hypot(dx, dy) || 1;
    return { x: c.x + (dx / l) * r, y: c.y + (dy / l) * r };
  }

  render(alpha) {
    const w = this.world, F = this.data.fx, g = this.gfx, now = w.time - (1 - alpha) * FIXED_DT;
    g.clear();
    const hand = this.player.body.lerpPos(alpha), look = F;
    const lines = [];
    for (const s of this.strands) {
      if (s.phase === 'gone' || s.phase === 'wait') { lines.push(null); continue; }
      const fade = s.phase === 'slack' ? clamp01(s.rope.length / 1.5) : 1;
      // Its windings round what it caught, then the rope from the hand to them.
      let end = null;
      if (s.caught && !s.caught.dead) {
        const c = s.caught.body.lerpPos(alpha), r = s.caught.body.radius + F.wrap.pad;
        const wound = easeOut(clamp01((now - s.caughtAt) / F.wrap.time));
        const loose = s.releasedAt === null ? 0 : clamp01((now - s.releasedAt) / F.loose);
        const from = Math.atan2(hand.y - c.y, hand.x - c.x);
        if (loose < 1) g.thread(windings(c, r, from, F.wrap.loops, wound, s.tilts, loose), 1 - loose, look);
        if (s.phase === 'caught') end = { x: c.x + Math.cos(from) * r, y: c.y + Math.sin(from) * r };
      }
      const curve = s.rope.curve(alpha, hand, end);
      g.thread(curve, fade, look);
      lines.push({ curve, lens: lengths(curve), fade });
    }
    // Threads across from each strand to the next, once both have paid out far enough,
    // sagging toward the hand; stretched too far apart, one snaps for good.
    const R = F.web, ring = { ...look, width: look.width * R.width };
    for (let i = 0; i < lines.length - 1; i++) {
      const A = lines[i], B = lines[i + 1];
      if (!A || !B) continue;
      this.rings[i].forEach((r, k) => {
        const key = i * 64 + k;
        if (this.snapped.has(key) || A.lens.at(-1) < r || B.lens.at(-1) < r) return;
        const a = pointAlong(A.curve, A.lens, r), b = pointAlong(B.curve, B.lens, r), span = dist(a, b);
        if (span > R.span) { this.snapped.add(key); return; }
        g.thread(sagging(a, b, hand, R.sag), Math.min(A.fade, B.fade) * R.alpha * (1 - (span / R.span) ** 4), ring);
      });
    }
  }

  dispose() {
    for (const s of this.strands) s.haul?.finish();
    this.view.destroy({ children: true });
  }
}

// The lasso: a loop twirled round the player and thrown at the enemy parried, bowing out as it
// flies; it drops over it, cinches tight, and reels it in, then slips off as the rope's drawn back.
class MoonsilkLasso extends Entity {
  constructor(aspect, target) {
    const w = aspect.world, d = aspect.data, R = d.reel;
    super(w);
    this.aspect = aspect;
    this.data = d;
    this.target = target;
    this.born = w.time;
    const o = aspect.player.body.pos, to = target.body.pos;
    this.side = randSign(); // which way it twirls (and so bows)
    this.aimAt = Math.atan2(to.y - o.y, to.x - o.x);
    this.phase = 'twirl';
    this.loopR = Math.max(R.loop, target.body.radius + 0.3);
    this.loop = { x: o.x, y: o.y, r: this.loopR * 0.5 }; // the loop's middle and radius
    this.prevLoop = { ...this.loop };
    this.spin = Math.random() * TAU;
    this.prevSpin = this.spin;
    this.fly = null; // { from, u, len }
    this.hookedAt = 0;
    this.strikeAt = null; // when its blow lands: reel.strikeDelay into the pull
    this.haul = null;
    this.releasedAt = null;
    this.rope = new Rope(w, o, R.points);
    this.view = new Container();
    w.layers.fx.addChild(this.view);
    this.gfx = new SilkGfx(this.view);
  }

  get player() { return this.aspect.player; }

  step(dt) {
    const w = this.world, R = this.data.reel, e = this.target, hand = this.player.body.pos, age = w.time - this.born;
    this.prevLoop = { ...this.loop };
    this.prevSpin = this.spin;
    this.spin += this.side * (this.phase === 'twirl' ? 34 : 14) * dt;
    if (this.phase !== 'release' && (!alive(e) || this.player.dead)) this.release();
    if (this.strikeAt !== null && w.time >= this.strikeAt) {
      this.strikeAt = null;
      this.aspect.strike(e, R.damage, e.closestPoint(hand), hand);
    }
    switch (this.phase) {
      case 'twirl': {
        // Round the player once, coming round to face the target as it's let go.
        const k = clamp01(age / R.twirlTime), a = this.aimAt - this.side * (1 - k) * TAU;
        const r = lerp(0.3, R.twirlRadius, easeOut(k));
        Object.assign(this.loop, { x: hand.x + Math.cos(a) * r, y: hand.y + Math.sin(a) * r, r: this.loopR * lerp(0.5, 1, k) });
        this.rope.length = r + this.loop.r;
        if (k >= 1) {
          this.fly = { from: { x: this.loop.x, y: this.loop.y }, u: 0 };
          this.phase = 'fly';
        }
        break;
      }
      case 'fly': {
        // Bowing out to the twirl's side on its way, homing on where the target is now.
        const f = this.fly, to = e.body.pos, len = Math.max(0.5, dist(f.from, to));
        f.u = Math.min(1, f.u + (R.shootSpeed * dt) / len);
        const mx = (f.from.x + to.x) / 2, my = (f.from.y + to.y) / 2, nx = -(to.y - f.from.y) / len, ny = (to.x - f.from.x) / len;
        const c = { x: mx + nx * len * R.bow * this.side, y: my + ny * len * R.bow * this.side }, u = f.u, v = 1 - u;
        this.loop.x = v * v * f.from.x + 2 * u * v * c.x + u * u * to.x;
        this.loop.y = v * v * f.from.y + 2 * u * v * c.y + u * u * to.y;
        this.rope.length = dist(hand, this.loop) * 1.08 + 0.4;
        if (f.u >= 1) this.hook();
        break;
      }
      case 'cinch': case 'haul': {
        Object.assign(this.loop, { x: e.body.pos.x, y: e.body.pos.y });
        const k = clamp01((w.time - this.hookedAt) / R.cinchTime);
        this.loop.r = lerp(this.loopR, e.body.radius + this.data.fx.wrap.pad, easeOut(k));
        if (this.phase === 'cinch' && k >= 1) this.phase = 'haul';
        if (this.phase === 'haul') {
          this.haul.step(dt);
          if (this.haul.done) { this.land(); break; }
        }
        this.rope.length = Math.min(this.rope.length, dist(hand, this.knot()));
        break;
      }
      case 'release':
        this.loop.r += dt * 2.5;
        this.rope.length = Math.max(0, this.rope.length - this.data.strand.retract * dt);
        if (this.rope.length <= 0.05 && this.strikeAt === null) { this.destroy(); return; }
        break;
    }
    const tied = this.phase !== 'release';
    this.rope.step(hand, tied ? this.knot() : null, { ignore: new Set([e]), drag: tied ? 0.86 : 0.8 });
  }

  // Where the rope meets the loop: its side nearest the player.
  knot(loop = this.loop, hand = this.player.body.pos) {
    const dx = hand.x - loop.x, dy = hand.y - loop.y, l = Math.hypot(dx, dy) || 1;
    return { x: loop.x + (dx / l) * loop.r, y: loop.y + (dy / l) * loop.r };
  }

  // Dropped over it: stunned, in a white flash, and cinched; its blow lands reel.strikeDelay after
  // the pull starts (once it's cinched).
  hook() {
    const w = this.world, d = this.data, R = d.reel, H = d.fx.reel.hook, e = this.target, from = this.player.body.pos;
    this.phase = 'cinch';
    this.hookedAt = w.time;
    const hit = e.closestPoint(from), angle = Math.atan2(from.y - hit.y, from.x - hit.x), c = e.body.pos;
    this.aspect.bind(e, 0, R.stun, hit, from);
    this.strikeAt = w.time + R.cinchTime + R.strikeDelay;
    const fx = w.deathFx;
    fx.flare(tex.mist, c.x, c.y, 0, { time: H.flash.time, w0: H.flash.size, h0: H.flash.size, w1: H.flash.size * H.flash.grow, h1: H.flash.size * H.flash.grow, alpha: H.flash.alpha, color0: SILK });
    fx.flare(tex.glint, c.x, c.y, Math.random() * TAU, { time: H.star.time, w0: H.star.size, h0: H.star.size, w1: 0, h1: 0, color0: SILK });
    fx.scatter(fx.stars, H.glints, c.x, c.y, 0.3, SILK, { fade: SILK });
    w.effects.burst(hit.x, hit.y, angle, H.sparks);
    w.sound('moonsilkHook', hit);
    this.haul = new Haul(w, e, R);
  }

  // Reeled in: a few glints where it fetches up, and the lasso slips off.
  land() {
    const e = this.target, p = e.body.pos, fx = this.world.deathFx;
    if (alive(e)) fx.scatter(fx.stars, this.data.fx.reel.land.glints, p.x, p.y, 0.3, SILK, { fade: SILK });
    this.release();
  }

  release() {
    if (this.phase === 'release') return;
    this.haul?.finish();
    this.phase = 'release';
    this.releasedAt = this.world.time;
  }

  render(alpha) {
    const w = this.world, F = this.data.fx, RF = F.reel, g = this.gfx, now = w.time - (1 - alpha) * FIXED_DT;
    g.clear();
    const hand = this.player.body.lerpPos(alpha);
    const loop = {
      x: lerp(this.prevLoop.x, this.loop.x, alpha), y: lerp(this.prevLoop.y, this.loop.y, alpha), r: lerp(this.prevLoop.r, this.loop.r, alpha),
    };
    // Dropped over it, it goes where the enemy's drawn (it's hauled after the loop's placed).
    if ((this.phase === 'cinch' || this.phase === 'haul') && !this.target.dead) Object.assign(loop, this.target.body.lerpPos(alpha));
    const spin = lerp(this.prevSpin, this.spin, alpha), look = RF;
    const loose = this.releasedAt === null ? 0 : clamp01((now - this.releasedAt) / F.loose);
    const fade = this.phase === 'release' ? Math.min(1 - loose, clamp01(this.rope.length / 1.5) + (1 - loose) * 0.5) : 1;
    // The loop: spinning and tipped as it twirls and flies (wobbling as it goes), lying flat
    // round the enemy once it's dropped over it.
    const flying = this.phase === 'twirl' || this.phase === 'fly';
    const tip = flying ? RF.tip : 1, wob = flying ? RF.wobble : 0.02, from = Math.atan2(hand.y - loop.y, hand.x - loop.x);
    const pts = [];
    for (let i = 0; i <= 48; i++) {
      const a = from + (i / 48) * TAU, rr = loop.r * (1 + wob * Math.sin(3 * a + spin * 2));
      const x = Math.cos(a - spin) * rr, y = Math.sin(a - spin) * rr * tip;
      pts.push({ x: loop.x + x * Math.cos(spin) - y * Math.sin(spin), y: loop.y + x * Math.sin(spin) + y * Math.cos(spin) });
    }
    if (loose < 1) g.thread(pts, fade, look);
    const knot = pts[0];
    // The rope from the hand to the knot, and the knot.
    const tied = this.phase !== 'release';
    g.thread(this.rope.curve(alpha, hand, tied ? knot : null), fade, look);
    if (tied) g.dot(knot, RF.knot, fade);
    // Hauling: glints running down the rope to the player.
    if (this.phase === 'haul' || this.phase === 'cinch') {
      const line = this.rope.curve(alpha, hand, knot, 1), lens = [0];
      for (let i = 1; i < line.length; i++) lens.push(lens[i - 1] + dist(line[i - 1], line[i]));
      const total = lens[lens.length - 1], G = RF.glints, shift = ((now - this.hookedAt) * G.speed) % G.spacing;
      for (let s = total - shift, j = line.length - 1; s > 0.3; s -= G.spacing) {
        while (j > 1 && lens[j - 1] > s) j--;
        const k = clamp01((s - lens[j - 1]) / (lens[j] - lens[j - 1] || 1));
        g.glint({ x: lerp(line[j - 1].x, line[j].x, k), y: lerp(line[j - 1].y, line[j].y, k) }, G.size * (0.6 + 0.4 * (s / total)), 0.85, spin + s);
      }
    }
  }

  dispose() {
    this.haul?.finish();
    this.view.destroy({ children: true });
  }
}
