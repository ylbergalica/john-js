// The Corsair's scimitar and cape. The scimitar is a sprite in one hand at its side, posed
// every frame from the attacks' phases (tuning in SCIMITAR); every swing carries it across
// to the other side, which the attacks keep track of (enemy.heldSide). At rest it bobs and
// sways with its stride. For a slash it is drawn back on its side and swung across the
// front, then settles at rest on the other side, the wrist rolling the blade over. For the
// rush it crouches with the blade drawn far back, then swings it from side to side with
// every step, and stopping, twirls it a full turn as it settles. Crashing leaves it hanging
// loose. A smear trails each swing. The cape is cloth (cape.js), under the body. All of
// it shares the Corsair's wind-up tint, hit flash and death pop. Cosmetic, except that the
// slash's hitbox follows the blade through the same poses (scimitarSwingPose, onScimitar).
import { Graphics, Sprite } from 'pixi.js';
import { ATTACK_FX as X, DEATH_FX, SCIMITAR as S } from '../data/config.js';
import { clamp01, lerp, lerpColor, randRange, smoothStep01, TAU } from '../engine/math.js';
import { tex } from '../render/assets.js';
import { SCIMITAR_ART, scimitarAt } from '../render/sprites.js';
import { Cape } from './cape.js';

const P = S.poses;
const easeOut = (t) => 1 - (1 - t) ** 2;
const pick = ([min, max]) => randRange(min, max);
const progress = (a, now) => clamp01((now - a.phaseStartedAt) / Math.max(1e-3, a.phaseEndsAt - a.phaseStartedAt));
const mix = (a, b, t) => ({
  phi: lerp(a.phi, b.phi, t), r: lerp(a.r, b.r, t), rot: lerp(a.rot, b.rot, t), grow: lerp(a.grow, b.grow, t), flip: lerp(a.flip, b.flip, t),
});

// A pose (for the blade on its right) with the blade on `side` (1 right, -1 left).
export const held = (pose, side) => ({ ...pose, phi: pose.phi * side, rot: pose.rot * side, flip: pose.flip * side });

// The blade `k` (0 → 1) of the way through a swing from `side`, as the slash's hitbox has it
// (the drawn swing starts from wherever the wind-up left it, near enough).
export const scimitarSwingPose = (side, k) => mix(held(P.slashReady, side), held(P.slashThrough, side), easeOut(clamp01(k)));

// The blade `steps` into a rush: through each step's swing (the first `share` of it), from
// alternate sides starting with `side`, then drawn back on the side it swung to for the next.
export function rushPose(side, steps, share) {
  const i = Math.floor(steps), u = steps - i, s = i % 2 ? -side : side;
  if (u < share) return scimitarSwingPose(s, u / share);
  return mix(held(P.slashThrough, s), held(P.slashReady, -s), smoothStep01((u - share) / (1 - share)));
}

// Where a point `along` the blade's spine from the guard sits in the Corsair's frame for `pose`.
export function onScimitar(pose, along) {
  const k = 1 + pose.grow, b = scimitarAt(along), x = b.x * k, y = b.y * k * pose.flip;
  const c = Math.cos(pose.rot), s = Math.sin(pose.rot);
  return { x: Math.cos(pose.phi) * pose.r + c * x - s * y, y: Math.sin(pose.phi) * pose.r + s * x + c * y };
}

export class CorsairRig {
  constructor(enemy) {
    this.enemy = enemy;
    const view = enemy.view;
    // Over the wind-up glow, under the body.
    this.cape = new Cape(enemy, view, 1);
    this.trail = new Graphics();
    this.trail.blendMode = 'add';
    view.addChild(this.trail);
    this.blade = this.bladeSprite(tex.scimitar, view);
    this.tint = this.bladeSprite(tex.scimitar_white, view);
    this.pose = held(P.idle, enemy.heldSide ?? 1);
    this.from = this.pose; // where the current motion started
    this.motion = 'idle';
    this.motionAt = 0;
    this.strike = null; // the latest strike: { ability, from }
    this.gait = 0; // radians through the stride cycle
    this.flashing = false;
    this.crashedAt = -Infinity; // the last crash whose dust has been thrown up
    this.dustAt = -Infinity; // when it last kicked up dust skidding
  }

  get world() { return this.enemy.world; }

  bladeSprite(texture, parent) {
    const s = new Sprite(texture);
    s.anchor.set(SCIMITAR_ART.rootX / SCIMITAR_ART.w, SCIMITAR_ART.rootY / SCIMITAR_ART.h);
    parent.addChild(s);
    return s;
  }

