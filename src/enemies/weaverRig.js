// The Weaver's eight legs, worked out every frame (tuning in WEAVER_LEGS). Each runs from a
// hip on its head to a foot, bowing out at the knee (weaverKnee). Walking, a foot stays
// planted on the floor while the body moves over it, and once it trails too far from where
// it would rest it steps there, aimed a little ahead of where the Weaver is going, in two
// sets of four that take turns, so it scuttles; turning on the spot, its feet shuffle round
// after it. At rest its legs flex in and out. An attack lifts some of them off the floor
// and holds them up (an ability's legPose): its front legs raised to spit or to cast,
// hauling hand over hand as it reels the player in, clamping in as it bites. Stunned or
// yanked off its feet, it draws them all in, twitching. They share its wind-up tint, hit
// flash and death. Cosmetic.
import { Graphics } from 'pixi.js';
import { WEAVER_LEGS as L } from '../data/config.js';
import { clamp01, lerp, lerpColor, smoothStep01, TAU } from '../engine/math.js';
import { weaverKnee, weaverLegsRest } from '../render/sprites.js';

const progress = (a, now) => clamp01((now - a.phaseStartedAt) / Math.max(1e-3, a.phaseEndsAt - a.phaseStartedAt));

export class WeaverRig {
  constructor(enemy) {
    this.enemy = enemy;
    // Over the wind-up glow, under the body.
    this.gfx = new Graphics();
    enemy.view.addChildAt(this.gfx, 1);
    // Each leg: its hip and where its foot rests (`home`) in the Weaver's frame, which set it
    // steps with, its foot in the world while planted (null until first placed) or in the
    // Weaver's frame while lifted (`held`), the step under way ({ from, at }) if any, and its
    // knee and foot in the Weaver's frame as last drawn.
    this.legs = weaverLegsRest().map(({ hip, foot, side, i }) => ({
      hip, home: foot, side, i, set: (i + (side > 0 ? 0 : 1)) % 2, foot: null, held: null, step: null, knee: null, footLocal: null,
    }));
    this.flashing = false;
  }

  get world() { return this.enemy.world; }

  // A point in the Weaver's frame → the world, and back, through its view as EnemyAttackFx
  // last placed it.
  toWorld(p) { return this.enemy.attackFx.toWorld(p); }
  toLocal(p) {
    const v = this.enemy.view, c = Math.cos(-v.rotation), s = Math.sin(-v.rotation);
    const dx = p.x - v.position.x, dy = p.y - v.position.y;
    return { x: (c * dx - s * dy) / v.scale.x, y: (s * dx + c * dy) / v.scale.y };
  }

  // What the attacks want of the legs at render time `now`: { pose, strain } (pose null: walk).
  pose(now) {
    const e = this.enemy;
    for (const a of e.abilities.values()) {
      const pose = a.legPose?.(now);
      if (pose) return { pose, strain: a.phase === 'windup' ? smoothStep01((progress(a, now) - 0.5) / 0.5) : 0 };
    }
    return { pose: e.stunned ? 'stunned' : null, strain: 0 };
  }

