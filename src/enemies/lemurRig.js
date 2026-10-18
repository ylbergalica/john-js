// The Lemur's tail: a short ringed stalk ending in a big spade, simulated as a chain of
// links every frame (tuning in LEMUR_TAIL). Each link's bend off the one before is sprung
// toward where it wants to be: its rest bend, swept back the faster the body turns, and
// leant away from where the Lemur runs. So the tail curls back after a turn and swings
// through past its rest as the turn stops, whipping round after a whirl, then settles; each
// bend springs on its own, so nothing builds up down the chain to set it flailing. At rest
// it sways lazily; stunned, it droops. An attack can swing it round the body
// (an ability's tailPose); crescents form on its spade and are flung off it (muzzle). It
// shares the Lemur's wind-up tint, hit flash and death pop. Cosmetic, except that the
// crescents leave from wherever the spade was last drawn.
import { Graphics, Sprite } from 'pixi.js';
import { DEATH_FX, LEMUR_TAIL as T } from '../data/config.js';
import { clamp, clamp01, deltaAngle, lerp, lerpColor, smoothStep01, TAU } from '../engine/math.js';
import { tex } from '../render/assets.js';
import { SPADE_ART, tailBanded, tailEdges } from '../render/sprites.js';

const STEP = 1 / 120; // the tail's own simulation step
const N = T.segments;
const MAX_BASE_SPIN = 40; // rad/s; a sudden jump in where the tail leaves the body (a stun) counts as no faster

export class LemurRig {
  constructor(enemy) {
    this.enemy = enemy;
    const view = enemy.view;
    // Over the wind-up glow, under the body.
    this.stalk = new Graphics();
    this.spade = this.spadeSprite(tex.lemur_spade);
    this.tint = this.spadeSprite(tex.lemur_spade_rim_white); // its outline, warmed by a wind-up
    [this.stalk, this.spade, this.tint].forEach((s, i) => view.addChildAt(s, 1 + i));
    this.bends = null; // each link's bend off the one before (the first's off `base`), root first
    this.flex = new Float64Array(N); // and how fast it is bending (rad/s)
    this.angles = new Float64Array(N); // each link's heading in the world, from the bends
    this.base = null; // the heading the tail leaves the body at, as last stepped
    this.turn = 0; // how fast that has been turning (rad/s), eased
    this.root = null; // where it left the body last frame: { x, y, base }
    this.points = null; // the spine in the world, root first, as last drawn: { x, y }
    this.carry = 0; // time not yet simulated
    this.sway = 0; // radians through the sway's wave
    this.vel = { x: 0, y: 0 }; // the Lemur's velocity, eased (see render)
    this.flashing = false;
    this.muzzle = null; // where crescents form on the spade, in the world, as last drawn
    this.muzzleLocal = null; // the same in the view's frame
  }

  get world() { return this.enemy.world; }

  spadeSprite(texture) {
    const s = new Sprite(texture);
    s.anchor.set(SPADE_ART.rootX / SPADE_ART.w, 0.5);
    return s;
  }

  // Where the tail leaves the body, `offset` round from its facing (π: straight out the
  // back), through its view as EnemyAttackFx last placed it.
  rootAt(offset) {
    const p = this.enemy.attackFx.toWorld({ x: Math.cos(offset) * T.root, y: Math.sin(offset) * T.root });
    return { x: p.x, y: p.y, base: this.enemy.view.rotation + offset };
  }

  // Laid out at rest from `base`, still.
  reset(base) {
    this.bends = Float64Array.from(T.bends);
    this.flex.fill(0);
    let a = base;
    for (let i = 0; i < N; i++) this.angles[i] = a += this.bends[i];
    this.base = base;
  }

  // After EnemyAttackFx has placed and posed the enemy's view for render time `now`.
  render(now, dt) {
    const e = this.enemy;
    let pose = null, flungAt = -Infinity;
    for (const a of e.abilities.values()) {
      pose = a.tailPose?.(now) ?? pose;
      if (a.flungAt > flungAt) flungAt = a.flungAt;
    }
    const mode = e.stunned ? 'stunned' : pose !== null ? 'swing' : 'free';
    const root = this.rootAt(mode === 'swing' ? pose : Math.PI), from = this.root ?? root;
    this.root = root;
    if (!this.bends) this.reset(root.base);

    // It trails after the Lemur's velocity eased over `trailEase`, so starting off, stopping or
    // turning round doesn't jolt it: leant toward behind where it heads, as far as it runs.
    const k = dt > 0 ? 1 - Math.exp(-dt / T.trailEase) : 0, v = this.vel;
    v.x += (e.body.vel.x - v.x) * k;
    v.y += (e.body.vel.y - v.y) * k;
    const pace = clamp01(Math.hypot(v.x, v.y) / e.type.ai.moveSpeed), walk = e.isActing || e.stunned ? 0 : pace;
    this.sway += dt * T.sway.freq * lerp(1, T.sway.walk, walk) * TAU * (mode === 'stunned' ? 0.4 : 1);
    const trail = pace > 0.02 ? T.trail * pace * Math.sin(deltaAngle(root.base, Math.atan2(-v.y, -v.x))) : 0;

    // Stepped at its own fixed rate, where it leaves the body carried from where it was last
    // frame to where it is now.
    this.carry = Math.min(this.carry + dt, 0.1);
    const steps = Math.floor(this.carry / STEP);
    for (let s = 1; s <= steps; s++) this.simulate(mode, from.base + deltaAngle(from.base, root.base) * (s / steps), trail);
    this.carry -= steps * STEP;

    // The spine, laid out from where it leaves the body.
    const pts = [{ x: root.x, y: root.y }];
    for (let i = 0; i < N; i++) {
      const p = pts[i];
      pts.push({ x: p.x + Math.cos(this.angles[i]) * T.segment, y: p.y + Math.sin(this.angles[i]) * T.segment });
    }
    this.points = pts;
    const since = now - flungAt, flick = since >= 0 && since < T.flick.time ? 1 - smoothStep01(since / T.flick.time) : 0;
    this.draw(flick);
  }

