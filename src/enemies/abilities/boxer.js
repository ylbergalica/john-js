// The Boxer's abilities.
import { clamp, deltaAngle, randRange, randSign } from '../../engine/math.js';
import { EnemyHitbox } from '../hitbox.js';
import { followThrough } from '../attackView.js';
import { fistSweep, hookFist, punchFist } from '../boxerRig.js';
import { DEG } from './ability.js';
import { LungeAbility } from './melee.js';

// Body: a fist conjured at one side (at random) and swung round across the front as the
// enemy steps in (the Boxer's hook). The fist is the hitbox, growing as it goes: capsules
// along where it has swept since the last step, posed as it's drawn (boxerRig.js) and turned
// with the body's follow-through.
export class HookAbility extends LungeAbility {
  constructor(enemy, data) {
    super(enemy, data, { type: 'group', parts: [] }, null, {
      kind: 'body', parryKnockback: data.parryKnockback, strikeSound: data.strikeSound,
    });
    this.side = 1; // the side the fist comes from: 1 its right, -1 its left
    this.sweptTo = 0; // seconds into the strike its hitbox last reached
  }

  execute() {
    this.side = randSign();
    super.execute();
  }

  strike() {
    super.strike();
    this.sweptTo = 0;
    this.sweep();
  }

  step(dt) {
    super.step(dt);
    if (this.phase === 'active') this.sweep();
  }

  sweep() {
    const d = this.data, t1 = this.world.time - this.strikeAt;
    this.hitbox.shape.parts = fistSweep((t) => {
      const q = hookFist(this.side, Math.min(t, d.swingTime) / d.swingTime), turn = followThrough(this, t), c = Math.cos(turn), s = Math.sin(turn);
      return { x: c * q.x - s * q.y, y: s * q.x + c * q.y, size: q.size };
    }, this.sweptTo, t1, d.sweepSamples);
    this.sweptTo = t1;
  }
}

// Body: a big step in, then `punches` thrown `punchInterval` apart, from each hand in turn,
// each out at random across the front `coneDeg` (the Boxer's flurry). Each fist has a
// hitbox of its own, `hitboxScale` × the fist, growing with it as it shoots out
// (`punchTime`) and following it `linger` seconds into its way back. Punches overlap, so
// they take turns at `hitboxes` hitboxes: each is off a while between its punches, so a
// fist can hurt even where the last one did, and the one that hurt the player stops
// hurting (so can be parried again) soon after. Once the step is done it keeps turning to
// the player at up to `turnRate` and pressing in at `advanceSpeed`. Blows don't stop it;
// only a parry does, stunning it as for any charge. Only the step burns its body: the fists
// do the rest.
export class FlurryAbility extends LungeAbility {
  constructor(enemy, data) {
    super(enemy, data, { type: 'group', parts: [] }, null, {
      kind: 'body', parryKnockback: data.parryKnockback, strikeSound: data.strikeSound, armOnStrike: false,
    });
    this.punches = []; // this flurry's, laid out as it begins: [{ at (seconds after the strike), side, angle }]
    // Its hitboxes (the first is `hitbox`), each with the punch it is the fist of (or -1) and
    // how far into that punch it last reached.
    this.slots = [this.hitbox, ...Array.from({ length: data.hitboxes - 1 }, () => new EnemyHitbox(enemy, this, { type: 'group', parts: [] }))]
      .map((hitbox) => ({ hitbox, punch: -1, sweptTo: 0 }));
  }

  get armDelay() { return this.data.stepTime; }
  get burning() { return this.world.time - this.strikeAt < this.data.stepTime; }

  execute() {
    const d = this.data, first = randSign(), half = (d.coneDeg * DEG) / 2;
    this.punches = Array.from({ length: d.punches }, (_, i) => ({
      at: d.stepTime + i * d.punchInterval, side: i % 2 ? -first : first, angle: randRange(-half, half),
    }));
    super.execute();
  }

  step(dt) {
    super.step(dt);
    if (this.phase !== 'active') return;
    const d = this.data, t = this.world.time - this.strikeAt, reach = d.punchTime + d.linger;
    this.slots.forEach((slot, j) => {
      // The latest punch taking this hitbox's turn that has been thrown, if it can still hurt.
      let i = -1;
      for (let k = j; k < this.punches.length && this.punches[k].at <= t; k += this.slots.length) i = k;
      if (i >= 0 && t - this.punches[i].at >= reach) i = -1;
      if (i !== slot.punch) {
        slot.hitbox.setActive(false);
        slot.punch = i;
        slot.sweptTo = 0;
        if (i >= 0) {
          slot.hitbox.setActive(true);
          this.sound(d.punchSound);
        }
      }
      if (i >= 0) this.sweep(slot, this.punches[i], t - this.punches[i].at);
    });
    if (t >= d.stepTime) this.press(dt);
  }

  // A hitbox along its fist since it last reached, `hitboxScale` × as wide.
  sweep(slot, punch, since) {
    const d = this.data;
    slot.hitbox.shape.parts = fistSweep((t) => {
      const q = punchFist(punch, t, d.punchTime, d.returnTime);
      return { ...q, size: q.size * d.hitboxScale };
    }, slot.sweptTo, since, d.sweepSamples);
    slot.sweptTo = since;
  }

  afterPhysics() { for (const { hitbox } of this.slots) hitbox.afterPhysics(); }

  press(dt) {
    const p = this.player, d = this.data, ai = this.enemy.ai, b = this.enemy.body;
    if (!p) return;
    const to = this.dirToPlayer(), turn = d.turnRate * dt;
    b.rotation += clamp(deltaAngle(b.rotation, Math.atan2(to.y, to.x)), -turn, turn);
    const dir = ai.pathDirection(d.advanceStop);
    ai.steer(dir ? dir.x * d.advanceSpeed : 0, dir ? dir.y * d.advanceSpeed : 0);
  }

  endActive() {
    super.endActive();
    for (const slot of this.slots) {
      slot.hitbox.setActive(false);
      slot.punch = -1;
    }
  }

  dispose() {
    super.dispose();
    for (const { hitbox } of this.slots) hitbox.destroy();
  }

}
