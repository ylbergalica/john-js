// The Corsair's abilities.
import { dist, fromAngle, lerp, randRange, randSign, smoothStep01, TAU } from '../../engine/math.js';
import { FIXED_DT } from '../../data/config.js';
import { CHARGE_STRETCH, followThrough } from '../attackView.js';
import { onScimitar, scimitarSwingPose } from '../corsairRig.js';
import { HitboxAbility } from './ability.js';
import { LungeAbility } from './melee.js';

// Body: a scimitar drawn back on the side it is held and swung across the front as the
// enemy steps in (the Corsair's slash), leaving it held on the other side. The blade is the
// hitbox: capsules along its curve wherever it has swept since the last step, posed as it's
// drawn (corsairRig.js), stretched and turned with the charging body (attackView.js).
export class ScimitarAbility extends LungeAbility {
  constructor(enemy, data) {
    super(enemy, data, { type: 'group', parts: [] }, null, {
      kind: 'body', parryKnockback: data.parryKnockback, strikeSound: data.strikeSound,
    });
    enemy.heldSide ??= randSign(); // the side its blade is on (1 right, -1 left), shared with its rush
    this.swingSide = enemy.heldSide; // the side the latest swing came from
    this.sweptTo = 0; // seconds into the strike its hitbox last reached
  }

  // The side the coming swing (in a wind-up) or the latest one comes from.
  get side() { return this.phase === 'windup' ? this.enemy.heldSide : this.swingSide; }

  strike() {
    super.strike();
    this.swingSide = this.enemy.heldSide;
    this.enemy.heldSide = -this.swingSide;
    this.sweptTo = 0;
    this.sweep();
  }

  step(dt) {
    super.step(dt);
    if (this.phase === 'active') this.sweep();
  }

  sweep() {
    const M = this.data.bladeHit, t0 = this.sweptTo, t1 = this.world.time - this.strikeAt, { x: sx, y: sy } = CHARGE_STRETCH, parts = [];
    const [r0, r1] = M.reach, mid = (r0 + r1) / 2;
    for (let i = 0; i < M.samples; i++) {
      const t = lerp(t0, t1, i / Math.max(1, M.samples - 1)), pose = scimitarSwingPose(this.swingSide, t / this.data.swingTime);
      const turn = followThrough(this, t), c = Math.cos(turn), s = Math.sin(turn);
      const at = (along) => {
        const q = onScimitar(pose, along), x = q.x * sx, y = q.y * sy;
        return { x: c * x - s * y, y: s * x + c * y };
      };
      for (const [u, v] of [[r0, mid], [mid, r1]]) { // two capsules, to follow the curve
        const a = at(u), b = at(v);
        parts.push({ type: 'segment', ax: a.x, ay: a.y, bx: b.x, by: b.y, r: M.radius * (1 + pose.grow) });
      }
    }
    this.hitbox.shape.parts = parts;
    this.sweptTo = t1;
  }
}

// Body: a charge of swinging steps (the Corsair's rush). Through the wind-up it turns to
// follow the player; then it rushes straight along its locked aim, swinging its blade from
// side to side with each `stride` it covers, `swingShare` of each step spent in the swing
// (corsairRig.js), surging `surge` faster as each swing starts and easing off after. It
// sets off at `startSpeed` of its `speed`, reaching full speed `rampTime` after. It keeps
// going until it runs into something or `duration` runs out:
//   a wall or another enemy  it crashes, knocked back `bounceForce` and left reeling,
//                            stunned for `crashStunTime`
//   the player               it cuts straight through them, passing through their body,
//                            and carries on `followTime` before it stops
// Stopping (but not crashing), it skids to a halt, its speed easing away over `skidEase`
// seconds, as it recovers. Brushing past the player without its front reaching them, it
// passes through them all the same.
// It would rather close in and swing: it only rushes once the player has kept further than
// `patience.range` away for a while (`patience.time`, rolled afresh each time they slip away).
export class RushAbility extends HitboxAbility {
  constructor(enemy, data) {
    super(enemy, data, { type: 'circle', r: data.hitboxRadius, forward: data.hitboxForward, arcDeg: data.hitboxArcDeg }, null, {
      kind: 'body', parryKnockback: data.parryKnockback, strikeSound: data.strikeSound,
    });
    enemy.heldSide ??= randSign(); // shared with its slash
    this.dir = { x: 1, y: 0 };
    this.lastPos = { x: 0, y: 0 };
    this.speed = 0; // as last set
    this.steps = 0; // steps taken since it set off (fractional)
    this.launchSide = 1; // the side the first swing came from
    this.cutAt = -Infinity; // when it last ran into the player
    this.crashedAt = -Infinity;
    this.crash = null; // where it last crashed: { x, y, angle (the way it was going) }
    this.farSince = null; // since when the player has kept out of reach, if they have
    this.patience = 0; // and how long it will wait this time
  }

