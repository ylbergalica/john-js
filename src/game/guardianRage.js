// Guardians losing patience as a floor drags on (GUARDIAN_RAGE). The clock is measured in
// fill times, how long the player should need to fill the adrenaline meter they arrived
// with: past `calm` of them the floor's guardians speed up (Enemy.pace), and on reaching
// `angry` they roar, the HUD showing their sign (src/ui/angerSign.js). An Exalted state
// started on this floor running out jumps the clock straight there (one carried in from
// the floor before doesn't), as does breaking the first of the floor's spawners; breaking
// the last jumps it to `max`, and they roar again.
import { GUARDIAN_RAGE as R } from '../data/config.js';
import { clamp } from '../engine/math.js';
import { sfx } from '../audio/sfx.js';

export class GuardianRage {
  constructor(world) {
    this.world = world;
    this.start(false);
  }

  // A new floor (`active` only on a run's floors): the clock starts over.
  start(active) {
    const a = this.world.adrenaline;
    this.active = active;
    this.elapsed = 0;
    this.fillTime = Math.max(1, a.capacity * R.secondsPerPoint);
    this.pace = 1;
    this.angry = false;
    this.roar = null; // { at, guardians } once they've roared
    this.roarAgain = false; // the last spawner broken: they roar again even if already angry
    this.exaltedHere = false; // an Exalted state started on this floor is running
    this.wasExalted = a.isExalted;
  }

  // The floor time at which guardians reach `pace`.
  timeAt(pace) { return (R.calm + (pace - 1) / R.climb) * this.fillTime; }

  get guardians() { return this.world.enemies.filter((e) => e.type.isChaser && !e.summoned); }

  step(dt) {
    if (!this.active) return;
    const w = this.world, a = w.adrenaline;
    this.elapsed += dt;
    if (a.isExalted !== this.wasExalted) {
      this.wasExalted = a.isExalted;
      if (a.isExalted) this.exaltedHere = true;
      else if (this.exaltedHere) {
        this.exaltedHere = false;
        if (w.livePlayer) this.provoke(); // dying Exalted doesn't count
      }
    }
    this.pace = clamp(1 + (this.elapsed / this.fillTime - R.calm) * R.climb, 1, R.max);
    const guardians = this.guardians;
    for (const g of guardians) g.pace = this.pace;
    if (this.roarAgain || (!this.angry && this.pace >= R.angry)) {
      this.angry = true;
      this.roarAgain = false;
      if (guardians.length) this.roarOut(guardians);
    }
  }

  // Jumps the clock ahead to where the guardians reach `pace` (no sooner than it already is).
  provoke(pace = R.angry) { this.elapsed = Math.max(this.elapsed, this.timeAt(pace)); }

  // One of the floor's spawners broken: the guardians are angry at once. The last of them
  // broken (`last`), they're as furious as they get, and roar again.
  spawnerBroken(last) {
    if (!this.active) return;
    this.provoke(last ? R.max : R.angry);
    if (last) this.roarAgain = true;
  }

  // Heard however far off they are, from their side of the screen.
  roarOut(guardians) {
    const w = this.world;
    this.roar = { at: w.time, guardians };
    const { pan, volume } = w.positional(guardians[0].body.pos);
    sfx.play('guardianRoar', { pan, volume: Math.max(R.roarVolume, volume), jitter: 0 });
  }
}
