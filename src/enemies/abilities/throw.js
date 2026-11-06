// Thrown attacks: the base the ranged abilities build on, and cannons (the Gunner's, and the base of the Tyrant's guns and the Blight's ring).
import { clamp, clamp01, deltaAngle, fromAngle } from '../../engine/math.js';
import { ATTACK_FX } from '../../data/config.js';
import { Projectile } from '../projectile.js';
import { DamageCause } from '../../game/damage.js';
import { ChargeView, lookColor } from '../attackView.js';
import { Ability } from './ability.js';

// Projectile: throws an orb the way it faces.
export class ThrowAbility extends Ability {
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

// Projectile: `salvos` of shots from fixed cannons (`muzzles`, the Gunner's), one every
// `salvoInterval`, each straight out its cannon (ahead, unless it has an `angle` off its
// facing): a single cannon a salvo, all of
// them once in a random order, or all of them at once (`together`). A shot forms at every
// cannon over the wind-up and waits there until fired; between `together` salvos a fresh
// set forms over `regrowTime`, the enemy turning after the player at up to `turnRate`
// until the last `lockTime` before the next. Each salvo is cued at its own cannons. A
// stun (a parried shot among them) stops the rest.
export class CannonsAbility extends ThrowAbility {
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
    if (d.volleys) this.salvos = d.volleys;
    else if (d.together) this.salvos = Array.from({ length: d.salvos }, () => all);
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
      if (this.cued % (d.cueEvery ?? 1) === 0) this.cueAt = this.world.time;
      this.cuedSalvo = this.cued++;
    }
    super.step(dt);
    if (this.phase !== 'active') return;
    while (this.fired < this.salvos.length && this.world.time >= this.fireTime(this.fired)) this.fireSalvo();
    if (d.turnRate && this.player && this.world.time < this.fireTime(this.fired) - (d.salvoLock ?? d.lockTime)) {
      const b = this.enemy.body, want = this.aimDir(), max = d.turnRate * dt;
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
      const rot = b.rotation + (m.angle ?? 0) + this.scatter();
      this.launch(x, y, rot);
      this.world.effects.burst(x, y, rot, { ...ATTACK_FX.projectile.muzzle, color: lookColor(d.look) });
    }
    b.vel.x -= dir.x * d.recoil;
    b.vel.y -= dir.y * d.recoil;
    this.sound(d.salvoSound ?? (cannons.length > 1 ? 'broadside' : 'cannon'));
  }

  // Where it turns to, firing.
  aimDir() { return this.dirToPlayer(); }

  // How far off its cannon's line a shot goes (radians).
  scatter() { return 0; }

  launch(x, y, rot) {
    const d = this.data;
    this.world.add(new Projectile(this.world, this, x, y, {
      dir: fromAngle(rot), speed: d.projectileSpeed, lifetime: d.projectileLifetime, damage: this.enemy.damage * d.damageMultiplier,
      size: d.projectileSize, look: d.look,
    }));
  }

  // The cannons with a shot waiting at them.
  loaded() { return new Set(this.salvos.slice(this.fired).flat()); }

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
    return [...this.loaded()].map((i) => {
      const m = this.muzzles[i];
      return { x: p.x + c * m.x - s * m.y, y: p.y + s * m.x + c * m.y, rot: rot + (m.angle ?? 0) };
    });
  }

  cuePoints() { return (this.salvos[this.cuedSalvo] ?? []).map((i) => ({ x: this.muzzles[i].x, y: this.muzzles[i].y })); }
}
