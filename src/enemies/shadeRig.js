// The Shade's arm-blades: a sprite floating at each side, posed every frame from the
// attacks' phases (tuning in BLADES). At rest they hang folded, bobbing in and out and
// swaying with its stride. They move like machinery: readying an attack, or stunned, an
// arm slides straight out from the body and judders there. For each slash one slides out
// and is driven forward and across (the other stays folded); for the lunge both slide out
// and thrust ahead, held there after the dash and folded back as it recovers. A smear trails
// each striking blade, and they share the Shade's wind-up tint, hit flash and death pop.
// Purely cosmetic.
import { Graphics, Sprite } from 'pixi.js';
import { ATTACK_FX as X, BLADES, DEATH_FX } from '../data/config.js';
import { clamp01, lerp, lerpColor, smoothStep01, TAU } from '../engine/math.js';
import { tex } from '../render/assets.js';
import { BLADE_ART, bladeAt } from '../render/sprites.js';

const P = BLADES.poses;
const SIDES = [1, -1]; // right blade, left blade
const easeOut = (t) => 1 - (1 - t) ** 2;
const progress = (a, now) => clamp01((now - a.phaseStartedAt) / Math.max(1e-3, a.phaseEndsAt - a.phaseStartedAt));
const mix = (a, b, t) => ({ phi: lerp(a.phi, b.phi, t), r: lerp(a.r, b.r, t), rot: lerp(a.rot, b.rot, t), grow: lerp(a.grow, b.grow, t) });

// Where a point `along` a blade's curved spine sits in the Shade's frame for `pose`, `side`
// 1 for the right blade, -1 for the left (poses are the right blade's; the left mirrors
// them).
function onBlade(pose, side, along) {
  const phi = pose.phi * side, rot = pose.rot * side, k = 1 + pose.grow, b = bladeAt(along);
  const x = b.x * k, y = b.y * k * side, c = Math.cos(rot), s = Math.sin(rot);
  return { x: Math.cos(phi) * pose.r + c * x - s * y, y: Math.sin(phi) * pose.r + s * x + c * y };
}

export class ShadeRig {
  constructor(enemy) {
    this.enemy = enemy;
    const view = enemy.view;
    this.trail = new Graphics();
    this.trail.blendMode = 'add';
    view.addChild(this.trail);
    this.blades = SIDES.map((side) => ({
      side,
      sprite: this.bladeSprite(tex.shade_blade, view),
      tint: this.bladeSprite(tex.shade_blade_white, view),
    }));
    this.poses = SIDES.map(() => ({ ...P.idle })); // right, left
    this.from = this.poses; // where the current motion started
    this.motion = 'idle';
    this.motionAt = 0;
    this.strike = null; // the latest strike: { ability, from, sides }
    this.gait = 0; // radians through the stride cycle
  }

  bladeSprite(texture, parent) {
    const s = new Sprite(texture);
    s.anchor.set(BLADE_ART.rootX / BLADE_ART.w, BLADE_ART.rootY / BLADE_ART.h);
    parent.addChild(s);
    return s;
  }

  // After EnemyAttackFx has placed and posed the enemy's view for render time `now`.
  render(now, dt) {
    const e = this.enemy;
    let ability = null, folding = null; // folding: a lunge recovering, its blades still out
    for (const a of e.abilities.values()) {
      if (a.phase === 'windup' || a.phase === 'active') ability = a;
      else if (a.phase === 'recovery' && a.data.blades === 'lunge') folding = a;
    }
    const motion = e.stunned ? 'stunned' : ability ? `${ability.data.blades}:${ability.phase}:${ability.side ?? 0}` : folding ? 'lunge:recovery' : 'idle';
    if (motion !== this.motion) {
      this.motion = motion;
      this.motionAt = now;
      this.from = this.poses.map((p) => ({ ...p }));
      if (ability?.phase === 'active') this.strike = { ability, from: this.from, sides: this.striking(ability) };
    }

    const walk = this.walk(dt);
    if (e.stunned) this.poses = this.settle(now, () => P.stunned);
    else if (ability?.phase === 'windup') this.poses = this.windup(ability, now);
    else if (ability) this.poses = this.strikePoses(this.strike, now - ability.strikeAt, now);
    else if (folding) this.poses = this.foldBack(folding, now);
    else this.poses = this.settle(now, (i) => this.idle(now, walk, SIDES[i]));
    this.place();

    const t = e.attackFx.tint;
    for (const { tint } of this.blades) {
      tint.visible = t.visible;
      tint.alpha = t.alpha;
      tint.tint = t.tint;
    }
    this.drawTrail(now);
  }

  // Which blades an attack swings: the slash's side, or both for the lunge.
  striking(a) { return a.data.blades === 'slash' ? [a.side] : SIDES; }

  // How much the Shade is walking (0–1), stepping its gait along with the distance.
  walk(dt) {
    const e = this.enemy, v = e.body.vel;
    if (e.isActing || e.stunned) return 0;
    const speed = Math.hypot(v.x, v.y);
    this.gait = (this.gait + speed * dt * BLADES.gait.stride) % TAU;
    return clamp01(speed / e.type.ai.moveSpeed);
  }

