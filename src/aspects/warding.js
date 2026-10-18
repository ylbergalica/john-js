// Warding Amulet: every few swings in a row that land on an enemy ward the player against a
// hit, the same ward a broken prop can drop, stacking with any already held up to a few. A
// swing that lands on nothing loses the count.
import { Aspect } from './aspect.js';

export class WardingAspect extends Aspect {
  constructor(player, data) {
    super(player, data);
    this.count = 0;
    this.swinging = false; // a swing is under way, still to be counted
    this.landed = false; // it has struck an enemy
  }

  // The HUD fills its icon toward the next ward.
  get cooldownFraction() { return 1 - this.count / this.data.everyAttacks; }

  // The swing just over (if any) is counted: a miss loses the count.
  settle() {
    if (!this.swinging) return;
    this.swinging = false;
    if (!this.landed) this.count = 0;
  }

  beforeAttack() {
    this.settle();
    this.swinging = true;
    this.landed = false;
  }

  step() { if (!this.player.attacking) this.settle(); }

  onHitEnemy() {
    if (!this.swinging || this.landed) return;
    this.landed = true;
    if (++this.count < this.data.everyAttacks) return;
    this.count = 0;
    if (this.player.buffs.wards >= this.data.maxWards) return;
    this.player.buffs.grant('ward', { quiet: true });
    this.used();
  }
}