  shouldExecute() {
    return this.farSince !== null && this.world.time - this.farSince >= this.patience && super.shouldExecute();
  }

  // Keeps track of how long the player has been out of reach.
  watchReach() {
    const p = this.player, P = this.data.patience;
    if (!p || dist(this.enemy.body.pos, p.body.pos) <= P.range) this.farSince = null;
    else if (this.farSince === null) {
      this.farSince = this.world.time;
      this.patience = randRange(...P.time);
    }
  }

  get cut() { return this.cutAt >= this.strikeAt; }
  get burning() { return !this.cut; } // once through the player it no longer hurts

  // How many steps in it was at time `t` (a little before the latest step, for drawing).
  stepsAt(t) { return Math.max(0, this.steps - ((this.world.time - t) * this.speed) / this.data.stride); }

  strike() {
    const b = this.enemy.body;
    this.dir = fromAngle(b.rotation);
    this.lastPos = { ...b.pos };
    this.speed = 0;
    this.steps = 0;
    this.launchSide = this.enemy.heldSide;
    this.enemy.heldSide = -this.launchSide;
  }

  step() {
    this.watchReach();
    super.step();
    if (this.phase === 'active') this.run();
    else if (this.phase === 'recovery') {
      const b = this.enemy.body, k = Math.exp(-FIXED_DT / this.data.skidEase);
      b.vel.x *= k;
      b.vel.y *= k;
    }
  }

  // Physics stops it at walls and other enemies (or deflects it along them): anything worse
  // than a glancing blow (losing over a quarter of its speed) is a crash, unless it's the
  // player in the way.
  run() {
    const e = this.enemy, b = e.body, d = this.data, w = this.world, dir = this.dir, t = w.time - this.strikeAt;
    if (this.cut) {
      this.hitbox.setActive(false);
      if (w.time - this.cutAt >= d.followTime) { this.advance(); return; }
    }
    if (t > 0) {
      const moved = (b.pos.x - this.lastPos.x) * dir.x + (b.pos.y - this.lastPos.y) * dir.y;
      if (moved < this.speed * FIXED_DT * 0.75) {
        const p = this.player?.body;
        if (p && !b.ignores && Math.hypot(p.pos.x - b.pos.x, p.pos.y - b.pos.y) < p.radius + b.radius + 0.05) b.ignores = new Set([p]);
        else { this.crashInto(); return; }
      }
    }
    const before = Math.floor(this.steps), u = this.steps % 1;
    const ramp = lerp(d.startSpeed, 1, smoothStep01(t / d.rampTime));
    this.speed = d.speed * ramp * (1 + d.surge * Math.cos(TAU * u));
    b.vel.x = dir.x * this.speed;
    b.vel.y = dir.y * this.speed;
    this.lastPos = { ...b.pos };
    this.steps += (this.speed * FIXED_DT) / d.stride;
    if (Math.floor(this.steps) > before) { // the next swing begins
      e.heldSide = -e.heldSide;
      this.sound(d.swingSound);
    }
  }

  // The hitbox reached the player: through them it goes.
  onStruck(player) {
    if (this.phase !== 'active' || this.cut) return;
    this.cutAt = this.world.time;
    this.enemy.body.ignores = new Set([player.body]);
  }

  crashInto() {
    const e = this.enemy, b = e.body, d = this.data, dir = this.dir, w = this.world;
    this.crashedAt = w.time;
    this.crash = { x: b.pos.x + dir.x * b.radius, y: b.pos.y + dir.y * b.radius, angle: Math.atan2(dir.y, dir.x) };
    this.endActive();
    b.stop();
    b.addImpulse(-dir.x * d.bounceForce, -dir.y * d.bounceForce);
    const { volume } = w.positional(b.pos), s = d.crashShake;
    if (volume > 0) w.camera.shake(s.duration, s.strength * volume, s.frequency);
    this.sound(d.crashSound);
    e.stunned = true;
    this.takeOverStun();
    this.setPhase('stunned', d.crashStunTime);
  }

  endActive() {
    super.endActive();
    this.enemy.body.ignores = null;
  }

  dispose() {
    super.dispose();
    this.enemy.body.ignores = null;
  }
}