  // Poses (one per blade, right then left) -----------------------------------
  // Folded, the arms bob in and out out of step with each other, and sway as it walks.
  idle(now, walk, side) {
    const H = BLADES.hover, sway = Math.sin(this.gait) * walk * BLADES.gait.sway * side;
    const bob = Math.sin(now * H.freq * TAU + (side > 0 ? 0 : Math.PI)) * H.amount;
    return { ...P.idle, r: P.idle.r + bob, rot: P.idle.rot + sway, phi: P.idle.phi + sway * 0.3 };
  }

  settle(now, target) {
    const k = smoothStep01(clamp01((now - this.motionAt) / BLADES.settleTime));
    return this.from.map((p, i) => mix(p, target(i), k));
  }

  // Into the ready pose, then straining there, pushing a little further out and juddering.
  windup(a, now) {
    const t = progress(a, now), lunge = a.data.blades === 'lunge';
    const ready = smoothStep01(clamp01(t / BLADES.readyIn)), k = smoothStep01(clamp01((t - BLADES.readyIn) / (1 - BLADES.readyIn)));
    const S = BLADES.strain, shake = Math.sin(now * S.freq * TAU) * S.shake * k;
    return SIDES.map((side, i) => {
      const drawn = lunge || side === a.side;
      const pose = mix(this.from[i], drawn ? (lunge ? P.lungeReady : P.slashReady) : P.guard, ready);
      if (drawn) pose.r += S.out * k + shake;
      return pose;
    });
  }

  // The striking blades whip out of their wind-up, a slash arcing out as it crosses; the
  // other stays folded.
  strikePoses({ ability, from, sides }, since, now = null) {
    const k = easeOut(clamp01(since / ability.data.swingTime)), lunge = ability.data.blades === 'lunge';
    return SIDES.map((side, i) => {
      if (!sides.includes(side)) return now === null ? this.poses[i] : mix(from[i], P.guard, smoothStep01(clamp01((now - this.motionAt) / BLADES.settleTime)));
      const pose = mix(from[i], lunge ? P.lungeThrust : P.slashThrough, k);
      if (!lunge) pose.r += BLADES.bow * Math.sin(Math.PI * k);
      return pose;
    });
  }

  // After a lunge the blades hold their thrust, then fold back to rest just as the
  // recovery ends.
  foldBack(a, now) {
    const k = smoothStep01(clamp01((progress(a, now) - BLADES.lungeHold) / (1 - BLADES.lungeHold)));
    return this.from.map((p, i) => mix(p, this.idle(now, 0, SIDES[i]), k));
  }

  place() {
    const base = 1 / BLADE_ART.unit;
    this.blades.forEach(({ side, sprite, tint }, i) => {
      const pose = this.poses[i], root = onBlade(pose, side, 0), size = base * (1 + pose.grow);
      for (const s of [sprite, tint]) {
        s.position.set(root.x, root.y);
        s.rotation = pose.rot * side;
        s.scale.set(size, size * side);
      }
    });
  }

  // Effects ----------------------------------------------------------------
  // A smear over where each striking blade has just been, sampled back along its strike.
  drawTrail(now) {
    const g = this.trail, s = this.strike, T = BLADES.trail;
    g.clear();
    if (!s) return;
    const since = now - s.ability.strikeAt;
    const t1 = Math.min(since, s.ability.data.swingTime), t0 = Math.max(0, since - T.life);
    if (t1 <= t0) return;
    const tip = BLADE_ART.len, rows = [];
    for (let i = 0; i <= T.samples; i++) rows.push(this.strikePoses(s, lerp(t0, t1, i / T.samples)));
    for (const side of s.sides) {
      const b = side === 1 ? 0 : 1;
      const edge = rows.map((poses) => [onBlade(poses[b], side, tip * T.inner), onBlade(poses[b], side, tip)]);
      for (let i = 0; i < T.samples; i++) {
        const [a0, b0] = edge[i], [a1, b1] = edge[i + 1], k = (i + 1) / T.samples;
        g.poly([a0.x, a0.y, b0.x, b0.y, b1.x, b1.y, a1.x, a1.y]).fill({ color: lerpColor(X.color, X.hot, k), alpha: T.alpha * k });
      }
    }
  }

  // Where the parry cue flashes: on each blade the attack is about to swing, as last posed.
  cuePoints(a) {
    return this.striking(a).map((side) => onBlade(this.poses[side === 1 ? 0 : 1], side, BLADE_ART.len * BLADE_ART.cue));
  }

  setFlash(on) {
    for (const { sprite } of this.blades) sprite.texture = on ? tex.shade_blade_white : tex.shade_blade;
  }

  // The blades pop white and swell away along with the body.
  onDeath() {
    const D = DEATH_FX.enemy.pop, fx = this.enemy.attackFx;
    this.blades.forEach(({ side }, i) => {
      const pose = this.poses[i], size = 1 + pose.grow, root = fx.toWorld(onBlade(pose, side, 0));
      const w = BLADE_ART.w * size, h = BLADE_ART.h * size;
      this.enemy.world.deathFx.flare(tex.shade_blade_white, root.x, root.y, this.enemy.view.rotation + pose.rot * side, {
        time: D.time, w0: w, h0: h, w1: w * D.scale, h1: h * D.scale, color0: 0xffffff, color1: this.enemy.type.hitColor, fade: 1.5,
        anchorX: BLADE_ART.rootX / BLADE_ART.w, anchorY: BLADE_ART.rootY / BLADE_ART.h, flipY: side < 0,
      });
    });
  }
}
