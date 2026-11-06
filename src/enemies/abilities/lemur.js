// The Lemur's abilities.
import { clamp01, deltaAngle, dist, fromAngle, lerp, randSign, smoothStep01, TAU } from '../../engine/math.js';
import { ATTACK_FX } from '../../data/config.js';
import { Projectile } from '../projectile.js';
import { DEG } from './ability.js';
import { ThrowAbility } from './throw.js';

// A full turn's progress through `t` (0 → 1) of a whirl: it winds back a little first,
// sweeps round fastest through the middle and swings a little past before settling (a
// smooth in-out ease, less a bump that dips it below 0 early and over 1 late).
function whirl(t) {
  t = clamp01(t);
  return t * t * t * (t * (6 * t - 15) + 10) - 0.15 * Math.sin(TAU * t) * Math.sin(Math.PI * t);
}

// When a whirl has come `k` (up to just short of all) of the way round.
function whirlAt(k) {
  let lo = 0.2, hi = 0.82; // whirl rises steadily from below 0 to past 1 across these
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (whirl(mid) < k) lo = mid;
    else hi = mid;
  }
  return hi;
}

// Where a Lemur's crescent forms and is flung from: on its tail's spade as last drawn, or
// failing that where the spade would be with the tail stretched straight out behind.
function spadeMuzzle(ability, alpha = 1) {
  const m = ability.enemy.rig?.muzzle;
  if (m) return m;
  const b = ability.enemy.body, p = b.lerpPos(alpha), rot = b.lerpRotation(alpha) + Math.PI, r = ability.data.muzzle;
  return { x: p.x + Math.cos(rot) * r, y: p.y + Math.sin(rot) * r, rot };
}

// Projectile: whirls a full turn one way, then back the other (the Lemur's spin), its tail
// whipping round after it, and flings a crescent off the tail's spade during each as the
// tail swings out to that side. The crescents curve back in from either side onto where the
// player stood as the spin began, along a circle at least `minArcRadius` round. The body is
// turned by the spin itself, held in place.
export class SpinThrowAbility extends ThrowAbility {
  constructor(enemy, data) {
    super(enemy, data);
    this.spin = null; // the spin under way: { from, aim, side, target, fling, flung, turns, cued, watching, sweepTo, swept, spadeAt }
    this.flungAt = -Infinity; // when it last flung a crescent (LemurRig flicks the spade)
  }

  get spinDuration() { return this.data.spinTime * 2 + this.data.spinGap; }

  // How far off the aim the tail is turned when a crescent leaves it (radians): square to
  // the side for a half circle onto the target, unless that would be tighter than
  // `minArcRadius`; then further back, so the circle through it is that wide.
  flingAngle(target) {
    const d = dist(this.enemy.body.pos, target), r = this.data.minArcRadius;
    return d >= 2 * r ? Math.PI / 2 : Math.PI - Math.asin(d / (2 * r));
  }

  // Seconds after the strike crescent `i` is flung: once the body has turned half round and
  // on by `fling`, its tail (out behind it) then pointing `fling` off the aim.
  flingAt(i, fling) { return i * (this.data.spinTime + this.data.spinGap) + this.data.spinTime * whirlAt((Math.PI + fling) / TAU); }

  get armDelay() { return this.player ? this.flingAt(0, this.flingAngle(this.player.body.pos)) : 0; }

  // How far round it has turned `t` after the strike: up to a full turn, then back again.
  turned(t) {
    const d = this.data, back = t - d.spinTime - d.spinGap;
    return back < 0 ? TAU * whirl(t / d.spinTime) : TAU * (1 - whirl(back / d.spinTime));
  }

  execute() {
    this.spin = null;
    super.execute();
  }

  advance() {
    const d = this.data, b = this.enemy.body;
    switch (this.phase) {
      case 'windup': {
        this.notifyAttackStarted();
        this.strikeAt = this.world.time;
        if (!this.player) { this.setPhase('recovery', d.recoveryTime); return; }
        const target = { ...this.player.body.pos }, aim = Math.atan2(target.y - b.pos.y, target.x - b.pos.x);
        this.spin = { from: b.rotation, aim, side: randSign(), target, fling: this.flingAngle(target), flung: 0, turns: 1, cued: false };
        b.stop();
        this.sound('spin');
        this.setPhase('active', this.spinDuration);
        return;
      }
      case 'active':
        b.rotation = this.spin.from;
        this.setPhase('recovery', d.recoveryTime);
        return;
    }
    super.advance();
  }

