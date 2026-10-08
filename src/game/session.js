// State that lives for one run (across floors) and dies with it: floor number,
// adrenaline, unbanked coins, the gameplay event channels and the stats shown on
// the run summary. Coins are awarded here, by the rules in COINS.
import { Emitter } from '../engine/events.js';
import { Adrenaline } from './adrenaline.js';
import { profile } from '../meta/profile.js';
import { COINS } from '../data/config.js';

export const RunMode = { Run: 'run', Playground: 'playground' };

export class RunSession {
  constructor(mode) {
    this.mode = mode;
    this.floor = 1;
    this.events = {
      enemyKilled: new Emitter(),
      parried: new Emitter(),
      enemyDamaged: new Emitter(), // (enemy, damage)
      playerDamaged: new Emitter(), // (player, damage after resistance, raw damage)
      adrenalineGained: new Emitter(), // (points added, points offered)
    };
    this.adrenaline = new Adrenaline(this.events);
    this.pendingCoins = 0;
    this.ended = false; // set once coins are banked; later kills (e.g. while dying) don't count
    this.stats = {
      kills: {}, // by enemy type key
      aspectUses: {}, // by aspect id, activatable aspects only
      floorsCleared: 0,
      coins: { enemies: 0, guardians: 0, floors: 0, achievements: 0 }, // earned, by source
      coinsBanked: 0,
      timeSurvived: 0,
    };
    this.events.enemyKilled.on((e) => this.enemyKilled(e));
  }

  get scalesDifficulty() { return this.mode === RunMode.Run; }

  // Only a run's own enemies count: the playground and the spawn menu earn nothing.
  get earns() { return this.mode === RunMode.Run && !this.ended; }

  enemyKilled(enemy) {
    if (!this.earns || enemy.summoned) return;
    profile.recordKill(enemy.typeKey);
    const { kills } = this.stats;
    kills[enemy.typeKey] = (kills[enemy.typeKey] ?? 0) + 1;
    if (enemy.type.isChaser) this.addCoins(this.coinsFor(COINS.guardianKill), 'guardians');
    else this.addCoins(this.coinsFor(COINS.enemyKill), 'enemies');
  }

  floorCleared() {
    if (!this.earns) return;
    this.stats.floorsCleared++;
    this.addCoins(this.coinsFor(COINS.floorCleared), 'floors');
  }

  // A COINS yield on the current floor.
  coinsFor({ base, perFloor }) { return base + perFloor * (this.floor - 1); }

  aspectUsed(id) {
    if (this.ended) return;
    const uses = this.stats.aspectUses;
    uses[id] = (uses[id] ?? 0) + 1;
  }

  addCoins(n, source) {
    this.pendingCoins += n;
    this.stats.coins[source] += n;
  }

  // Death banks the run's coins; quitting from the pause menu forfeits them.
  bankCoins() {
    profile.bankCoins(this.pendingCoins);
    this.stats.coinsBanked += this.pendingCoins;
    this.pendingCoins = 0;
    this.ended = true;
  }
  forfeitCoins() { this.pendingCoins = 0; }
}
