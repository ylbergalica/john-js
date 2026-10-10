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
import { clamp01, clampLength, dist, dirTo, fromAngle, lerp } from '../engine/math.js';
import { ATTACK_FX, FIXED_DT } from '../data/config.js';
import { EnemyHitbox } from './hitbox.js';
import { Projectile } from './projectile.js';
import { MistShell } from './mistShell.js';
import { DamageCause } from '../game/damage.js';
import { ZoneView, ChargeView, BeamView } from './attackView.js';

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

  shouldExecute() {
    const p = this.player;
    return !!p && dist(this.enemy.body.pos, p.body.pos) <= this.data.range && this.hasClearAttackPath();
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

  // Sweeps a circle toward the player; walls and other enemies block the attack.
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
      if (other === e || other.dead) continue;
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

  // Damage taken when parried, plus the player's parry-streak bonus, both scaled by Exalted.
  parryDamage() {
    const base = this.data.damageMultiplier * this.enemy.damage + (this.player?.parryBonusDamage ?? 0);
    return base * this.world.adrenaline.damageMultiplier;
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
  onParry() {
    if (this.phase !== 'active' || this.parriedStunEndsAt !== null) return;
    const e = this.enemy, zone = this.kind === 'zone';
    if (zone) this.hitbox.setActive(false);
    else this.endActive();
    e.body.stop();
    const k = this.awayFromPlayer();
    e.body.addImpulse(k.x * this.parryKnockback, k.y * this.parryKnockback);
    e.takeDamage(this.parryDamage(), null, null, DamageCause.Parry);
    if (e.dead) return;
    e.stunned = true;
    if (zone) this.parriedStunEndsAt = this.world.time + this.data.parryStunTime;
    else this.setPhase('stunned', this.data.parryStunTime);
  }
}

// Body: charges the way it faces.
class DashAbility extends HitboxAbility {
  constructor(enemy, data) {
    super(enemy, data, { type: 'circle', r: data.hitboxRadius }, null, {
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

// Body: a held weapon swung across the front as the enemy lunges (the Mauler's maul). The
// enemy and its weapon are the hitbox, a circle `hitboxRadius` around a point
// `hitboxForward` ahead, so a parry meets the enemy itself and cuts the swing short.
class SwingAbility extends LungeAbility {
  constructor(enemy, data) {
    super(enemy, data, { type: 'circle', r: data.hitboxRadius, forward: data.hitboxForward }, null, {
      kind: 'body', parryKnockback: data.parryKnockback, strikeSound: data.strikeSound,
    });
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

  // Where ChargeView grows the orbs, as the frame `alpha` shows the enemy: [{ x, y, rot }].
  chargePoints(alpha) {
    const b = this.enemy.body, p = b.lerpPos(alpha), rot = b.lerpRotation(alpha), s = this.data.spawnDistance;
    return [{ x: p.x + Math.cos(rot) * s, y: p.y + Math.sin(rot) * s, rot }];
  }

  cuePoints() { return [{ x: this.data.spawnDistance, y: 0 }]; }

  // A parried projectile punishes its thrower, even mid-way through a later attack, which
  // the stun breaks off if it was still winding up.
  onParry() {
    const e = this.enemy;
    if (this.phase === 'stunned' || e.dead) return;
    e.body.stop();
    e.takeDamage(this.parryDamage(), null, null, DamageCause.Parry);
    if (e.dead) return;
    e.stunned = true;
    e.isActing = false;
    for (const a of e.abilities.values()) if (a !== this && a.phase === 'windup') a.phase = 'ready';
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

const TYPES = {
  dash: DashAbility, ram: RamAbility, laser: LaserAbility, punch: PunchAbility, swing: SwingAbility, slashes: SlashesAbility, smash: SmashAbility, groundPound: GroundPoundAbility,
  slam: SlamAbility, throw: ThrowAbility, lob: LobAbility, missiles: MissilesAbility,
};

export function createAbility(enemy, data) {
  const Type = TYPES[data.type];
  if (!Type) throw new Error(`Unknown ability type "${data.type}"`);
  return new Type(enemy, data);
}
