// Adrenaline meter: filled by orbs, spent all at once to enter the Exalted state.
// Each use raises the meter's capacity ("tolerance") and the Exalted duration.
// Landing hits and parries while Exalted refills it (see extend). Swings landing on a
// guardian and parries of one add a little to it.
import { ADRENALINE as A } from '../data/config.js';
import { sfx } from '../audio/sfx.js';
import { DamageCause } from './damage.js';

export class Adrenaline {
  constructor(events) {
    this.events = events;
    this.current = 0;
    this.uses = 0;
    this.max = A.baseMaxAdrenaline;
    this.exaltedRemaining = 0;
    this.exaltedDuration = 0;
    events.enemyDamaged.on((enemy, _damage, cause) => {
      this.extend(A.extendPerHit);
      if (cause === DamageCause.Attack && enemy.type.isChaser) this.add(A.perGuardianHit);
    });
    events.parried.on((attack) => {
      const enemy = attack?.enemy ?? attack?.sourceAbility?.enemy;
      if (enemy?.type.isChaser) this.add(A.perGuardianParry);
    });
  }

  get isExalted() { return this.exaltedRemaining > 0; }
  get canActivate() { return !this.isExalted && this.current >= this.max; }
  get damageMultiplier() { return this.isExalted ? A.damageMultiplier : 1; }
  get speedMultiplier() { return this.isExalted ? A.speedMultiplier : 1; }
  get damageTakenMultiplier() { return this.isExalted ? 1 - A.damageResistance : 1; }
  // The size of the meter to fill next; an Exalted state counts as spent.
  get capacity() { return this.isExalted ? this.nextMax : this.max; }
  get nextMax() { return A.baseMaxAdrenaline + this.uses * A.toleranceIncreasePerUse; }

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

  // Dying Exalted: the state goes with the body, without its usual sigh.
  burnOut() {
    if (!this.isExalted) return;
    this.exaltedRemaining = 0;
    this.current = 0;
    this.max = this.nextMax;
  }

  step(dt) {
    if (!this.isExalted) return;
    this.exaltedRemaining = Math.max(0, this.exaltedRemaining - dt);
    // The meter drains with the timer.
    this.current = (this.exaltedRemaining / this.exaltedDuration) * this.max;
    if (this.exaltedRemaining === 0) {
      sfx.play('exaltedEnd');
      this.current = 0;
      this.max = this.nextMax;
    }
  }
}