  // After EnemyAttackFx has placed and posed the enemy's view for render time `now`.
  render(now, dt) {
    const e = this.enemy, side = e.heldSide ?? 1;
    let ability = null, stopping = null; // stopping: a rush skidding to a halt
    for (const a of e.abilities.values()) {
      if (a.phase === 'windup' || a.phase === 'active') ability = a;
      else if (a.phase === 'recovery' && a.data.blade === 'rush') stopping = a;
    }
    const motion = e.stunned ? 'stunned' : ability ? `${ability.data.blade}:${ability.phase}` : stopping ? 'rush:recovery' : 'idle';
    if (motion !== this.motion) {
      this.motion = motion;
      this.motionAt = now;
      this.from = { ...this.pose };
      if (ability?.phase === 'active') this.strike = { ability, from: this.from };
    }

    const walk = this.walk(dt);
    if (e.stunned) this.pose = this.settle(now, held(P.stunned, side));
    else if (ability?.phase === 'windup') this.pose = this.windup(ability, now);
    else if (ability?.data.blade === 'slash') this.pose = this.slashPose(this.strike, now - ability.strikeAt);
    else if (ability) this.pose = this.rushPoseAt(ability, ability.stepsAt(now));
    else if (stopping) this.pose = this.flourish(now, side);
    else this.pose = this.settle(now, this.idle(now, walk, side));
    this.place();

    const t = e.attackFx.tint;
    this.tint.visible = t.visible && !this.flashing;
    this.tint.alpha = t.alpha;
    this.tint.tint = t.tint;
    this.drawTrail(now);
    this.cape.render(now, dt, e.stunned, t, this.flashing);
    this.updateCrash();
    if (stopping && !e.stunned) this.skid(now);
  }

  // How much the Corsair is walking (0–1), stepping its gait along with the distance.
  walk(dt) {
    const e = this.enemy, v = e.body.vel;
    if (e.isActing || e.stunned) return 0;
    const speed = Math.hypot(v.x, v.y);
    this.gait = (this.gait + speed * dt * S.gait.stride) % TAU;
    return clamp01(speed / e.type.ai.moveSpeed);
  }

  // Poses ------------------------------------------------------------------
  // At its side, bobbing in and out and swaying as it walks.
  idle(now, walk, side) {
    const sway = Math.sin(this.gait) * walk * S.gait.sway, bob = Math.sin(now * S.hover.freq * TAU) * S.hover.amount;
    return held({ ...P.idle, r: P.idle.r + bob, rot: P.idle.rot + sway, phi: P.idle.phi + sway * 0.3 }, side);
  }

  settle(now, target) {
    return mix(this.from, target, smoothStep01(clamp01((now - this.motionAt) / S.settleTime)));
  }

  // Into the ready pose on its side, then straining there, drawn back further and juddering.
  windup(a, now) {
    const t = progress(a, now), side = this.enemy.heldSide ?? 1;
    const ready = smoothStep01(clamp01(t / S.readyIn)), k = smoothStep01(clamp01((t - S.readyIn) / (1 - S.readyIn)));
    const pose = mix(this.from, held(a.data.blade === 'rush' ? P.rushReady : P.slashReady, side), ready);
    pose.rot += side * k * (S.strain.rot + Math.sin(now * S.strain.freq * TAU) * S.strain.shake);
    return pose;
  }

  // The slash: out of the wind-up and across to the other side in `swingTime`, holding there.
  slashPose({ ability, from }, since) {
    return mix(from, held(P.slashThrough, ability.side), easeOut(clamp01(since / ability.data.swingTime)));
  }

  // The rush, `steps` into it; the first swing starts from wherever the wind-up left it.
  rushPoseAt(a, steps) {
    const share = a.data.swingShare;
    if (steps < share && this.strike?.ability === a) return mix(this.strike.from, held(P.slashThrough, a.launchSide), easeOut(steps / share));
    return rushPose(a.launchSide, steps, share);
  }

  // Stopping: back to rest, twirling the blade a full turn on the way, onward the way it was
  // already turning.
  flourish(now, side) {
    const F = S.flourish, k = smoothStep01(clamp01((now - this.motionAt) / F.time)), to = this.idle(now, 0, side);
    const pose = mix(this.from, to, k);
    pose.rot += Math.sign(to.rot - this.from.rot || 1) * TAU * F.turns * k;
    return pose;
  }

  place() {
    const pose = this.pose, root = { x: Math.cos(pose.phi) * pose.r, y: Math.sin(pose.phi) * pose.r }, size = (1 + pose.grow) / SCIMITAR_ART.unit;
    for (const s of [this.blade, this.tint]) {
      s.position.set(root.x, root.y);
      s.rotation = pose.rot;
      s.scale.set(size, size * pose.flip);
    }
  }

  // Effects ----------------------------------------------------------------
  // The latest swing, if one is under way or just done: when it started, when it ends (by
  // `now`), how long its smear trails, and the blade's pose at any time in between (null
  // while it isn't swinging).
  swing(now) {
    const e = this.enemy, a = this.strike?.ability;
    if (!a || e.stunned || now < a.strikeAt) return null;
    if (a.data.blade === 'slash') {
      return { t0: a.strikeAt, t1: Math.min(now, a.strikeAt + a.data.swingTime), life: S.trail.life, at: (t) => this.slashPose(this.strike, t - a.strikeAt) };
    }
    if (a.phase !== 'active') return null;
    const share = a.data.swingShare;
    return { t0: a.strikeAt, t1: now, life: S.trail.rushLife, at: (t) => { const steps = a.stepsAt(t); return steps % 1 < share ? this.rushPoseAt(a, steps) : null; } };
  }

