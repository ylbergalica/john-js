// Gravebloom: every enemy that falls leaves a small, pale see-through lotus where it fell, pink
// and white round a pale green heart. Struck by the player, a lotus bursts in a wave of pink
// light out along the blow; set off any other way (another lotus's burst, an enemy falling
// beside it) all round in a ring. Petals, glints and sparks fly with the wave, and it strikes
// every enemy and prop its front passes.
import { Container, Sprite } from 'pixi.js';
import { Aspect } from './aspect.js';
import { Entity } from '../game/entity.js';
import { clamp01, deltaAngle, dist, lerp, norm, randRange, TAU } from '../engine/math.js';
import { FX } from '../data/config.js';
import { anims, tex } from '../render/assets.js';
import { Plume, Strand } from '../render/fx.js';
import { BLOOM_WAVE, LOTUS_CORE, LOTUS_PETAL, LOTUS_RINGS, RING_RADIUS } from '../render/sprites.js';
import { hurtDistance } from '../game/hurtbox.js';

const DEG = Math.PI / 180;
const pick = ([min, max]) => randRange(min, max);
const easeOut = (t) => 1 - (1 - t) ** 3;
const smooth = (t) => t * t * (3 - 2 * t);
const easeOutBack = (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2; // overshoots, then settles
const alive = (t) => !t.dead && !t.dying;

export class GravebloomAspect extends Aspect {
  constructor(player, data) {
    super(player, data);
    this.blooms = [];
    const fx = player.world.layers.fx;
    this.petals = new Plume(fx, tex.bloom_petal, { drag: 1.8 });
    this.glints = new Plume(fx, tex.glint, { drag: 2.5 });
    this.motes = new Plume(fx, tex.glint, { drag: 1.2 });
    // Its own kills too (the controller never sends an aspect those): lotuses chain.
    this.offOwnKills = player.world.events.enemyKilled.on((enemy, cause) => { if (cause === data.id) this.onEnemyKilled(enemy, cause); });
    this.streakOn = null; // the enemy hit last
    this.streak = 0; // hits in a row on it
    this.lastHitAt = -Infinity;
  }

  // Every streak.hits hits in a row on one enemy (any damage but its own bursts'; streak.time
  // without a hit loses the count) grow a lotus beside it, so it blooms in a long fight too
  // (a guardian's), with nothing dying.
  onEnemyDamaged(enemy) {
    const S = this.data.streak;
    this.streak = enemy === this.streakOn && this.now - this.lastHitAt <= S.time ? this.streak + 1 : 1;
    this.streakOn = enemy;
    this.lastHitAt = this.now;
    if (this.streak < S.hits) return;
    this.streak = 0;
    const at = this.besideOf(enemy);
    if (!at) return;
    this.blooms = this.blooms.filter((b) => !b.dead);
    this.blooms.push(this.world.add(new Bloom(this, at)));
    this.world.sound('bloom', at);
  }

  // A spot clear of walls somewhere up to streak.reach out from the enemy's edge, or null.
  besideOf(enemy) {
    const S = this.data.streak, c = enemy.body.pos, r = enemy.body.radius, physics = this.world.physics;
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * TAU, d = r + Math.random() * S.reach;
      const at = { x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d };
      if (!physics.circleHitsWall(at.x, at.y, this.data.radius) && physics.rayLength(c.x, c.y, Math.cos(a), Math.sin(a), d) >= d) return at;
    }
    return null;
  }

  // A kill sets off every lotus ready beside it, all round, and leaves one of its own, which
  // bursts all round too once it's bloomed if a burst made the kill.
  onEnemyKilled(enemy, cause) {
    const d = this.data, at = { ...enemy.body.pos }, ours = cause === d.id;
    this.blooms = this.blooms.filter((b) => !b.dead);
    for (const b of this.blooms) if (dist(b.pos, at) <= d.nearby) b.setOff(d.delay);
    this.blooms.push(this.world.add(new Bloom(this, at, ours)));
    this.world.sound('bloom', at);
  }

  // The player's own swing sends a lotus off along the swing.
  onHitProp(prop) {
    if (prop.aspect === this && prop.struck) prop.struck.angle = Math.atan2(this.player.facing.y, this.player.facing.x);
  }

  // Bursts at `at`, in a wave along `angle`, or all round if it's null.
  burst(at, angle) {
    const w = this.world, F = this.data.fx, B = F.burst, fx = w.deathFx, round = angle === null, { x, y } = at;
    const fl = round ? B.round.flash : B.flash;
    fx.flare(tex.mist, x, y, 0, {
      time: fl.time, w0: fl.size, h0: fl.size, w1: fl.size * fl.grow, h1: fl.size * fl.grow, alpha: fl.alpha, color0: F.white, color1: F.pink,
    });
    // The flower itself pops out in light.
    const s = F.size * F.swell;
    for (const t of [tex.bloom_outer, tex.bloom_inner]) {
      fx.flare(t, x, y, Math.random() * TAU, { time: B.pop.time, w0: s, h0: s, w1: s * B.pop.grow, h1: s * B.pop.grow, alpha: B.pop.alpha, fade: 1.5, color0: 0xffffff, color1: F.pink });
    }
    if (round) this.ringFx(at);
    else this.coneFx(at, angle);

    const P = B.petals, G = B.glints, spread = P.spreadDeg * DEG;
    const toss = (plume, cfg, count, extra) => {
      for (let i = 0; i < count; i++) {
        const a = round ? ((i + Math.random()) / count) * TAU : angle + randRange(-spread, spread), v = pick(cfg.speed), d = Math.random() * 0.3;
        plume.spawn({ ...extra(i), x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: Math.cos(a) * v, vy: Math.sin(a) * v, size: pick(cfg.size), life: pick(cfg.life) });
      }
    };
    const petalColor = (i) => (i % 3 === 0 ? F.white : i % 7 === 0 ? F.green : F.pink);
    toss(this.petals, P, round ? P.ringCount : P.count, (i) => ({ color: petalColor(i), fade: i % 7 === 0 ? F.green : F.pink, alpha: P.alpha, sway: P.sway, orient: true }));
    toss(this.glints, G, round ? G.ringCount : G.count, (i) => ({ color: i % 4 === 0 ? F.green : F.white, fade: F.pink }));
    w.effects.burst(x, y, round ? 0 : angle, { ...B.sparks, count: round ? B.sparks.ringCount : B.sparks.count, coneDeg: round ? 180 : P.spreadDeg, color: F.pink });
    w.camera.shakeAtLeast(round ? B.round.shake : B.shake);
    w.sound(round ? 'bloomRing' : 'bloomBurst', at);
    w.add(new BloomWave(this, at, angle));
    this.used();
  }

  // The wave: pink light fanning out along `angle`, a white edge riding it and a faint green
  // haze trailing behind, its front where BloomWave strikes (the texture's arc is stretched
  // across to span the cone).
  coneFx({ x, y }, angle) {
    const C = this.data.cone, F = this.data.fx, W = F.burst.wave, fx = this.world.deathFx;
    const across = (BLOOM_WAVE.height * Math.tan(C.halfDeg * DEG)) / Math.tan(BLOOM_WAVE.halfDeg * DEG);
    const wave = (scale, o) => {
      const w0 = (C.from * scale) / BLOOM_WAVE.reach, w1 = (C.range * scale) / BLOOM_WAVE.reach;
      fx.flare(tex.bloom_wave, x, y, angle, { time: C.time, w0, h0: w0 * across, w1, h1: w1 * across, fade: W.fade, anchorX: 0, ...o });
    };
    wave(1, { alpha: W.alpha, color0: F.white, color1: F.pink });
    wave(0.97, { alpha: W.edge, color0: 0xffffff, color1: F.white, fade: 1.4 });
    wave(0.85, { alpha: W.green, color0: F.green, color1: F.green, delay: W.lag, time: C.time * 1.3 });
  }

  // The ring: a disc of pink haze swelling out under rings of pink haze and white light racing
  // out to the ring's range, a fainter pink one and a green one behind.
  ringFx({ x, y }) {
    const R = this.data.ring, F = this.data.fx, fx = this.world.deathFx, D = F.burst.round.disc, s = R.range * 2.2;
    fx.flare(tex.mist, x, y, Math.random() * TAU, { time: R.time * D.time, w0: s * 0.2, h0: s * 0.2, w1: s, h1: s, alpha: D.alpha, fade: 0.7, color0: F.white, color1: F.pink });
    for (const r of F.burst.rings) {
      const d0 = (r.from * R.range) / RING_RADIUS, d1 = (r.to * R.range) / RING_RADIUS; // sprite width for that band radius
      fx.flare(r.mist ? tex.mist_ring : tex.ring, x, y, Math.random() * TAU, {
        delay: r.delay ?? 0, time: r.time * R.time, w0: d0, h0: d0, w1: d1, h1: d1, alpha: r.alpha, fade: r.fade ?? 0.6,
        color0: r.green ? F.green : r.mist ? F.pink : 0xffffff, color1: r.green ? F.green : F.pink,
      });
    }
  }

  render(_alpha, dt) {
    this.petals.update(dt);
    this.glints.update(dt);
    this.motes.update(dt);
  }

  dispose() {
    this.offOwnKills();
    for (const b of this.blooms) b.destroy();
    this.petals.destroy();
    this.glints.destroy();
    this.motes.destroy();
  }
}

