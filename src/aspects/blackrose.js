// Black Rose: the first swing of each attack to land on an enemy sets off a pulse at the cursor, black
// energy bursting out that strikes everything round it and drives it outward; every parry sets
// off an implosion there instead, black energy caving in that strikes harder and drags it all
// into the centre. Both strike halfway through. Where they happen the world itself tears (see
// src/render/distortion.js) under a ring of black mist.
import { Container, Sprite } from 'pixi.js';
import { Aspect } from './aspect.js';
import { Entity } from '../game/entity.js';
import { Body } from '../engine/physics.js';
import { FIXED_DT } from '../data/config.js';
import { clamp01, lerp, randRange, TAU } from '../engine/math.js';
import { tex } from '../render/assets.js';
import { RING_RADIUS } from '../render/sprites.js';
import { TearKind } from '../render/distortion.js';
import { hurtByCircle } from '../game/hurtbox.js';

const easeOut = (t) => 1 - (1 - t) ** 3;
const easeIn = (t) => t ** 3;
const pick = ([min, max]) => randRange(min, max);
const MAX_SPEED = 60; // the fastest anything is dragged, units a second (it's caught on a wall)

export class BlackRoseAspect extends Aspect {
  constructor(player, data) {
    super(player, data);
    this.landed = false; // this swing has set one off already
  }

  beforeAttack() { this.landed = false; }
  onHitEnemy() { this.swingLanded(); } // props don't set it off

  swingLanded() {
    if (this.landed) return;
    this.landed = true;
    this.burst(TearKind.Pulse);
  }

  onParry() { this.burst(TearKind.Implode); }

  burst(kind) {
    const at = this.player.cursorWorld();
    this.world.add(new RoseBurst(this, at, kind));
    this.world.sound(kind === TearKind.Pulse ? 'rosePulse' : 'roseImplode', at);
    this.used();
  }
}

class RoseBurst extends Entity {
  constructor(aspect, at, kind) {
    const w = aspect.world, d = aspect.data, F = d.fx;
    super(w);
    this.data = d;
    this.at = { x: at.x, y: at.y };
    this.kind = kind;
    this.implode = kind === TearKind.Implode;
    this.born = w.time;
    this.struck = false;
    this.moves = []; // { body, from, to, at, time }: what it's driving out or dragging in
    this.look = { kind, seed: Math.random() * 100, ...F.tear, ink: F.ink };

    this.view = new Container();
    w.layers.fx.addChild(this.view);
    const dark = (texture) => {
      const s = new Sprite({ texture, anchor: 0.5 });
      s.tint = F.ink;
      s.visible = false;
      this.view.addChild(s);
      return s;
    };
    this.ring = dark(tex.ring);
    const spin = Math.random() * TAU, n = F.mist.count;
    this.mist = Array.from({ length: n }, (_, i) => ({
      s: dark(tex.mist), angle: spin + ((i + Math.random() * 0.8) / n) * TAU, lag: Math.random(),
      size: pick(F.mist.size), turn: randRange(-2, 2), rot: Math.random() * TAU,
    }));
    this.core = dark(tex.mist);
    this.streaks = Array.from({ length: F.streaks.count }, () => ({
      s: dark(tex.spark), angle: Math.random() * TAU, lag: Math.random(), size: pick(F.streaks.size),
    }));
  }

  step(dt) {
    const d = this.data, w = this.world;
    if (!this.struck && w.time - this.born >= d.strikeAt) this.strike();
    for (let i = this.moves.length - 1; i >= 0; i--) if (this.drive(this.moves[i], dt)) this.moves.splice(i, 1);
    if (w.time - this.born >= d.time && this.moves.length === 0) this.destroy();
  }

