// State that lives for one run (across floors) and dies with it: floor number,
// adrenaline, unbanked coins and the gameplay event channels.
import { Emitter } from '../engine/events.js';
import { Adrenaline } from './adrenaline.js';
import { profile } from '../meta/profile.js';

export const RunMode = { Run: 'run', Playground: 'playground' };

export class RunSession {
  constructor(mode) {
    this.mode = mode;
    this.floor = 1;
    this.adrenaline = new Adrenaline();
    this.pendingCoins = 0;
    this.events = {
      enemyKilled: new Emitter(),
      parried: new Emitter(),
    };
  }

  get scalesDifficulty() { return this.mode === RunMode.Run; }

  addCoins(n) { this.pendingCoins += n; }

  // Death banks the run's coins; quitting from the pause menu forfeits them.
  bankCoins() {
    profile.bankCoins(this.pendingCoins);
    this.pendingCoins = 0;
  }
  forfeitCoins() { this.pendingCoins = 0; }
}
