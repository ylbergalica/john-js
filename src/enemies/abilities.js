// Enemy abilities as small phase machines on the simulation clock:
//   ready → windup → active → recovery → ready   (melee hitbox abilities)
//   ready → windup → recovery → ready            (projectile throw)
// A parry interrupts with damage and a stun phase.
import { dist, dirTo, norm, fromAngle } from '../engine/math.js';
import { EnemyHitbox } from './hitbox.js';
import { Projectile } from './projectile.js';

class Ability {
  constructor(enemy, data) {
    this.enemy = enemy;
    this.data = data;
    this.lastUseTime = -Infinity;
    this.phase = 'ready';
    this.phaseEndsAt = 0;
    this.hitbox = null;
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

  dirToPlayer() {
    const p = this.player;
    return p ? dirTo(this.enemy.body.pos, p.body.pos) : fromAngle(this.enemy.body.rotation);
  }

  awayFromPlayer() {
    const p = this.player;
    return p ? dirTo(p.body.pos, this.enemy.body.pos) : { x: 0, y: 0 };
  }

  notifyAttackStarted() { this.enemy.ai.onAbilityAttackStarted(this); }

  dispose() { this.hitbox?.destroy(); }
}

// Melee abilities with a telegraphed hitbox (Dash, Punch, Ground Pound, Slam).
class HitboxAbility extends Ability {
  constructor(enemy, data, shape, colorKey, { stopsOnStart = true, parryKnockback = 5 } = {}) {
    super(enemy, data);
    this.hitbox = new EnemyHitbox(enemy, this, shape, colorKey);
    this.stopsOnStart = stopsOnStart;
    this.parryKnockback = parryKnockback;
  }

  execute() {
    this.enemy.isActing = true;
    if (this.stopsOnStart) this.enemy.body.stop();
    this.setPhase('windup', this.data.windUpTime);
  }

  advance() {
    const e = this.enemy;
    switch (this.phase) {
      case 'windup':
        this.notifyAttackStarted();
        this.strike();
        this.hitbox.setActive(true);
        this.setPhase('active', this.data.duration);
        break;
      case 'active':
        this.hitbox.setActive(false);
        this.setPhase('recovery', this.data.recoveryTime);
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

  onParry() {
    if (this.phase !== 'active') return;
    const e = this.enemy;
    this.hitbox.setActive(false);
    e.body.stop();
    const k = this.awayFromPlayer();
    e.body.addImpulse(k.x * this.parryKnockback, k.y * this.parryKnockback);
    e.takeDamage(this.data.damageMultiplier * e.damage);
    if (e.dead) return;
    e.stunned = true;
    this.setPhase('stunned', this.data.parryStunTime);
  }
}

class DashAbility extends HitboxAbility {
  constructor(enemy, data) {
    super(enemy, data, { type: 'circle', r: data.hitboxRadius }, 'dash', { parryKnockback: data.dashForce * 0.3 });
  }
  strike() {
    const d = this.dirToPlayer();
    this.enemy.body.addImpulse(d.x * this.data.dashForce, d.y * this.data.dashForce);
  }
}

class PunchAbility extends HitboxAbility {
  constructor(enemy, data) {
    const h = data.hitboxSize / 2;
    super(enemy, data, { type: 'box', forward: data.forwardOffset, hw: h, hh: h }, 'punch');
  }
  strike() {
    const d = this.dirToPlayer();
    this.enemy.body.addImpulse(d.x * this.data.stepForce, d.y * this.data.stepForce);
  }
}

class GroundPoundAbility extends HitboxAbility {
  constructor(enemy, data) { super(enemy, data, { type: 'circle', r: data.radius }, 'groundPound'); }
}

class SlamAbility extends HitboxAbility {
  constructor(enemy, data) {
    const s = data.sizeScale, half = (data.range / 2) * s;
    super(enemy, data, { type: 'box', forward: half, hw: half, hh: (data.slamWidth / 2) * s }, 'slam', { stopsOnStart: false });
  }
}

class ThrowAbility extends Ability {
  execute() {
    this.enemy.isActing = true;
    this.enemy.body.stop();
    this.setPhase('windup', this.data.windUpTime);
  }

  advance() {
    const e = this.enemy, d = this.data;
    switch (this.phase) {
      case 'windup': {
        this.notifyAttackStarted();
        if (this.player) {
          const dir = norm(this.dirToPlayer());
          this.world.add(new Projectile(this.world, this, e.body.pos.x + dir.x * d.spawnDistance, e.body.pos.y + dir.y * d.spawnDistance, {
            dir, speed: d.projectileSpeed, lifetime: d.projectileLifetime, damage: e.damage * d.damageMultiplier,
            size: d.projectileSize, color: d.projectileColor,
          }));
        }
        this.setPhase('recovery', d.recoveryTime);
        break;
      }
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

  // A parried projectile punishes its thrower, even mid-way through a later attack.
  onParry() {
    const e = this.enemy;
    if (this.phase === 'stunned' || e.dead) return;
    e.body.stop();
    e.takeDamage(e.damage * this.data.damageMultiplier);
    if (e.dead) return;
    e.stunned = true;
    e.isActing = false;
    this.setPhase('stunned', this.data.parryStunTime);
  }
}

const TYPES = { dash: DashAbility, punch: PunchAbility, groundPound: GroundPoundAbility, slam: SlamAbility, throw: ThrowAbility };

export function createAbility(enemy, data) {
  const Type = TYPES[data.type];
  if (!Type) throw new Error(`Unknown ability type "${data.type}"`);
  return new Type(enemy, data);
}
