// The Mauler's star-maul: its own sprite in the Mauler's hands, posed every frame from the
// attacks' phases (tuning in MAUL). It sways with the Mauler's heavy gait, is drawn back
// to the side and whipped across the front (growing as it goes) for a swing, or heaved
// back over the Mauler's head and brought down for a slam, which throws up dust. A smear
// trails it as it strikes, its star brightens through a wind-up, and it shares the
// Mauler's wind-up tint, hit flash and death pop. Purely cosmetic.
import { Graphics, Sprite } from 'pixi.js';
import { ATTACK_FX as X, DEATH_FX, MAUL } from '../data/config.js';
import { clamp01, lerp, lerpColor, smoothStep01, randRange, TAU } from '../engine/math.js';
import { tex } from '../render/assets.js';
import { MAUL_ART } from '../render/sprites.js';

const P = MAUL.poses;
const easeOut = (t) => 1 - (1 - t) ** 2;
const pick = ([min, max]) => randRange(min, max);
const progress = (a, now) => clamp01((now - a.phaseStartedAt) / Math.max(1e-3, a.phaseEndsAt - a.phaseStartedAt));
const mix = (a, b, t) => ({
  phi: lerp(a.phi, b.phi, t), r: lerp(a.r, b.r, t), rot: lerp(a.rot, b.rot, t), pitch: lerp(a.pitch, b.pitch, t), grow: lerp(a.grow, b.grow, t),
});
// How big the maul looks: grown, and looming larger the more it's raised toward the camera.
const sizeOf = (pose) => (1 + pose.grow) * (1 + MAUL.lift * Math.sin(pose.pitch));
// How long a strike's motion takes: the swing across, or the slam down to the floor.
const strikeTime = (a) => (a.data.maul === 'slam' ? a.data.landTime : a.data.swingTime);

// Where a point on the maul, `along` the haft from the grip and `side` across it, sits in
// the Mauler's frame for `pose`. Pitched up, the maul foreshortens.
function onMaul(pose, along, side = 0) {
  const size = sizeOf(pose), x = along * Math.cos(pose.pitch) * size, y = side * size;
  const c = Math.cos(pose.rot), s = Math.sin(pose.rot);
  return { x: Math.cos(pose.phi) * pose.r + c * x - s * y, y: Math.sin(pose.phi) * pose.r + s * x + c * y };
}

export class MaulerRig {
  constructor(enemy) {
    this.enemy = enemy;
    const view = enemy.view;
    this.trail = new Graphics();
    this.trail.blendMode = 'add';
    view.addChild(this.trail);
    this.maul = this.maulSprite(tex.star_maul, view);
    this.tint = this.maulSprite(tex.star_maul_white, view);
    this.glint = new Sprite(tex.glint);
    this.glint.anchor.set(0.5);
    this.glint.blendMode = 'add';
    this.glint.tint = MAUL.glint.color;
    view.addChild(this.glint);
    this.pose = { ...P.idle };
    this.from = this.pose; // where the current motion started
    this.motion = 'idle';
    this.motionAt = 0;
    this.strike = null; // the latest strike: { ability, from }
    this.landedAt = -Infinity; // the last slam landing whose dust has been thrown up
    this.gait = 0; // radians through the stride cycle
  }

  get world() { return this.enemy.world; }

  maulSprite(texture, parent) {
    const s = new Sprite(texture);
    s.anchor.set(MAUL_ART.grip / MAUL_ART.w, 0.5);
    parent.addChild(s);
    return s;
  }

