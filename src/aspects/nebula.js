// Nebula: every parry bursts a cloud of space dust out ahead of the player, along the parry,
// striking everything it touches. The cloud hangs there a while, one colour (blue, green or
// purple, picked as it bursts), see-through and slowly churning. The slot key calls them all
// home: each cloud swirls in on itself into a few white stars, and they streak back to the
// player on long smooth trails, striking everything they pass for twice the burst's damage.
import { Container, Sprite } from 'pixi.js';
import { Aspect } from './aspect.js';
import { Entity } from '../game/entity.js';
import { FIXED_DT } from '../data/config.js';
import { clamp, clamp01, deltaAngle, lerp, lerpColor, randRange, TAU } from '../engine/math.js';
import { tex } from '../render/assets.js';
import { Plume, Strand } from '../render/fx.js';
import { RING_RADIUS } from '../render/sprites/combat.js';
import { hurtByCircle, hurtBySegment } from '../game/hurtbox.js';

const pick = ([min, max]) => randRange(min, max);
const easeOut = (t) => 1 - (1 - t) ** 3;
const easeOutQuart = (t) => 1 - (1 - t) ** 4;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const alive = (t) => !t.dead && !t.dying;
const targets = (w) => [...w.enemies, ...w.props].filter(alive);
// Where a trail's tail starts along the ribbon texture (which fades in from nothing at 0), so
// it stays a line all the way back rather than thinning to a comet's tail.
const TRAIL_U = 0.3;

