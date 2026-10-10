// Flash: blink toward the cursor. Kills and parries shave time off the cooldown.
import { Aspect } from './aspect.js';
import { clamp01, clampLength } from '../engine/math.js';
import { TeleportResolver } from '../level/teleport.js';
import { tex } from '../render/assets.js';
import { RING_RADIUS } from '../render/sprites.js';

export class FlashAspect extends Aspect {
  constructor(player, data) {
    super(player, data);
    this.remaining = 0;
    this.resolver = new TeleportResolver(player.world, player.body);
  }

  get cooldownFraction() { return this.data.baseCooldown > 0 ? clamp01(this.remaining / this.data.baseCooldown) : 0; }

  step(dt) { this.remaining = Math.max(0, this.remaining - dt); }

  tryActivate() {
    if (this.remaining > 0) return false;
    const body = this.player.body;
    const from = { ...body.pos };
    const cursor = this.player.cursorWorld();
    const off = clampLength({ x: cursor.x - from.x, y: cursor.y - from.y }, this.data.maxBlinkDistance);
    const dest = this.resolver.findNearest(from, { x: from.x + off.x, y: from.y + off.y }, this.data.maxBlinkDistance);
    if (!dest) return false;
    body.teleport(dest.x, dest.y);
    this.blinkFx(from, dest);
    this.world.sound('flash');
    this.remaining = this.data.baseCooldown;
    return true;
  }

  // Light folds in where the player left, a streak of it joins the two spots, and it
  // bursts out where they land. Borrows the death effects' flares and glints.
  blinkFx(from, to) {
    const F = this.data.fx, fx = this.world.deathFx, { color, hot } = F;
    const ring = (at, R) => {
      const d0 = R.from / RING_RADIUS, d1 = R.to / RING_RADIUS;
      fx.flare(tex.ring, at.x, at.y, 0, { time: R.time, w0: d0, h0: d0, w1: d1, h1: d1, alpha: R.alpha, color0: hot, color1: color });
    };

    const D = F.depart;
    fx.flare(tex.mist, from.x, from.y, 0, {
      time: D.flash.time, w0: D.flash.size, h0: D.flash.size, w1: D.flash.size * D.flash.shrink, h1: D.flash.size * D.flash.shrink,
      alpha: D.flash.alpha, color0: hot, color1: color,
    });
    ring(from, D.ring);
    fx.flare(tex.glint, from.x, from.y, 0, { time: D.star.time, w0: D.star.size, h0: D.star.size, w1: 0, h1: 0, color0: hot, color1: color });
    fx.scatter(fx.stars, D.glints, from.x, from.y, 0.3, hot, { fade: color });

    // The spark streak runs from 0.14 to 0.86 of its texture, so anchoring at 0.14 roots it at `from`.
    const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy), S = F.streak;
    if (len > 0.1) {
      fx.flare(tex.spark, from.x, from.y, Math.atan2(dy, dx), {
        time: S.time, w0: len / 0.72, h0: S.width, w1: len / 0.72, h1: 0, alpha: S.alpha, color0: hot, color1: color, anchorX: 0.14,
      });
    }

    const A = F.arrive;
    fx.flare(tex.mist, to.x, to.y, 0, {
      time: A.flash.time, w0: A.flash.size, h0: A.flash.size, w1: A.flash.size * A.flash.grow, h1: A.flash.size * A.flash.grow,
      alpha: A.flash.alpha, color0: hot, color1: color,
    });
    ring(to, A.ring);
    fx.flare(tex.glint, to.x, to.y, 0, { time: A.star.time, w0: A.star.size, h0: A.star.size, w1: A.star.size * 0.2, h1: A.star.size * 0.2, fade: 1.5, color0: hot, color1: color });
    this.world.effects.burst(to.x, to.y, 0, { ...A.sparks, color });
    fx.scatter(fx.stars, A.glints, to.x, to.y, 0.3, hot, { fade: color });
  }

  onEnemyKilled() { this.reduce(); }
  onParry() { this.reduce(); }
  refreshCooldown() { this.remaining = 0; }
  reduce() { this.remaining = Math.max(0, this.remaining - this.data.cooldownReductionPerTrigger); }
}
