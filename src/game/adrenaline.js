// Adrenaline meter: filled by orbs, spent all at once to enter the Exalted state.
// Each use raises the meter's capacity ("tolerance") and the Exalted duration.
import { ADRENALINE as A } from '../data/config.js';

export class Adrenaline {
  constructor() {
    this.current = 0;
    this.uses = 0;
    this.max = A.baseMaxAdrenaline;
    this.exaltedRemaining = 0;
    this.exaltedDuration = 0;
  }

  get isExalted() { return this.exaltedRemaining > 0; }
  get canActivate() { return !this.isExalted && this.current >= this.max; }
  get damageMultiplier() { return this.isExalted ? A.damageMultiplier : 1; }
  get speedMultiplier() { return this.isExalted ? A.speedMultiplier : 1; }
  get damageTakenMultiplier() { return this.isExalted ? 1 - A.damageResistance : 1; }

  add(amount) {
    if (this.isExalted) return;
    this.current = Math.min(this.current + amount * A.basePointValue, this.max);
  }

  activate() {
    if (!this.canActivate) return false;
    this.uses++;
    this.exaltedDuration = A.baseDuration + (this.uses - 1) * A.durationIncreasePerUse;
    this.exaltedRemaining = this.exaltedDuration;
    return true;
  }

  step(dt) {
    if (!this.isExalted) return;
    this.exaltedRemaining = Math.max(0, this.exaltedRemaining - dt);
    // The meter drains with the timer.
    this.current = (this.exaltedRemaining / this.exaltedDuration) * this.max;
    if (this.exaltedRemaining === 0) {
      this.current = 0;
      this.max = A.baseMaxAdrenaline + this.uses * A.toleranceIncreasePerUse;
    }
  }
}
