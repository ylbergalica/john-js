// Enemy abilities as small phase machines on the simulation clock:
//   ready → windup → active → recovery → ready   (melee hitbox abilities)
//   ready → windup → recovery → ready            (projectile throw)
// A parry interrupts with damage and a stun phase.
// Each ability is one of three kinds, which decides how it looks (attackView.js) and what
// a parry does to the attack itself:
//   body        the enemy itself is the weapon (a charge); a parry cuts it short
//   zone        an area near the enemy is struck (in front of it, all around, or a beam); a
//               parry only disarms it: it plays out harmlessly while the enemy is stunned
//   projectile  something is thrown; a parry breaks the projectile
import { clamp, clamp01, clampLength, deltaAngle, dist, dirTo, fromAngle, lerp, pickWeighted, randRange, randSign, smoothStep01, TAU } from '../engine/math.js';
import { ATTACK_FX, BLIGHT, FIXED_DT, NOVA, WEB } from '../data/config.js';
import { segmentPointDistSq } from '../engine/physics.js';
import { EnemyHitbox } from './hitbox.js';
import { Projectile } from './projectile.js';
import { MistShell } from './mistShell.js';
import { DamageCause } from '../game/damage.js';
import { hurtDistance } from '../game/hurtbox.js';
import { ZoneView, ChargeView, BeamView, CHARGE_STRETCH, followThrough, lookColor } from './attackView.js';
import { maulSwingPose, onMaul, sizeOf } from './maulerRig.js';
import { fistSweep, hookFist, punchFist } from './boxerRig.js';
import { onScimitar, scimitarSwingPose } from './corsairRig.js';
import { Glob } from './glob.js';
import { ReelView, Silk, Thread, WebBall, segmentsDist } from './web.js';
import { AIState } from './ai.js';
import { blightMuzzle, blightParts } from '../render/sprites.js';

const DEG = Math.PI / 180;

class Ability {
  constructor(enemy, data) {
    this.enemy = enemy;
    this.data = data;
    this.lastUseTime = -Infinity;
    this.phase = 'ready';
    this.phaseStartedAt = 0;
    this.phaseEndsAt = 0;
    this.strikeAt = -Infinity; // when the attack last fired
    this.cueAt = -Infinity; // when its cue last flashed
    this.activeEndedAt = -Infinity; // when its hitbox last stopped hurting
    this.hitbox = null;
    this.view = null;
  }

  get world() { return this.enemy.world; }
  get player() { return this.enemy.player; }

  canExecute() {
    const e = this.enemy;
    if (e.isActing || e.stunned) return false;
    if (this.world.time < this.lastUseTime + this.data.cooldown) return false;
    return this.shouldExecute();
  }

  // In range: within `range` of the player, and no nearer than `minRange` if it has one.
  shouldExecute() {
    const p = this.player, d = p && dist(this.enemy.body.pos, p.body.pos);
    return !!p && d <= this.data.range && d >= (this.data.minRange ?? 0) && this.hasClearAttackPath();
  }

  forceExecute() {
    this.execute();
    this.lastUseTime = this.world.time;
  }

  setPhase(phase, duration) {
    this.phase = phase;
    this.phaseStartedAt = this.world.time;
    this.phaseEndsAt = this.world.time + Math.max(0, duration);
  }

  step() {
    // The parry cue: a flash where the attack comes from, `ATTACK_FX.cue.lead` before it can
    // first hurt, so the player knows when to parry (EnemyAttackFx shows it).
    if (this.phase === 'windup' && this.cueAt < this.phaseStartedAt
      && this.world.time >= this.phaseEndsAt + this.armDelay - ATTACK_FX.cue.lead) this.cueAt = this.world.time;
    // Loop so zero-length phases chain within one step.
    while (this.phase !== 'ready' && this.world.time >= this.phaseEndsAt) this.advance();
  }

  // How long after the wind-up ends the attack can first hurt.
  get armDelay() { return 0; }

  // Where the cue flashes, in the enemy's frame (+x forward): its front, or `cueAt` body
  // radii ahead.
  cuePoints() { return [{ x: this.enemy.body.radius * (this.data.cueAt ?? 1), y: 0 }]; }

  // Sweeps a circle toward the player; walls and other enemies block the attack, all but a
  // squat one the others attack past (its type's `shootOver`, the Bulwark).
  hasClearAttackPath() {
    const d = this.data, p = this.player;
    if (!d.requireClearAttackPath || !p) return true;
    const e = this.enemy, o = e.body.pos;
    const toX = p.body.pos.x - o.x, toY = p.body.pos.y - o.y;
    const centerDist = Math.hypot(toX, toY);
    if (centerDist <= 1e-6) return true;
    const dx = toX / centerDist, dy = toY / centerDist;
    const offset = Math.max(0, d.attackPathOriginOffset);
    const castDist = Math.max(0, centerDist - p.body.radius) - offset;
    if (castDist <= 1e-6) return true;
    const r = Math.max(0.01, d.attackPathCastSize.y / 2);
    const sx = o.x + dx * offset, sy = o.y + dy * offset;
    if (this.world.physics.circleCastHitsWall(sx, sy, dx, dy, castDist, r)) return false;
    for (const other of this.world.enemies) {
      if (other === e || other.dead || other.type.shootOver) continue;
      const ob = other.body;
      const t = Math.max(0, Math.min(castDist, (ob.pos.x - sx) * dx + (ob.pos.y - sy) * dy));
      const qx = sx + dx * t - ob.pos.x, qy = sy + dy * t - ob.pos.y;
      if (qx * qx + qy * qy < (ob.radius + r) ** 2) return false;
    }
    return true;
  }

  // Whether the enemy should keep turning toward the player: always, except for the last
  // `lockTime` seconds of the wind-up, when its aim is fixed.
  tracking() {
    return this.phase !== 'windup' || this.phaseEndsAt - this.world.time > (this.data.lockTime ?? 0);
  }

  dirToPlayer() {
    const p = this.player;
    return p ? dirTo(this.enemy.body.pos, p.body.pos) : fromAngle(this.enemy.body.rotation);
  }

  awayFromPlayer() {
    const p = this.player;
    return p ? dirTo(p.body.pos, this.enemy.body.pos) : { x: 0, y: 0 };
  }

  notifyAttackStarted() { this.enemy.ai.onAbilityAttackStarted(this); }

  // After the physics step: whether its hitbox touches the player.
  afterPhysics() { this.hitbox?.afterPhysics(); }

  // Called off by a stun from outside (Enemy.stun): a wind-up comes to nothing and a strike
  // stops hurting. A parried zone still playing out is left to it, its own stun to follow.
  interrupt() {
    if (this.phase === 'windup') this.phase = 'ready';
    else if (this.phase === 'active' && this.parriedStunEndsAt == null) {
      this.endActive?.();
      this.setPhase('recovery', 0);
    }
  }

  // Before a parry stuns the enemy afresh: whatever else it was winding up comes to nothing,
  // and a stun still running from an earlier parry gives way to this one.
  takeOverStun() {
    for (const a of this.enemy.abilities.values()) {
      if (a === this) continue;
      if (a.phase === 'windup' || a.phase === 'stunned') a.phase = 'ready';
      if (a.parriedStunEndsAt != null) a.parriedStunEndsAt = null;
    }
  }

  // Damage taken when parried, plus the player's parry-streak bonus, both scaled by Exalted.
  parryDamage() {
    const base = this.data.damageMultiplier * this.enemy.damage;
    return (base + (this.world.livePlayer?.parryBonusDamage(base) ?? 0)) * this.world.adrenaline.damageMultiplier;
  }

  sound(name) { this.world.sound(name, this.enemy.body.pos, { pitch: this.enemy.type.sfxPitch }); }

  // How far an impulse carries the enemy over `duration` under the physics' per-step damping.
  travel(impulse, duration) {
    const b = this.enemy.body, damp = 1 / (1 + FIXED_DT * b.damping);
    let v = impulse / b.mass, d = 0;
    for (let t = 0; t < duration; t += FIXED_DT) { v *= damp; d += v * FIXED_DT; }
    return d;
  }

  dispose() {
    this.hitbox?.destroy();
    this.view?.destroy();
  }
}

// Melee abilities with a hitbox (Dash, Ram, Laser, Punch, Swing, Slashes, Smash, Ground Pound, Slam). Zones pass
// `area`, the shape ZoneView burns (see there): everywhere the hitbox reaches while active.
// `kind` defaults to 'zone', so a new zone attack is disarmed rather than cut short by a parry.
// Unless `armOnStrike` is off, the hitbox starts hurting (and the zone shows) on the strike.
class HitboxAbility extends Ability {
  constructor(enemy, data, shape, area, { kind = 'zone', stopsOnStart = true, parryKnockback = 5, strikeSound, continuous = false, armOnStrike = true } = {}) {
    super(enemy, data);
    this.kind = kind;
    this.armOnStrike = armOnStrike;
    this.hitbox = new EnemyHitbox(enemy, this, shape, { continuous });
    if (area) this.view = new ZoneView(this, area);
    this.strikeSound = strikeSound;
    this.stopsOnStart = stopsOnStart;
    this.parryKnockback = parryKnockback;
    this.parriedStunEndsAt = null; // set while a parried zone plays out
  }

  execute() {
    this.enemy.isActing = true;
    if (this.stopsOnStart) this.enemy.body.stop();
    this.sound('windup');
    this.setPhase('windup', this.data.windUpTime);
  }

  advance() {
    const e = this.enemy;
    switch (this.phase) {
      case 'windup':
        this.notifyAttackStarted();
        this.strikeAt = this.world.time;
        this.strike();
        this.sound(this.strikeSound);
        if (this.armOnStrike) this.arm();
        this.setPhase('active', this.data.duration);
        break;
      case 'active':
        this.endActive();
        if (this.parriedStunEndsAt !== null) {
          this.setPhase('stunned', this.parriedStunEndsAt - this.world.time);
          this.parriedStunEndsAt = null;
        } else this.setPhase('recovery', this.data.recoveryTime);
        break;
      case 'recovery':
        e.isActing = false;
        this.phase = 'ready';
        break;
      case 'stunned':
        e.stunned = false;
        e.isActing = false;
        this.phase = 'ready';
        break;
    }
  }

  strike() {}

  // The hitbox starts hurting and the zone shows where (pinned at `at` if given).
  arm(at) {
    this.view?.strike(at);
    this.hitbox.setActive(true);
  }

  // When the zone started burning: the strike, unless it arms later.
  get zoneAt() { return this.strikeAt; }

  endActive() {
    this.hitbox.setActive(false);
    this.activeEndedAt = this.world.time;
  }

  // A zone stays active (and keeps its look) with its hitbox off. The stun starts now either
  // way; for a zone, whatever is left of it once the strike ends follows (see advance).
  // A late parry (Player.hitBy) can come once the strike is over; then the stun just starts,
  // breaking off anything the enemy has begun since. Parried again while stunned, it all
  // happens again: the knockback, the damage and the stun from the start.
  onParry() {
    const e = this.enemy, striking = this.phase === 'active', zone = striking && this.kind === 'zone';
    if (zone) this.hitbox.setActive(false);
    else if (striking) this.endActive();
    e.body.stop();
    const k = this.awayFromPlayer();
    e.body.addImpulse(k.x * this.parryKnockback, k.y * this.parryKnockback);
    e.takeDamage(this.parryDamage(), null, null, DamageCause.Parry);
    if (e.dead || e.dying) return;
    e.stunned = true;
    this.takeOverStun();
    if (zone) {
      this.parriedStunEndsAt = this.world.time + this.data.parryStunTime;
      return;
    }
    this.setPhase('stunned', this.data.parryStunTime);
  }
}

