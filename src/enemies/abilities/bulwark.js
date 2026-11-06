// The Bulwark's abilities.
import { clamp01, lerp } from '../../engine/math.js';
import { LungeAbility, SwingAbility } from './melee.js';

// Body: the Bulwark's bash, a lunge shield-first, its hitbox the shield ahead. Parried, its
// guard breaks: the shield flies off its arm, away from the player. Not tried with the
// shield off.
export class BashAbility extends SwingAbility {
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
export class PlantAbility extends LungeAbility {
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
