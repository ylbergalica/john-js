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
import { dist, dirTo, fromAngle } from '../../engine/math.js';
import { ATTACK_FX, FIXED_DT } from '../../data/config.js';
import { EnemyHitbox } from '../hitbox.js';
import { DamageCause } from '../../game/damage.js';
import { ZoneView } from '../attackView.js';

export const DEG = Math.PI / 180;

export class Ability {
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
      if (other === e || other.dead || other.type.shootOver || other.untargetable) continue;
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
export class HitboxAbility extends Ability {
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