// 0xRRGGBB from hue (degrees), saturation and lightness (0-1).
function hsl(h, s, l) {
  const f = (n) => {
    const k = (n + (((h % 360) + 360) % 360) / 30) % 12, a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return (f(0) << 16) | (f(8) << 8) | f(4);
}

// A cloud's colours: a vivid one of any hue, its neighbours either side (`shift` degrees round
// the wheel) and a light one, so it's one colour that still shifts a little within, never dark.
// Thin as it is over a dark floor, a warm one would read as olive or brown, so the nearer its
// hue is to C.warm.hue (within C.warm.width degrees) the thicker it's drawn, up to 1 + C.warm.boost.
function paletteFor(C) {
  const h = Math.random() * 360, s = pick(C.saturation), l = pick(C.lightness), W = C.warm;
  const off = Math.abs(((h - W.hue + 540) % 360) - 180);
  return {
    density: 1 + W.boost * Math.max(0, 1 - off / W.width),
    color: hsl(h, s, l),
    light: hsl(h, s, C.light),
    shades: [hsl(h - C.shift, s, l), hsl(h + C.shift, s, l), hsl(h, s, C.light)],
  };
}

export class NebulaAspect extends Aspect {
  constructor(player, data) {
    super(player, data);
    this.clouds = [];
    // Dust twinkling in the clouds and flung out as they burst; it outlives the cloud it came from.
    this.specks = new Plume(player.world.layers.fx, tex.glint, { drag: 1.2 });
  }

  get resting() { return this.clouds.filter((c) => !c.dead && !c.gathering); }
  get available() { return this.resting.length > 0; }
  get counter() { const n = this.resting.length; return n > 0 ? n : null; }

  onParry() {
    const p = this.player, f = p.parryFacing, d = this.data;
    const at = { x: p.body.pos.x + f.x * d.reach, y: p.body.pos.y + f.y * d.reach };
    const from = { x: p.body.pos.x + f.x * d.fx.burst.from, y: p.body.pos.y + f.y * d.fx.burst.from };
    this.clouds.push(this.world.add(new NebulaCloud(this, at, from)));
    this.world.sound('nebulaBurst', at);
    this.used();
  }

  tryActivate() {
    const clouds = this.resting;
    if (clouds.length === 0) return false;
    for (const c of clouds) c.gather();
    this.world.sound('nebulaGather', this.player.body.pos);
    return true;
  }

  step() { this.clouds = this.clouds.filter((c) => !c.dead); }
  render(_alpha, dt) { this.specks.update(dt); }

  dispose() {
    this.specks.destroy();
    this.clouds = [];
  }
}

// A cloud of dust: blasted out of the parry, billowing forward into a cloud round `at` and
// striking everything it covers as it bursts, then hanging there churning until it fades or is
// gathered into stars.
class NebulaCloud extends Entity {
  constructor(aspect, at, from) {
    const w = aspect.world, d = aspect.data, F = d.fx;
    super(w);
    this.aspect = aspect;
    this.data = d;
    this.at = at;
    this.from = from;
    this.born = w.time;
    this.burst = false;
    this.gathering = false;
    this.gatherAt = 0;
    this.palette = paletteFor(F.colors);

    // On the floor, under the bodies, so it hides none of them.
    this.view = new Container();
    w.layers.telegraphs.addChild(this.view);
    const R = d.radius, P = F.puffs, G = F.glow, B = F.burst;
    const puff = (size, alpha, spread, add) => {
      const s = new Sprite({ texture: tex.mist, anchor: 0.5 });
      if (add) s.blendMode = 'add';
      s.visible = false;
      this.view.addChild(s);
      const r = R * spread * Math.sqrt(Math.random()), a = Math.random() * TAU;
      return {
        s, add, r, a, size: pick(size), alpha: pick(alpha), rot: Math.random() * TAU, turn: randRange(-0.6, 0.6),
        drift: randRange(-P.drift, P.drift), breathe: pick(P.breathe), phase: Math.random() * TAU, rate: randRange(0.4, 1.1),
        tint: lerpColor(this.palette.color, this.palette.shades[Math.floor(Math.random() * 3)], Math.random() * 0.6),
        // Its flight out of the parry: when it sets off, how long it takes, how far it bows aside.
        delay: pick(B.delay), time: pick(B.time), bow: randRange(-B.bow, B.bow), jx: randRange(-0.15, 0.15), jy: randRange(-0.15, 0.15),
      };
    };
    this.puffs = [
      ...Array.from({ length: P.count }, () => puff(P.size, P.alpha, P.spread, false)),
      ...Array.from({ length: G.count }, () => puff(G.size, G.alpha, P.spread * 0.7, true)),
    ];
  }

  get age() { return this.world.time - this.born; }

  step() {
    const w = this.world, d = this.data;
    if (!this.burst) this.strike();
    if (this.gathering) {
      if (w.time - this.gatherAt >= d.gather.time) this.destroy();
    } else if (this.age >= d.lifetime) this.destroy();
  }

  // Bursting: everything it touches is struck and knocked away from the middle.
  strike() {
    this.burst = true;
    const d = this.data, w = this.world, F = d.fx, B = F.burst, c = this.at, R = d.radius, pal = this.palette;
    const damage = d.burst.damage * w.adrenaline.damageMultiplier;
    for (const t of targets(w)) {
      if (!hurtByCircle(t, c.x, c.y, R)) continue;
      t.takeDamage(damage, t.closestPoint(c), c, d.id);
      if (alive(t) && !t.isProp) t.applyKnockback(d.burst.enemyKnockbackForce, c);
      const p = t.body.pos;
      w.effects.burst(p.x, p.y, Math.atan2(p.y - c.y, p.x - c.x), { ...B.hit.sparks, color: pal.light });
    }
    const fx = w.deathFx, Fl = B.flash, ring = R / RING_RADIUS, o = this.from, dir = Math.atan2(c.y - o.y, c.x - o.x);
    fx.flare(tex.mist, o.x, o.y, Math.random() * TAU, { time: Fl.time, w0: Fl.size, h0: Fl.size, w1: Fl.size * Fl.grow, h1: Fl.size * Fl.grow, alpha: Fl.alpha, color0: 0xffffff, color1: pal.color });
    fx.flare(tex.ring, c.x, c.y, 0, { delay: B.ring.delay, time: B.ring.time, w0: ring * 0.2, h0: ring * 0.2, w1: ring, h1: ring, alpha: B.ring.alpha, color0: pal.light, color1: pal.color });
    w.effects.burst(o.x, o.y, dir, { ...B.sparks, color: pal.light });
    const Sp = B.specks;
    for (let i = 0; i < Sp.count; i++) {
      const a = dir + randRange(-1, 1) * Sp.spreadDeg * (Math.PI / 180), v = pick(Sp.speed);
      this.aspect.specks.spawn({ x: o.x, y: o.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, size: pick(Sp.size), life: pick(Sp.life), color: pal.light, fade: pal.color, alpha: F.specks.alpha });
    }
    w.camera.shakeAtLeast(B.shake);
    w.blastWall(c.x, c.y, R);
  }

  // Swirls in on itself into its stars, which fly home once it's gone.
  gather() {
    if (this.gathering || this.dead) return;
    const w = this.world, d = this.data, R = d.radius, n = d.stars;
    this.gathering = true;
    this.gatherAt = w.time;
    // Where each puff stands now: it swirls in from there.
    const now = w.time;
    for (const p of this.puffs) p.from = this.puffAt(p, now);
    const turn = Math.random() * TAU, side = Math.random() < 0.5 ? -1 : 1;
    this.stars = Array.from({ length: n }, (_, i) => {
      const a = turn + ((i + randRange(-0.15, 0.15)) / n) * TAU, r = R * randRange(0.2, 0.4);
      const at = { x: this.at.x + Math.cos(a) * r, y: this.at.y + Math.sin(a) * r };
      return w.add(new NebulaStar(this.aspect, at, this.palette, w.time + d.gather.time, (i % 2 ? -1 : 1) * side));
    });
    for (const p of this.puffs) {
      const from = p.from;
      p.star = this.stars.reduce((best, s) => (Math.hypot(s.at.x - from.x, s.at.y - from.y) < Math.hypot(best.at.x - from.x, best.at.y - from.y) ? s : best));
    }
  }

  // How far a puff is through its flight out of the parry at time `t`, 0-1, eased to settle.
  flown(p, t) { return easeOutQuart(clamp01((t - this.born - p.delay) / p.time)); }

  // Where a puff lies at time `t`: blown out of the parry on a slight bow to its place in the
  // cloud, then turning slowly round its middle.
  puffAt(p, t) {
    const e = t - this.born, k = this.flown(p, t), o = this.from;
    const r = p.r * (1 + 0.04 * Math.sin(e * p.rate + p.phase)), a = p.a + p.drift * e;
    const x = this.at.x + Math.cos(a) * r, y = this.at.y + Math.sin(a) * r;
    const sx = o.x + p.jx, sy = o.y + p.jy, dx = x - sx, dy = y - sy, bow = Math.sin(Math.PI * k) * p.bow;
    return { x: lerp(sx, x, k) - dy * bow, y: lerp(sy, y, k) + dx * bow };
  }

  render(alpha, dt) {
    const w = this.world, d = this.data, F = d.fx, B = F.burst, pal = this.palette;
    const now = w.time - (1 - alpha) * FIXED_DT, e = now - this.born;
    const settled = e >= B.time[1] + B.delay[1];
    const fade = clamp01((d.lifetime - e) / F.fadeTime);
    const g = this.gathering ? clamp01((now - this.gatherAt) / d.gather.time) : 0, gi = easeInOut(g);
    for (const p of this.puffs) {
      p.rot += p.turn * dt;
      const s = p.s;
      // Billowing out as it flies, bright at first and cooling into its colour.
      const k = this.flown(p, now), glare = 1 + B.glare * (1 - k) ** 2;
      let pos, size = p.size * lerp(B.size, 1, easeOut(k)) * (1 + p.breathe * 0.25 * Math.sin(e * p.rate * 1.7 + p.phase));
      let a = p.alpha * this.palette.density * fade * glare * clamp01((e - p.delay) / 0.05), tint = lerpColor(pal.light, p.tint, k);
      if (this.gathering) {
        // Drawn in on its star as it sets off, following it, turning round it as it goes,
        // shrinking and whitening into it.
        const c = p.star.headAt(alpha), ox = p.from.x - p.star.at.x, oy = p.from.y - p.star.at.y, turn = F.swirl * gi * p.star.side;
        const cos = Math.cos(turn), sin = Math.sin(turn), m = 1 - gi;
        pos = { x: c.x + (ox * cos - oy * sin) * m, y: c.y + (ox * sin + oy * cos) * m };
        size *= lerp(1, 0.12, gi);
        a = p.alpha * this.palette.density * fade * lerp(1, 2.2, gi) * (1 - g ** 4);
        tint = lerpColor(tint, 0xffffff, gi);
      } else pos = this.puffAt(p, now);
      s.visible = a > 0.003;
      if (!s.visible) continue;
      s.position.set(pos.x, pos.y);
      s.width = s.height = size;
      s.rotation = p.rot;
      s.alpha = Math.min(1, a);
      s.tint = tint;
    }
    // Dust twinkling inside it while it hangs there.
    if (!this.gathering && settled && fade > 0.3) {
      const S = F.specks, R = d.radius * F.puffs.spread;
      for (let i = Math.floor(S.rate * dt + Math.random()); i > 0; i--) {
        const r = R * Math.sqrt(Math.random()), a = Math.random() * TAU, v = pick(S.speed), va = Math.random() * TAU;
        this.aspect.specks.spawn({
          x: this.at.x + Math.cos(a) * r, y: this.at.y + Math.sin(a) * r, vx: Math.cos(va) * v, vy: Math.sin(va) * v,
          size: pick(S.size), life: pick(S.life), color: Math.random() < 0.5 ? 0xffffff : pal.light, fade: pal.color, alpha: S.alpha * fade,
        });
      }
    }
  }

  dispose() { this.view.destroy({ children: true }); }
}

// A star gathered out of a cloud: it sets off for the player the moment the cloud starts drawing
// in, forming out of the dust as it goes (fully by formedAt): straight at them, slow at first and
// speeding up ever faster, turning after them as they move at no more than
// its turn rate (which climbs the longer it flies, so it always gets there). Its trail is the
// way it actually came, its last trailTime of flight; once it's home the tail drains into them.
class NebulaStar extends Entity {
  constructor(aspect, at, palette, formedAt, side) {
    const w = aspect.world, d = aspect.data, F = d.fx;
    super(w);
    this.aspect = aspect;
    this.data = d;
    this.at = at;
    this.palette = palette;
    this.side = side; // which way its cloud swirls into it
    this.born = w.time;
    this.formedAt = formedAt;
    this.launchAt = 0;
    this.flying = false;
    this.pos = { ...at };
    this.prev = { ...at };
    this.heading = 0;
    this.trail = []; // { x, y, t }: where it was each step, newest last
    this.struck = new Set();
    this.arrivedAt = null;

    this.view = new Container();
    w.layers.fx.addChild(this.view);
    this.layers = F.layers.map((L) => ({ ...L, strand: new Strand(this.view, F.points, TRAIL_U, 1, lerpColor(palette.color, 0xffffff, L.white)) }));
    const sprite = (texture, tint) => {
      const s = new Sprite({ texture, anchor: 0.5 });
      s.blendMode = 'add';
      s.tint = tint;
      this.view.addChild(s);
      return s;
    };
    this.glow = sprite(tex.mist, palette.light);
    this.core = sprite(tex.glint, 0xffffff);
    this.spin = Math.random() * TAU;
  }

  get player() { return this.aspect.player; }
  get arrived() { return this.arrivedAt !== null; }

  // Where it's drawn at render `alpha` (the dust gathering into it follows this).
  headAt(alpha) {
    if (this.arrived) return this.player.body.lerpPos(alpha);
    return { x: lerp(this.prev.x, this.pos.x, alpha), y: lerp(this.prev.y, this.pos.y, alpha) };
  }

  step(dt) {
    const w = this.world, S = this.data.star, to = this.player.body.pos;
    if (!this.flying) {
      this.flying = true;
      this.launchAt = w.time - dt;
      this.heading = Math.atan2(to.y - this.pos.y, to.x - this.pos.x);
      this.trail.push({ ...this.pos, t: w.time - dt });
      w.sound('nebulaStar', this.at, { volume: 0.7 });
    }
    if (!this.arrived) {
      const age = w.time - this.launchAt, speed = Math.min(S.maxSpeed, S.speed + S.surge * age * age);
      const turn = (S.turn + S.turnGrow * age) * dt;
      this.heading += clamp(deltaAngle(this.heading, Math.atan2(to.y - this.pos.y, to.x - this.pos.x)), -turn, turn);
      this.prev = { ...this.pos };
      const step = speed * dt, left = Math.hypot(to.x - this.pos.x, to.y - this.pos.y);
      if (left <= step + this.player.body.radius || age >= S.maxTime) this.pos = { x: to.x, y: to.y };
      else this.pos = { x: this.pos.x + Math.cos(this.heading) * step, y: this.pos.y + Math.sin(this.heading) * step };
      this.sweep(this.prev, this.pos);
      if (this.pos.x === to.x && this.pos.y === to.y) this.arrive();
    } else this.pos = { x: to.x, y: to.y }; // home: what's left of the trail drains into them
    this.trail.push({ ...this.pos, t: w.time });
    const keep = w.time - this.data.fx.trail - 2 * dt;
    while (this.trail.length > 2 && this.trail[1].t < keep) this.trail.shift();
    if (this.arrived && w.time - this.arrivedAt > this.data.fx.trail + dt) this.destroy();
  }

  // Everything it passes over from `a` to `b` is struck, once a flight.
  sweep(a, b) {
    const w = this.world, d = this.data, S = d.star;
    let dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) return;
    dx /= len; dy /= len;
    const damage = S.damage * w.adrenaline.damageMultiplier, H = d.fx.hit;
    for (const t of targets(w)) {
      if (this.struck.has(t) || !hurtBySegment(t, a.x, a.y, b.x, b.y, S.radius)) continue;
      this.struck.add(t);
      const p = t.body.pos, src = { x: p.x - dx * (t.body.radius + 1), y: p.y - dy * (t.body.radius + 1) }; // straight back along its flight
      t.takeDamage(damage, t.closestPoint(src), src, d.id);
      if (alive(t) && !t.isProp) t.applyKnockback(S.enemyKnockbackForce, src);
      const Fl = H.flash;
      w.deathFx.flare(tex.mist, p.x, p.y, 0, { time: Fl.time, w0: Fl.size, h0: Fl.size, w1: Fl.size * Fl.grow, h1: Fl.size * Fl.grow, alpha: Fl.alpha, color0: 0xffffff, color1: this.palette.color });
      w.effects.burst(p.x, p.y, Math.atan2(dy, dx), { ...H.sparks, color: lerpColor(this.palette.light, 0xffffff, 0.5) });
      w.sound('nebulaHit', p);
    }
  }

  // It sinks into the player in a soft flash of white and its colour.
  arrive() {
    this.arrivedAt = this.world.time;
    const w = this.world, A = this.data.fx.arrive, p = this.player.body.pos, s = A.size * this.player.sizeScale;
    w.deathFx.flare(tex.mist, p.x, p.y, Math.random() * TAU, { time: A.time, w0: s, h0: s, w1: s * A.grow, h1: s * A.grow, alpha: A.alpha, color0: 0xffffff, color1: this.palette.color });
    w.deathFx.scatter(this.aspect.specks, A.glints, p.x, p.y, 0.2, 0xffffff, { fade: this.palette.light });
  }

  render(alpha, dt) {
    const w = this.world, F = this.data.fx, now = w.time - (1 - alpha) * FIXED_DT;
    this.spin += F.core.spin * dt;
    const C = F.core, G = F.starGlow;
    const place = (s, at, size, a) => {
      s.visible = a > 0.003;
      if (!s.visible) return;
      s.position.set(at.x, at.y);
      s.width = s.height = size;
      s.alpha = Math.min(1, a);
    };
    // It grows and brightens out of the dust drawing into it.
    const grown = easeOut(clamp01((now - this.born) / Math.max(1e-3, this.formedAt - this.born)));
    const head = this.headAt(alpha);
    const line = this.flying ? this.trailLine(now, head) : null;
    for (const L of this.layers) {
      const s = L.strand, n = s.n;
      s.mesh.visible = !!line;
      if (!line) continue;
      for (let i = 0; i < n; i++) {
        s.pts[2 * i] = line[2 * i];
        s.pts[2 * i + 1] = line[2 * i + 1];
        s.widths[i] = L.width * grown * lerp(0.15, 1, (i / (n - 1)) ** 0.7);
      }
      s.build();
      s.mesh.alpha = L.alpha * grown;
    }
    // The star itself at the head, until it's home; a little pulse to its light.
    const on = this.arrived ? 0 : grown;
    place(this.core, head, C.size * lerp(0.2, 1, grown) * (1 + 0.08 * Math.sin(this.spin * 3)), on);
    this.core.rotation = this.spin;
    place(this.glow, head, G.size * lerp(0.4, 1, grown), G.alpha * on);
  }

  // Its trail as `points` points evenly along the way it came, from `trail` seconds ago up to
  // `head` (x, y pairs), or null while it's too short to draw.
  trailLine(now, head) {
    const T = this.trail, cut = now - this.data.fx.trail, path = [];
    for (let i = 0; i < T.length; i++) {
      const p = T[i];
      if (p.t >= now) break;
      if (p.t < cut) {
        const q = T[i + 1];
        if (q && q.t > cut) { const k = (cut - p.t) / (q.t - p.t); path.push({ x: lerp(p.x, q.x, k), y: lerp(p.y, q.y, k) }); }
        continue;
      }
      path.push(p);
    }
    path.push(head);
    const lens = [0];
    for (let i = 1; i < path.length; i++) lens.push(lens[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
    const total = lens[lens.length - 1], n = this.data.fx.points;
    if (total < 1e-3) return null;
    const out = new Float32Array(n * 2);
    for (let i = 0, j = 1; i < n; i++) {
      const d = (total * i) / (n - 1);
      while (j < path.length - 1 && lens[j] < d) j++;
      const k = clamp01((d - lens[j - 1]) / (lens[j] - lens[j - 1] || 1));
      out[2 * i] = lerp(path[j - 1].x, path[j].x, k);
      out[2 * i + 1] = lerp(path[j - 1].y, path[j].y, k);
    }
    return out;
  }

  dispose() { this.view.destroy({ children: true }); }
}
