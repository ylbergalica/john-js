// The Tyrant's barrels, worked out every frame (tuning in TYRANT): a crown of them across its
// front that ease to the pose each attack names, so how they lie says what's coming: bunched
// ahead for its tracers, splayed wide for its fan (shifting into the gaps between volleys),
// spun round each other for its stream, gathered into one for its shell, hanging loose while
// it's stunned. Each shot kicks its barrel back, long fire heats them, its eyes burn brighter
// through an attack, and they blow off when it dies. Cosmetic: its shots come from its muzzles
// (TyrantSnap and the rest).
import { Sprite } from 'pixi.js';
import { DEATH_FX, TYRANT as T } from '../data/config.js';
import { lerp, lerpColor, TAU } from '../engine/math.js';
import { tex } from '../render/assets.js';
import { TYRANT_ART as A } from '../render/sprites.js';

const DEG = Math.PI / 180;

export class TyrantRig {
  constructor(enemy) {
    this.enemy = enemy;
    const v = enemy.view;
    this.barrels = T.poses.idle.angles.map((deg, i) => {
      const s = new Sprite(tex.tyrant_barrel);
      s.anchor.set(A.root / A.w, 0.5);
      s.width = A.w;
      s.height = A.h;
      v.addChildAt(s, 0); // behind the hull, which hides their roots
      return { sprite: s, angle: deg, kick: 0, seed: i * 1.7 };
    });
    this.eyes = new Sprite(tex.mist);
    this.eyes.anchor.set(0.5);
    this.eyes.blendMode = 'add';
    this.eyes.tint = T.eyes.color;
    this.eyes.position.set(T.eyes.at, 0);
    this.eyes.width = this.eyes.height = T.eyes.size;
    v.addChild(this.eyes);
    this.spin = 0; // rad/s, eased
    this.side = 0;
    this.back = 0;
    this.turn = 0; // how far they've spun round
    this.heat = 0; // 0 → 1
    this.burn = T.eyes.idle;
    this.lastNow = null;
    this.lastStrike = -Infinity;
    this.nextKick = 0; // the barrel the next single shot kicks
  }

  get world() { return this.enemy.world; }

  // The attack under way, if any.
  attack() {
    for (const a of this.enemy.abilities.values()) {
      if (a.data.poses && (a.phase === 'windup' || a.phase === 'active')) return a;
    }
    return null;
  }

  pose(a) {
    if (this.enemy.stunned) return T.poses.slack;
    if (!a) return T.poses.idle;
    const { poses } = a.data;
    return T.poses[poses[Math.min(a.fired, poses.length - 1)]];
  }

  // After EnemyAttackFx has placed and posed the enemy's view for render time `now`.
  render(now) {
    const step = this.lastNow === null ? 0 : Math.max(0, now - this.lastNow); // still while paused
    this.lastNow = now;
    const a = this.attack(), to = this.pose(a), k = 1 - Math.exp(-step / T.ease), spinK = 1 - Math.exp(-step / T.spinEase);
    this.spin = lerp(this.spin, to.spin ?? 0, spinK);
    this.side = lerp(this.side, to.side ?? 0, k);
    this.back = lerp(this.back, to.back ?? 0, k);
    this.turn = (this.turn + this.spin * step) % TAU;
    const firing = a?.phase === 'active' && to.spin;
    this.heat += ((firing ? 1 : 0) - this.heat) * (1 - Math.exp(-step / (firing ? T.heatRise : T.heatFall)));
    this.burn = lerp(this.burn, a ? T.eyes.attack : T.eyes.idle, k);
    this.eyes.alpha = this.burn;
    this.takeKick(a, to);

    const tint = lerpColor(0xffffff, T.hotColor, this.heat), B = T.breathe, n = this.barrels.length;
    this.barrels.forEach((g, i) => {
      g.angle = lerp(g.angle, to.angles[i], k);
      g.kick *= Math.exp(-step / T.kickTime);
      const round = this.turn + (i * TAU) / n, rot = (g.angle + Math.sin(now * B.speed + g.seed) * B.deg) * DEG;
      const out = T.mount - this.back - g.kick * T.kick, across = Math.sin(round) * this.side;
      g.sprite.rotation = rot;
      g.sprite.position.set(Math.cos(rot) * out - Math.sin(rot) * across, Math.sin(rot) * out + Math.cos(rot) * across);
      g.sprite.alpha = this.side > 0.01 ? lerp(T.far, 1, 0.5 + 0.5 * Math.cos(round)) : 1;
      g.sprite.tint = tint;
    });
  }

  // A shot just gone: every barrel kicks for a volley, one at a time for single shots.
  takeKick(a, to) {
    if (!a || a.strikeAt === this.lastStrike) return;
    this.lastStrike = a.strikeAt;
    if (a.fired === 0) return;
    const shots = a.salvos[a.fired - 1]?.length ?? 0;
    if (shots > 1 || !to.spin) {
      for (const g of this.barrels) g.kick = 1;
      return;
    }
    this.barrels[this.nextKick].kick = 1;
    this.nextKick = (this.nextKick + 3) % this.barrels.length; // skipping round as they spin
  }

  // Struck: its barrels flash white with the rest of it.
  setFlash(on) {
    for (const g of this.barrels) g.sprite.texture = on ? tex.tyrant_barrel_white : tex.tyrant_barrel;
  }

  // Its barrels pop white, flung out where they lay, with a burst of sparks off each.
  onDeath() {
    const D = DEATH_FX.enemy.pop, e = this.enemy, v = e.view;
    for (const g of this.barrels) {
      const rot = g.sprite.rotation, at = e.attackFx.toWorld({ x: g.sprite.x, y: g.sprite.y }), angle = v.rotation + rot;
      this.world.deathFx.flare(tex.tyrant_barrel_white, at.x, at.y, angle, {
        time: D.time, w0: A.w, h0: A.h, w1: A.w * D.scale, h1: A.h * D.scale, color0: 0xffffff, color1: e.type.hitColor, fade: 1.5, anchorX: A.root / A.w,
      });
      const tip = e.attackFx.toWorld({ x: g.sprite.x + Math.cos(rot) * A.length, y: g.sprite.y + Math.sin(rot) * A.length });
      this.world.effects.burst(tip.x, tip.y, angle, T.sparks);
    }
    this.world.sound('tyrantWreck', e.body.pos, { pitch: e.type.sfxPitch });
  }
}
