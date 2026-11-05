// What the Comet leaves behind (tuning in COMET). A Wake is the fire it lays on the floor as it
// runs: a fixed ring of points drawn as one mesh, each quad its own 4 vertices so a break or a
// dead stretch just collapses, its heat kept in the texture's u (comet_wake) so it can fade along
// its length without a shader. It's an entity of its own: it outlives the Comet to burst back
// along its line (burstBack), and goes with the floor like any entity. It hurts like poison:
// whenever the player touches it and hasn't been hurt lately, past any parry.
// A PathTell is the way an attack will go, shown on the floor through its wind-up.
import { Graphics, MeshSimple } from 'pixi.js';
import { ATTACK_FX as X, COMET } from '../data/config.js';
import { clamp01, lerp, lerpColor, randRange, smoothStep01, TAU } from '../engine/math.js';
import { segmentPointDistSq } from '../engine/physics.js';
import { Entity } from '../game/entity.js';
import { tex } from '../render/assets.js';
import { clearGraphics } from '../render/fx.js';
import { renderTime } from './attackView.js';

const W = COMET.wake;
const TAPER = 3; // points over which a stretch of it closes off, rather than ending flat
const newPoint = () => ({ x: 0, y: 0, nx: 0, ny: 1, at: 0, endsAt: 0, joined: false, flareAt: Infinity, sparked: true, doused: false, serial: 0 });

export class Wake extends Entity {
  constructor(world, ability) {
    super(world);
    this.sourceAbility = ability;
    this.pts = Array.from({ length: W.points }, newPoint);
    this.start = 0; // the oldest point's slot
    this.count = 0;
    this.serial = 0; // how many have ever been laid, so an attack can tell its own
    this.laidAt = -Infinity; // the last step it was laid, so a break can be told
    this.nextHurtAt = 0;
    this.sparks = 0; // sparks owed
    this.popping = null; // { queue, next, i, stride }: bursting back along the line
    const quads = W.points - 1, indices = new Uint32Array(quads * 6);
    for (let i = 0; i < quads; i++) indices.set([4 * i, 4 * i + 1, 4 * i + 2, 4 * i + 1, 4 * i + 3, 4 * i + 2], i * 6);
    this.mesh = new MeshSimple({ texture: tex.comet_wake, vertices: new Float32Array(quads * 8), uvs: new Float32Array(quads * 8), indices });
    this.mesh.blendMode = 'add';
    this.mesh.visible = false;
    this.uvs = this.mesh.geometry.getBuffer('aUV');
    world.layers.telegraphs.addChild(this.mesh);
    this.edges = new Float32Array(W.points * 5); // per point as last drawn: its two edges and its heat
    this.fromEnd = new Uint8Array(W.points); // how many points each is from the nearer end of its stretch, at most TAPER
  }

  at(i) { return this.pts[(this.start + i) % W.points]; }

  // Called each step it runs fast: a point once it's come `spacing` on, overwriting the oldest
  // if it must.
  lay(x, y) {
    const now = this.world.time, last = this.count ? this.at(this.count - 1) : null;
    const joined = !!last && now - this.laidAt < 0.05;
    this.laidAt = now;
    let tx = 0, ty = 0;
    if (joined) {
      tx = x - last.x;
      ty = y - last.y;
      const l = Math.hypot(tx, ty);
      if (l < W.spacing) return;
      tx /= l;
      ty /= l;
      // Mitred with the stretch before it.
      const mx = (last.joined ? last.nx : 0) - ty, my = (last.joined ? last.ny : 0) + tx, m = Math.hypot(mx, my) || 1;
      last.nx = mx / m;
      last.ny = my / m;
    }
    const p = this.pts[(this.start + this.count) % W.points];
    if (this.count === W.points) this.start = (this.start + 1) % W.points;
    else this.count++;
    p.x = x;
    p.y = y;
    p.nx = -ty;
    p.ny = tx;
    p.at = now;
    p.endsAt = now + W.life;
    p.joined = joined;
    p.flareAt = Infinity;
    p.sparked = true;
    p.doused = false;
    p.serial = ++this.serial;
  }

  // Everything laid since `serial` flares, running back along it from its newest, for a while
  // burning wider and harder, and lasting at least that long.
  flare(serial) {
    const now = this.world.time, F = W.flare, n = Math.max(1, this.serial - serial);
    for (let i = 0; i < this.count; i++) {
      const p = this.at(i);
      if (p.serial <= serial || p.doused) continue;
      p.flareAt = now + F.sweep * ((this.serial - p.serial) / n);
      p.sparked = false;
      p.endsAt = Math.max(p.endsAt, p.flareAt + F.time + W.fade);
    }
  }