  // One step: each link's bend off the one before springs toward where it wants to be (its
  // rest bend and sway, swept back by how fast the body turns, and leant away from where the
  // Lemur is heading by `trail`), within `maxBend`; the headings follow from the bends.
  simulate(mode, base, trail) {
    const spin = clamp(deltaAngle(this.base, base) / STEP, -MAX_BASE_SPIN, MAX_BASE_SPIN);
    this.base = base;
    this.turn += (spin - this.turn) * (1 - Math.exp(-STEP / T.turnEase));
    let heading = base;
    for (let i = 0; i < N; i++) {
      const along = i / (N - 1);
      let bend = T.bends[i] + T.sway.amount * lerp(0.4, 1, along) * Math.sin(this.sway - i * T.sway.lag);
      let freq = lerp(T.spring.freq[0], T.spring.freq[1], along), damping = T.spring.damping;
      if (mode === 'swing') { bend = 0; freq = T.swing.freq; damping = T.swing.damping; }
      else if (mode === 'stunned') { bend *= T.stunned.droop; freq *= T.stunned.freq; }
      if (mode === 'free') bend += trail * along;
      bend -= clamp(lerp(T.lag[0], T.lag[1], along) * this.turn, -T.maxLag, T.maxLag);
      const w = TAU * freq;
      this.flex[i] += (w * w * (bend - this.bends[i]) - 2 * damping * w * this.flex[i]) * STEP;
      this.bends[i] += this.flex[i] * STEP;
      if (Math.abs(this.bends[i]) > T.maxBend) {
        this.bends[i] = Math.sign(this.bends[i]) * T.maxBend;
        this.flex[i] = 0;
      }
      this.angles[i] = heading += this.bends[i];
    }
  }

  // Drawn in the view's frame (under its pose), so it sits under the body.
  draw(flick) {
    const v = this.enemy.view, c = Math.cos(-v.rotation), s = Math.sin(-v.rotation);
    const toLocal = (p) => {
      const dx = p.x - v.position.x, dy = p.y - v.position.y;
      return { x: (c * dx - s * dy) / v.scale.x, y: (s * dx + c * dy) / v.scale.y };
    };
    const local = this.points.map(toLocal);
    const { left, right } = tailEdges(local, T.width), outline = [...left, ...[...right].reverse()].flat();
    const t = this.enemy.attackFx.tint, heat = t.visible ? t.alpha * 0.85 : 0;
    // Flashing it all goes white; winding up only its outline warms, as the body's does.
    const rim = (base) => (this.flashing ? 0xffffff : lerpColor(base, t.tint, heat));
    const fill = (base) => (this.flashing ? 0xffffff : base);
    const g = this.stalk;
    g.clear();
    g.poly(outline).stroke({ width: T.glowLine, color: rim(T.color.glow), alpha: T.glowAlpha, join: 'round' });
    g.poly(outline).stroke({ width: T.line * 2, color: rim(T.color.outline), join: 'round' });
    g.poly(outline).fill({ color: fill(T.color.fill) });
    for (let i = 0; i < N; i++) {
      if (tailBanded(i)) g.poly([...left[i], ...left[i + 1], ...right[i + 1], ...right[i]]).fill({ color: fill(T.color.band) });
    }
    const tip = local[N], neck = local[N - 1], rot = Math.atan2(tip.y - neck.y, tip.x - neck.x), grow = 1 + T.flick.swell * flick;
    for (const sp of [this.spade, this.tint]) {
      sp.position.set(tip.x, tip.y);
      sp.rotation = rot;
      sp.scale.set(grow / SPADE_ART.unit);
    }
    this.tint.visible = t.visible && !this.flashing;
    this.tint.alpha = t.alpha;
    this.tint.tint = t.tint;
    const reach = SPADE_ART.len * SPADE_ART.muzzle * grow, end = this.points[N], heading = this.angles[N - 1];
    this.muzzle = { x: end.x + Math.cos(heading) * reach, y: end.y + Math.sin(heading) * reach, rot: heading };
    this.muzzleLocal = { x: tip.x + Math.cos(rot) * reach, y: tip.y + Math.sin(rot) * reach };
  }

  setFlash(on) {
    this.flashing = on;
    this.spade.texture = on ? tex.lemur_spade_white : tex.lemur_spade;
  }

  // The spade pops white and swells away along with the body, sparks flying off the stalk.
  onDeath() {
    if (!this.points) return;
    const D = DEATH_FX.enemy.pop, pts = this.points, tip = pts[N], color = this.enemy.type.hitColor;
    const { w, h, rootX } = SPADE_ART;
    this.world.deathFx.flare(tex.lemur_spade_white, tip.x, tip.y, this.angles[N - 1], {
      time: D.time, w0: w, h0: h, w1: w * D.scale, h1: h * D.scale, color0: 0xffffff, color1: color, fade: 1.5, anchorX: rootX / w,
    });
    for (let i = 1; i <= N; i += 2) {
      this.world.effects.burst(pts[i].x, pts[i].y, Math.random() * TAU, { count: 3, speed: 4, lifetime: 0.3, size: 0.25, coneDeg: 180, color });
    }
  }
}