  // Everything touching the circle is struck, and what's left of it driven out or dragged in.
  strike() {
    this.struck = true;
    const d = this.data, w = this.world, E = this.implode ? d.implode : d.pulse, c = this.at;
    const damage = E.damage * w.adrenaline.damageMultiplier;
    for (const t of [...w.enemies, ...w.props]) {
      if (t.dead || t.dying || !hurtByCircle(t, c.x, c.y, d.radius)) continue;
      const p = t.body.pos;
      let dx = p.x - c.x, dy = p.y - c.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 1e-4) { dx /= dist; dy /= dist; } else {
        const a = Math.random() * TAU;
        dx = Math.cos(a); dy = Math.sin(a);
      }
      // Struck from the centre, or (caving in) from beyond it, so it reels the way it's going.
      const src = this.implode ? { x: p.x + dx * (t.body.radius + 1), y: p.y + dy * (t.body.radius + 1) } : c;
      t.takeDamage(damage, t.closestPoint(src), src, d.id);
      if (t.dead || t.dying || !(t.body instanceof Body)) continue;
      const weight = (1 - (t.type?.knockbackResistance ?? 0)) * Math.min(1, d.heavy / t.body.mass);
      const travel = (this.implode ? -dist * E.fill : Math.max(E.min, E.to - dist)) * weight;
      if (Math.abs(travel) < 0.05) continue;
      this.moves.push({ body: t.body, from: { ...p }, to: { x: p.x + dx * travel, y: p.y + dy * travel }, at: w.time, time: E.moveTime });
      t.ai?.suppressMovementFor(E.moveTime + 0.05);
    }
    w.camera.shakeAtLeast(d.fx.shake);
  }

  // Steers `m` along its way, easing out, for this step: true once it's there.
  drive(m, dt) {
    const b = m.body, e = this.world.time - m.at;
    if (e >= m.time) { b.stop(); return true; }
    const k = easeOut(clamp01((e + dt) / m.time));
    const damp = 1 / (1 + dt * b.damping); // the physics damps before it moves
    let vx = (lerp(m.from.x, m.to.x, k) - b.pos.x) / (dt * damp), vy = (lerp(m.from.y, m.to.y, k) - b.pos.y) / (dt * damp);
    const v = Math.hypot(vx, vy);
    if (v > MAX_SPEED) { vx *= MAX_SPEED / v; vy *= MAX_SPEED / v; }
    b.vel.x = vx;
    b.vel.y = vy;
    return false;
  }

  render(alpha, dt) {
    const d = this.data, F = d.fx, R = d.radius, w = this.world, { x, y } = this.at;
    const now = w.time - (1 - alpha) * FIXED_DT;
    const t = clamp01((now - this.born) / d.time), half = d.strikeAt / d.time;
    const p = clamp01(t / half), u = clamp01((t - half) / (1 - half)); // up to the strike, and after it
    if (t < 1) w.distortion.tear(x, y, R, t < half ? p * 0.5 : 0.5 + u * 0.5, this.look); // its strike at 0.5
    const place = (s, r, angle, size, a, rot = 0) => {
      s.visible = a > 0.005;
      if (!s.visible) return;
      s.position.set(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
      s.width = s.height = size;
      s.rotation = rot;
      s.alpha = a;
    };
    // The crest: bursting out to the edge by the strike and on past it (a pulse), or rushing
    // in from past it to the centre and bursting out a little from there (an implosion).
    const crest = this.implode ? (t < half ? R * 1.25 * (1 - easeIn(p)) : R * 0.7 * easeOut(u)) : R * (t < half ? easeOut(p) : 1 + 0.3 * easeOut(u));
    const env = t < half ? Math.min(1, p * 4) : (1 - u) ** (this.implode ? 2 : 1.3);
    const ringSize = Math.max(0.01, crest / RING_RADIUS);
    place(this.ring, 0, 0, ringSize, F.ring.alpha * env * (this.implode && t >= half ? 0.6 : 1));

    for (const m of this.mist) {
      m.rot += m.turn * dt;
      // Puffs trail behind the crest, spread back from it by `lag`; thicker as they bunch in.
      const r = this.implode
        ? (t < half ? crest * (1 + m.lag * 0.25) : crest * 0.5 * m.lag)
        : crest * (1 - m.lag * 0.3);
      const size = m.size * (this.implode ? lerp(1, 0.6, p) * (1 + u) : lerp(0.6, 1, p) * (1 + 0.7 * u));
      const a = F.mist.alpha * (this.implode && t >= half ? (1 - u) ** 2 * 0.5 : env);
      place(m.s, r, m.angle, size, a, m.rot);
    }

    // A black heart: thinning out as a pulse leaves it; thickening as an implosion closes, the
    // knot it collapses into bursting at the strike and gone.
    const C = F.core;
    const core = this.implode
      ? (t < half ? [C.size * lerp(0.3, 0.75, p), C.alpha * p] : [C.size * lerp(0.75, 1.5, easeOut(u)), C.alpha * (1 - u) ** 2])
      : (t < half ? [C.size * lerp(0.5, 1, easeOut(p)), C.alpha * (1 - p * 0.5)] : [C.size * (1 + u), C.alpha * 0.5 * (1 - u) ** 2]);
    place(this.core, 0, 0, core[0], core[1]);

    // Black streaks along the crest, pointing out from the centre: flung out ahead of a pulse,
    // sucked in ahead of an implosion (stretching as they go), and thrown off its knot after.
    const S = F.streaks;
    for (const s of this.streaks) {
      const r = this.implode
        ? (t < half ? R * 1.4 * (1 - easeIn(p)) * (0.75 + 0.5 * s.lag) : R * (0.2 + 0.9 * easeOut(u)) * (0.6 + 0.4 * s.lag))
        : crest * (0.85 + 0.3 * s.lag) + (t < half ? 0 : R * 0.3 * u * s.lag);
      const stretch = this.implode && t < half ? 1 + 2 * p * p : 1 + (t < half ? 0.6 : 0);
      place(s.s, r, s.angle, s.size, S.alpha * env, s.angle);
      if (s.s.visible) { s.s.width = s.size * stretch; s.s.height = s.size * 0.3; }
    }
  }

  dispose() { this.view.destroy({ children: true }); }
}