  // Parried: all of it dies at once, doing no more harm.
  gutter() {
    const now = this.world.time, G = W.gutter, fx = this.world.effects;
    let any = false;
    for (let i = 0; i < this.count; i++) {
      const p = this.at(i);
      if (p.doused || now >= p.endsAt) continue;
      any = true;
      p.doused = true;
      p.flareAt = Infinity;
      p.endsAt = now + G.time * randRange(0.4, 1);
      if (i % 2 === 0) fx.burst(p.x, p.y, -Math.PI / 2, G.sparks);
    }
    if (any) this.world.sound('cometGutter', this.at(this.count - 1));
  }

  // Its Comet dead: `tail` (points, from its head back) and then the wake, newest first, burst
  // one after another. None of it hurts from now on.
  burstBack(tail) {
    const P = W.pops, steps = tail.length + this.count;
    this.popping = { queue: tail, next: this.world.time, i: this.count - 1, stride: Math.max(1, Math.ceil((steps * P.every) / P.total)), done: 0 };
  }

  pop(x, y) {
    const P = W.pops, w = this.world, F = P.flash, k = this.popping.done++;
    w.effects.burst(x, y, Math.random() * TAU, P.sparks);
    w.deathFx.flare(tex.mist, x, y, 0, { time: F.time, w0: F.from, h0: F.from, w1: F.to, h1: F.to, alpha: F.alpha, color0: 0xffffff, color1: F.color, fade: 1.5 });
    const S = P.star; // a hard white star at the heart of each
    w.deathFx.flare(tex.glint, x, y, Math.random() * TAU, { time: S.time, w0: S.size, h0: S.size, w1: S.size * 0.3, h1: S.size * 0.3, color0: 0xffffff, color1: F.color });
    if (k % 3 === 0) w.sound('cometPop', { x, y }, { pitch: 1 + 0.03 * k });
  }

  stepPops() {
    const P = this.popping, now = this.world.time;
    while (now >= P.next) {
      P.next += W.pops.every;
      if (P.queue.length) {
        const q = P.queue.shift();
        this.pop(q.x, q.y);
        continue;
      }
      if (P.i < 0) return;
      const n = Math.min(this.count, P.i + 1);
      if (n > 0) {
        const p = this.at(n - 1);
        if (now < p.endsAt) this.pop(p.x, p.y);
      }
      // The stretch it stands for goes with it.
      for (let i = n - 1, end = Math.max(0, n - P.stride); i >= end; i--) {
        const p = this.at(i);
        p.doused = true;
        p.flareAt = Infinity;
        p.endsAt = Math.min(p.endsAt, now + 0.12);
      }
      P.i = n - 1 - P.stride;
    }
  }

  step() {
    const now = this.world.time, enemy = this.sourceAbility.enemy;
    while (this.count && now >= this.at(0).endsAt) {
      this.start = (this.start + 1) % W.points;
      this.count--;
      if (this.popping) this.popping.i--;
    }
    if (this.popping) {
      this.stepPops();
      if (!this.count && !this.popping.queue.length) this.destroy();
      return;
    }
    if (!enemy.dead) return;
    if (this.count) this.gutter(); // cleared away, not killed
    this.popping = { queue: [], next: Infinity, i: -1, stride: 1, done: 0 };
  }

  // Whether the point can hurt, and how far out: 0 if it can't.
  reach(p, now) {
    if (p.doused || now < p.at + W.armAfter) return 0;
    if (now >= p.flareAt && now < p.flareAt + W.flare.time) return W.flare.hurtRadius;
    return p.endsAt - now > W.fade * W.dying ? W.hurtRadius : 0;
  }

  // The stretch of it the circle (x, y, r) touches, if any: its later point.
  touching(x, y, r) {
    const now = this.world.time;
    for (let i = this.count - 1; i > 0; i--) {
      const b = this.at(i);
      if (!b.joined) continue;
      const a = this.at(i - 1), R = Math.max(this.reach(a, now), this.reach(b, now));
      if (R > 0 && segmentPointDistSq(a.x, a.y, b.x, b.y, x, y) <= (R + r) ** 2) return b;
    }
    return null;
  }

