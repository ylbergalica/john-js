// Thunderclap: strings of hits call down jagged purple thunder. Hit enemies one after
// another, each one not hit yet in the chain, and on the chainHits-th it bursts out of the
// last one hit, runs back along the chain through every enemy in it and forks off to any
// enemy near its lines, each fork reaching further, until maxTargets are struck or no more
// are in reach. Hit one enemy sameHits times in a row and it strikes that one alone, arcs
// crawling out around it into the empty air. Either way the count starts over. Until then,
// static crackles over every enemy counted so far.
// The bolts are white-hot down the middle in a wide band of purple under a soft glow, with
// thin sprouts forking off them. Once all laid down they hold still, twitch into a new shape
// once with a second thunderclap, then fade.
import { Graphics } from 'pixi.js';
import { Aspect } from './aspect.js';
import { Entity } from '../game/entity.js';
import { FIXED_DT, FX } from '../data/config.js';
import { clamp01, lerp, randRange, TAU } from '../engine/math.js';
import { anims, tex } from '../render/assets.js';
import { hurtDistance } from '../game/hurtbox.js';

const DEG = Math.PI / 180;
const U = 32; // bolts are drawn at this many units to the world unit, then scaled back down
const TAPER = 3; // pieces a sprout is drawn in, each thinner than the last
const alive = (e) => !!e && !e.dead && !e.dying;
const pick = ([min, max]) => randRange(min, max);
const side = () => (Math.random() < 0.5 ? -1 : 1);

export class ThunderAspect extends Aspect {
  constructor(player, data) {
    super(player, data);
    this.reset();
    // The static, drawn like the bolts: a glow of added light under purple lines.
    this.staticGlow = new Graphics();
    this.staticGlow.blendMode = 'add';
    this.staticLines = new Graphics();
    for (const g of [this.staticGlow, this.staticLines]) g.scale.set(1 / U);
    player.world.layers.fx.addChild(this.staticGlow, this.staticLines);
    this.crackles = new Map(); // enemy → its arcs, around its centre: [{ pts, alpha }]
    this.recrackleAt = -Infinity;
  }

  reset() {
    this.chain = []; // different enemies hit, in order: { enemy, x, y }
    this.last = null; // the enemy hit last
    this.same = 0; // hits in a row on it
    this.lastHitAt = -Infinity;
  }

  // Enemies in the chain so far: nothing until the first is hit.
  get counter() { return this.chain.length || null; }

  onEnemyDamaged(enemy) {
    const d = this.data, at = { enemy, x: enemy.body.pos.x, y: enemy.body.pos.y };
    this.same = enemy === this.last ? this.same + 1 : 1;
    this.last = enemy;
    this.lastHitAt = this.now;
    // An enemy already in the chain doesn't add to it again, nor break it.
    const known = this.chain.find((n) => n.enemy === enemy);
    if (known) Object.assign(known, at);
    else this.chain.push(at);
    // From the last enemy hit, back along the chain.
    if (this.chain.length >= d.chainHits) this.call([...this.chain].reverse());
    else if (this.same >= d.sameHits) this.call([at]);
  }

  // comboTime without a hit and the count is lost.
  step() { if (this.now - this.lastHitAt > this.data.comboTime) this.reset(); }

  call(nodes) {
    this.reset();
    this.world.add(new Thunder(this, nodes.map((n) => ({ ...n }))));
    this.used();
  }

  // Static over every enemy counted so far, its arcs laid anew every so often; more of them
  // on the enemy hit last for each hit in a row on it.
  render(alpha) {
    const S = this.data.fx.static, F = this.data.fx, now = this.now;
    const relay = now >= this.recrackleAt;
    if (relay) {
      this.recrackleAt = now + S.every;
      this.crackles.clear();
    }
    this.staticGlow.clear();
    this.staticLines.clear();
    for (const { enemy } of this.chain) {
      if (!alive(enemy)) continue;
      if (relay) {
        const n = Math.min(S.maxArcs, S.arcs + (enemy === this.last ? this.same - 1 : 0));
        this.crackles.set(enemy, Array.from({ length: n }, () => this.crackle(enemy.body.radius)));
      }
      const c = enemy.body.lerpPos(alpha);
      for (const arc of this.crackles.get(enemy) ?? []) {
        const pts = arc.pts.map((p) => ({ x: c.x + p.x, y: c.y + p.y }));
        stroke(this.staticGlow, pts, S.glowWidth, F.glow, S.glowAlpha * arc.alpha);
        stroke(this.staticLines, pts, S.width, F.color, arc.alpha);
      }
    }
  }