  // After EnemyAttackFx has placed and posed the enemy's view for render time `now`.
  render(now, dt) {
    const e = this.enemy, { pose, strain } = this.pose(now), P = L.poses[pose];
    const curl = L.curl[pose];
    const breathe = 1 + Math.sin(now * L.breathe.freq * TAU) * L.breathe.amount;
    const spread = (P?.spread ?? 1) * breathe;
    const v = e.body.vel, lead = L.step.lead;
    const stepping = [false, false]; // whether either set has a foot in the air
    for (const leg of this.legs) if (leg.step) stepping[leg.set] = true;

    for (const leg of this.legs) {
      const { hip, home, side, i } = leg;
      let held = null;
      if (curl) {
        const tw = Math.sin(now * L.twitch.freq * TAU + i * 1.7 + side) * L.twitch.amount;
        held = { x: hip.x + (home.x - hip.x) * curl + tw, y: hip.y + (home.y - hip.y) * curl - tw * side };
      } else if (P?.feet[i] === 'haul') {
        // Hand over hand: each side reaching and hauling in turn.
        const H = L.haul, k = 0.5 - 0.5 * Math.cos(now * H.rate * TAU + (side > 0 ? 0 : Math.PI));
        held = { x: lerp(H.reach[0], H.pull[0], k), y: lerp(H.reach[1], H.pull[1], k) * side };
      } else if (P?.feet[i]) {
        const [x, y] = P.feet[i], tr = strain * L.tremble.amount * Math.sin(now * L.tremble.freq * TAU + i + side);
        held = { x: x + tr, y: (y + tr * 0.6) * side };
      }

      if (held) {
        // Lifted: chasing where it is held, in the Weaver's frame.
        if (!leg.held) leg.held = leg.foot ? this.toLocal(leg.foot) : { ...held };
        const k = dt > 0 ? 1 - Math.exp(-dt / L.ease) : 0;
        leg.held.x += (held.x - leg.held.x) * k;
        leg.held.y += (held.y - leg.held.y) * k;
        leg.foot = null;
        leg.step = null;
        leg.footLocal = leg.held;
      } else {
        // Walking: planted, stepping to where it would rest once it trails too far.
        const rest = { x: hip.x + (home.x - hip.x) * spread, y: hip.y + (home.y - hip.y) * spread };
        const at = this.toWorld(rest);
        at.x += v.x * lead; at.y += v.y * lead;
        if (leg.held) { leg.foot = this.toWorld(leg.held); leg.held = null; }
        if (!leg.foot) leg.foot = at;
        if (leg.step) {
          const k = (now - leg.step.at) / L.step.time;
          if (k >= 1 || k < 0) { leg.foot = at; leg.step = null; }
          else {
            const ease = smoothStep01(k), lift = Math.sin(Math.PI * k) * L.step.lift;
            const out = this.toWorld({ x: rest.x * (1 + lift), y: rest.y * (1 + lift) }), mid = this.toWorld(rest);
            leg.foot = { x: lerp(leg.step.from.x, at.x, ease) + (out.x - mid.x), y: lerp(leg.step.from.y, at.y, ease) + (out.y - mid.y) };
          }
        } else {
          const hipW = this.toWorld(hip), reach = (L.femur + L.tibia) * L.step.reach;
          const strayed = Math.hypot(leg.foot.x - at.x, leg.foot.y - at.y) > L.step.threshold;
          const stretched = Math.hypot(leg.foot.x - hipW.x, leg.foot.y - hipW.y) > reach;
          if (stretched || (strayed && !stepping[1 - leg.set])) {
            leg.step = { from: { ...leg.foot }, at: now };
            stepping[leg.set] = true;
          }
        }
        leg.footLocal = this.toLocal(leg.foot);
      }
      leg.knee = weaverKnee(hip, leg.footLocal);
    }
    this.draw();
  }

  // Every leg's glow, then every outline, then every fill over them, so where legs cross
  // they read as one dark shape inside one pale edge.
  draw() {
    const g = this.gfx, t = this.enemy.attackFx.tint, heat = t.visible ? t.alpha * 0.85 : 0, C = L.color;
    const rim = (base) => (this.flashing ? 0xffffff : lerpColor(base, t.tint, heat));
    g.clear();
    for (const [grow, color, alpha] of [[L.glowLine / 2, rim(C.glow), L.glowAlpha], [L.line, rim(C.outline), 1], [0, this.flashing ? 0xffffff : C.fill, 1]]) {
      for (const leg of this.legs) this.shape(g, leg, grow, color, alpha);
    }
  }

  // A leg `grow` fatter all round: a round hip, a femur to a round knee, and a tibia
  // tapering to its foot.
  shape(g, { hip, knee, footLocal: foot }, grow, color, alpha) {
    const [w0, w1] = L.width, fill = { color, alpha };
    g.circle(hip.x, hip.y, w0 / 2 + grow).fill(fill);
    segment(g, hip, knee, w0 / 2 + grow, w0 * 0.42 + grow, 0, fill);
    g.circle(knee.x, knee.y, w0 * 0.45 + grow).fill(fill);
    segment(g, knee, foot, w1 / 2 + grow, w1 * 0.12 + grow, grow, fill);
  }

  setFlash(on) { this.flashing = on; }

  // Light spills out along every leg as it bursts.
  onDeath() {
    const color = this.enemy.type.hitColor;
    for (const leg of this.legs) {
      if (!leg.knee) continue;
      for (const p of [leg.knee, leg.footLocal]) {
        const w = this.toWorld(p);
        this.world.effects.burst(w.x, w.y, Math.random() * TAU, { count: 2, speed: 4, lifetime: 0.3, size: 0.24, coneDeg: 180, color });
      }
    }
  }
}

// A quad from `a` to `b`, `r0` half as wide at `a` and `r1` at `b`, reaching `past` beyond `b`.
function segment(g, a, b, r0, r1, past, fill) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1e-6, ux = dx / len, uy = dy / len;
  const ex = b.x + ux * past, ey = b.y + uy * past;
  g.poly([a.x - uy * r0, a.y + ux * r0, ex - uy * r1, ey + ux * r1, ex + uy * r1, ey - ux * r1, a.x + uy * r0, a.y - ux * r0]).fill(fill);
}