  step(dt) {
    super.step(dt);
    const s = this.spin, d = this.data;
    if (this.phase !== 'active' || !s) return;
    const t = this.world.time - this.strikeAt, b = this.enemy.body;
    b.stop();
    b.rotation = s.from + s.side * this.turned(t);
    if (s.turns === 1 && t >= d.spinTime + d.spinGap) {
      s.turns = 2;
      this.sound('spin');
    }
    // The second crescent is cued like the first.
    if (!s.cued && t >= this.flingAt(1, s.fling) - ATTACK_FX.cue.lead) {
      s.cued = true;
      this.cueAt = this.world.time;
    }
    const turn = t < d.spinTime + d.spinGap ? 0 : 1;
    if (s.flung === turn) this.watchSpade(turn, t - turn * (d.spinTime + d.spinGap));
  }

  // Flings turn `turn`'s crescent once the spade (lagging after the body) has swept round to
  // `fling` off the aim, the way that turn goes; or as the turn ends, if it never gets there.
  // Without a drawn spade to go by, when the body has turned far enough (flingAt).
  watchSpade(turn, since) {
    const s = this.spin, d = this.data, m = this.enemy.rig?.muzzle, b = this.enemy.body;
    if (!m) {
      if (since + turn * (d.spinTime + d.spinGap) >= this.flingAt(turn, s.fling)) this.fling();
      return;
    }
    const side = turn === 0 ? s.side : -s.side, at = Math.atan2(m.y - b.pos.y, m.x - b.pos.x);
    if (s.watching !== turn) {
      s.watching = turn;
      s.sweepTo = (((side * (s.aim + side * s.fling - at)) % TAU) + TAU) % TAU; // how far round it has to go
      s.swept = 0;
    } else s.swept += side * deltaAngle(s.spadeAt, at);
    s.spadeAt = at;
    if (s.swept >= s.sweepTo || since >= d.spinTime) this.fling();
  }

  // Off the spade, out to the side the tail has swung to (the first turn's way, then back
  // the other), onto the circle that leaves along there and passes through the target:
  // square to the way there, or turned further back to keep it `minArcRadius` round.
  fling() {
    const s = this.spin, d = this.data, e = this.enemy, side = s.flung === 0 ? s.side : -s.side;
    const from = spadeMuzzle(this), wx = s.target.x - from.x, wy = s.target.y - from.y, len = Math.hypot(wx, wy);
    s.flung++;
    this.flungAt = this.world.time;
    let dir, bend = 0, arcTime = 0;
    if (len > 1e-2) {
      const off = len >= 2 * d.minArcRadius ? Math.PI / 2 : Math.PI - Math.asin(len / (2 * d.minArcRadius));
      dir = fromAngle(Math.atan2(wy, wx) + side * off);
      bend = (2 * (dir.x * wy - dir.y * wx)) / (len * len); // signed curvature
      arcTime = (2 * off) / (Math.abs(bend) * d.projectileSpeed);
    } else dir = fromAngle(from.rot);
    this.world.add(new Projectile(this.world, this, from.x, from.y, {
      dir, speed: d.projectileSpeed, lifetime: arcTime + d.chaseTime + d.coastTime, damage: e.damage * d.damageMultiplier,
      size: d.projectileSize, look: d.look, curve: bend * d.projectileSpeed, curveTime: arcTime,
      turnRate: d.turnRate, homingDelay: arcTime, homingTime: arcTime + d.chaseTime, spin: Math.sign(bend) || 1,
    }));
    this.sound('crescent');
  }

  // The first crescent forms on the spade over the wind-up and rides it through the spin
  // until flung; the second forms over `regrowTime` once it has been.
  charge(now) {
    if (this.phase === 'windup') return super.charge(now);
    const s = this.spin;
    if (this.phase !== 'active' || !s || s.flung >= 2) return null;
    if (s.flung === 0) return { t: 1, since: Infinity };
    const since = now - this.flungAt;
    return { t: clamp01(since / this.data.regrowTime), since };
  }

  chargePoints(alpha) { return [spadeMuzzle(this, alpha)]; }
  cuePoints() { return [this.enemy.rig?.muzzleLocal ?? { x: -this.data.muzzle, y: 0 }]; }
}

