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
import { dist, dirTo, norm, fromAngle } from '../engine/math.js';
import { ATTACK_FX, FIXED_DT } from '../data/config.js';
import { EnemyHitbox } from './hitbox.js';
import { Projectile } from './projectile.js';
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
    // Loop so zero-length phases chain within one step.
    while (this.phase !== 'ready' && this.world.time >= this.phaseEndsAt) this.advance();
  }

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

// Melee abilities with a hitbox (Dash, Ram, Laser, Punch, Ground Pound, Slam). Zones pass
// `area`, the shape ZoneView burns (see there): everywhere the hitbox reaches while active.
// `kind` defaults to 'zone', so a new zone attack is disarmed rather than cut short by a parry.
class HitboxAbility extends Ability {
  constructor(enemy, data, shape, area, { kind = 'zone', stopsOnStart = true, parryKnockback = 5, strikeSound, continuous = false } = {}) {
    super(enemy, data);
    this.kind = kind;
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
        this.view?.strike();
        this.sound(this.strikeSound);
        this.hitbox.setActive(true);
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
    e.takeDamage(this.parryDamage());
    if (e.dead) return;
    e.stunned = true;
    if (zone) this.parriedStunEndsAt = this.world.time + this.data.parryStunTime;
    else this.setPhase('stunned', this.data.parryStunTime);
  }
}

// Body: charges at the player.
class DashAbility extends HitboxAbility {
  constructor(enemy, data) {
    super(enemy, data, { type: 'circle', r: data.hitboxRadius }, null, {
      kind: 'body', parryKnockback: data.dashForce * 0.3, strikeSound: 'enemyDash',
    });
  }
  strike() {
    const d = this.dirToPlayer();
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

// Projectile: throws an orb at the player.
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
    const e = this.enemy, d = this.data, dir = norm(this.dirToPlayer());
    this.world.add(new Projectile(this.world, this, e.body.pos.x + dir.x * d.spawnDistance, e.body.pos.y + dir.y * d.spawnDistance, {
      dir, speed: d.projectileSpeed, lifetime: d.projectileLifetime, damage: e.damage * d.damageMultiplier,
      size: d.projectileSize,
    }));
    this.sound('throw');
  }

  // Where ChargeView grows the orbs, as the frame `alpha` shows the enemy: [{ x, y, rot }].
  chargePoints(alpha) {
    const p = this.enemy.body.lerpPos(alpha), target = this.player.body.lerpPos(alpha), s = this.data.spawnDistance;
    const dx = target.x - p.x, dy = target.y - p.y, l = Math.hypot(dx, dy) || 1;
    return [{ x: p.x + (dx / l) * s, y: p.y + (dy / l) * s, rot: Math.atan2(dy, dx) }];
  }

  // A parried projectile punishes its thrower, even mid-way through a later attack.
  onParry() {
    const e = this.enemy;
    if (this.phase === 'stunned' || e.dead) return;
    e.body.stop();
    e.takeDamage(this.parryDamage());
    if (e.dead) return;
    e.stunned = true;
    e.isActing = false;
    this.setPhase('stunned', this.data.parryStunTime);
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
  dash: DashAbility, ram: RamAbility, laser: LaserAbility, punch: PunchAbility, groundPound: GroundPoundAbility,
  slam: SlamAbility, throw: ThrowAbility, missiles: MissilesAbility,
};

export function createAbility(enemy, data) {
  const Type = TYPES[data.type];
  if (!Type) throw new Error(`Unknown ability type "${data.type}"`);
  return new Type(enemy, data);
}