  // A smear over where the blade has just swung, sampled back along its swing.
  drawTrail(now) {
    const g = this.trail, T = S.trail, sw = this.swing(now);
    g.clear();
    if (!sw) return;
    const t0 = Math.max(sw.t0, now - sw.life), t1 = sw.t1;
    if (t1 <= t0) return;
    const len = SCIMITAR_ART.len, edges = [];
    for (let i = 0; i <= T.samples; i++) {
      const pose = sw.at(lerp(t0, t1, i / T.samples));
      edges.push(pose && [onScimitar(pose, len * T.inner), onScimitar(pose, len)]);
    }
    for (let i = 0; i < T.samples; i++) {
      if (!edges[i] || !edges[i + 1]) continue;
      const [a0, b0] = edges[i], [a1, b1] = edges[i + 1], k = (i + 1) / T.samples;
      g.poly([a0.x, a0.y, b0.x, b0.y, b1.x, b1.y, a1.x, a1.y]).fill({ color: lerpColor(X.color, X.hot, k), alpha: T.alpha * k });
    }
  }

  // A rush that crashed: a flash where it hit, steel sparks off the blade and dust thrown up
  // (the ability bounces it back, rings the clang and shakes the camera).
  updateCrash() {
    let a = null;
    for (const ab of this.enemy.abilities.values()) if (ab.crash && ab.crashedAt > this.crashedAt) a = ab;
    if (!a) return;
    this.crashedAt = a.crashedAt;
    const C = S.crash, w = this.world, fx = w.deathFx, F = C.flash, { x, y, angle } = a.crash;
    fx.flare(tex.mist, x, y, 0, { time: F.time, w0: F.size, h0: F.size, w1: F.size * F.grow, h1: F.size * F.grow, alpha: F.alpha, color0: X.hot, color1: this.enemy.type.hitColor });
    w.effects.burst(x, y, angle + Math.PI, C.sparks);
    w.effects.burst(x, y, angle + Math.PI, { ...C.sparks, count: C.sparks.count / 2, color: this.enemy.type.hitColor });
    const D = C.dust;
    for (let i = 0; i < D.count; i++) {
      const dir = angle + Math.PI + randRange(-1.4, 1.4), speed = pick(D.speed);
      fx.mist.spawn({
        x, y, vx: Math.cos(dir) * speed, vy: Math.sin(dir) * speed, size: pick(D.size), life: pick(D.life),
        color: D.color, fade: D.fade, alpha: D.alpha, grow: D.grow, sway: 0.5,
      });
    }
  }

  // Skidding to a halt after a rush: dust kicked up at its feet while it still slides.
  skid(now) {
    const K = S.skid, b = this.enemy.body, speed = Math.hypot(b.vel.x, b.vel.y);
    if (speed < K.minSpeed || now - this.dustAt < K.every) return;
    this.dustAt = now;
    const D = K.dust, back = Math.atan2(-b.vel.y, -b.vel.x) + randRange(-0.5, 0.5), r = b.radius * 0.7;
    this.world.deathFx.mist.spawn({
      x: b.pos.x + Math.cos(back) * r, y: b.pos.y + Math.sin(back) * r, vx: Math.cos(back) * speed * 0.3, vy: Math.sin(back) * speed * 0.3,
      size: pick(D.size), life: pick(D.life), color: D.color, fade: D.fade, alpha: D.alpha, grow: D.grow, sway: 0.5,
    });
  }

  // Where the parry cue flashes: on the blade, as last posed.
  cuePoints() { return [onScimitar(this.pose, SCIMITAR_ART.len * SCIMITAR_ART.cue)]; }

  setFlash(on) {
    this.flashing = on;
    this.blade.texture = on ? tex.scimitar_white : tex.scimitar;
  }

  // The blade pops white and swells away along with the body; sparks fly off the cape.
  onDeath() {
    const D = DEATH_FX.enemy.pop, pose = this.pose, k = 1 + pose.grow, { w, h, rootX, rootY } = SCIMITAR_ART;
    const root = this.enemy.attackFx.toWorld({ x: Math.cos(pose.phi) * pose.r, y: Math.sin(pose.phi) * pose.r });
    this.world.deathFx.flare(tex.scimitar_white, root.x, root.y, this.enemy.view.rotation + pose.rot, {
      time: D.time, w0: w * k, h0: h * k, w1: w * k * D.scale, h1: h * k * D.scale, color0: 0xffffff, color1: this.enemy.type.hitColor, fade: 1.5,
      anchorX: rootX / w, anchorY: rootY / h, flipY: pose.flip < 0,
    });
    this.cape.points().forEach((p, i) => {
      if (i % 3 === 1) this.world.effects.burst(p.x, p.y, Math.random() * TAU, { count: 2, speed: 3.5, lifetime: 0.35, size: 0.25, coneDeg: 180, color: 0xfff6e0 });
    });
  }
}