// Projectile: `shots` crescents (the Lemur's volley), `shotInterval` apart, each flung
// straight at the player off the spade as its tail sweeps round in front, the next sweeping
// back the other way (`swing`, posed by tailPose). Each wind-up draws the tail round to its
// side and sweeps it back to the front as it ends, re-aiming until the last `lockTime`;
// the strike then follows through for `swing.followTime`, the crescent leaving the moment
// the spade (lagging after) comes past the front, or as the follow-through ends.
export class VolleyAbility extends ThrowAbility {
  constructor(enemy, data) {
    super(enemy, data);
    this.shots = 0; // fired since the attack began
    this.side = 1; // the side the tail is drawn round to for the first: 1 its right, -1 its left
    this.sweep = 1; // the side the sweep under way (or the last) came from
    this.fired = false; // whether this sweep's crescent has left
    this.flungAt = -Infinity; // when it last flung a crescent (LemurRig flicks the spade)
  }

  // The side the tail is drawn round to for shot `n` (from 0), sweeping across from there.
  sideOf(n) { return n % 2 ? -this.side : this.side; }

  execute() {
    this.shots = 0;
    this.side = randSign();
    super.execute();
  }

  step(dt) {
    super.step(dt);
    if (this.phase === 'active' && !this.fired && this.spadePastFront()) this.fire();
    if (this.phase === 'windup' && this.shots > 0 && this.player && this.tracking()) this.enemy.ai.turnToward(this.dirToPlayer(), dt);
  }

  advance() {
    const d = this.data;
    switch (this.phase) {
      case 'windup':
        if (this.shots === 0) this.notifyAttackStarted();
        this.sweep = this.sideOf(this.shots);
        this.fired = false;
        this.setPhase('active', d.swing.followTime);
        return;
      case 'active':
        if (!this.fired) this.fire();
        if (this.shots < d.shots) {
          this.sound('windup');
          this.setPhase('windup', d.shotInterval - d.swing.followTime);
        } else this.setPhase('recovery', d.recoveryTime);
        return;
    }
    super.advance();
  }

  // Whether the spade has come past the front, the way this sweep goes (yes, if none is drawn).
  spadePastFront() {
    const m = this.enemy.rig?.muzzle, b = this.enemy.body;
    return !m || this.sweep * deltaAngle(b.rotation, Math.atan2(m.y - b.pos.y, m.x - b.pos.x)) <= 0;
  }

  fire() {
    this.fired = true;
    this.strikeAt = this.world.time;
    if (this.player) this.release();
    this.shots++;
  }

  // Off the spade, straight at the player, a little off toward the way the tail sweeps.
  release() {
    const e = this.enemy, d = this.data, p = this.player.body.pos, from = spadeMuzzle(this);
    this.flungAt = this.world.time;
    const aim = Math.atan2(p.y - from.y, p.x - from.x) - this.sweep * d.spreadDeg * DEG;
    this.world.add(new Projectile(this.world, this, from.x, from.y, {
      dir: fromAngle(aim), speed: d.projectileSpeed, lifetime: d.projectileLifetime, damage: e.damage * d.damageMultiplier,
      size: d.projectileSize, look: d.look, spin: randSign(),
    }));
    this.sound('crescent');
  }

  // Each crescent forms on the spade over its wind-up and rides it until it leaves.
  charge(now) {
    if (this.phase === 'active' && !this.fired) return { t: 1, since: Infinity };
    return super.charge(now);
  }

  // Where its tail leaves the body (radians round from its facing: 0 ahead, π behind, + its
  // right) at render time `now`, for LemurRig; null when the attack isn't swinging it.
  // Each wind-up draws it round to its side (from behind for the first, from where the last
  // follow-through left it after), then sweeps it to the front in the last `swingIn`; each
  // strike follows it on through to the other side; the recovery swings it on round behind.
  tailPose(now) {
    const S = this.data.swing, cock = S.cockDeg * DEG, through = S.throughDeg * DEG;
    const t = now - this.phaseStartedAt, span = this.phaseEndsAt - this.phaseStartedAt;
    switch (this.phase) {
      case 'active': return -this.sweep * through * (1 - (1 - clamp01(t / S.followTime)) ** 2);
      case 'recovery': return lerp(-this.sweep * through, -this.sweep * Math.PI, smoothStep01(t / Math.max(1e-3, span)));
      case 'windup': {
        const side = this.sideOf(this.shots), swingAt = span - S.swingIn;
        if (t >= swingAt) return side * cock * (1 - clamp01((t - swingAt) / S.swingIn) ** 2);
        const k = smoothStep01(t / swingAt);
        return this.shots === 0 ? Math.PI + deltaAngle(Math.PI, side * cock) * k : lerp(side * through, side * cock, k);
      }
    }
    return null;
  }

  chargePoints(alpha) { return [spadeMuzzle(this, alpha)]; }
  cuePoints() { return [this.enemy.rig?.muzzleLocal ?? { x: this.data.muzzle, y: 0 }]; }
}