  // One little arc of static hugging an outline of radius `r`, around its centre.
  crackle(r) {
    const S = this.data.fx.static, a = Math.random() * TAU, b = a + side() * pick(S.turnDeg) * DEG;
    const p = { x: Math.cos(a) * r * pick(S.from), y: Math.sin(a) * r * pick(S.from) };
    const q = { x: Math.cos(b) * r * pick(S.to), y: Math.sin(b) * r * pick(S.to) };
    return { pts: place(jagged(Math.hypot(q.x - p.x, q.y - p.y), S.step, S.rough), p, q), alpha: pick(S.alpha) };
  }

  dispose() {
    this.reset();
    this.staticGlow.destroy();
    this.staticLines.destroy();
  }
}

// One clap of thunder: a tree of bolts, each running from an anchor to an anchor. An anchor is
// a node (an enemy, or where it was last seen once it's gone: { enemy, x, y }) or a point
// partway along another bolt ({ bolt, t }); an arc's far end is an offset from its start
// ({ dx, dy }). Bolts come after the bolts they fork off. Each bolt is laid down where things
// are as it sets off and never moves after; once all are out the clap twitches into a new
// shape once, over the same points, then holds and fades out together.
class Thunder extends Entity {
  constructor(aspect, nodes) {
    const world = aspect.world;
    super(world);
    this.data = aspect.data;
    this.born = world.time;
    this.origin = nodes[0];
    this.bolts = [];
    this.struck = new Set(); // enemies hit
    this.cut = new Set(); // props hit
    this.strikes = [{ node: this.origin, at: this.born, from: null }]; // still to land
    this.twitchAt = null; // set once it's all out
    this.twitched = false;
    this.dieAt = Infinity; // set as it twitches
    // The glow is added light; the bolts are blended normally so they show over everything.
    this.glow = new Graphics();
    this.glow.blendMode = 'add';
    this.glow.scale.set(1 / U);
    this.lines = new Graphics();
    this.lines.scale.set(1 / U);
    world.layers.fx.addChild(this.glow, this.lines);
    this.solo = nodes.length === 1;
    if (this.solo) this.callSolo();
    else this.callChain(nodes);

    const F = this.data.fx, S = F.strike, { x, y } = this.origin;
    world.deathFx.flare(tex.mist, x, y, 0, { time: S.time, w0: S.size, h0: S.size, w1: S.size * 0.3, h1: S.size * 0.3, alpha: S.alpha, color0: 0xffffff, color1: F.color });
    world.camera.shake(F.shake.duration, F.shake.strength, F.shake.frequency);
    world.sound('thunder', { x, y });
  }

  bolt(o) {
    const b = { target: null, width: 1, line: null, sprouts: null, ...o };
    this.bolts.push(b);
    if (b.target) this.strikes.push({ node: b.target, at: b.end, from: b.from });
    return b;
  }

  jumpTime(a, b) { return Math.max(this.data.minJumpTime, Math.hypot(b.x - a.x, b.y - a.y) / this.data.speed); }

  // Back through the chain, then forks out to whoever is in reach of any line so far, nearest
  // first, each fork's line reaching further.
  callChain(nodes) {
    const d = this.data, w = this.world;
    for (const n of nodes) if (alive(n.enemy)) Object.assign(n, n.enemy.body.pos);
    let t = this.born;
    for (let i = 1; i < nodes.length; i++) {
      const dur = this.jumpTime(nodes[i - 1], nodes[i]);
      this.bolt({ from: nodes[i - 1], to: nodes[i], start: t, end: t + dur, target: nodes[i] });
      t += dur;
    }
    const taken = new Set(nodes.map((n) => n.enemy).filter(alive));
    while (taken.size < d.maxTargets) {
      let best = null;
      for (const e of w.enemies) {
        if (!alive(e) || taken.has(e)) continue;
        const p = e.body.pos;
        for (const b of this.bolts) {
          const a = this.at(b.from), c = this.at(b.to);
          const near = nearest(a.x, a.y, c.x, c.y, p.x, p.y), gap = hurtDistance(e, lerp(a.x, c.x, near.t), lerp(a.y, c.y, near.t));
          if (gap <= d.reach && (!best || gap < best.gap)) best = { e, b, t: near.t, gap };
        }
      }
      if (!best) break;
      taken.add(best.e);
      const from = { bolt: best.b, t: best.t }, to = { enemy: best.e, ...best.e.body.pos };
      const start = lerp(best.b.start, best.b.end, best.t), end = start + this.jumpTime(this.at(from), to);
      this.bolt({ from, to, start, end, target: to });
    }
    this.spawnUntil = this.born;
  }

