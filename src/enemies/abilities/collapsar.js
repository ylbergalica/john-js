// The Collapsar's abilities.
import { clamp01, fromAngle, smoothStep01, TAU } from '../../engine/math.js';
import { COLLAPSAR } from '../../data/config.js';
import { Projectile } from '../projectile.js';
import { WellOrb, gravityPull, wellsIn } from '../gravity.js';
import { HitboxAbility } from './ability.js';
import { ThrowAbility } from './throw.js';

// ── the Collapsar ──────────────────────────────────────────────────
// Zone: its Maw, hauling the player in through the wind-up, then the crush all round it. Its
// pull lives in World.gravities, which the player answers to as they walk.
export class InhaleAbility extends HitboxAbility {
  constructor(enemy, data) {
    const area = { type: 'circle', r: data.hitboxRadius };
    super(enemy, data, area, area, { parryKnockback: data.parryKnockback, strikeSound: 'collapsarCrush' });
    this.world.gravities.add(this);
  }

  execute() {
    super.execute();
    this.sound('collapsarInhale');
  }

  strike() {
    const b = this.enemy.body, w = this.world, s = this.data.crushShake, { volume } = w.positional(b.pos);
    if (volume > 0) w.camera.shake(s.duration, s.strength * volume, s.frequency);
    w.effects.burst(b.pos.x, b.pos.y, 0, COLLAPSAR.crushSparks);
  }

  pullOn(player) {
    const d = this.data;
    if (this.phase !== 'windup') return { x: 0, y: 0 };
    return gravityPull(this.world, this.enemy.body.pos, player.body, d.pull, smoothStep01(clamp01((this.world.time - this.phaseStartedAt) / d.pullRise)));
  }

  dispose() {
    super.dispose();
    this.world.gravities.delete(this);
  }
}

// Projectile: its Well, an orb lobbed at where the player stands (WellOrb).
export class WellAbility extends ThrowAbility {
  // Nothing can hurt as the wind-up ends, so EnemyAttackFx never cues it.
  get armDelay() { return Infinity; }

  // At most so many on the floor, counting those on their way: orbs flying and being gathered.
  shouldExecute() {
    const w = this.world, gathering = w.enemies.filter((e) => [...e.abilities.values()].some((a) => a instanceof WellAbility && a.phase === 'windup')).length;
    return wellsIn(w) + gathering < this.data.well.max && super.shouldExecute();
  }

  execute() {
    super.execute();
    this.sound('collapsarGather');
  }

  release() {
    const e = this.enemy, d = this.data, from = this.chargePoints(1)[0], to = this.player.body.pos;
    this.world.add(new WellOrb(this.world, this, from, to, {
      speed: d.projectileSpeed, size: d.projectileSize, damage: e.damage * d.damageMultiplier, well: d.well,
    }));
    this.sound('collapsarLob');
  }
}

// Projectile: its Ejecta, waves of shots straight out all round it, the first forming round
// its disc through the wind-up, the rest thrown `waveGap` after each other. Its rig draws the
// lanes of the wave to come (lanes()).
export class EjectaAbility extends ThrowAbility {
  constructor(enemy, data) {
    super(enemy, data);
    this.turn = 0; // the angle its lanes are laid out from: at the player as it starts
    this.wave = 0; // the next wave to go
  }

  get armDelay() { return Infinity; }

  execute() {
    const p = this.player, b = this.enemy.body;
    this.turn = p ? Math.atan2(p.body.pos.y - b.pos.y, p.body.pos.x - b.pos.x) : b.rotation;
    this.wave = 0;
    super.execute();
    this.sound('collapsarGather');
  }

  // The angles of wave `i`'s lanes.
  angles(i) {
    const W = this.data.waves[i];
    return Array.from({ length: W.count }, (_, j) => this.turn + (TAU * (j + W.offset)) / W.count);
  }

  // The lanes of the wave to come, for its rig: { angles, t: 0 → 1 till it goes }, or null.
  lanes(now) {
    const d = this.data;
    if (this.phase === 'windup') return { angles: this.angles(0), t: clamp01((now - this.phaseStartedAt) / d.windUpTime) };
    if (this.phase !== 'recovery' || this.wave >= d.waves.length) return null;
    return { angles: this.angles(this.wave), t: clamp01((now - this.strikeAt - (this.wave - 1) * d.waveGap) / d.waveGap) };
  }

  chargePoints(alpha) {
    const p = this.enemy.body.lerpPos(alpha), R = this.data.radius;
    return this.angles(0).map((a) => ({ x: p.x + Math.cos(a) * R, y: p.y + Math.sin(a) * R, rot: a }));
  }

  step(dt) {
    super.step(dt);
    const d = this.data;
    if (this.phase === 'recovery' && this.wave < d.waves.length && this.world.time >= this.strikeAt + this.wave * d.waveGap) this.throwWave();
  }

  release() { this.throwWave(); }

  throwWave() {
    const e = this.enemy, d = this.data, w = this.world, p = e.body.pos, R = d.radius;
    for (const a of this.angles(this.wave)) {
      const x = p.x + Math.cos(a) * R, y = p.y + Math.sin(a) * R;
      if (w.physics.circleHitsWall(x, y, d.projectileSize / 2)) continue; // into a wall right beside it
      w.add(new Projectile(w, this, x, y, { dir: fromAngle(a), speed: d.projectileSpeed, lifetime: d.projectileLifetime, damage: e.damage * d.damageMultiplier, size: d.projectileSize, look: d.look }));
    }
    this.wave++;
    this.sound('collapsarEjecta');
  }
}
