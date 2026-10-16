// Momentum: setting off on a dash charges the player's next swing to land on anything (an enemy
// or a prop), which deals `multiplier` times the damage to everything it strikes. While charged the player sheds
// embers; a charged hit lands in a flash, a ring, a bigger impact, a spray of sparks and a shake.
import { Aspect } from './aspect.js';
import { randRange } from '../engine/math.js';
import { FX } from '../data/config.js';
import { anims, tex } from '../render/assets.js';
import { Plume } from '../render/fx.js';

const pick = ([min, max]) => randRange(min, max);

export class MomentumAspect extends Aspect {
  constructor(player, data) {
    super(player, data);
    this.charged = false;
    this.swing = null; // the charged swing (its attackEndsAt) once it has landed: the rest of it strikes charged too
    this.motes = new Plume(player.world.layers.fx, tex.glint, { drag: 3, lift: 0.6 });
    this.moteDebt = 0;
  }

  get available() { return this.charged; }
  get striking() { return this.player.attacking && this.player.attackEndsAt === this.swing; }
  get damageMultiplier() { return this.charged || this.striking ? this.data.multiplier : 1; }

  onDash() { this.charged = true; }

  onHitProp(_prop, hitPoint) { this.onHitEnemy(null, hitPoint); }

  onHitEnemy(_enemy, hitPoint) {
    if (this.charged) {
      this.charged = false;
      this.swing = this.player.attackEndsAt;
      this.used();
      this.world.sound('momentum', hitPoint);
    } else if (!this.striking) return;
    this.impactFx(hitPoint);
  }

  impactFx({ x, y }) {
    const F = this.data.fx, I = F.hit, fx = this.world.deathFx, f = this.player.facing;
    const angle = Math.atan2(f.y, f.x);
    fx.flare(tex.mist, x, y, 0, {
      time: I.flash.time, w0: I.flash.size, h0: I.flash.size, w1: I.flash.size * I.flash.grow, h1: I.flash.size * I.flash.grow,
      alpha: I.flash.alpha, color0: F.hot, color1: F.color,
    });
    fx.flare(tex.ring, x, y, 0, { time: I.ring.time, w0: I.ring.from, h0: I.ring.from, w1: I.ring.to, h1: I.ring.to, alpha: I.ring.alpha, color0: F.hot, color1: F.color });
    this.world.effects.playOnce(anims.hit_impact, x, y, angle, FX.hitImpactSize * I.impact, F.hot);
    this.world.effects.burst(x, y, angle, { ...I.sparks, color: F.color });
    this.world.camera.shakeAtLeast(I.shake);
  }

  render(_alpha, dt) {
    const M = this.data.fx.motes, F = this.data.fx;
    if (this.charged && !this.player.hidden && !this.player.death) {
      const p = this.player.body.pos;
      for (this.moteDebt += M.rate * dt; this.moteDebt >= 1; this.moteDebt--) {
        const a = Math.random() * Math.PI * 2, d = pick(M.spread), v = pick(M.drift);
        this.motes.spawn({
          x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          size: pick(M.size), life: pick(M.life), alpha: M.alpha, color: F.hot, fade: F.color,
        });
      }
    } else this.moteDebt = 0;
    this.motes.update(dt);
  }

  dispose() { this.motes.destroy(); }
}