// A lotus. Struck once it's ready, like a prop (it sits in world.props, though it has no
// body in the physics: nothing bumps into it), it bursts the step after, which leaves time
// for the player's swing to say which way it went.
class Bloom extends Entity {
  // `doomed`: grown from a kill of a burst's, it bursts all round once it's bloomed.
  constructor(aspect, at, doomed = false) {
    const w = aspect.world, d = aspect.data, F = d.fx;
    super(w);
    this.aspect = aspect;
    this.data = d;
    this.isProp = true;
    this.body = { pos: at, radius: d.radius, rotation: 0 };
    this.born = w.time;
    this.wiltAt = w.time + d.lifetime;
    this.armed = false; // ready to be struck
    this.struck = null; // { source, round, angle? }: struck this step (all round if by another lotus)
    this.setOffAt = Infinity; // when it's to burst all round, set off (not struck by the player)
    this.setOffFrom = 0;
    this.spent = false;
    this.wilting = false;
    this.doomed = doomed;
    this.age = 0; // render time since it appeared
    this.seed = Math.random() * 10;

    const sprite = (texture, size, blend) => {
      const s = new Sprite({ texture, anchor: 0.5 });
      s.width = s.height = size;
      if (blend) s.blendMode = blend;
      return s;
    };
    this.view = new Container();
    this.glow = sprite(tex.mist, F.glow.size, 'add');
    this.glow.tint = F.glow.color;
    // The flower, petal by petal (so each can open on its own), ring over ring, the seed pod on top.
    this.flower = new Container();
    this.flower.rotation = Math.random() * TAU;
    const O = F.open;
    this.rings = LOTUS_RINGS.map((R, k) => {
      const ring = new Container();
      const texture = tex[`lotus_petal_${k}`], base = (R.L * F.size) / LOTUS_PETAL.length / texture.width;
      const petals = Array.from({ length: R.count }, (_, i) => {
        const s = new Sprite({ texture, anchor: { x: LOTUS_PETAL.base, y: 0.5 } });
        s.rotation = R.offset * DEG + (i / R.count) * TAU;
        ring.addChild(s);
        return { sprite: s, angle: s.rotation, base, start: O.starts[k] + Math.random() * O.jitter };
      });
      this.flower.addChild(ring);
      return { ring, petals, way: k % 2 ? -1 : 1 };
    });
    this.core = sprite(tex.lotus_core, F.size * LOTUS_CORE);
    this.flower.addChild(this.core);
    this.coreBase = this.core.scale.x;
    this.view.addChild(this.glow, this.flower);
    this.view.position.set(at.x, at.y);
    w.layers.props.addChild(this.view);
    this.glowBase = this.glow.scale.x;
    this.moteDebt = 0;
    this.gather();

    const S = F.sprout, { x, y } = at;
    w.deathFx.flare(tex.mist, x, y, 0, { time: S.flash.time, w0: S.flash.size, h0: S.flash.size, w1: S.flash.size * S.flash.grow, h1: S.flash.size * S.flash.grow, alpha: S.flash.alpha, color0: F.white, color1: F.pink });
    w.deathFx.scatter(aspect.motes, S.motes, x, y, 0.15, F.green, { fade: F.white, alpha: 0.8 });
  }

