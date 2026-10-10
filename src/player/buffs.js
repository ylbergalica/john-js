// Boons picked up from broken props (BUFFS): swift and fury last a while, a ward until it
// stops a hit. They carry over to the next floor (World.advanceFloor). Times are on the
// world's simulation clock.
import { BUFFS } from '../data/config.js';
import { BuffView } from './buffView.js';

export const BUFF_KINDS = Object.keys(BUFFS);
const TIMED = BUFF_KINDS.filter((k) => BUFFS[k].time);

export class Buffs {
  constructor(player) {
    this.player = player;
    this.until = Object.fromEntries(TIMED.map((k) => [k, -Infinity]));
    this.ward = false;
    this.grants = Object.fromEntries(BUFF_KINDS.map((k) => [k, 0])); // pickups taken, so the HUD can pop on each
    this.view = new BuffView(player, this);
  }

  get now() { return this.player.now; }
  get speedMultiplier() { return this.has('swift') ? BUFFS.swift.speed : 1; }
  get damageMultiplier() { return this.has('fury') ? BUFFS.fury.damage : 1; }

  has(kind) { return kind === 'ward' ? this.ward : this.now < this.until[kind]; }

  // Seconds left of a timed buff (0 once it's over); Infinity for a ward that holds.
  left(kind) {
    if (kind === 'ward') return this.ward ? Infinity : 0;
    return Math.max(0, this.until[kind] - this.now);
  }

  grant(kind) {
    if (kind === 'ward') this.ward = true;
    else this.until[kind] = this.now + BUFFS[kind].time;
    this.grants[kind]++;
    this.view.gained(kind);
    this.player.world.sound(`${kind}Gain`);
  }

  // Takes a hit in the player's place if warded: → whether it did.
  absorb(source) {
    if (!this.ward) return false;
    this.ward = false;
    this.view.wardBroken(source);
    this.player.world.sound('wardBreak');
    return true;
  }

  step() {
    for (const kind of TIMED) {
      if (this.until[kind] === -Infinity || this.now < this.until[kind]) continue;
      this.until[kind] = -Infinity;
      this.view.ended(kind);
      this.player.world.sound('buffEnd');
    }
  }

  // What's carried to the next floor's player: seconds left of each timed buff, and the ward.
  carry() { return { left: Object.fromEntries(TIMED.map((k) => [k, this.left(k)])), ward: this.ward }; }

  restore({ left, ward }) {
    for (const kind of TIMED) if (left[kind] > 0) this.until[kind] = this.now + left[kind];
    this.ward = ward;
  }

  render(alpha, dt) { this.view.render(alpha, dt); }

  destroy() { this.view.destroy(); }
}