// Body: charges the way it faces, hurting only across its front `hitboxArcDeg`.
class DashAbility extends HitboxAbility {
  constructor(enemy, data) {
    super(enemy, data, { type: 'circle', r: data.hitboxRadius, arcDeg: data.hitboxArcDeg }, null, {
      kind: 'body', parryKnockback: data.dashForce * 0.3, strikeSound: 'enemyDash',
    });
  }
  strike() {
    const d = fromAngle(this.enemy.body.rotation);
    this.enemy.body.addImpulse(d.x * this.data.dashForce, d.y * this.data.dashForce);
  }
}

// Body: locks its aim, then flies straight until it crashes into a wall.
class RamAbility extends HitboxAbility {
  constructor(enemy, data) {
    super(enemy, data, { type: 'circle', r: data.hitboxRadius }, null, {
      kind: 'body', parryKnockback: data.parryKnockback, strikeSound: 'boost',
    });
    this.dir = { x: 1, y: 0 };
    this.lastPos = { x: 0, y: 0 };
  }

  strike() {
    this.dir = fromAngle(this.enemy.body.rotation);
    this.lastPos = { ...this.enemy.body.pos };
  }

  step() {
    super.step();
    if (this.phase === 'active') this.fly();
  }

  // Physics stops it at walls (or deflects it along them): anything worse than a glancing
  // blow (losing over a quarter of its speed, i.e. hitting at more than ~30°) is a crash.
  fly() {
    const b = this.enemy.body, d = this.data, dir = this.dir;
    if (this.world.time > this.strikeAt) {
      const moved = (b.pos.x - this.lastPos.x) * dir.x + (b.pos.y - this.lastPos.y) * dir.y;
      if (moved < d.speed * FIXED_DT * 0.75) {
        this.crash();
        return;
      }
    }
    b.vel.x = dir.x * d.speed;
    b.vel.y = dir.y * d.speed;
    this.lastPos = { ...b.pos };
  }

  crash() {
    const b = this.enemy.body, d = this.data, dir = this.dir, w = this.world, C = ATTACK_FX.crash;
    this.endActive();
    b.stop();
    b.addImpulse(-dir.x * d.bounceForce, -dir.y * d.bounceForce);
    const x = b.pos.x + dir.x * b.radius, y = b.pos.y + dir.y * b.radius, back = Math.atan2(-dir.y, -dir.x);
    w.effects.burst(x, y, back, { ...C, color: ATTACK_FX.color });
    w.effects.burst(x, y, back, { ...C, count: C.count / 2, color: ATTACK_FX.hot });
    const { volume } = w.positional(b.pos), s = d.crashShake;
    if (volume > 0) w.camera.shake(s.duration, s.strength * volume, s.frequency);
    this.sound('crash');
    this.setPhase('recovery', d.crashRecoveryTime);
  }
}

// Zone: a beam from the nose to the first wall along its locked aim, held while the
// enemy stays put.
class LaserAbility extends HitboxAbility {
  constructor(enemy, data) {
    super(enemy, data, { type: 'beam', from: data.beamFrom, length: 0, r: data.beamWidth / 2 }, null, {
      parryKnockback: data.parryKnockback, strikeSound: 'laserFire', continuous: true,
    });
    this.view = new BeamView(this);
    this.locked = false;
  }

  execute() {
    super.execute();
    this.locked = false;
    this.sound('laserCharge');
  }

  step() {
    super.step();
    if (this.phase === 'windup' && !this.locked && !this.tracking()) {
      this.locked = true;
      this.sound('laserLock');
    }
    if (this.phase === 'active') this.enemy.body.stop();
  }

  strike() {
    const b = this.enemy.body, s = this.hitbox.shape, c = Math.cos(b.rotation), sn = Math.sin(b.rotation);
    s.length = this.world.physics.rayLength(b.pos.x + c * s.from, b.pos.y + sn * s.from, c, sn, this.data.maxLength);
  }

  cuePoints() { return [{ x: this.hitbox.shape.from, y: 0 }]; }
}

// Zone: a blow in front that steps into the player; the area stretches over the step.
class PunchAbility extends HitboxAbility {
  constructor(enemy, data) {
    const h = data.hitboxSize / 2, f = data.forwardOffset;
    super(enemy, data, { type: 'box', forward: f, hw: h, hh: h }, { type: 'box', near: f - h, far: f + h, hh: h }, { strikeSound: 'punch' });
    this.view.shape.far += this.travel(data.stepForce, data.duration);
  }
  strike() {
    const d = this.dirToPlayer();
    this.enemy.body.addImpulse(d.x * this.data.stepForce, d.y * this.data.stepForce);
  }
}

// Zone attacks that lunge: the enemy steps `stepDistance` along its aim over `stepTime` as
// it strikes, stopping dead if parried.
class LungeAbility extends HitboxAbility {
  constructor(enemy, data, shape, area, opts) {
    super(enemy, data, shape, area, opts);
    this.dir = { x: 1, y: 0 };
    this.stepping = false;
  }

  strike() { this.dir = fromAngle(this.enemy.body.rotation); }

  // How far the current strike steps.
  get stepDistance() { return this.data.stepDistance; }

  step() {
    super.step();
    const b = this.enemy.body, d = this.data;
    const stepping = this.phase === 'active' && this.parriedStunEndsAt === null && this.world.time - this.strikeAt < d.stepTime;
    if (stepping) {
      const speed = this.stepDistance / d.stepTime;
      b.vel.x = this.dir.x * speed;
      b.vel.y = this.dir.y * speed;
    } else if (this.stepping && !this.enemy.stunned) b.stop();
    this.stepping = stepping;
  }

  shake() {
    const s = this.data.shake, { volume } = this.world.positional(this.enemy.body.pos);
    if (s && volume > 0) this.world.camera.shake(s.duration, s.strength * volume, s.frequency);
  }

  // The cue flashes on the held weapon, if the enemy's rig has one.
  cuePoints() {
    const at = this.enemy.rig?.cuePoints(this);
    return at?.length ? at : super.cuePoints();
  }
}

// Body: a held weapon swung across the front as the enemy lunges. The hitbox is the weapon,
// so a parry meets it and cuts the swing short: given `maulHit`, the Mauler's maul itself,
// wherever it has swept since the last step; otherwise a circle `hitboxRadius` around a
// point `hitboxForward` ahead (the Shade's blades).
class SwingAbility extends LungeAbility {
  constructor(enemy, data) {
    super(enemy, data, data.maulHit ? { type: 'group', parts: [] } : { type: 'circle', r: data.hitboxRadius, forward: data.hitboxForward }, null, {
      kind: 'body', parryKnockback: data.parryKnockback, strikeSound: data.strikeSound,
    });
    this.sweptTo = 0; // seconds into the strike the maul's hitbox last reached
  }

  strike() {
    super.strike();
    this.sweptTo = 0;
    this.sweep();
  }

  step(dt) {
    super.step(dt);
    if (this.phase === 'active') this.sweep();
  }

  // The maul's part of the hitbox: capsules along it at `maulHit.samples` points of its
  // swing, from where it was at the last step to where it is now, posed as it's drawn
  // (maulerRig.js), stretched and turned with the charging body (attackView.js).
  sweep() {
    const M = this.data.maulHit;
    if (!M) return;
    const t0 = this.sweptTo, t1 = this.world.time - this.strikeAt, { x: sx, y: sy } = CHARGE_STRETCH, parts = [];
    for (let i = 0; i < M.samples; i++) {
      const t = lerp(t0, t1, i / Math.max(1, M.samples - 1)), pose = maulSwingPose(t / this.data.swingTime);
      const turn = followThrough(this, t), c = Math.cos(turn), s = Math.sin(turn);
      const at = (along) => {
        const q = onMaul(pose, along), x = q.x * sx, y = q.y * sy;
        return { x: c * x - s * y, y: s * x + c * y };
      };
      const a = at(M.reach[0]), b = at(M.reach[1]);
      parts.push({ type: 'segment', ax: a.x, ay: a.y, bx: b.x, by: b.y, r: M.radius * sizeOf(pose) });
    }
    this.hitbox.shape.parts = parts;
    this.sweptTo = t1;
  }
}

// Body: swings from each side in turn, right first, `strikes` of them `strikeInterval`
// apart (the Shade's slashes), each stepping its own `stepDistance`. Between strikes it
// winds up again, so each strike is told and cued like the first, turning to follow the
// player until its aim locks. Through every wind-up it keeps advancing on the player at
// `advanceSpeed`, until it is `advanceStop` away. A parry cuts the rest short.
class SlashesAbility extends SwingAbility {
  constructor(enemy, data) {
    super(enemy, data);
    this.strikeCount = 0; // strikes made since the attack began
  }

  // The side the coming strike (in a wind-up) or the latest one swings from: 1 right, -1 left.
  get side() { return (this.phase === 'windup' ? this.strikeCount : this.strikeCount - 1) % 2 ? -1 : 1; }

  get stepDistance() { return this.data.stepDistance[Math.max(0, this.strikeCount - 1)]; }

  execute() {
    this.strikeCount = 0;
    super.execute();
  }

  step(dt) {
    super.step(dt);
    if (this.phase !== 'windup' || !this.player) return;
    const ai = this.enemy.ai, d = this.data, dir = ai.pathDirection(d.advanceStop);
    if (dir) ai.steer(dir.x * d.advanceSpeed, dir.y * d.advanceSpeed);
    else ai.steer(0, 0);
    if (this.strikeCount > 0 && this.tracking()) ai.turnToward(this.dirToPlayer(), dt);
  }

  advance() {
    const d = this.data;
    if (this.phase === 'active' && this.strikeCount < d.strikes) {
      this.endActive();
      this.setPhase('windup', d.strikeInterval - d.duration);
      return;
    }
    if (this.phase === 'windup') this.strikeCount++;
    super.advance();
  }
}

// Body: a fist conjured at one side (at random) and swung round across the front as the
// enemy steps in (the Boxer's hook). The fist is the hitbox, growing as it goes: capsules
// along where it has swept since the last step, posed as it's drawn (boxerRig.js) and turned
// with the body's follow-through.
class HookAbility extends LungeAbility {
  constructor(enemy, data) {
    super(enemy, data, { type: 'group', parts: [] }, null, {
      kind: 'body', parryKnockback: data.parryKnockback, strikeSound: data.strikeSound,
    });
    this.side = 1; // the side the fist comes from: 1 its right, -1 its left
    this.sweptTo = 0; // seconds into the strike its hitbox last reached
  }

  execute() {
    this.side = randSign();
    super.execute();
  }

  strike() {
    super.strike();
    this.sweptTo = 0;
    this.sweep();
  }

  step(dt) {
    super.step(dt);
    if (this.phase === 'active') this.sweep();
  }

  sweep() {
    const d = this.data, t1 = this.world.time - this.strikeAt;
    this.hitbox.shape.parts = fistSweep((t) => {
      const q = hookFist(this.side, Math.min(t, d.swingTime) / d.swingTime), turn = followThrough(this, t), c = Math.cos(turn), s = Math.sin(turn);
      return { x: c * q.x - s * q.y, y: s * q.x + c * q.y, size: q.size };
    }, this.sweptTo, t1, d.sweepSamples);
    this.sweptTo = t1;
  }
}