  afterPhysics() {
    const w = this.world, p = w.hittablePlayer, now = w.time;
    if (!p || this.popping || this.count < 2 || now < this.nextHurtAt || now < p.invincibleUntil || p.pendingHit) return;
    const { x, y } = p.body.pos, hit = this.touching(x, y, p.body.radius);
    if (!hit) return;
    const a = this.sourceAbility, D = a.data, flaring = now >= hit.flareAt && now < hit.flareAt + W.flare.time;
    this.nextHurtAt = now + W.hurtEvery;
    p.hitBy(this, a.enemy.damage * (flaring ? D.flareMultiplier : D.damageMultiplier), { x, y }, { x: hit.x, y: hit.y });
    w.effects.burst(x, y, 0, W.sear);
    w.sound('cometSear', { x, y });
  }

  // As an attack, for the player's parry: it can't be.
  worldShape() { return { type: 'group', parts: [] }; }
  overlapsCircle(x, y, r) { return !!this.touching(x, y, r); }
  overlapsCapsule() { return false; }
  closestPoint(cap) { return { x: cap.cx, y: cap.cy }; }
  parry() { return false; }

  // Each point's distance from the nearer end of its unbroken stretch.
  measure() {
    const f = this.fromEnd, n = this.count;
    for (let i = 0; i < n; i++) f[i] = this.at(i).joined && i > 0 ? Math.min(TAPER, f[i - 1] + 1) : 0;
    let run = 0;
    for (let i = n - 1; i >= 0; i--) {
      run = i < n - 1 && this.at(i + 1).joined ? Math.min(TAPER, run + 1) : 0;
      f[i] = Math.min(f[i], run);
    }
  }

  // How hot point `p` burns just now, 0…1, and how wide, into `edges[5i…]`. Its flicker runs along
  // the line (`serial`), so flames lick along it rather than each point jumping on its own.
  place(p, i, now) {
    const left = p.endsAt - now, age = now - p.at, e = this.edges, j = i * 5;
    let heat = 0, width = 0;
    if (left > 0) {
      const [f0, f1] = W.flickerSpeed, s = p.serial * W.flickerAlong;
      const wob = (a) => 0.6 * Math.sin(now * f0 + s + a) + 0.4 * Math.sin(now * f1 - s * 2.3 + 2 * a);
      const dying = clamp01(left / W.fade);
      if (p.doused) {
        heat = W.gutter.heat * clamp01(left / W.gutter.time);
        width = W.width * lerp(0.35, 0.8, heat / W.gutter.heat);
      } else {
        heat = lerp(1, W.cool, clamp01(age / W.life)) * smoothStep01(dying) * (1 + W.flicker * 0.5 * wob(1));
        width = W.width * lerp(0.5, 1, clamp01(age / 0.12)) * lerp(0.55, 1, dying);
      }
      const f = (now - p.flareAt) / W.flare.time;
      if (f >= 0 && f < 1) {
        const k = (1 - f) * Math.min(1, f * 8);
        heat = Math.max(heat, lerp(0.75, 1, k));
        width *= lerp(1, W.flare.width, k);
      }
      const end = this.fromEnd[i] / TAPER;
      heat *= end;
      width *= lerp(0.35, 1, end);
      e[j] = p.x - p.nx * width * (1 + W.flicker * wob(3));
      e[j + 1] = p.y - p.ny * width * (1 + W.flicker * wob(3));
      e[j + 2] = p.x + p.nx * width * (1 + W.flicker * wob(5));
      e[j + 3] = p.y + p.ny * width * (1 + W.flicker * wob(5));
    } else {
      e[j] = e[j + 2] = p.x;
      e[j + 1] = e[j + 3] = p.y;
    }
    e[j + 4] = clamp01(heat);
  }

  render(alpha, dt) {
    const now = renderTime(this.world, alpha), m = this.mesh, n = this.count;
    m.visible = n > 1;
    if (n <= 1) return;
    this.measure();
    for (let i = 0; i < n; i++) this.place(this.at(i), i, now);
    const v = m.vertices, u = this.uvs.data, e = this.edges;
    v.fill(0);
    u.fill(0);
    for (let i = 1; i < n; i++) {
      if (!this.at(i).joined) continue;
      const a = (i - 1) * 5, b = i * 5, q = (i - 1) * 8;
      if (e[a + 4] <= 0 && e[b + 4] <= 0) continue;
      v[q] = e[a]; v[q + 1] = e[a + 1];
      v[q + 2] = e[a + 2]; v[q + 3] = e[a + 3];
      v[q + 4] = e[b]; v[q + 5] = e[b + 1];
      v[q + 6] = e[b + 2]; v[q + 7] = e[b + 3];
      u[q] = e[a + 4]; u[q + 1] = 0;
      u[q + 2] = e[a + 4]; u[q + 3] = 1;
      u[q + 4] = e[b + 4]; u[q + 5] = 0;
      u[q + 6] = e[b + 4]; u[q + 7] = 1;
    }
    this.uvs.update();
    if (dt > 0) this.shed(dt, now);
  }