  // After EnemyAttackFx has placed and posed the enemy's view for render time `now`.
  render(now, dt) {
    const e = this.enemy;
    let ability = null;
    for (const a of e.abilities.values()) if (a.phase === 'windup' || a.phase === 'active') ability = a;
    const motion = e.stunned ? 'stunned' : ability ? `${ability.data.maul}:${ability.phase}` : 'idle';
    if (motion !== this.motion) {
      this.motion = motion;
      this.motionAt = now;
      this.from = { ...this.pose };
      if (motion.endsWith(':active')) this.strike = { ability, from: this.from };
    }

    const walk = this.walk(dt);
    if (e.stunned) this.pose = this.settle(now, P.stunned);
    else if (ability?.phase === 'windup') this.pose = this.windup(ability, now);
    else if (ability) this.pose = this.strikePose(this.strike, now - ability.strikeAt);
    else this.pose = this.settle(now, this.idle(walk));
    this.place(this.pose);
    e.view.rotation += Math.sin(this.gait) * MAUL.gait.waddle * walk;

    const t = e.attackFx.tint;
    this.tint.visible = t.visible;
    this.tint.alpha = t.alpha;
    this.tint.tint = t.tint;
    this.drawTrail(now);
    this.updateGlint(now, ability);
    this.updateLanding();
  }

  // How much the Mauler is walking (0–1), stepping its gait along with the distance.
  walk(dt) {
    const e = this.enemy, v = e.body.vel;
    if (e.isActing || e.stunned) return 0;
    const speed = Math.hypot(v.x, v.y);
    this.gait = (this.gait + speed * dt * MAUL.gait.stride) % TAU;
    return clamp01(speed / e.type.ai.moveSpeed);
  }

  // Poses ------------------------------------------------------------------
  idle(walk) {
    const sway = Math.sin(this.gait) * walk * MAUL.gait.sway;
    return { ...P.idle, phi: P.idle.phi + sway * 0.4, rot: P.idle.rot + sway };
  }

  settle(now, target) {
    return mix(this.from, target, smoothStep01(clamp01((now - this.motionAt) / MAUL.settleTime)));
  }

  // Into the ready pose, then straining there: a swing draws further back, a slam heaves
  // higher, both trembling.
  windup(a, now) {
    const kind = a.data.maul, t = progress(a, now);
    const pose = mix(this.from, kind === 'slam' ? P.slamReady : P.swingReady, smoothStep01(clamp01(t / MAUL.readyIn)));
    const S = MAUL.strain[kind], k = smoothStep01(clamp01((t - MAUL.readyIn) / (1 - MAUL.readyIn)));
    const shake = Math.sin(now * MAUL.strain.freq * TAU) * S.shake * k;
    pose.rot += S.rot * k + shake;
    pose.pitch += S.pitch * k + shake;
    return pose;
  }

  // A swing whips out of its wind-up; a slam gathers speed as it comes down.
  strikePose({ ability, from }, since) {
    const slam = ability.data.maul === 'slam', k = clamp01(since / strikeTime(ability));
    return mix(from, slam ? P.slamDown : P.swingThrough, slam ? k * k : easeOut(k));
  }

  place(pose) {
    const size = sizeOf(pose), base = 1 / MAUL_ART.unit, grip = onMaul(pose, 0);
    for (const s of [this.maul, this.tint]) {
      s.position.set(grip.x, grip.y);
      s.rotation = pose.rot;
      s.scale.set(base * Math.cos(pose.pitch) * size, base * size);
    }
  }

  // Effects ----------------------------------------------------------------
  // A smear over where the maul has just been, sampled back along its strike: along the
  // haft for a swing, across the head for a slam.
  drawTrail(now) {
    const g = this.trail, s = this.strike, T = MAUL.trail;
    g.clear();
    if (!s) return;
    const since = now - s.ability.strikeAt;
    const t1 = Math.min(since, strikeTime(s.ability)), t0 = Math.max(0, since - T.life);
    if (t1 <= t0) return;
    const [at, , width] = MAUL_ART.head, tip = MAUL_ART.tip;
    const edges = s.ability.data.maul === 'slam' ? [[at, -width / 2], [at, width / 2]] : [[tip * T.inner, 0], [tip, 0]];
    const rows = [];
    for (let i = 0; i <= T.samples; i++) {
      const pose = this.strikePose(s, lerp(t0, t1, i / T.samples));
      rows.push(edges.map(([along, side]) => onMaul(pose, along, side)));
    }
    for (let i = 0; i < T.samples; i++) {
      const [a0, b0] = rows[i], [a1, b1] = rows[i + 1], k = (i + 1) / T.samples;
      g.poly([a0.x, a0.y, b0.x, b0.y, b1.x, b1.y, a1.x, a1.y]).fill({ color: lerpColor(X.color, X.hot, k), alpha: T.alpha * k });
    }
  }