// Body: a scimitar drawn back on the side it is held and swung across the front as the
// enemy steps in (the Corsair's slash), leaving it held on the other side. The blade is the
// hitbox: capsules along its curve wherever it has swept since the last step, posed as it's
// drawn (corsairRig.js), stretched and turned with the charging body (attackView.js).
class ScimitarAbility extends LungeAbility {
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
class RushAbility extends HitboxAbility {
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

// Body: a big step in, then `punches` thrown `punchInterval` apart, from each hand in turn,
// each out at random across the front `coneDeg` (the Boxer's flurry). Each fist has a
// hitbox of its own, `hitboxScale` × the fist, growing with it as it shoots out
// (`punchTime`) and following it `linger` seconds into its way back. Punches overlap, so
// they take turns at `hitboxes` hitboxes: each is off a while between its punches, so a
// fist can hurt even where the last one did, and the one that hurt the player stops
// hurting (so can be parried again) soon after. Once the step is done it keeps turning to
// the player at up to `turnRate` and pressing in at `advanceSpeed`. Blows don't stop it;
// only a parry does, stunning it as for any charge. Only the step burns its body: the fists
// do the rest.
class FlurryAbility extends LungeAbility {
  constructor(enemy, data) {
    super(enemy, data, { type: 'group', parts: [] }, null, {
      kind: 'body', parryKnockback: data.parryKnockback, strikeSound: data.strikeSound, armOnStrike: false,
    });
    this.punches = []; // this flurry's, laid out as it begins: [{ at (seconds after the strike), side, angle }]
    // Its hitboxes (the first is `hitbox`), each with the punch it is the fist of (or -1) and
    // how far into that punch it last reached.
    this.slots = [this.hitbox, ...Array.from({ length: data.hitboxes - 1 }, () => new EnemyHitbox(enemy, this, { type: 'group', parts: [] }))]
      .map((hitbox) => ({ hitbox, punch: -1, sweptTo: 0 }));
  }

  get armDelay() { return this.data.stepTime; }
  get burning() { return this.world.time - this.strikeAt < this.data.stepTime; }

  execute() {
    const d = this.data, first = randSign(), half = (d.coneDeg * DEG) / 2;
    this.punches = Array.from({ length: d.punches }, (_, i) => ({
      at: d.stepTime + i * d.punchInterval, side: i % 2 ? -first : first, angle: randRange(-half, half),
    }));
    super.execute();
  }

  step(dt) {
    super.step(dt);
    if (this.phase !== 'active') return;
    const d = this.data, t = this.world.time - this.strikeAt, reach = d.punchTime + d.linger;
    this.slots.forEach((slot, j) => {
      // The latest punch taking this hitbox's turn that has been thrown, if it can still hurt.
      let i = -1;
      for (let k = j; k < this.punches.length && this.punches[k].at <= t; k += this.slots.length) i = k;
      if (i >= 0 && t - this.punches[i].at >= reach) i = -1;
      if (i !== slot.punch) {
        slot.hitbox.setActive(false);
        slot.punch = i;
        slot.sweptTo = 0;
        if (i >= 0) {
          slot.hitbox.setActive(true);
          this.sound(d.punchSound);
        }
      }
      if (i >= 0) this.sweep(slot, this.punches[i], t - this.punches[i].at);
    });
    if (t >= d.stepTime) this.press(dt);
  }

  // A hitbox along its fist since it last reached, `hitboxScale` × as wide.
  sweep(slot, punch, since) {
    const d = this.data;
    slot.hitbox.shape.parts = fistSweep((t) => {
      const q = punchFist(punch, t, d.punchTime, d.returnTime);
      return { ...q, size: q.size * d.hitboxScale };
    }, slot.sweptTo, since, d.sweepSamples);
    slot.sweptTo = since;
  }

  afterPhysics() { for (const { hitbox } of this.slots) hitbox.afterPhysics(); }

  press(dt) {
    const p = this.player, d = this.data, ai = this.enemy.ai, b = this.enemy.body;
    if (!p) return;
    const to = this.dirToPlayer(), turn = d.turnRate * dt;
    b.rotation += clamp(deltaAngle(b.rotation, Math.atan2(to.y, to.x)), -turn, turn);
    const dir = ai.pathDirection(d.advanceStop);
    ai.steer(dir ? dir.x * d.advanceSpeed : 0, dir ? dir.y * d.advanceSpeed : 0);
  }

  endActive() {
    super.endActive();
    for (const slot of this.slots) {
      slot.hitbox.setActive(false);
      slot.punch = -1;
    }
  }

  dispose() {
    super.dispose();
    for (const { hitbox } of this.slots) hitbox.destroy();
  }

}

// Zone: a held weapon brought down overhead. It lands `landTime` after the strike (once
// the lunge is done) `impactAt` ahead, striking a circle there that spreads from
// `radius[0]` to `radius[1]` over `spreadTime` and stays where it landed.
class SmashAbility extends LungeAbility {
  constructor(enemy, data) {
    const [from, r] = data.radius;
    super(enemy, data, { type: 'circle', r: from }, { type: 'circle', from, r, growTime: data.spreadTime }, {
      strikeSound: data.strikeSound, armOnStrike: false,
    });
    this.landedAt = -Infinity;
    this.impact = null; // where it last landed: { x, y, rotation }
  }

  get landed() { return this.landedAt >= this.strikeAt; }
  get zoneAt() { return this.landed ? this.landedAt : Infinity; }
  get armDelay() { return this.data.landTime; }

  step() {
    super.step();
    if (this.phase !== 'active') return;
    const d = this.data;
    if (!this.landed) {
      if (this.world.time - this.strikeAt >= d.landTime && this.parriedStunEndsAt === null) this.land();
      return;
    }
    const [from, r] = d.radius, k = clamp01((this.world.time - this.landedAt) / d.spreadTime);
    this.hitbox.shape.r = lerp(from, r, 1 - (1 - k) ** 2);
  }

  land() {
    const b = this.enemy.body, d = this.data;
    this.landedAt = this.world.time;
    this.impact = { x: b.pos.x + this.dir.x * d.impactAt, y: b.pos.y + this.dir.y * d.impactAt, rotation: b.rotation };
    this.hitbox.anchor = this.impact;
    this.hitbox.shape.r = d.radius[0];
    this.arm(this.impact);
    this.sound(d.landSound);
    this.shake();
  }
}

// Body: the Bulwark's bash, a lunge shield-first, its hitbox the shield ahead. Parried, its
// guard breaks: the shield flies off its arm, away from the player. Not tried with the
// shield off.
class BashAbility extends SwingAbility {
  shouldExecute() { return this.enemy.guardUp && super.shouldExecute(); }

  onParry() {
    this.enemy.breakGuard(this.awayFromPlayer());
    super.onParry();
  }
}

// Zone: the Bulwark's plant. The shield comes down `landTime` after the strike (once its step
// is done), biting the floor `radius[0]` ahead, and a shockwave runs out from where the
// Bulwark stands across `arcDeg` ahead: a band `band` deep whose front spreads from
// `radius[0]` to `radius[1]` over `spreadTime`, staying where it was struck. Only the band
// hurts. Not tried with the shield off.
class PlantAbility extends LungeAbility {
  constructor(enemy, data) {
    const [from, r] = data.radius;
    super(enemy, data, { type: 'circle', r: from, arcDeg: data.arcDeg, inner: 0 }, { type: 'cone', from, r, arcDeg: data.arcDeg, band: data.band, growTime: data.spreadTime }, {
      strikeSound: data.strikeSound, armOnStrike: false,
    });
    this.landedAt = -Infinity;
    this.impact = null; // where the shield last bit the floor: { x, y, rotation }
    this.wave = null; // where its shockwave last ran out from: { x, y, rotation }
  }

  get landed() { return this.landedAt >= this.strikeAt; }
  get zoneAt() { return this.landed ? this.landedAt : Infinity; }
  get armDelay() { return this.data.landTime; }

  shouldExecute() { return this.enemy.guardUp && super.shouldExecute(); }

  // How far out the shockwave's front has run by `time`.
  frontAt(time) {
    const [from, r] = this.data.radius, k = clamp01((time - this.landedAt) / this.data.spreadTime);
    return lerp(from, r, 1 - (1 - k) ** 2);
  }

  step() {
    super.step();
    if (this.phase !== 'active') return;
    if (!this.landed) {
      if (this.world.time - this.strikeAt >= this.data.landTime && this.parriedStunEndsAt === null) this.land();
      return;
    }
    const s = this.hitbox.shape;
    s.r = this.frontAt(this.world.time);
    s.inner = Math.max(0, s.r - this.data.band);
  }

  land() {
    const b = this.enemy.body, from = this.data.radius[0], rotation = Math.atan2(this.dir.y, this.dir.x);
    this.landedAt = this.world.time;
    this.wave = { x: b.pos.x, y: b.pos.y, rotation };
    this.impact = { x: b.pos.x + this.dir.x * from, y: b.pos.y + this.dir.y * from, rotation };
    this.hitbox.anchor = this.wave;
    this.hitbox.shape.r = from;
    this.hitbox.shape.inner = 0;
    this.arm(this.wave);
    this.sound(this.data.landSound);
    this.shake();
  }
}

// Body: the Jet's flights, which never stop it to wind up. Through each wind-up it keeps
// circling the player at `strafeSpeed` (unless a blow has just knocked it about, or it's
// coasting on from a dash into another, `chained`), turning
// after them until its aim locks; then `aimLocked` turns it. In flight it gathers speed
// (`cruise`) and passes over the player, the other enemies and the props; over the recovery
// it skids to a halt (`skidEase`).
class FlightAbility extends HitboxAbility {
  constructor(enemy, data) {
    super(enemy, data, { type: 'circle', r: data.hitboxRadius, arcDeg: data.hitboxArcDeg }, null, {
      kind: 'body', stopsOnStart: false, parryKnockback: data.parryKnockback, strikeSound: data.strikeSound,
    });
  }

  step(dt) {
    super.step(dt);
    const e = this.enemy, ai = e.ai, b = e.body;
    if (this.phase === 'windup' && this.player) {
      if (this.chained) this.skid(dt); // straight on from a dash, coasting
      else if (this.world.time >= ai.movementSuppressedUntil) ai.strafe(this.data.strafeSpeed);
      if (!this.tracking()) this.aimLocked(dt);
      else if (ai.state !== AIState.WindUp) ai.turnToward(this.dirToPlayer(), dt); // a chained wind-up: its AI no longer turns it
    } else if (this.phase === 'recovery') this.skid(dt);
  }

  skid(dt) {
    const b = this.enemy.body, k = Math.exp(-dt / this.data.skidEase);
    b.vel.x *= k;
    b.vel.y *= k;
  }

  aimLocked() {}

  // Setting off along `dir`: from however fast it already goes that way.
  takeOff(dir) {
    const w = this.world, b = this.enemy.body;
    this.launchSpeed = Math.max(0, b.vel.x * dir.x + b.vel.y * dir.y);
    b.ignores = new Set([...w.enemies, ...w.props, w.livePlayer, this.player].filter((t) => t?.body).map((t) => t.body));
  }

