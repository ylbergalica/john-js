// Builds the equipped aspects for a player, routes slot keys 1–3 (buffered) and
// forwards combat events to them.
import { PLAYER } from '../data/config.js';
import { InputBuffer } from '../player/inputBuffer.js';
import { profile } from '../meta/profile.js';
import { createAspect } from './index.js';

export class AspectController {
  constructor(player) {
    this.player = player;
    this.aspects = profile.equippedAspects().map((data) => createAspect(player, data));
    this.buffers = this.aspects.map(() => new InputBuffer(PLAYER.inputBufferTime));
    const events = player.world.events;
    this.unsubscribe = [
      events.enemyDamaged.on((enemy, damage, cause) => this.others(cause, (a) => a.onEnemyDamaged(enemy, damage, cause))),
      events.enemyKilled.on((enemy, cause) => this.others(cause, (a) => a.onEnemyKilled(enemy, cause))),
      events.parried.on(() => this.aspects.forEach((a) => a.onParry())),
    ];
  }

  // Every aspect except the one that caused the event: aspects never trigger themselves.
  others(cause, fn) { for (const a of this.aspects) if (a.data.id !== cause) fn(a); }

  step(dt) {
    const { input, time } = this.player.world;
    this.aspects.forEach((aspect, i) => {
      if (!aspect.data.activatable) return;
      if (input.wasPressed(`slot${i + 1}`)) this.buffers[i].press(time);
      if (!this.player.teleporting) this.buffers[i].consume(time, () => this.activate(aspect));
    });
    for (const a of this.aspects) a.step(dt);
  }

  activate(aspect) {
    const ok = aspect.tryActivate();
    if (ok) this.player.world.session.aspectUsed(aspect.data.id);
    return ok;
  }

  afterPhysics() { for (const a of this.aspects) a.afterPhysics(); }
  render(alpha, dt) { for (const a of this.aspects) a.render(alpha, dt); }

  beforeAttack() { for (const a of this.aspects) a.beforeAttack(); }
  onHitEnemy(enemy, hitPoint) { for (const a of this.aspects) a.onHitEnemy(enemy, hitPoint); }
  refreshCooldowns() { for (const a of this.aspects) a.refreshCooldown(); }

  dispose() {
    for (const off of this.unsubscribe) off();
    for (const a of this.aspects) a.dispose();
    this.aspects = [];
  }
}