  // The star in the head brightens through a wind-up and flashes on the strike.
  updateGlint(now, ability) {
    const G = MAUL.glint, s = this.strike;
    let k = ability?.phase === 'windup' ? lerp(0.25, 1, progress(ability, now)) * (0.85 + 0.15 * Math.sin(now * 40)) : 0;
    const since = s ? now - s.ability.strikeAt : Infinity;
    if (since >= 0 && since < G.flashTime) k = Math.max(k, 1 - since / G.flashTime);
    this.glint.visible = k > 0;
    if (k <= 0) return;
    const at = onMaul(this.pose, MAUL_ART.head[0]);
    this.glint.position.set(at.x, at.y);
    this.glint.alpha = k;
    this.glint.width = this.glint.height = G.size * (1 + G.grow * k) * sizeOf(this.pose);
  }

  // Throws up the dust once a slam lands (SmashAbility decides when and where).
  updateLanding() {
    const a = this.strike?.ability;
    if (!a?.landed || a.landedAt === this.landedAt) return;
    this.landedAt = a.landedAt;
    this.impact(a.impact, a.data.radius[0]);
  }

  // A flash and a few sparks where the head lands, dust rolling out from the first radius
  // of the struck circle as it spreads, and a haze hanging over it. Borrows the death
  // effects' flares and mist.
  impact({ x, y, rotation }, r0) {
    const I = MAUL.impact, w = this.world, fx = w.deathFx, F = I.flash;
    fx.flare(tex.mist, x, y, 0, { time: F.time, w0: F.size, h0: F.size, w1: F.size * F.grow, h1: F.size * F.grow, alpha: F.alpha, color0: X.hot, color1: X.color });
    w.effects.burst(x, y, rotation, { ...I.sparks, color: X.hot });
    const puff = (cfg, from) => {
      for (let i = 0; i < cfg.count; i++) {
        const a = ((i + Math.random()) / cfg.count) * TAU, c = Math.cos(a), s = Math.sin(a), speed = pick(cfg.speed);
        fx.mist.spawn({
          x: x + c * from, y: y + s * from, vx: c * speed, vy: s * speed, size: pick(cfg.size), life: pick(cfg.life),
          color: cfg.color, fade: cfg.fade, alpha: cfg.alpha, grow: cfg.grow, sway: 0.5,
        });
      }
    };
    puff(I.dust, r0);
    puff(I.haze, r0 * 0.3);
  }

  // Local point → world, through the enemy's view as last placed.
  toWorld(p) {
    const v = this.enemy.view, c = Math.cos(v.rotation), s = Math.sin(v.rotation);
    const x = p.x * v.scale.x, y = p.y * v.scale.y;
    return { x: v.position.x + c * x - s * y, y: v.position.y + s * x + c * y };
  }

  setFlash(on) { this.maul.texture = on ? tex.star_maul_white : tex.star_maul; }

  // The maul pops white and swells away along with the body.
  onDeath() {
    const pose = this.pose, size = sizeOf(pose), reach = Math.cos(pose.pitch) * size, D = DEATH_FX.enemy.pop;
    const grip = this.toWorld(onMaul(pose, 0)), w = MAUL_ART.w * Math.abs(reach), h = MAUL_ART.h * size;
    const rot = this.enemy.view.rotation + pose.rot + (reach < 0 ? Math.PI : 0);
    this.world.deathFx.flare(tex.star_maul_white, grip.x, grip.y, rot, {
      time: D.time, w0: w, h0: h, w1: w * D.scale, h1: h * D.scale, color0: 0xffffff, color1: this.enemy.type.hitColor, fade: 1.5,
      anchorX: MAUL_ART.grip / MAUL_ART.w,
    });
  }
}
