// Builds the equipped aspects for a player, routes slot keys 1–3 (buffered) and
// forwards combat events to them.
import { PLAYER } from '../data/config.js';
import { InputBuffer } from '../player/inputBuffer.js';
import { profile } from '../meta/profile.js';
import { createAspect } from './index.js';

export class AspectController {
  constructor(player) {
    this.player = player;
    // Each remembers its loadout slot: slot i fires on key i + 1, even with gaps before it.
    this.aspects = profile.loadout().flatMap((data, slot) => (data ? [Object.assign(createAspect(player, data), { slot })] : []));
    this.buffers = this.aspects.map(() => new InputBuffer(PLAYER.inputBufferTime));
    // The player's swings: PLAYER.attack, as an equipped aspect changes it (its data's `attack`).
    // `hold`: holding the attack key keeps swinging; `ownLook`: the aspect draws its swings, in
    // place of the usual ones and their burst; `sound`: what a swing sounds like; hitstop,
    // killHitstop and shake: how a hit feels, × the usual (ENEMY_HIT).
    this.attack = {
      ...PLAYER.attack, hold: false, ownLook: false, sound: 'swing', hitstop: 1, killHitstop: 1, shake: 1,
      ...this.aspects.find((a) => a.data.attack)?.data.attack,
    };
    const events = player.world.events;
    this.unsubscribe = [
      events.enemyDamaged.on((enemy, damage, cause) => this.others(cause, (a) => a.onEnemyDamaged(enemy, damage, cause))),
      events.enemyKilled.on((enemy, cause) => this.others(cause, (a) => a.onEnemyKilled(enemy, cause))),
      events.parried.on((attack) => this.aspects.forEach((a) => a.onParry(attack))),
    ];
  }

  // Every aspect except the one that caused the event: aspects never trigger themselves.
  others(cause, fn) { for (const a of this.aspects) if (a.data.id !== cause) fn(a); }

  step(dt) {
    const { input, time } = this.player.world;
    this.aspects.forEach((aspect, i) => {
      if (!aspect.data.activatable) return;
      if (input.wasPressed(`slot${aspect.slot + 1}`)) this.buffers[i].press(time);
      if (!this.player.teleporting) this.buffers[i].consume(time, () => this.activate(aspect));
    });
    for (const a of this.aspects) a.step(dt);
  }

  activate(aspect) {
    const ok = aspect.tryActivate();
    if (ok) aspect.used();
    return ok;
  }

  afterPhysics() { for (const a of this.aspects) a.afterPhysics(); }
  render(alpha, dt) { for (const a of this.aspects) a.render(alpha, dt); }

  beforeAttack() { for (const a of this.aspects) a.beforeAttack(); }
  onSwing() { for (const a of this.aspects) a.onSwing(); }
  onDash(dir) { for (const a of this.aspects) a.onDash(dir); }
  onHitEnemy(enemy, hitPoint) { for (const a of this.aspects) a.onHitEnemy(enemy, hitPoint); }
  onHitProp(prop, hitPoint) { for (const a of this.aspects) a.onHitProp(prop, hitPoint); }
  // How an equipped aspect changes the player's own look (its data's `identity`), or null.
  get identity() { return this.aspects.find((a) => a.data.identity)?.data.identity ?? null; }
  get damageMultiplier() { return this.aspects.reduce((m, a) => m * a.damageMultiplier, 1); }
  get damageDealtMultiplier() { return this.aspects.reduce((m, a) => m * a.damageDealtMultiplier, 1); }
  refreshCooldowns() { for (const a of this.aspects) a.refreshCooldown(); }

  // What each aspect carries to the next floor's player, by id.
  carry() {
    const out = {};
    for (const a of this.aspects) {
      const state = a.carry();
      if (state !== undefined) out[a.data.id] = state;
    }
    return out;
  }

  restore(carried) { for (const a of this.aspects) if (a.data.id in carried) a.restore(carried[a.data.id]); }

  dispose() {
    for (const off of this.unsubscribe) off();
    for (const a of this.aspects) a.dispose();
    this.aspects = [];
  }
}