  callSolo() {
    const S = this.data.fx.solo;
    this.spawnUntil = this.born + this.data.soloTime;
    for (let i = 0; i < S.burst; i++) this.soloArc();
  }

  // An arc crawling out around the enemy struck alone: from it, or forking off an arc already
  // out, kept within soloReach of it.
  soloArc() {
    const d = this.data, S = d.fx.solo, o = this.origin;
    let from = o, angle = Math.random() * TAU;
    if (this.bolts.length && Math.random() < S.fork) {
      const parent = this.bolts[Math.floor(Math.random() * this.bolts.length)];
      from = { bolt: parent, t: randRange(0.4, 1) };
      angle = parent.angle + side() * pick(d.fx.sprouts.spreadDeg) * DEG;
    }
    const p = this.at(from);
    let len = pick(S.length);
    for (let i = 0; i < 4 && Math.hypot(p.x + Math.cos(angle) * len - o.x, p.y + Math.sin(angle) * len - o.y) > d.soloReach; i++) len *= 0.6;
    const now = this.world.time, end = now + Math.max(d.minJumpTime, len / d.speed);
    // Forks can't set off before the arc they come off reaches them.
    const start = from.bolt ? Math.max(now, lerp(from.bolt.start, from.bolt.end, from.t)) : now;
    this.bolt({ from, to: { dx: Math.cos(angle) * len, dy: Math.sin(angle) * len }, angle, start, end: Math.max(end, start + d.minJumpTime), width: S.width });
  }

  // Where an anchor is in the simulation, along straight lines.
  at(a) {
    if (a.bolt) {
      const p = this.at(a.bolt.from), q = this.end(a.bolt, p);
      return { x: lerp(p.x, q.x, a.t), y: lerp(p.y, q.y, a.t) };
    }
    return a;
  }

  end(b, from) { return b.to.dx !== undefined ? { x: from.x + b.to.dx, y: from.y + b.to.dy } : this.at(b.to); }

  step(dt) {
    const d = this.data, w = this.world, now = w.time;
    for (const n of [this.origin, ...this.bolts.map((b) => b.target)]) if (n && alive(n.enemy)) Object.assign(n, n.enemy.body.pos);
    const due = this.strikes.filter((s) => now >= s.at);
    if (due.length) {
      this.strikes = this.strikes.filter((s) => now < s.at);
      for (const s of due) this.strike(s.node, s.from && this.at(s.from));
    }
    if (this.solo && now < this.spawnUntil) for (let i = Math.floor(d.fx.solo.rate * dt + Math.random()); i > 0; i--) this.soloArc();
    // All out: a moment later it twitches once, cracking again, then holds and fades.
    if (this.twitchAt === null && now >= this.spawnUntil && this.bolts.every((b) => now >= b.end)) {
      this.twitchAt = Math.max(...this.bolts.map((b) => b.end)) + d.twitchDelay;
    }
    if (!this.twitched && this.twitchAt !== null && now >= this.twitchAt) {
      this.twitched = true;
      this.dieAt = now + d.hold;
      for (const b of this.bolts) b.line = null; // laid again, in a new shape
      this.world.sound('thunder', this.origin);
    }
    for (const b of this.bolts) {
      if (!b.line && now >= b.start) this.lay(b, 1);
      if (b.line && !b.swept && now >= b.end) this.sweep(b);
    }
    if (!this.strikes.length && now >= this.dieAt + d.fade) this.destroy();
  }

  // Bolt `b` is all out: every prop it touches is hit, and alone, every enemy too (but the one
  // struck, once each).
  sweep(b) {
    const d = this.data, w = this.world, mult = w.adrenaline.damageMultiplier;
    b.swept = true;
    // Measured from the bolt's point nearest its centre.
    const touching = (t) => {
      const near = closestOn(b.line, t.body.pos);
      return hurtDistance(t, near.x, near.y) <= d.hitRadius ? near : null;
    };
    for (const prop of w.props) {
      const near = !prop.dead && !this.cut.has(prop) && touching(prop);
      if (!near) continue;
      this.cut.add(prop);
      prop.takeDamage((this.solo ? d.arcDamage : d.damage) * mult, prop.closestPoint(near), near);
    }
    if (!this.solo) return;
    for (const e of w.enemies) {
      const near = alive(e) && !this.struck.has(e) && touching(e);
      if (near) this.strike({ enemy: e }, near, d.arcDamage);
    }
  }

