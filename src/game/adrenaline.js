// Adrenaline meter: filled by orbs, spent all at once to enter the Exalted state.
// Each use raises the meter's capacity ("tolerance") and the Exalted duration.
// Landing hits and parries while Exalted refills it (see extend).
import { ADRENALINE as A } from '../data/config.js';
import { sfx } from '../audio/sfx.js';

export class Adrenaline {
  constructor(events) {
    this.events = events;
    this.current = 0;
    this.uses = 0;
    this.max = A.baseMaxAdrenaline;
    this.exaltedRemaining = 0;
    this.exaltedDuration = 0;
    events.enemyDamaged.on(() => this.extend(A.extendPerHit));
  }

  get isExalted() { return this.exaltedRemaining > 0; }
  get canActivate() { return !this.isExalted && this.current >= this.max; }
  get damageMultiplier() { return this.isExalted ? A.damageMultiplier : 1; }
  get speedMultiplier() { return this.isExalted ? A.speedMultiplier : 1; }
  get damageTakenMultiplier() { return this.isExalted ? 1 - A.damageResistance : 1; }

  add(amount) {
    if (this.isExalted) return;
    const wasFull = this.current >= this.max, before = this.current, offered = amount * A.basePointValue;
    this.current = Math.min(this.current + offered, this.max);
    this.events.adrenalineGained.emit(this.current - before, offered);
    if (!wasFull && this.current >= this.max) sfx.play('adrenalineFull');
  }

  // Buys back Exalted time (and the meter with it), up to the state's full duration.
  extend(seconds) {
    if (!this.isExalted) return;
    this.exaltedRemaining = Math.min(this.exaltedRemaining + seconds, this.exaltedDuration);
  }

  activate() {
    if (!this.canActivate) return false;
    this.uses++;
    this.exaltedDuration = A.baseDuration + (this.uses - 1) * A.durationIncreasePerUse;
    this.exaltedRemaining = this.exaltedDuration;
    sfx.play('exalted');
    return true;
  }

  step(dt) {
    if (!this.isExalted) return;
    this.exaltedRemaining = Math.max(0, this.exaltedRemaining - dt);
    // The meter drains with the timer.
    this.current = (this.exaltedRemaining / this.exaltedDuration) * this.max;
    if (this.exaltedRemaining === 0) {
      sfx.play('exaltedEnd');
      this.current = 0;
      this.max = A.baseMaxAdrenaline + this.uses * A.toleranceIncreasePerUse;
    }
  }
}