  // Sparks off it, by how much of it is alight, and a ring's as it flares.
  shed(dt, now) {
    const fx = this.world.effects, n = this.count, S = W.sparks;
    for (this.sparks += S.rate * dt * Math.min(1, n / 40); this.sparks >= 1; this.sparks--) {
      const p = this.at(Math.floor(Math.random() * n));
      if (now < p.endsAt && !p.doused) fx.burst(p.x + randRange(-0.2, 0.2), p.y + randRange(-0.2, 0.2), -Math.PI / 2, S);
    }
    for (let i = 0; i < n; i++) {
      const p = this.at(i);
      if (p.sparked || now < p.flareAt) continue;
      p.sparked = true;
      fx.burst(p.x, p.y, 0, W.flare.sparks);
    }
  }

  dispose() { this.mesh.destroy(); }
}

const U = 32; // drawn this many times larger and scaled back down, so its curves come out round

// Shows `ability.plot(alpha)`, a line of { x, y } it will run along, through its wind-up; the
// last of it stays where it was, fading, once it's off (`ability.view`).
export class PathTell {
  constructor(ability) {
    this.ability = ability;
    this.g = new Graphics();
    this.g.blendMode = 'add';
    this.g.scale.set(1 / U);
    ability.world.layers.telegraphs.addChild(this.g);
    this.path = null;
  }

  strike() {}

  render(now, alpha) {
    const a = this.ability, g = this.g, T = COMET.path;
    clearGraphics(g);
    let k = 1, show = 0;
    if (a.phase === 'windup') {
      this.path = a.plot(alpha);
      const span = Math.max(1e-3, a.phaseEndsAt - a.phaseStartedAt);
      k = clamp01((now - a.phaseStartedAt) / span);
      show = clamp01((now - a.phaseStartedAt) / 0.1) * lerp(0.6, 1, k);
    } else {
      const since = (now - a.strikeAt) / T.releaseTime;
      if (since < 0 || since >= 1) { this.path = since >= 1 ? null : this.path; return; }
      show = 1 - since;
    }
    const path = this.path;
    if (!path || path.length < 2 || show <= 0) return;
    let total = 0;
    for (let i = 1; i < path.length; i++) total += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    const line = T.line * U, color = lerpColor(X.color, X.hot, 0.25 * k);
    const trace = (to) => { // along the path as far as `to`, and where that is
      g.moveTo(path[0].x * U, path[0].y * U);
      let run = 0, end = path[0];
      for (let i = 1; i < path.length && run < to; i++) {
        const p = path[i - 1], q = path[i], l = Math.hypot(q.x - p.x, q.y - p.y), t = Math.min(1, (to - run) / (l || 1));
        end = { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
        g.lineTo(end.x * U, end.y * U);
        run += l;
      }
      return end;
    };
    trace(total);
    g.stroke({ width: line, color, alpha: T.faint * show });
    const lit = total * k * k;
    const bead = trace(lit);
    g.stroke({ width: line * T.halo, color, alpha: 0.3 * show });
    trace(lit);
    g.stroke({ width: line, color: X.hot, alpha: show });
    g.circle(bead.x * U, bead.y * U, T.bead * U).fill({ color: X.hot, alpha: show });
    // A chevron where it ends, pointing on.
    const e = path[path.length - 1], b = path[path.length - 2], dir = Math.atan2(e.y - b.y, e.x - b.x), A = T.arrow * U;
    const wing = (off) => [e.x * U + Math.cos(dir + off) * A, e.y * U + Math.sin(dir + off) * A];
    g.moveTo(...wing(Math.PI - 0.6)).lineTo(e.x * U, e.y * U).lineTo(...wing(Math.PI + 0.6));
    g.stroke({ width: line, color, alpha: show });
  }

  destroy() { this.g.destroy(); }
}