  // The bolt reaches `node`, coming from `src` (the origin has none).
  strike(node, src, damage = this.solo ? this.data.soloDamage : this.data.damage) {
    const e = node.enemy, d = this.data, H = d.fx.hit, w = this.world;
    if (!alive(e) || this.struck.has(e)) return;
    this.struck.add(e);
    const p = { ...e.body.pos }, hitPoint = src ? e.closestPoint(src) : p;
    const angle = src ? Math.atan2(p.y - src.y, p.x - src.x) : Math.random() * TAU;
    e.takeDamage(damage * w.adrenaline.damageMultiplier, hitPoint, src, d.id);
    if (src && !e.dead) e.applyKnockback(d.enemyKnockbackForce, src);
    w.deathFx.flare(tex.mist, p.x, p.y, 0, { time: H.flash.time, w0: H.flash.size, h0: H.flash.size, w1: H.flash.size * 0.4, h1: H.flash.size * 0.4, alpha: H.flash.alpha, color0: 0xffffff, color1: d.fx.color });
    w.effects.playOnce(anims.hit_impact, hitPoint.x, hitPoint.y, angle, FX.hitImpactSize, H.impactTint);
    w.effects.burst(p.x, p.y, angle, H.sparks);
    if (src) w.sound('thunderZap', p);
  }

  // Where an anchor is on screen as a bolt is laid from it: an enemy where it was when the
  // first bolt from or to it was laid, and a fork on the jagged bolt it comes off (laid before it).
  view(a, alpha) {
    if (a.bolt) return (a.bolt.line && pointAt(a.bolt.line, a.t)) ?? this.at(a);
    a.seen ??= alive(a.enemy) ? a.enemy.body.lerpPos(alpha) : { x: a.x, y: a.y };
    return a.seen;
  }

  render(alpha) {
    const F = this.data.fx, now = this.world.time - (1 - alpha) * FIXED_DT;
    const k = now < this.dieAt ? 1 : 1 - (now - this.dieAt) / this.data.fade;
    const shown = [];
    for (const b of this.bolts) {
      if (now < b.start || k <= 0 || !b.line) continue;
      const grown = (b.line.length - 1) * clamp01((now - b.start) / Math.max(1e-6, b.end - b.start));
      shown.push({ line: cut(b.line, grown), sprouts: b.sprouts.filter((s) => s.i <= grown), w: b.width });
    }
    const S = F.sprouts;
    this.glow.clear();
    this.lines.clear();
    // The glow, in two soft layers, then the purple, then the white over all of it.
    F.glowWidth.forEach((gw, i) => {
      for (const s of shown) {
        stroke(this.glow, s.line, gw * s.w, F.glow, F.glowAlpha[i] * k);
        for (const sp of s.sprouts) stroke(this.glow, sp.pts, gw * s.w * sp.w, F.glow, F.glowAlpha[i] * k);
      }
    });
    for (const [width, color] of [[F.width, F.color], [F.coreWidth, F.core]]) {
      for (const s of shown) {
        stroke(this.lines, s.line, width * s.w, color, k);
        // Sprouts thin out along their length.
        for (const sp of s.sprouts) {
          const n = sp.pts.length - 1;
          for (let p = 0; p < TAPER; p++) {
            const from = Math.floor((n * p) / TAPER), to = Math.ceil((n * (p + 1)) / TAPER);
            stroke(this.lines, sp.pts.slice(from, to + 1), width * s.w * sp.w * lerp(1, S.taper, p / (TAPER - 1)), color, k);
          }
        }
      }
    }
  }

  // Lays bolt `b` down for good from where its ends are now (`alpha` of the way through this
  // step): a jagged line, and sprouts forking off some of its points.
  lay(b, alpha) {
    const F = this.data.fx, S = F.sprouts;
    const a = this.view(b.from, alpha);
    const c = b.to.dx !== undefined ? { x: a.x + b.to.dx, y: a.y + b.to.dy } : this.view(b.to, alpha);
    const len = Math.hypot(c.x - a.x, c.y - a.y), ux = (c.x - a.x) / (len || 1), uy = (c.y - a.y) / (len || 1);
    b.line = place(jagged(len, F.step, F.rough), a, c);
    b.sprouts = [];
    for (let i = 1; i < b.line.length - 1; i++) {
      if (Math.random() >= S.chance * b.width) continue;
      // Now and then a long one, reaching far out and sprouting twigs of its own.
      const L = S.long, long = Math.random() < L.share;
      const pts = sprout(b.line[i], ux, uy, long ? lerp(L.length[0], L.length[1], Math.random() ** 2) : pick(S.length), long ? L : S, S.spreadDeg);
      b.sprouts.push({ i, pts, w: long ? L.width : S.width });
      if (!long) continue;
      for (let j = 1; j < pts.length - 1; j++) {
        if (Math.random() >= S.chance) continue;
        const dx = pts[j + 1].x - pts[j].x, dy = pts[j + 1].y - pts[j].y, l = Math.hypot(dx, dy) || 1;
        b.sprouts.push({ i, pts: sprout(pts[j], dx / l, dy / l, pick(S.length), S, S.spreadDeg), w: S.width * L.twig });
      }
    }
  }