  // The misty lines drawn into it as it blooms, like its icon's: each wanders out from the middle
  // its own way (a slice of the circle, plus a little), turning this way and that at random (two
  // wavering turns laid over each other), free to stray `free` degrees off its way and steered
  // back by `pull` beyond that, until it's `radius` out; then it's run backward, in toward the
  // middle. Each is a haze, a band and a thread (Strands, under the flower).
  gather() {
    const G = this.data.fx.gather, Wd = G.wander, STEP = 0.02, turn0 = Math.random() * TAU;
    const limes = new Set();
    while (limes.size < Math.min(G.lime, G.count)) limes.add(Math.floor(Math.random() * G.count));
    this.wisps = Array.from({ length: G.count }, (_, i) => {
      const way = turn0 + ((i + randRange(-0.3, 0.3)) / G.count) * TAU, R = pick(G.radius);
      const waves = [0, 1].map(() => ({ amp: pick(Wd.amp) * (Math.random() < 0.5 ? -1 : 1), freq: pick(Wd.freq), phase: Math.random() * TAU }));
      let x = 0, y = 0, heading = way + randRange(-0.5, 0.5);
      const pts = [[0, 0]];
      for (let s = 0; Math.hypot(x, y) < R && s < R * 3; s += STEP) {
        const off = Math.atan2(Math.sin(way - heading), Math.cos(way - heading));
        heading += (waves.reduce((t, w) => t + w.amp * Math.sin(w.freq * s + w.phase), 0) + Math.sign(off) * Math.max(0, Math.abs(off) - Wd.free * DEG) * Wd.pull) * STEP;
        x += Math.cos(heading) * STEP;
        y += Math.sin(heading) * STEP;
        pts.push([x, y]);
      }
      pts.reverse();
      const lens = [0];
      for (let j = 1; j < pts.length; j++) lens.push(lens[j - 1] + Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]));
      const colors = limes.has(i) ? G.colors.lime : G.colors.pink;
      const layers = G.layers.map((L, k) => {
        const strand = new Strand(this.view, G.points, 0, 1, colors[k], 0, { texture: tex.bloom_wisp });
        this.view.setChildIndex(strand.mesh, 0);
        return { strand, ...L };
      });
      return { pts, lens, layers, delay: pick(G.delay), alpha: randRange(0.7, 1) };
    });
  }

  // The point `d` along a wisp's path.
  along({ pts, lens }, d) {
    let j = 1;
    while (j < lens.length - 1 && lens[j] < d) j++;
    const k = clamp01((d - lens[j - 1]) / (lens[j] - lens[j - 1] || 1));
    return [lerp(pts[j - 1][0], pts[j][0], k), lerp(pts[j - 1][1], pts[j][1], k)];
  }

  // Each wisp's trail runs in along its path over `time`, speeding up as it goes, `trail` of its
  // length long, drawn into the middle at the end; then it's gone.
  renderWisps(t) {
    const G = this.data.fx.gather;
    let left = 0;
    for (const wisp of this.wisps) {
      if (!wisp.layers) continue;
      const k = (t - wisp.delay) / G.time;
      if (k >= 1) { for (const L of wisp.layers) L.strand.destroy(); wisp.layers = null; continue; }
      left++;
      if (k < 0) continue;
      const total = wisp.lens[wisp.lens.length - 1], h = k ** 1.5 * (1 + G.trail);
      const head = Math.min(1, h) * total, tail = Math.max(0, h - G.trail) * total;
      for (const L of wisp.layers) {
        const s = L.strand, n = s.n;
        for (let i = 0; i < n; i++) {
          const [px, py] = this.along(wisp, lerp(tail, head, i / (n - 1)));
          s.pts[2 * i] = px; s.pts[2 * i + 1] = py;
          s.widths[i] = L.width * lerp(0.5, 1, i / (n - 1));
        }
        s.build();
        s.mesh.alpha = L.alpha * wisp.alpha * Math.min(1, k * 6);
        s.mesh.visible = head - tail > 1e-3;
      }
    }
    if (!left) this.wisps = null;
  }

  get pos() { return this.body.pos; }

  closestPoint(p) {
    const d = norm({ x: p.x - this.pos.x, y: p.y - this.pos.y });
    return { x: this.pos.x + d.x * this.body.radius, y: this.pos.y + d.y * this.body.radius };
  }

  takeDamage(damage, _hitPoint, source, cause = null) {
    if (!this.armed || this.spent || this.struck || damage <= 0) return;
    this.struck = { source: { ...source }, round: cause === this.data.id };
  }

  sap() {} // a burn doesn't set it off

  // Bursts it all round `delay` from now, if it's ready.
  setOff(delay) {
    if (!this.armed || this.spent || this.wilting || this.struck || this.setOffAt !== Infinity) return;
    this.setOffAt = this.world.time + delay;
    this.setOffFrom = this.world.time;
  }

  step() {
    const w = this.world, d = this.data, now = w.time;
    if (this.wilting) {
      if (now >= this.wiltAt + d.wiltTime) this.destroy();
      return;
    }
    if (!this.armed && now >= this.born + d.armTime) {
      this.armed = true;
      w.props.push(this);
      this.readyFx();
    }
    if (this.doomed && now >= this.born + d.doom.at) this.setOff(d.doom.delay);
    if (this.struck) {
      const s = this.struck.source;
      if (this.struck.round) this.goOff(null);
      else this.goOff(this.struck.angle ?? (dist(s, this.pos) > 1e-4 ? Math.atan2(this.pos.y - s.y, this.pos.x - s.x) : Math.random() * TAU));
    } else if (now >= this.setOffAt) this.goOff(null);
    else if (now >= this.wiltAt) {
      this.wilting = true;
      this.leave();
      const F = this.data.fx;
      for (let i = 0; i < F.wilt.petals; i++) {
        const a = Math.random() * TAU, v = randRange(0.2, 0.7);
        this.aspect.petals.spawn({ x: this.pos.x + Math.cos(a) * 0.15, y: this.pos.y + Math.sin(a) * 0.15, vx: Math.cos(a) * v, vy: Math.sin(a) * v, size: randRange(0.12, 0.18), life: randRange(0.7, 1.1), color: i % 2 ? F.white : F.pink, fade: F.deep, alpha: 0.6, sway: 2, orient: true });
      }
    }
  }

  // It glints once, and a ring closes in on it.
  readyFx() {
    const F = this.data.fx, R = F.ready, { x, y } = this.pos, fx = this.world.deathFx;
    const d0 = R.ring.to / RING_RADIUS, d1 = R.ring.from / RING_RADIUS;
    fx.flare(tex.ring, x, y, 0, { time: R.ring.time, w0: d0, h0: d0, w1: d1, h1: d1, alpha: R.ring.alpha, color0: F.white, color1: F.pink });
    fx.scatter(this.aspect.glints, R.glints, x, y, 0.3, F.white, { fade: F.pink });
  }

  goOff(angle) {
    this.spent = true;
    this.leave();
    this.aspect.burst({ ...this.pos }, angle);
    this.destroy();
  }

  // Out of world.props: nothing strikes it again.
  leave() {
    const props = this.world.props, i = props.indexOf(this);
    if (i >= 0) props.splice(i, 1);
  }

  render(_alpha, dt) {
    const F = this.data.fx, w = this.world, B = F.breathe;
    const t = (this.age += dt), g = t / F.growTime;
    const breath = 1 + B.amount * Math.sin(t * B.rate + this.seed), sway = B.sway * Math.sin(t * B.rate * 0.6 + this.seed * 2);
    // Blooms out of nothing: a closed bud swells up, then its petals open out one by one, from
    // the outside in, each lengthening and widening as it falls open and turning a little as it
    // goes, and last the seed pod shows in the middle.
    const O = F.open, bud = easeOut(clamp01(t / O.emerge));
    for (const { ring, petals, way } of this.rings) {
      for (const p of petals) {
        const o = smooth(clamp01((t - p.start) / O.time));
        p.sprite.scale.set(p.base * lerp(O.closed[0], 1, o), p.base * lerp(O.closed[1], 1, o));
        p.sprite.rotation = p.angle + way * O.twist * (1 - o);
      }
      ring.rotation = way * sway * (way > 0 ? 1 : 1.4);
    }
    this.core.scale.set(this.coreBase * easeOutBack(clamp01((t - O.core[0]) / O.core[1])));
    // Set off, it swells and brightens until it goes.
    const primed = this.setOffAt === Infinity ? 0 : clamp01((w.time - this.setOffFrom) / (this.setOffAt - this.setOffFrom || 1));
    const swell = lerp(1, F.swell, easeOut(primed));
    const wilt = this.wilting ? clamp01((w.time - this.wiltAt) / this.data.wiltTime) : 0;
    const shrink = 1 - 0.3 * wilt;
    this.flower.scale.set(bud * breath * swell * shrink);
    if (this.wisps) this.renderWisps(t);
    this.view.alpha = F.alpha * (1 - wilt);
    const G = F.glow, beat = 0.5 + 0.5 * Math.sin(t * G.pulse * TAU + this.seed);
    this.glow.alpha = (lerp(G.alpha[0], G.alpha[1], beat) + primed * 0.6) * clamp01(g) / F.alpha;
    this.glow.scale.set(this.glowBase * easeOut(clamp01(g)) * swell);

    // Motes drifting up off it, pink and white and now and then green.
    const M = F.motes;
    if (this.wilting) return;
    for (this.moteDebt += M.rate * dt; this.moteDebt >= 1; this.moteDebt--) {
      const a = Math.random() * TAU, r = Math.random() * M.spread, green = Math.random() < M.greenShare;
      this.aspect.motes.spawn({
        x: this.pos.x + Math.cos(a) * r, y: this.pos.y + Math.sin(a) * r, vx: randRange(-0.15, 0.15), vy: -pick(M.rise),
        size: pick(M.size), life: pick(M.life), alpha: M.alpha, color: green ? F.green : Math.random() < 0.5 ? F.white : F.pink, fade: green ? F.green : F.pink,
      });
    }
  }

  dispose() {
    this.leave();
    this.view.destroy({ children: true });
  }
}