  // How fast it flies, gathering speed from its launch up to `speed` over `launchTime`.
  cruise() {
    const d = this.data, t = this.world.time - this.strikeAt;
    return Math.min(d.speed, this.launchSpeed + (d.speed * t) / d.launchTime);
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

// Body: the Jet's dash, straight through where the player stood when its aim locked and
// on as far again past, over walls too, ending clear of them (see JetDash). It may go
// again at once, `dashes` in all. Cut short over a wall, it glides on to the nearest clear
// spot along its line (`landing`), walls off until it's there.
class JetDashAbility extends FlightAbility {
  constructor(enemy, data) {
    super(enemy, data);
    this.dashes = 0; // left to go, the one under way included
    this.chained = false;
    this.target = null; // where its aim locked
    this.from = { x: 0, y: 0 }; // the dash under way: from where, which way and how far
    this.dir = { x: 1, y: 0 };
    this.length = 0;
    this.landing = null;
  }

  canExecute() { return !this.landing && super.canExecute(); }

  execute() {
    this.dashes = pickWeighted(this.data.chain).dashes;
    this.chained = false; // whether the wind-up under way leads on from a dash
    this.target = null;
    super.execute();
  }

  // Its aim locked on where the player stood: turning to face that.
  aimLocked(dt) {
    this.target ??= { ...this.player.body.pos };
    this.enemy.ai.turnToward(dirTo(this.enemy.body.pos, this.target), dt);
  }

  advance() {
    if (this.phase === 'active' && --this.dashes > 0) { // straight on into the next, no recovery
      this.endActive();
      this.chained = true;
      this.sound('windup');
      this.setPhase('windup', this.data.chainWindUpTime);
      return;
    }
    super.advance();
    if (this.phase === 'active') this.phaseEndsAt = Infinity; // until it gets there (fly)
  }

  // Toward where its aim locked (where the player is now, if it never did).
  strike() {
    const b = this.enemy.body, to = this.target ?? this.player?.body.pos ?? b.pos;
    const dx = to.x - b.pos.x, dy = to.y - b.pos.y, l = Math.hypot(dx, dy);
    this.target = null;
    this.from = { ...b.pos };
    this.dir = l > 1e-6 ? { x: dx / l, y: dy / l } : fromAngle(b.rotation);
    this.length = this.clearLength(2 * l);
    b.collideWalls = false;
    this.takeOff(this.dir);
  }

  step(dt) {
    super.step(dt);
    if (this.phase === 'active') this.fly(dt);
    if (this.landing) this.land();
  }

  // Along its line, swinging round onto it (`turnEase`) and gathering speed, then braking
  // over its last `brakeTime` to arrive exactly at its end with `carry` of its speed, which
  // it keeps going on into the next dash or the recovery.
  fly(dt) {
    const b = this.enemy.body, d = this.data, dir = this.dir;
    const left = this.length - ((b.pos.x - this.from.x) * dir.x + (b.pos.y - this.from.y) * dir.y);
    const end = d.speed * d.carry;
    if (left <= end * FIXED_DT || this.world.time - this.strikeAt > this.length / d.speed + d.launchTime + 0.5) { // its carry takes it the rest of the way
      b.vel.x = dir.x * end;
      b.vel.y = dir.y * end;
      this.advance();
      return;
    }
    b.rotation += deltaAngle(b.rotation, Math.atan2(dir.y, dir.x)) * (1 - Math.exp(-dt / d.turnEase));
    const brake = (d.speed - end) / d.brakeTime; // its deceleration
    const v = Math.min(this.cruise(), Math.sqrt(end * end + 2 * brake * left), left / FIXED_DT);
    b.vel.x = dir.x * v;
    b.vel.y = dir.y * v;
  }

  // How far it can fly along its line and end clear of walls: `len`, or back from there to
  // the first clear spot (where it set off, at worst).
  clearLength(len) {
    const P = this.world.physics, { from, dir } = this, r = this.enemy.body.radius;
    for (let t = len; t > 0; t -= 0.1) if (!P.circleHitsWall(from.x + dir.x * t, from.y + dir.y * t, r)) return t;
    return 0;
  }

  // Walls back on, unless it's over one.
  endActive() {
    super.endActive();
    const b = this.enemy.body;
    if (this.world.physics.circleHitsWall(b.pos.x, b.pos.y, b.radius)) this.landing = this.landingSpot();
    else b.collideWalls = true;
  }

  // The nearest spot along its line clear of walls, on ahead or back the way it came (both
  // its ends are clear).
  landingSpot() {
    const b = this.enemy.body, P = this.world.physics, { from, dir } = this;
    const at = (b.pos.x - from.x) * dir.x + (b.pos.y - from.y) * dir.y;
    for (let k = 0.1; k < this.length + 0.1; k += 0.1) {
      for (const t of [at + k, at - k]) {
        const u = clamp(t, 0, this.length), x = from.x + dir.x * u, y = from.y + dir.y * u;
        if (!P.circleHitsWall(x, y, b.radius)) return { x, y };
      }
    }
    return { ...from };
  }

  // Gliding on to its landing spot, however it's knocked about meanwhile; walls back on once
  // it's clear of them, and there it stops.
  land() {
    const b = this.enemy.body, to = this.landing, dx = to.x - b.pos.x, dy = to.y - b.pos.y, l = Math.hypot(dx, dy);
    if (l < 0.02 || !this.world.physics.circleHitsWall(b.pos.x, b.pos.y, b.radius)) {
      this.landing = null;
      b.collideWalls = true;
      b.stop();
      return;
    }
    const v = Math.min(this.data.landSpeed, l / FIXED_DT);
    b.vel.x = (dx / l) * v;
    b.vel.y = (dy / l) * v;
    this.enemy.ai.suppressMovementFor(FIXED_DT);
  }

  dispose() {
    super.dispose();
    this.enemy.body.collideWalls = true;
  }
}

// Body: the Jet's swoop. Its aim locked, it banks away toward the way it circles, then
// flies on its heading, coming round after the player along the circle through them (see
// JetSwoop) until they're behind it, then straight on until it pulls out. Walls stop
// it: a crash.
class SwoopAbility extends FlightAbility {
  constructor(enemy, data) {
    super(enemy, data);
    this.side = 1; // the way it banks: 1 to its left, as it circles (EnemyAI.orbitDirection)
    this.aim = null; // the heading it banks to, once its aim locks (radians)
    this.heading = 0;
    this.committedAt = null; // when it stopped turning after the player
    this.lastPos = { x: 0, y: 0 };
  }

  execute() {
    this.side = this.enemy.ai.orbitDirection;
    this.aim = null;
    super.execute();
  }

  // Banking out no further than it could come round from onto the player as they stand,
  // turning at `turnFit` of its `turnRate`.
  aimLocked(dt) {
    const b = this.enemy.body, p = this.player.body.pos, d = this.data;
    if (this.aim === null) {
      const fit = (d.turnFit * d.turnRate * dist(b.pos, p)) / (2 * d.speed);
      this.aim = Math.atan2(p.y - b.pos.y, p.x - b.pos.x) + this.side * Math.min(d.outDeg * DEG, Math.asin(clamp01(fit)));
    }
    this.enemy.ai.turnToward(fromAngle(this.aim), dt);
  }

  strike() {
    const b = this.enemy.body;
    this.heading = b.rotation;
    this.committedAt = null;
    this.lastPos = { ...b.pos };
    this.takeOff(fromAngle(this.heading));
  }

  step(dt) {
    super.step(dt);
    if (this.phase === 'active') this.fly(dt);
  }

  fly(dt) {
    const b = this.enemy.body, d = this.data, w = this.world, p = this.player, v = this.cruise();
    let c = Math.cos(this.heading), s = Math.sin(this.heading);
    // Held up against a wall (not just knocked back by a blow): a crash.
    if (w.time > this.strikeAt) {
      const moved = (b.pos.x - this.lastPos.x) * c + (b.pos.y - this.lastPos.y) * s;
      if (moved < v * dt * 0.75 && w.physics.circleHitsWall(b.pos.x + c * 0.1, b.pos.y + s * 0.1, b.radius)) {
        this.crash();
        return;
      }
    }
    // Turning as fast as the circle on from its heading through the player needs, until it
    // commits: close in, or gone past them.
    if (this.committedAt === null && p) {
      const dx = p.body.pos.x - b.pos.x, dy = p.body.pos.y - b.pos.y, l = Math.hypot(dx, dy), off = deltaAngle(this.heading, Math.atan2(dy, dx));
      if (l <= d.commitRange || Math.abs(off) > Math.PI / 2) this.committedAt = w.time;
      else this.heading += clamp((2 * v * Math.sin(off)) / l, -d.turnRate, d.turnRate) * dt;
    }
    if (this.committedAt !== null && w.time - this.committedAt >= d.followTime) {
      this.advance();
      return;
    }
    c = Math.cos(this.heading);
    s = Math.sin(this.heading);
    b.rotation = this.heading;
    b.vel.x = c * v;
    b.vel.y = s * v;
    this.lastPos = { ...b.pos };
  }

  crash() {
    const b = this.enemy.body, d = this.data, w = this.world, C = ATTACK_FX.crash;
    const c = Math.cos(this.heading), s = Math.sin(this.heading), x = b.pos.x + c * b.radius, y = b.pos.y + s * b.radius;
    this.endActive();
    b.stop();
    b.addImpulse(-c * d.bounceForce, -s * d.bounceForce);
    w.effects.burst(x, y, this.heading + Math.PI, { ...C, color: ATTACK_FX.color });
    w.effects.burst(x, y, this.heading + Math.PI, { ...C, count: C.count / 2, color: ATTACK_FX.hot });
    this.sound('crash');
    this.setPhase('recovery', d.crashRecoveryTime);
  }
}

// Zone: everything around the enemy.
class GroundPoundAbility extends HitboxAbility {
  constructor(enemy, data) {
    const r = data.radius;
    super(enemy, data, { type: 'circle', r }, { type: 'circle', r }, { strikeSound: 'slam' });
  }
}

// Zone: a long strip in front.
class SlamAbility extends HitboxAbility {
  constructor(enemy, data) {
    const s = data.sizeScale, half = (data.range / 2) * s, hh = (data.slamWidth / 2) * s;
    super(enemy, data, { type: 'box', forward: half, hw: half, hh }, { type: 'box', near: 0, far: half * 2, hh }, {
      stopsOnStart: false, strikeSound: 'slam',
    });
  }
}

// Projectile: throws an orb the way it faces.
class ThrowAbility extends Ability {
  constructor(enemy, data) {
    super(enemy, data);
    this.kind = 'projectile';
    this.view = new ChargeView(this);
  }

  execute() {
    this.enemy.isActing = true;
    this.enemy.body.stop();
    this.sound('windup');
    this.setPhase('windup', this.data.windUpTime);
  }

  advance() {
    const e = this.enemy, d = this.data;
    switch (this.phase) {
      case 'windup':
        this.notifyAttackStarted();
        this.strikeAt = this.world.time;
        if (this.player) this.release();
        this.setPhase('recovery', d.recoveryTime);
        break;
      case 'recovery':
        e.isActing = false;
        this.phase = 'ready';
        break;
      case 'stunned':
        e.stunned = false;
        this.phase = 'ready';
        break;
    }
  }

  release() {
    const e = this.enemy, d = this.data, dir = fromAngle(e.body.rotation);
    this.world.add(new Projectile(this.world, this, e.body.pos.x + dir.x * d.spawnDistance, e.body.pos.y + dir.y * d.spawnDistance, {
      dir, speed: d.projectileSpeed, lifetime: d.projectileLifetime, damage: e.damage * d.damageMultiplier,
      size: d.projectileSize, look: d.look, passesWalls: d.passesWalls,
    }));
    this.sound('throw');
  }

  // How far the next projectile has formed, for ChargeView at render time `now`: { t: 0 → 1,
  // since: seconds it has been forming }, or null while none is.
  charge(now) {
    if (this.phase !== 'windup') return null;
    return { t: clamp01((now - this.phaseStartedAt) / Math.max(1e-3, this.phaseEndsAt - this.phaseStartedAt)), since: now - this.phaseStartedAt };
  }

  // Where ChargeView grows the orbs, as the frame `alpha` shows the enemy: [{ x, y, rot }].
  chargePoints(alpha) {
    const b = this.enemy.body, p = b.lerpPos(alpha), rot = b.lerpRotation(alpha), s = this.data.spawnDistance;
    return [{ x: p.x + Math.cos(rot) * s, y: p.y + Math.sin(rot) * s, rot }];
  }

  cuePoints() { return [{ x: this.data.spawnDistance, y: 0 }]; }

  // A parried projectile punishes its thrower, even mid-way through a later attack, which
  // the stun breaks off if it was still winding up. With no `parryStunTime` it only hurts.
  // Another of its shots parried while the enemy is stunned hurts and stuns it afresh.
  onParry() {
    const e = this.enemy;
    if (e.dead) return;
    const stuns = this.data.parryStunTime > 0;
    if (stuns) e.body.stop();
    e.takeDamage(this.parryDamage(), null, null, DamageCause.Parry);
    if (!stuns || e.dead || e.dying) return;
    e.stunned = true;
    e.isActing = false;
    this.takeOverStun();
    this.setPhase('stunned', this.data.parryStunTime);
  }
}

// Projectile: the ball formed over the wind-up is thrown up out of sight, to come down
// `flightTime` later a little way along the player's path (the Seer's Omen). The ball then is a MistShell of its own, so the thrower is free once it
// recovers; the shell flashes its own parry cue where it lands.
class LobAbility extends ThrowAbility {
  // Nothing can hurt as the wind-up ends, so EnemyAttackFx never cues it.
  get armDelay() { return this.data.flightTime; }

  release() {
    const e = this.enemy, d = this.data, from = this.chargePoints(1)[0];
    this.world.add(new MistShell(this.world, this, from, this.landingSpot(), {
      flightTime: d.flightTime, boomTime: d.boomTime, radius: d.boomRadius, size: d.chargeSize,
      damage: e.damage * d.damageMultiplier,
    }));
    this.sound('mistThrow');
  }

  // `leadFraction` of the way to where the player would be after the flight at their
  // current velocity, at most `maxLead` ahead, and never past a wall in the way.
  landingSpot() {
    const p = this.player.body, d = this.data, k = d.flightTime * d.leadFraction;
    const lead = clampLength({ x: p.vel.x * k, y: p.vel.y * k }, d.maxLead);
    const len = Math.hypot(lead.x, lead.y);
    if (len < 1e-3) return { x: p.pos.x, y: p.pos.y };
    const dx = lead.x / len, dy = lead.y / len, free = this.world.physics.rayLength(p.pos.x, p.pos.y, dx, dy, len + p.radius);
    const reach = Math.min(len, Math.max(0, free - p.radius));
    return { x: p.pos.x + dx * reach, y: p.pos.y + dy * reach };
  }
}

// Projectile: a homing missile from each engine, launched back and out to either side.
class MissilesAbility extends ThrowAbility {
  release() {
    const e = this.enemy, d = this.data;
    for (const { x, y, rot } of this.launches(e.body.pos, e.body.rotation)) {
      this.world.add(new Projectile(this.world, this, x, y, {
        dir: fromAngle(rot), speed: d.projectileSpeed, lifetime: d.projectileLifetime, damage: e.damage * d.damageMultiplier,
        size: d.projectileSize, turnRate: d.turnRate, homingDelay: d.homingDelay, homingTime: d.homingTime,
        passesWalls: d.passesWalls,
      }));
    }
    this.sound('missile');
  }

  chargePoints(alpha) {
    return this.launches(this.enemy.body.lerpPos(alpha), this.enemy.body.lerpRotation(alpha));
  }

  cuePoints() { return this.launches({ x: 0, y: 0 }, 0); }

  // Both engines' launch points and headings for an enemy at `pos` facing `rot`.
  launches(pos, rot) {
    const d = this.data, c = Math.cos(rot), s = Math.sin(rot), spread = d.launchAngleDeg * DEG;
    return [-1, 1].map((side) => {
      const lx = d.launchPoint.x, ly = d.launchPoint.y * side;
      return { x: pos.x + c * lx - s * ly, y: pos.y + s * lx + c * ly, rot: rot + side * spread };
    });
  }
}

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
class SpinThrowAbility extends ThrowAbility {
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
class VolleyAbility extends ThrowAbility {
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

// Projectile: `salvos` of shots from fixed cannons (`muzzles`, the Gunner's), one every
// `salvoInterval`, each straight out its cannon (ahead, unless it has an `angle` off its
// facing): a single cannon a salvo, all of
// them once in a random order, or all of them at once (`together`). A shot forms at every
// cannon over the wind-up and waits there until fired; between `together` salvos a fresh
// set forms over `regrowTime`, the enemy turning after the player at up to `turnRate`
// until the last `lockTime` before the next. Each salvo is cued at its own cannons. A
// stun (a parried shot among them) stops the rest.
class CannonsAbility extends ThrowAbility {
  constructor(enemy, data) {
    super(enemy, data);
    this.muzzles = data.muzzles; // each { x, y, angle? }
    this.salvos = []; // each salvo's cannons (indices into `muzzles`)
    this.fired = 0; // salvos fired since the attack began
    this.cued = 0; // salvos cued
    this.cuedSalvo = 0; // the one last cued (cuePoints)
    this.firstAt = 0; // when the first salvo fires
  }

  execute() {
    const d = this.data, all = this.muzzles.map((_, i) => i);
    if (d.together) this.salvos = Array.from({ length: d.salvos }, () => all);
    else {
      const order = [];
      while (order.length < d.salvos) {
        const deck = all.slice();
        for (let i = deck.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        order.push(...deck);
      }
      this.salvos = order.slice(0, d.salvos).map((i) => [i]);
    }
    this.fired = this.cued = this.cuedSalvo = 0;
    super.execute();
    this.firstAt = this.phaseEndsAt;
  }

  fireTime(i) { return this.firstAt + i * this.data.salvoInterval; }

  step(dt) {
    const d = this.data, live = this.phase === 'windup' || this.phase === 'active';
    if (live && this.cued < this.salvos.length && this.world.time >= this.fireTime(this.cued) - ATTACK_FX.cue.lead) {
      this.cueAt = this.world.time;
      this.cuedSalvo = this.cued++;
    }
    super.step(dt);
    if (this.phase !== 'active') return;
    while (this.fired < this.salvos.length && this.world.time >= this.fireTime(this.fired)) this.fireSalvo();
    if (d.turnRate && this.player && this.world.time < this.fireTime(this.fired) - d.lockTime) {
      const b = this.enemy.body, want = this.dirToPlayer(), max = d.turnRate * dt;
      b.rotation += clamp(deltaAngle(b.rotation, Math.atan2(want.y, want.x)), -max, max);
    }
  }

  advance() {
    const d = this.data;
    switch (this.phase) {
      case 'windup':
        this.notifyAttackStarted();
        this.fireSalvo();
        this.setPhase('active', (this.salvos.length - 1) * d.salvoInterval);
        return;
      case 'active':
        while (this.fired < this.salvos.length) this.fireSalvo();
        this.setPhase('recovery', d.recoveryTime);
        return;
    }
    super.advance();
  }

  // Each of this salvo's cannons fires straight out with a flash, kicking the enemy back.
  fireSalvo() {
    const e = this.enemy, d = this.data, b = e.body, dir = fromAngle(b.rotation);
    const cannons = this.salvos[this.fired++];
    this.strikeAt = this.world.time;
    if (!this.player) return;
    for (const i of cannons) {
      const m = this.muzzles[i], x = b.pos.x + dir.x * m.x - dir.y * m.y, y = b.pos.y + dir.y * m.x + dir.x * m.y;
      const rot = b.rotation + (m.angle ?? 0);
      this.world.add(new Projectile(this.world, this, x, y, {
        dir: fromAngle(rot), speed: d.projectileSpeed, lifetime: d.projectileLifetime, damage: e.damage * d.damageMultiplier,
        size: d.projectileSize, look: d.look,
      }));
      this.world.effects.burst(x, y, rot, { ...ATTACK_FX.projectile.muzzle, color: lookColor(d.look) });
    }
    b.vel.x -= dir.x * d.recoil;
    b.vel.y -= dir.y * d.recoil;
    this.sound(d.salvoSound ?? (cannons.length > 1 ? 'broadside' : 'cannon'));
  }

  // A shot sits at every cannon yet to fire: formed over the wind-up, then a fresh set
  // over `regrowTime` after each `together` salvo.
  charge(now) {
    if (this.phase !== 'active' || this.fired >= this.salvos.length) return super.charge(now);
    if (!this.data.together) return { t: 1, since: Infinity };
    const since = now - this.strikeAt;
    return { t: clamp01(since / this.data.regrowTime), since };
  }

  chargePoints(alpha) {
    const b = this.enemy.body, p = b.lerpPos(alpha), rot = b.lerpRotation(alpha), c = Math.cos(rot), s = Math.sin(rot);
    const loaded = new Set(this.salvos.slice(this.fired).flat());
    return [...loaded].map((i) => {
      const m = this.muzzles[i];
      return { x: p.x + c * m.x - s * m.y, y: p.y + s * m.x + c * m.y, rot: rot + (m.angle ?? 0) };
    });
  }

  cuePoints() { return (this.salvos[this.cuedSalvo] ?? []).map((i) => ({ x: this.muzzles[i].x, y: this.muzzles[i].y })); }
}

// Whether thread `t` lies along the line a–b: near it (within `apart`) and close to parallel.
function alongside(t, a, b, apart) {
  const ux = b.x - a.x, uy = b.y - a.y, vx = t.b.x - t.a.x, vy = t.b.y - t.a.y;
  const sin = Math.abs(ux * vy - uy * vx) / (Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1);
  return sin < 0.35 && segmentsDist(a, b, t.a, t.b) < apart;
}

// Passive: a projectile, then a walk. The Weaver strings a thread from wall to wall through
// where it stands (the Weaver's weave), not as an attack but of its own accord, in the fight
// or out of it, whatever else is attacking (consider). It picks its line (chooseLine),
// turns to its far end over the wind-up and spits an anchor of silk into it (Silk,
// web.js); stuck, it spins a Thread from there out of its spinnerets as it walks across to
// the near end, and fastens it there, or wherever it is if it gets stuck, is stunned or
// slain, takes too long or the player comes too close. Its threads stay strung until cut,
// through its death too; it stops weaving once it has `max` of them. A parried thread hurts
// it, without a stun. Its AI stands back meanwhile (enemy.passive).
// Phases: windup → cast → walk → recovery.
const WEAVE_FROM = new Set([AIState.Idle, AIState.Reposition, AIState.Chase]); // AI states it can leave off to weave
class WeaveAbility extends ThrowAbility {
  constructor(enemy, data) {
    super(enemy, data);
    this.threads = []; // strung and being spun, oldest first
    this.line = null; // { a, b }: the line it is stringing, `a` the end it spits at, `b` the one it walks to
    this.silk = null; // its anchor in flight
    this.thread = null; // the thread it is spinning
    this.walkCheck = null; // { at, pos }: where it was when it last checked it was getting anywhere
    this.lastUseTime = this.world.time - Math.random() * data.cooldown; // so Weavers don't all start at once
  }

  // Its threads still strung (or being spun).
  get strung() { return (this.threads = this.threads.filter((t) => !t.dead && t.taut)); }

  // Whether the player is about: its AI is after them.
  get present() { return !!this.player && this.enemy.ai.state !== AIState.Idle; }

  // Never picked by its AI: it goes off on its own (consider).
  shouldExecute() { return false; }

  // It aims at its line, not the player.
  tracking() { return false; }

  // Free to (not acting, stunned or dying, its AI not mid-attack), every `cooldown` seconds,
  // `absent` times as long while the player isn't about, it starts on another thread, unless
  // it has `max` or the player is within `minPlayerDist`. With no line to string from
  // where it is, it tries again `retry` later (`absent` times as long, likewise).
  consider() {
    const e = this.enemy, d = this.data, now = this.world.time;
    if (e.isActing || e.stunned || e.dying || !WEAVE_FROM.has(e.ai.state)) return;
    const slow = this.present ? 1 : d.absent;
    if (now < this.lastUseTime + d.cooldown * slow || this.strung.length >= d.max) return;
    const p = this.player;
    if (p && dist(e.body.pos, p.body.pos) < d.minPlayerDist) return;
    this.line = this.chooseLine();
    if (!this.line) { this.lastUseTime = now - (d.cooldown - d.retry) * slow; return; }
    this.lastUseTime = now;
    e.passive = this;
    this.execute();
  }

  // Of `line.tries` lines through it at random, wall to wall, the best to string (see
  // WeaverWeave.line), its far end first; null if none will do. With the player about, it
  // keeps clear of them and favours lines near them.
  chooseLine() {
    const o = this.enemy.body.pos, L = this.data.line, physics = this.world.physics, p = this.present ? this.player.body.pos : null, [min, max] = L.length;
    let best = null, bestScore = -Infinity;
    for (let i = 0; i < L.tries; i++) {
      const angle = Math.random() * Math.PI, dx = Math.cos(angle), dy = Math.sin(angle);
      const ra = physics.rayLength(o.x, o.y, dx, dy, max), rb = physics.rayLength(o.x, o.y, -dx, -dy, max);
      if (ra >= max || rb >= max || ra + rb < min || ra + rb > max) continue;
      const a = { x: o.x + dx * (ra - 0.05), y: o.y + dy * (ra - 0.05) }, b = { x: o.x - dx * (rb - 0.05), y: o.y - dy * (rb - 0.05) };
      const off = p ? Math.sqrt(segmentPointDistSq(a.x, a.y, b.x, b.y, p.x, p.y)) : L.near;
      if (off < L.clear || this.strung.some((t) => alongside(t, a, b, L.apart))) continue;
      const score = -Math.max(0, off - L.near) - (ra + rb) * 0.15 + Math.random();
      if (score > bestScore) { bestScore = score; best = ra >= rb ? { a, b } : { a: b, b: a }; }
    }
    return best;
  }

  step(dt) {
    super.step(dt);
    const e = this.enemy;
    if (this.phase === 'ready') this.consider();
    if (this.phase === 'windup' && this.line) e.ai.turnToward(dirTo(e.body.pos, this.line.a), dt);
    if (this.phase === 'cast' && (!this.silk || this.silk.dead)) { // its anchor hit the player, or was parried
      this.silk = null;
      this.setPhase('recovery', this.data.recoveryTime);
    }
    if (this.phase === 'walk') this.walk(dt);
  }

  advance() {
    switch (this.phase) {
      case 'windup':
        this.strikeAt = this.world.time;
        this.spit();
        this.setPhase('cast', Infinity);
        return;
      case 'walk': // taking too long
        this.fasten();
        return;
    }
    super.advance();
    if (this.phase === 'ready') this.done();
  }

  // Done weaving: its AI takes over again.
  done() {
    const e = this.enemy;
    e.isActing = false;
    if (e.passive === this) e.passive = null;
  }

  // An anchor of silk spat from its mouth into the line's far end.
  spit() {
    const e = this.enemy, d = this.data, from = this.chargePoints(1)[0], to = this.line.a;
    this.silk = this.world.add(new Silk(this.world, this, from, {
      dir: dirTo(from, to), speed: d.projectileSpeed, lifetime: dist(from, to) / d.projectileSpeed + 0.15,
      damage: e.damage * d.damageMultiplier, size: d.projectileSize,
    }));
    this.sound('silkSpit');
  }

  // Its anchor stuck at `at`: it spins its thread from there, walking to the line's near end.
  anchored(at) {
    const e = this.enemy, d = this.data;
    this.silk = null;
    if (this.phase !== 'cast' || e.dead || e.dying) return; // given up on since
    this.thread = this.world.add(new Thread(this.world, this, at, this.spinneret(), {
      width: d.thread.width, damage: e.damage * d.thread.damage, rehit: d.thread.rehit,
    }, { spinning: true }));
    this.threads.push(this.thread);
    this.world.sound('threadStrung', at);
    this.walkCheck = { at: this.world.time, pos: { ...e.body.pos } };
    this.setPhase('walk', d.walkTime);
  }

  spinneret() {
    const b = this.enemy.body, s = this.data.spinneret;
    return { x: b.pos.x - Math.cos(b.rotation) * s, y: b.pos.y - Math.sin(b.rotation) * s };
  }

  // Across to the line's near end, paying out the thread, until it gets there or gives up.
  walk(dt) {
    const e = this.enemy, b = e.body, d = this.data, t = this.thread, to = this.line.b, p = this.player, now = this.world.time;
    if (!t || !t.taut) { // cut or parried
      this.thread = null;
      this.setPhase('recovery', d.recoveryTime);
      return;
    }
    t.spinTo(this.spinneret());
    if (dist(b.pos, to) <= b.radius + 0.15 || (p && dist(b.pos, p.body.pos) < d.minPlayerDist)) { this.fasten(); return; }
    if (now - this.walkCheck.at >= 0.4) {
      if (dist(b.pos, this.walkCheck.pos) < 0.15) { this.fasten(); return; } // stuck
      this.walkCheck = { at: now, pos: { ...b.pos } };
    }
    const dir = dirTo(b.pos, to);
    if (now >= e.ai.movementSuppressedUntil) e.ai.steer(dir.x * d.walkSpeed, dir.y * d.walkSpeed);
    e.ai.turnToward(dir, dt);
  }

  // Fastens the thread it is spinning: at the line's near end if it got near enough, or
  // where it is; one too short to keep falls.
  fasten() {
    const t = this.thread, d = this.data;
    this.thread = null;
    if (t && !t.dead && t.taut) {
      const end = this.spinneret(), at = dist(end, this.line.b) <= d.reach ? this.line.b : end;
      if (dist(t.a, at) < d.minThread) t.slacken();
      else t.fasten(at);
    }
    if (this.phase === 'walk') this.setPhase('recovery', d.recoveryTime);
  }

  // One of its threads parried: it is hurt as by any parry, but not stunned.
  threadParried() {
    const e = this.enemy;
    if (!e.dead && !e.dying) e.takeDamage(this.parryDamage(), null, null, DamageCause.Parry);
  }

  // Stunned from outside, it fastens what it has spun; an anchor in flight comes to nothing.
  interrupt() {
    if (this.phase === 'walk') this.fasten();
    if (this.phase === 'cast') this.phase = 'ready';
    super.interrupt();
    if (this.phase === 'ready') this.done();
  }

  legPose() { return this.phase === 'windup' || this.phase === 'cast' ? this.data.legs : null; }

  dispose() {
    this.fasten();
    super.dispose();
  }
}

// A ball of web thrown on a line from the mouth (the Weaver's reel), formed over the
// wind-up, flying straight along the facing (WebBall, web.js). Catching the player, it winds
// them in web and reels them in (Player is dragged along at its pullOn) at a steady pace,
// braced and turning after them, until they are close, holds them there through a second
// wind-up, the bite's, then bites: a hitbox lunging along its facing (a charge, parried like
// one), and lets go. Caught, the player can't attack or dash: trying struggles against the
// web instead, tearing a strand off, and the `struggles`th tears them free; the line breaks
// too if they get out of reach or out of the fight. Its
// threads and its bite land on them caught however recently they were hurt
// (ignoresInvincibility). Missing, the ball is drawn back in its recovery. Parried, the line
// drags the Weaver to the player (`yank`), where it lies stunned.
// Phases: windup → cast → (reel → windup → active) → recovery.
class ReelAbility extends Ability {
  constructor(enemy, data) {
    super(enemy, data);
    this.kind = 'body';
    this.hitbox = new EnemyHitbox(enemy, this, { type: 'circle', r: data.biteRadius, forward: data.biteForward });
    this.view = new ReelView(this);
    this.ball = null; // the ball of web in flight
    this.held = null; // the player on the line: caught and reeled in, or the Weaver yanked to them
    this.caughtAt = -Infinity; // when it last caught them
    this.retract = null; // { from, at }: the ball drawn back from where it missed
    this.loose = null; // { from, at, snap, player }: the line let go (falling slack, its web falling off `player`) or broken (springing back)
    this.struggles = 0; // how many times the player caught has struggled
    this.struggledAt = -Infinity; // when they last did
    this.dir = { x: 1, y: 0 }; // the bite's lunge
  }

  // Whether it has the player caught: reeling them in, or biting.
  get snared() { return this.held !== null && (this.phase === 'reel' || this.phase === 'windup' || this.phase === 'active'); }
  // A charge burns only while the bite can hurt.
  get burning() { return this.phase === 'active'; }

  mouth() {
    const b = this.enemy.body, d = this.data;
    return { x: b.pos.x + Math.cos(b.rotation) * d.muzzle, y: b.pos.y + Math.sin(b.rotation) * d.muzzle };
  }

  execute() {
    this.enemy.isActing = true;
    this.enemy.body.stop();
    this.held = this.retract = null;
    this.sound('windup');
    this.setPhase('windup', this.data.windUpTime);
  }

  advance() {
    const e = this.enemy, d = this.data;
    switch (this.phase) {
      case 'windup':
        if (this.held) { this.bite(); return; }
        this.notifyAttackStarted();
        this.strikeAt = this.world.time;
        this.cast();
        return;
      case 'reel': // reeling too long: it bites anyway
        this.readyBite();
        return;
      case 'active':
        this.endActive();
        this.letGo(false);
        this.setPhase('recovery', d.recoveryTime);
        return;
      case 'yank':
        this.land();
        return;
      case 'recovery':
      case 'stunned':
        if (this.phase === 'stunned') e.stunned = false;
        e.isActing = false;
        this.phase = 'ready';
        return;
    }
  }

  step(dt) {
    super.step(dt);
    const e = this.enemy, b = e.body, d = this.data;
    if (this.ball && this.phase !== 'cast') this.dropBall();
    if (this.held && !this.snared && this.phase !== 'yank') this.letGo(false);
    if (this.phase === 'cast') b.stop();
    if (this.snared) {
      const p = this.held;
      if (this.phase !== 'active') b.stop();
      if (p !== this.world.hittablePlayer || p.teleporting || dist(b.pos, p.body.pos) > d.ballReach + d.snapRange) this.letGo(true);
      else {
        if (this.phase === 'reel' || (this.phase === 'windup' && this.tracking())) e.ai.turnToward(this.dirToPlayer(), dt);
        if (this.phase === 'reel' && dist(b.pos, p.body.pos) <= d.biteRange + 0.05) this.readyBite();
      }
    }
    if (this.phase === 'active' && this.world.time - this.strikeAt < d.duration) {
      const speed = d.biteStep / d.duration;
      b.vel.x = this.dir.x * speed; b.vel.y = this.dir.y * speed;
    }
    if (this.phase === 'yank') this.yank();
  }

  cast() {
    const e = this.enemy, d = this.data;
    this.ball = this.world.add(new WebBall(this.world, this, this.mouth(), {
      dir: fromAngle(e.body.rotation), speed: d.ballSpeed, reach: d.ballReach, size: d.projectileSize,
    }));
    this.sound('webThrow');
    this.setPhase('cast', Infinity);
  }

  // Called by its ball of web. Missing, it is drawn back from where it was.
  missed(at) {
    this.ball = null;
    this.retract = { from: at, at: this.world.time };
    this.setPhase('recovery', this.data.retractTime + this.data.recoveryTime);
  }

  // Catching the player, it winds them in web and starts reeling them in.
  caught(player) {
    this.ball = null;
    this.held = player;
    this.caughtAt = this.world.time;
    this.struggles = 0;
    player.reeledBy = this;
    this.sound('webCatch');
    this.sound('reel');
    this.setPhase('reel', this.data.reelTime);
  }

  // Reeled in close, held there through the bite's wind-up (cued again).
  readyBite() {
    this.sound('windup');
    this.setPhase('windup', this.data.biteWindup);
  }

  // How the player it has caught is dragged this step (Player.step), or null if it isn't
  // dragging them: straight at it at a steady pace, stopping at biteRange, then held still.
  pullOn(player) {
    if (this.held !== player || !this.snared) return null;
    if (this.phase !== 'reel') return { x: 0, y: 0 };
    const d = this.data, e = this.enemy.body.pos, p = player.body.pos, dx = e.x - p.x, dy = e.y - p.y, l = Math.hypot(dx, dy) || 1;
    const v = Math.max(0, Math.min(d.pullSpeed, (l - d.biteRange) / FIXED_DT));
    return { x: (dx / l) * v, y: (dy / l) * v };
  }

  // The player caught trying to attack or dash: instead they struggle, shaking the web and
  // tearing a strand off, and at the last tear free.
  struggle(player) {
    if (this.held !== player || !this.snared) return;
    this.struggles++;
    this.struggledAt = this.world.time;
    const p = player.body.pos;
    this.world.effects.burst(p.x, p.y, 0, { ...WEB.snare.strain, color: WEB.color });
    if (this.struggles >= this.data.struggles) this.letGo(true);
    else this.world.sound('strain', p);
  }

  // Its threads and its bite land on the player it has caught however recently they were hurt.
  ignoresInvincibility(player) { return player.reeledBy === this; }

  // Lets go of the player: after the bite, the line falling slack, or broken, springing back.
  letGo(snap) {
    const p = this.held;
    if (!p) return;
    if (p.reeledBy === this) p.reeledBy = null;
    this.held = null;
    this.loose = { from: { ...p.body.pos }, at: this.world.time, snap, player: p };
    if (!snap) return;
    this.world.effects.burst(p.body.pos.x, p.body.pos.y, 0, { ...WEB.snap.sparks, color: WEB.color });
    this.sound('threadSnap');
    if (this.phase === 'active') this.endActive();
    this.setPhase('recovery', this.data.recoveryTime);
  }

  dropBall() {
    if (!this.ball) return;
    this.retract = { from: { ...this.ball.body.pos }, at: this.world.time };
    this.ball.destroy();
    this.ball = null;
  }

  bite() {
    this.strikeAt = this.world.time;
    this.dir = fromAngle(this.enemy.body.rotation);
    this.hitbox.setActive(true);
    this.sound('bite');
    this.setPhase('active', this.data.duration);
  }

  endActive() {
    this.hitbox.setActive(false);
    this.activeEndedAt = this.world.time;
  }

  // Its ball parried, the line drags it to the player (unstunned on the way, so nothing caps
  // its speed); its bite parried, it reels back stunned, even a late parry once it's over.
  onParry() {
    const e = this.enemy, d = this.data;
    if (this.phase === 'cast') {
      this.ball = null;
      e.takeDamage(this.parryDamage(), null, null, DamageCause.Parry);
      if (e.dead || e.dying) return;
      this.takeOverStun();
      this.held = this.player;
      this.sound('yank');
      this.setPhase('yank', d.yankTime);
      return;
    }
    if (this.phase === 'active') this.endActive();
    e.body.stop();
    const k = this.awayFromPlayer();
    e.body.addImpulse(k.x * d.parryKnockback, k.y * d.parryKnockback);
    e.takeDamage(this.parryDamage(), null, null, DamageCause.Parry);
    if (e.dead || e.dying) return;
    e.stunned = true;
    this.takeOverStun();
    this.setPhase('stunned', d.parryStunTime);
  }

  // Dragged along the line to the player, until it is close enough (or out of time).
  yank() {
    const b = this.enemy.body, p = this.held, d = this.data;
    if (!p || p.dead || dist(b.pos, p.body.pos) <= d.yankStop) { this.land(); return; }
    const dir = dirTo(b.pos, p.body.pos);
    b.vel.x = dir.x * d.yankSpeed; b.vel.y = dir.y * d.yankSpeed;
  }

  // Fetched up at the player's feet, stunned.
  land() {
    const e = this.enemy, b = e.body;
    this.loose = this.held ? { from: { ...this.held.body.pos }, at: this.world.time, snap: false } : null;
    this.held = null;
    b.stop();
    e.stunned = true;
    this.world.effects.burst(b.pos.x, b.pos.y, 0, { ...ATTACK_FX.crash, count: 8, color: e.type.hitColor });
    this.sound('thud');
    this.setPhase('stunned', this.data.parryStunTime);
  }

  // A stun from outside drops whatever it has on the line.
  interrupt() {
    this.dropBall();
    if (this.snared) this.letGo(true);
    this.held = null;
    if (this.phase === 'cast' || this.phase === 'yank' || this.phase === 'reel') this.phase = 'ready';
    else super.interrupt();
  }

  legPose() {
    switch (this.phase) {
      case 'windup': return this.held ? 'reel' : this.data.legs;
      case 'reel': return 'reel';
      case 'cast': return this.data.legs;
      case 'active': return 'bite';
      case 'yank': return 'yank';
    }
    return null;
  }

  cuePoints() { return [{ x: this.data.muzzle, y: 0 }]; }

  dispose() {
    if (this.held?.reeledBy === this) this.held.reeledBy = null;
    this.ball?.destroy();
    super.dispose();
  }
}

// Body: the Nova's flare (NovaFlare). It rushes the player (`rush`), swells up over the
// wind-up and goes critical (`active`, its blast able to hurt the player), then bursts in a
// supernova, which is its death. A hit only knocks it back (Enemy.applyKnockback), swelling
// on. Parried as it goes critical, it is launched along the parry (`launched`) and bursts
// on whatever it hits, sparing the player. Caught in another's blast, it is lit (`fuse`) and
// bursts soon after. `friendly`: lit by the player, so its burst can't hurt them.
class FlareAbility extends HitboxAbility {
  constructor(enemy, data) {
    super(enemy, data, { type: 'circle', r: data.blastRadius }, null, { kind: 'body' });
    this.friendly = false;
    this.spent = false; // burst
    this.dir = { x: 1, y: 0 }; // launched, the way it flies
    this.lastPos = null; // launched, where it was before this step's physics
  }

  get burning() { return false; } // it never charges: its blast does the hurting

  canExecute() { return this.phase === 'ready' && super.canExecute(); }

  execute() {
    this.enemy.isActing = true;
    this.friendly = false;
    this.sound(this.data.rushSound);
    this.setPhase('rush', this.data.rushTime);
  }

  step() {
    if (this.phase === 'rush') this.rush();
    else if (this.phase === 'launched') this.fly();
    super.step();
  }

  afterPhysics() {
    super.afterPhysics();
    if (this.phase === 'launched' && (this.hitWall() || this.touchesAnything())) this.detonate();
  }

  advance() {
    switch (this.phase) {
      case 'rush': this.swell(); break;
      case 'windup': this.goCritical(); break;
      case 'active': this.detonate(); break;
      case 'launched': this.detonate(); break;
      case 'fuse': if (this.friendly) this.detonate(); else this.goCritical(); break;
      case 'recovery': this.enemy.isActing = false; this.phase = 'ready'; break;
    }
  }

  // Straight at the player along the paths round walls, until close enough to swell. Knocked
  // back, it lets the blow carry it before steering in again.
  rush() {
    const e = this.enemy, b = e.body, d = this.data, p = this.player;
    if (!p) return;
    if (dist(b.pos, p.body.pos) <= d.swellRange) { this.swell(); return; }
    if (this.world.time < e.ai.movementSuppressedUntil) return;
    const dir = e.ai.pathDirection(0) ?? this.dirToPlayer(), k = d.rushResponsiveness;
    b.vel.x += (dir.x * d.rushSpeed - b.vel.x) * k;
    b.vel.y += (dir.y * d.rushSpeed - b.vel.y) * k;
  }

  swell() {
    const b = this.enemy.body, k = this.data.swellSkid;
    b.vel.x *= k;
    b.vel.y *= k;
    this.sound(this.data.swellSound);
    this.setPhase('windup', this.data.windUpTime);
  }

  goCritical() {
    this.notifyAttackStarted();
    this.strikeAt = this.world.time;
    if (!this.friendly) this.hitbox.setActive(true);
    this.setPhase('active', this.data.duration);
  }

  // Parried: launched along the player's parry, lit. Once it has burst, a parry only spares
  // the player its blast.
  onParry() {
    if (this.spent) return;
    const e = this.enemy, b = e.body, d = this.data, p = this.world.livePlayer;
    this.hitbox.setActive(false);
    this.friendly = true;
    const f = p?.facing, l = f ? Math.hypot(f.x, f.y) : 0;
    this.dir = l > 1e-6 ? { x: f.x / l, y: f.y / l } : this.awayFromPlayer();
    b.vel.x = this.dir.x * d.launchSpeed;
    b.vel.y = this.dir.y * d.launchSpeed;
    b.rotation = Math.atan2(this.dir.y, this.dir.x);
    b.ignores = p ? new Set([p.body]) : null; // out past them, not off them
    this.lastPos = null;
    e.isActing = true;
    e.ai.suppressMovementFor(d.launchTime);
    this.sound(d.launchSound);
    this.setPhase('launched', d.launchTime);
  }

  // In flight at a steady speed.
  fly() {
    const b = this.enemy.body, d = this.data, dir = this.dir;
    b.vel.x = dir.x * d.launchSpeed;
    b.vel.y = dir.y * d.launchSpeed;
    this.lastPos = { ...b.pos };
  }

  // Anything worse than a glancing blow off a wall this step (losing over 40% of its speed).
  hitWall() {
    const b = this.enemy.body, dir = this.dir, from = this.lastPos;
    if (!from) return false;
    const moved = (b.pos.x - from.x) * dir.x + (b.pos.y - from.y) * dir.y;
    return moved < this.data.launchSpeed * FIXED_DT * 0.6;
  }

  touchesAnything() {
    const e = this.enemy, b = e.body, reach = b.radius + this.data.contactMargin;
    for (const t of [...this.world.enemies, ...this.world.props]) {
      if (t !== e && !t.dead && !t.isThread && hurtDistance(t, b.pos.x, b.pos.y) <= reach) return true;
    }
    return false;
  }

  // Caught in another's blast: it bursts `chainDelay` later, going critical first unless the
  // player lit it.
  ignite(friendly) {
    if (this.spent || this.phase === 'fuse' || this.phase === 'launched' || (this.phase === 'active' && !friendly)) return;
    this.hitbox.setActive(false);
    this.friendly = friendly;
    this.enemy.isActing = true;
    this.sound(this.data.fuseSound);
    this.setPhase('fuse', this.data.chainDelay);
  }

  // Called off by a stun: its fuse snuffed, unless it is already lit.
  interrupt() {
    if (this.phase === 'rush' || this.phase === 'windup') this.phase = 'ready';
    else if (this.phase === 'active' && !this.friendly) {
      this.endActive();
      this.phase = 'ready';
    }
  }

  // The supernova: everything in the blast is hurt and thrown back, other Novas lit, and the
  // Nova is gone (its death, drops and all, with this burst for its look).
  detonate() {
    const e = this.enemy, w = this.world, b = e.body, d = this.data, { x, y } = b.pos, src = { x, y };
    this.endActive();
    this.spent = true;
    this.phase = 'spent';
    this.phaseEndsAt = Infinity;
    b.ignores = null;
    const amount = d.blastDamage * (this.friendly ? w.adrenaline.damageMultiplier : 1);
    for (const t of [...w.enemies, ...w.props]) {
      if (t === e || t.dead || (t.isThread && !this.friendly) || hurtDistance(t, x, y) >= d.blastRadius) continue; // only the player's cuts silk
      const fuse = t.abilities && [...t.abilities.values()].find((a) => a.ignite);
      if (fuse) { fuse.ignite(this.friendly); continue; }
      t.takeDamage(amount, t.closestPoint(src), src, DamageCause.Nova);
      if (!t.dead && !t.isProp) t.applyKnockback(d.blastKnockback, src);
    }
    w.deathFx.explode(x, y, d.blastRadius / NOVA.burst.reach, e.hitColor, NOVA.burst);
    this.sound(d.burstSound);
    e.detonated = true;
    e.die(DamageCause.Nova);
  }

  cuePoints() { return [{ x: 0, y: 0 }]; }

  dispose() {
    super.dispose();
    this.enemy.body.ignores = null;
  }
}

// The Alembic's parts (blightParts): its valves fire its toxin from over their irises
// (blightMuzzle) and its canisters launch, from their places at rest; its rig moves them to
// match (`parts`, see blightRig.js).
function shuffled(list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
const rimValves = () => blightParts().filter((h) => h.rim);

// A point in the enemy's frame → the world, for its body as it is now.
function bodyToWorld(e, p) {
  const b = e.body, c = Math.cos(b.rotation), s = Math.sin(b.rotation);
  return { x: b.pos.x + c * p.x - s * p.y, y: b.pos.y + s * p.x + c * p.y };
}

// Projectile: cannons all round (the Alembic's ring), one in each valve, firing out evenly
// round. It turns after the player the whole time (lockTime 0), so the valve in front
// always fires at them, and only that shot is cued.
class RingAbility extends CannonsAbility {
  constructor(enemy, data) {
    super(enemy, data);
    this.muzzles = rimValves().map((h, i, all) => ({ ...blightMuzzle(h), angle: (TAU * i) / all.length }));
  }

  cuePoints() { return [{ x: this.muzzles[0].x, y: this.muzzles[0].y }]; }
}

// Projectile: `count` of the Alembic's canisters strain out through the wind-up, then launch
// and fly off away from its centre, homing in on the player (the canisters themselves show
// the wind-up, so it has no ChargeView). A new one slides up in time (`launched`, which its
// rig reads); a socket still empty isn't picked.
class CanistersAbility extends ThrowAbility {
  constructor(enemy, data) {
    super(enemy, data);
    this.view = null;
    this.chosen = []; // the canisters launching this time
    this.launched = new Map(); // part index → when it last launched
  }

  regrowing(i) {
    const at = this.launched.get(i), d = this.data;
    return at != null && this.world.time < at + d.regrowDelay + d.regrowTime;
  }

  execute() {
    const free = blightParts().flatMap((h, i) => (h.kind === 'pod' && !this.regrowing(i) ? [i] : []));
    this.chosen = shuffled(free).slice(0, this.data.count);
    super.execute();
  }

  // Where canister `h` is once pushed out, in the enemy's frame.
  strained(h) {
    const k = this.data.pushOut;
    return { x: h.x + Math.cos(h.rot) * k, y: h.y + Math.sin(h.rot) * k };
  }

  release() {
    const e = this.enemy, d = this.data, parts = blightParts();
    for (const i of this.chosen) {
      const h = parts[i], { x, y } = bodyToWorld(e, this.strained(h));
      const rot = e.body.rotation + (Math.hypot(h.x, h.y) > 0.1 ? Math.atan2(h.y, h.x) : h.rot); // away from its centre
      this.world.add(new Projectile(this.world, this, x, y, {
        dir: fromAngle(rot), speed: d.projectileSpeed, lifetime: d.projectileLifetime, damage: e.damage * d.damageMultiplier,
        size: d.projectileSize, look: d.look, turnRate: d.turnRate, homingDelay: d.homingDelay, homingTime: d.homingTime,
        passesWalls: d.passesWalls, variant: i,
      }));
      this.launched.set(i, this.world.time);
      this.world.effects.burst(x, y, rot, BLIGHT.launch);
    }
    this.sound('podLaunch');
  }

  cuePoints() { return this.chosen.map((i) => this.strained(blightParts()[i])); }
}

// Projectile: it builds pressure through the wind-up, every valve opening, then fires
// `bursts` of orbs, `burstInterval` apart, each from `perBurst` of its valves picked at
// random, straight out of each, a little off at random. Each burst's orbs flying at the
// player are cued. A stun (an orb parried) stops the rest.
class SpewAbility extends ThrowAbility {
  constructor(enemy, data) {
    super(enemy, data);
    this.view = null; // its tell and opening valves show the wind-up
    this.plan = []; // each burst's shots: [{ i (valve), off (radians) }]
    this.fired = 0;
    this.cued = 0;
    this.cuedBurst = 0;
    this.firstAt = 0;
    this.spatAt = new Map(); // valve index → when it last fired (for its rig)
  }

  execute() {
    const d = this.data, rim = rimValves().map((_, i) => i);
    this.plan = Array.from({ length: d.bursts }, () => shuffled(rim).slice(0, d.perBurst).map((i) => ({ i, off: randRange(-d.jitterDeg, d.jitterDeg) * DEG })));
    this.fired = this.cued = this.cuedBurst = 0;
    super.execute();
    this.firstAt = this.phaseEndsAt;
  }

  burstTime(n) { return this.firstAt + n * this.data.burstInterval; }

  step(dt) {
    const live = this.phase === 'windup' || this.phase === 'active';
    if (live && this.cued < this.plan.length && this.world.time >= this.burstTime(this.cued) - ATTACK_FX.cue.lead) {
      this.cuedBurst = this.cued++;
      if (this.aimed(this.cuedBurst).length) this.cueAt = this.world.time;
    }
    super.step(dt);
    if (this.phase !== 'active') return;
    while (this.fired < this.plan.length && this.world.time >= this.burstTime(this.fired)) this.burst();
  }

  advance() {
    switch (this.phase) {
      case 'windup':
        this.notifyAttackStarted();
        this.burst();
        this.setPhase('active', (this.plan.length - 1) * this.data.burstInterval);
        return;
      case 'active':
        while (this.fired < this.plan.length) this.burst();
        this.setPhase('recovery', this.data.recoveryTime);
        return;
    }
    super.advance();
  }

  burst() {
    const e = this.enemy, d = this.data, b = e.body, heads = rimValves();
    const spits = this.plan[this.fired++];
    if (this.fired === 1) this.strikeAt = this.world.time; // the body pops once, as it starts; each shot kicks its valve (spatAt)
    if (!this.player) return;
    for (const { i, off } of spits) {
      const { x, y } = bodyToWorld(e, blightMuzzle(heads[i])), rot = b.rotation + heads[i].rot + off;
      this.world.add(new Projectile(this.world, this, x, y, {
        dir: fromAngle(rot), speed: d.projectileSpeed, lifetime: d.projectileLifetime, damage: e.damage * d.damageMultiplier,
        size: d.projectileSize, look: d.look,
      }));
      this.world.effects.burst(x, y, rot, { ...ATTACK_FX.projectile.muzzle, color: lookColor(d.look) });
      this.spatAt.set(i, this.world.time);
    }
    this.sound('puff');
  }

  // Burst `n`'s shots flying within `cueWithinDeg` of the player, as it faces now.
  aimed(n) {
    const p = this.player, b = this.enemy.body, heads = rimValves();
    if (!p || !this.plan[n]) return [];
    const to = Math.atan2(p.body.pos.y - b.pos.y, p.body.pos.x - b.pos.x) - b.rotation;
    return this.plan[n].filter(({ i, off }) => Math.abs(deltaAngle(heads[i].rot + off, to)) <= this.data.cueWithinDeg * DEG);
  }

  cuePoints() { return this.aimed(this.cuedBurst).map(({ i }) => blightMuzzle(rimValves()[i])); }
}

// Projectile: big globs form over the valves `from` over the wind-up, then `globs` of them
// are lobbed, `globInterval` apart, from each of those valves in turn, each at
// a spot around where the player is as it is thrown (the first right at them), where it
// splats into a pool of poison (Glob). Meanwhile it turns after the player at up to
// `turnRate`, each valve's next glob re-forms as the others are thrown, and each throw is
// cued at its valve. A stun (a glob parried) stops the rest.
class GlobsAbility extends ThrowAbility {
  constructor(enemy, data) {
    super(enemy, data);
    this.offsets = []; // each glob's landing spot off the player: { angle, dist }, or null for right at them
    this.thrown = 0;
    this.cued = 0;
    this.cuedGlob = 0;
    this.firstAt = 0;
    this.spatAt = new Map(); // valve index → when it last lobbed (for its rig)
  }

  execute() {
    const d = this.data, n = d.globs, start = Math.random() * TAU;
    this.offsets = Array.from({ length: n }, (_, k) => (k === 0 ? null
      : { angle: start + (TAU * (k - 1 + randRange(-0.3, 0.3))) / Math.max(1, n - 1), dist: randRange(...d.spread) }));
    this.thrown = this.cued = this.cuedGlob = 0;
    super.execute();
    this.firstAt = this.phaseEndsAt;
  }

  throwTime(k) { return this.firstAt + k * this.data.globInterval; }

  step(dt) {
    const d = this.data, live = this.phase === 'windup' || this.phase === 'active';
    if (live && this.cued < d.globs && this.world.time >= this.throwTime(this.cued) - ATTACK_FX.cue.lead) {
      this.cueAt = this.world.time;
      this.cuedGlob = this.cued++;
    }
    super.step(dt);
    if (this.phase !== 'active') return;
    while (this.thrown < d.globs && this.world.time >= this.throwTime(this.thrown)) this.hurl();
    if (this.player) {
      const b = this.enemy.body, want = this.dirToPlayer(), max = d.turnRate * dt;
      b.rotation += clamp(deltaAngle(b.rotation, Math.atan2(want.y, want.x)), -max, max);
    }
  }

  advance() {
    switch (this.phase) {
      case 'windup':
        this.notifyAttackStarted();
        this.hurl();
        this.setPhase('active', (this.data.globs - 1) * this.data.globInterval);
        return;
      case 'active':
        while (this.thrown < this.data.globs) this.hurl();
        this.setPhase('recovery', this.data.recoveryTime);
        return;
    }
    super.advance();
  }

  hurl() {
    const e = this.enemy, d = this.data, k = this.thrown++, i = d.from[k % d.from.length];
    this.strikeAt = this.world.time;
    if (!this.player) return;
    const from = bodyToWorld(e, blightMuzzle(blightParts()[i]));
    this.world.add(new Glob(this.world, this, from, this.landingSpot(this.offsets[k]), {
      speed: d.projectileSpeed, size: d.projectileSize, damage: e.damage * d.damageMultiplier,
      pool: { radius: d.pool.radius, time: d.pool.time, damage: e.damage * d.pool.damageMultiplier },
    }));
    this.spatAt.set(i, this.world.time);
    this.sound('lob');
  }

  // `off` from where the player is now, never past a wall in the way.
  landingSpot(off) {
    const p = this.player.body.pos;
    if (!off) return { x: p.x, y: p.y };
    const dx = Math.cos(off.angle), dy = Math.sin(off.angle), margin = 0.5;
    const reach = Math.min(off.dist, Math.max(0, this.world.physics.rayLength(p.x, p.y, dx, dy, off.dist + margin) - margin));
    return { x: p.x + dx * reach, y: p.y + dy * reach };
  }

  // A glob is forming then sitting over each valve with one still to throw: the first of
  // each valve's over the wind-up, each later one from that valve's last throw until two
  // throws before its own.
  charge(now) {
    if (this.phase === 'active' && this.thrown < this.data.globs) return { t: 1, since: Infinity };
    return super.charge(now);
  }

  chargePoints(alpha, now) {
    const d = this.data, n = d.from.length, b = this.enemy.body, p = b.lerpPos(alpha), rot = b.lerpRotation(alpha);
    const c = Math.cos(rot), s = Math.sin(rot), first = this.phase === 'windup' ? 0 : this.thrown, out = [];
    for (let k = first; k < Math.min(first + n, d.globs); k++) {
      const h = blightParts()[d.from[k % n]], m = blightMuzzle(h);
      const t = k < n ? undefined : clamp01((now - this.throwTime(k - n)) / (d.globInterval * (n - 1)));
      out.push({ x: p.x + c * m.x - s * m.y, y: p.y + s * m.x + c * m.y, rot: rot + h.rot, t });
    }
    return out;
  }

  cuePoints() { return [blightMuzzle(blightParts()[this.data.from[this.cuedGlob % this.data.from.length]])]; }
}

const TYPES = {
  dash: DashAbility, ram: RamAbility, laser: LaserAbility, punch: PunchAbility, swing: SwingAbility, slashes: SlashesAbility, smash: SmashAbility, groundPound: GroundPoundAbility,
  slam: SlamAbility, hook: HookAbility, flurry: FlurryAbility, throw: ThrowAbility, lob: LobAbility, missiles: MissilesAbility, spin: SpinThrowAbility, volley: VolleyAbility,
  cannons: CannonsAbility, scimitar: ScimitarAbility, rush: RushAbility, ring: RingAbility, canisters: CanistersAbility, spew: SpewAbility,
  globs: GlobsAbility, weave: WeaveAbility, reel: ReelAbility, flare: FlareAbility, bash: BashAbility, plant: PlantAbility, jetDash: JetDashAbility,
  swoop: SwoopAbility,
};

export function createAbility(enemy, data) {
  const Type = TYPES[data.type];
  if (!Type) throw new Error(`Unknown ability type "${data.type}"`);
  return new Type(enemy, data);
}
