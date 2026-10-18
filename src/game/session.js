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
      enemyKilled: new Emitter(), // (enemy, cause) — see DamageCause
      parried: new Emitter(), // (attack)
      enemyDamaged: new Emitter(), // (enemy, damage, cause)
      playerDamaged: new Emitter(), // (player, damage after resistance, raw damage)
      playerThreatened: new Emitter(), // (player, pendingHit): an attack has connected and lands in a moment (see Player.hitBy)
      adrenalineGained: new Emitter(), // (points added, points offered)
    };
    this.adrenaline = new Adrenaline(this.events);
    this.pendingCoins = 0;
    this.aspectState = {}; // by aspect id: what an aspect keeps for the run (the player and its aspects are rebuilt each floor)
    this.ended = false; // set once coins are banked; later kills (after the dying player's body bursts) don't count
    this.stats = {
      kills: {}, // by enemy type key
      aspectCounts: {}, // by aspect id: what its AspectStat counts
      floorsCleared: 0,
      spawnersBroken: 0,
      coins: { enemies: 0, guardians: 0, spawners: 0, achievements: 0 }, // earned, by source
      coinsBanked: 0,
      timeSurvived: 0,
    };
    this.events.enemyKilled.on((e) => this.enemyKilled(e));
    this.events.enemyDamaged.on((_e, _damage, cause) => this.countAspect(cause, 'hits'));
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

  spawnerBroken() {
    if (!this.earns) return;
    this.stats.spawnersBroken++;
    this.addCoins(this.coinsFor(COINS.spawnerBroken), 'spawners');
  }

  floorCleared() {
    if (!this.earns) return;
    this.stats.floorsCleared++;
    profile.recordFloorCleared();
  }

  // A COINS yield on the current floor.
  coinsFor({ base, perFloor }) { return base + perFloor * (this.floor - 1); }

  // Adds `n` to the aspect `id`'s summary stat if that's what it counts ('uses', 'hits' or
  // 'tally', see AspectStat).
  countAspect(id, counts, n = 1) {
    if (this.ended || profile.getAspect(id)?.stat?.counts !== counts) return;
    const all = this.stats.aspectCounts;
    all[id] = (all[id] ?? 0) + n;
  }

  addCoins(n, source) {
    this.pendingCoins += n;
    this.stats.coins[source] += n;
  }

  // Death banks the run's coins and counts the run; quitting from the pause menu forfeits
  // them and doesn't count.
  bankCoins() {
    if (!this.ended) profile.recordRunFinished();
    profile.bankCoins(this.pendingCoins);
    this.stats.coinsBanked += this.pendingCoins;
    this.pendingCoins = 0;
    this.ended = true;
  }
  forfeitCoins() { this.pendingCoins = 0; }
}