// A burst's wave: its front races out from the lotus (easing out, as its look does) and
// strikes every enemy and prop it passes over, once, not through walls. Along `angle`, only
// what's within the cone; all round if that's null. A lotus it strikes bursts on all round
// (not one grown since it set off, from a kill of its own).
class BloomWave extends Entity {
  constructor(aspect, at, angle) {
    super(aspect.world);
    this.aspect = aspect;
    this.data = aspect.data;
    this.at = at;
    this.angle = angle;
    this.W = angle === null ? this.data.ring : this.data.cone;
    this.t = 0;
    this.born = aspect.world.time;
    this.struck = new Set();
  }

  step(dt) {
    const w = this.world, W = this.W, { x, y } = this.at;
    this.t += dt;
    const k = clamp01(this.t / W.time), front = lerp(W.from, W.range, easeOut(k));
    for (const t of [...w.enemies, ...w.props]) {
      if (!alive(t) || this.struck.has(t) || t.born >= this.born || hurtDistance(t, x, y) > front) continue;
      const p = t.body.pos, d = Math.hypot(p.x - x, p.y - y), r = t.body.radius;
      // In the cone: its centre, or near enough that its body reaches in.
      if (this.angle !== null && d > r && Math.abs(deltaAngle(this.angle, Math.atan2(p.y - y, p.x - x))) > W.halfDeg * DEG + Math.asin(r / d)) continue;
      if (d > r && w.physics.rayLength(x, y, (p.x - x) / d, (p.y - y) / d, d) < d - r) continue;
      this.struck.add(t);
      this.strike(t);
    }
    if (k >= 1) this.destroy();
  }

  strike(t) {
    const w = this.world, d = this.data, H = d.fx.hit, src = this.at, hitPoint = t.closestPoint(src);
    const damage = this.W.damage * w.adrenaline.damageMultiplier;
    if (t.isProp) { t.takeDamage(damage, hitPoint, src, d.id); return; }
    const angle = Math.atan2(t.body.pos.y - src.y, t.body.pos.x - src.x);
    t.takeDamage(damage, hitPoint, src, d.id);
    if (!t.dead) t.applyKnockback(this.W.enemyKnockbackForce, src);
    w.effects.playOnce(anims.hit_impact, hitPoint.x, hitPoint.y, angle, FX.hitImpactSize, H.impactTint);
    w.effects.burst(hitPoint.x, hitPoint.y, angle, H.sparks);
  }
}