  dispose() {
    this.glow.destroy();
    this.lines.destroy();
  }
}

// A line `len` long, cut into pieces no longer than `step` by knocking each midpoint sideways
// by up to `rough` of its piece's length: points { u along, v out }, in units of `len`.
function jagged(len, step, rough) {
  const pts = [{ u: 0, v: 0 }];
  const split = (a, b) => {
    const du = b.u - a.u, dv = b.v - a.v, l = Math.hypot(du, dv);
    if (l * len <= step) { pts.push(b); return; }
    const off = (Math.random() - 0.5) * rough * l;
    const m = { u: (a.u + b.u) / 2 - (dv / l) * off, v: (a.v + b.v) / 2 + (du / l) * off };
    split(a, m);
    split(m, b);
  };
  if (len > 1e-6) split(pts[0], { u: 1, v: 0 });
  else pts.push({ u: 1, v: 0 });
  return pts;
}

// A jagged sprout `len` long off `root`, turned up to `spreadDeg` either way from unit (ux, uy),
// cut and knocked about by `J`'s step and rough: its points, from the root out.
function sprout(root, ux, uy, len, J, spreadDeg) {
  const turn = side() * pick(spreadDeg) * DEG, ca = Math.cos(turn), sa = Math.sin(turn);
  return jagged(len, J.step, J.rough).map(({ u, v }) => {
    const x = (ca * u - sa * v) * len, y = (sa * u + ca * v) * len; // along (ux, uy) and out from it
    return { x: root.x + ux * x - uy * y, y: root.y + uy * x + ux * y };
  });
}

// A shape from `jagged` laid from `a` to `c`.
function place(shape, a, c) {
  const dx = c.x - a.x, dy = c.y - a.y;
  return shape.map(({ u, v }) => ({ x: a.x + dx * u - dy * v, y: a.y + dy * u + dx * v }));
}

// The first `upto` (fractional) pieces of a line.
function cut(pts, upto) {
  if (upto >= pts.length - 1) return pts;
  const i = Math.floor(upto), f = upto - i, out = pts.slice(0, i + 1);
  if (f > 0) out.push({ x: lerp(pts[i].x, pts[i + 1].x, f), y: lerp(pts[i].y, pts[i + 1].y, f) });
  return out;
}

// The point of a line nearest `p`, and its squared distance.
function closestOn(pts, p) {
  let best = { x: pts[0].x, y: pts[0].y, d2: Infinity };
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], n = nearest(a.x, a.y, b.x, b.y, p.x, p.y);
    if (n.d2 < best.d2) best = { x: lerp(a.x, b.x, n.t), y: lerp(a.y, b.y, n.t), d2: n.d2 };
  }
  return best;
}

// The point `t` of the way along a line, by length.
function pointAt(pts, t) {
  if (pts.length < 2) return null;
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  let left = total * t;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], l = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= l || i === pts.length - 1) {
      const f = l > 0 ? clamp01(left / l) : 0;
      return { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f) };
    }
    left -= l;
  }
  return null;
}

// The point of segment a–b nearest p: how far along it (0…1), and its squared distance.
function nearest(ax, ay, bx, by, px, py) {
  const abx = bx - ax, aby = by - ay, l2 = abx * abx + aby * aby;
  const t = l2 > 0 ? clamp01(((px - ax) * abx + (py - ay) * aby) / l2) : 0;
  return { t, d2: (px - ax - abx * t) ** 2 + (py - ay - aby * t) ** 2 };
}

function stroke(g, pts, width, color, alpha) {
  if (pts.length < 2 || alpha <= 0 || width <= 0) return;
  g.moveTo(pts[0].x * U, pts[0].y * U);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x * U, pts[i].y * U);
  g.stroke({ width: width * U, color, alpha, cap: 'round', join: 'round' });
}
