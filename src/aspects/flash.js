// Flash: blink toward the cursor, landing in a star of light that strikes whatever it
// touches. Kills and parries shave time off the cooldown.
import { Aspect } from './aspect.js';
import { clamp01, clampLength, fromAngle } from '../engine/math.js';
import { TeleportResolver } from '../level/teleport.js';
import { FX } from '../data/config.js';
import { anims, tex } from '../render/assets.js';
import { hurtByCircle, hurtBySegment } from '../game/hurtbox.js';

const DEG = Math.PI / 180;
const GLINT_REACH = 0.42; // how far the glint's points reach from its centre, in units of its width

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
    this.star(dest);
    this.world.sound('flash');
    this.remaining = this.data.baseCooldown;
    return true;
  }

  // Light folds in where the player left, a streak of it joins the two spots, and it
  // bursts out where they land. Borrows the death effects' flares and glints.
  blinkFx(from, to) {
    const F = this.data.fx, fx = this.world.deathFx, { color, hot } = F;
    const D = F.depart;
    fx.flare(tex.mist, from.x, from.y, 0, {
      time: D.flash.time, w0: D.flash.size, h0: D.flash.size, w1: D.flash.size * D.flash.shrink, h1: D.flash.size * D.flash.shrink,
      alpha: D.flash.alpha, color0: hot, color1: color,
    });
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
    this.world.effects.burst(to.x, to.y, 0, { ...A.sparks, color });
    fx.scatter(fx.stars, A.glints, to.x, to.y, 0.3, hot, { fade: color });
  }

  // The star where they land: two four-point flares crossed, like the icon, tilted at random
  // (a quarter turn covers every look a four-point star has) and turning slowly either way.
  // Everything its points or middle touch as it flashes out is struck, once.
  star(at) {
    const A = this.data.fx.arrive, { color, hot } = this.data.fx, fx = this.world.deathFx;
    const tilt = Math.random() * Math.PI / 2, spin = A.star.spin * (Math.random() < 0.5 ? -1 : 1);
    const stars = [
      { angle: tilt + A.cross.deg * DEG, size: A.star.size * A.cross.scale, alpha: A.cross.alpha },
      { angle: tilt, size: A.star.size, alpha: 1 },
    ];
    for (const s of stars) {
      fx.flare(tex.glint, at.x, at.y, s.angle, {
        time: A.star.time, w0: s.size, h0: s.size, w1: s.size * 0.2, h1: s.size * 0.2, fade: 1.5, alpha: s.alpha,
        color0: hot, color1: color, spin,
      });
    }
    const d = this.data, w = this.world, mult = w.adrenaline.damageMultiplier;
    const arms = stars.flatMap((s) => [0, 1, 2, 3].map((i) => ({ dir: fromAngle(s.angle + (i * Math.PI) / 2), len: s.size * GLINT_REACH })));
    const touches = (t) => hurtByCircle(t, at.x, at.y, d.core)
      || arms.some(({ dir, len }) => hurtBySegment(t, at.x, at.y, at.x + dir.x * len, at.y + dir.y * len, d.armWidth));
    for (const t of [...w.enemies, ...w.props]) {
      if (t.dead || t.dying || !touches(t)) continue;
      const hitPoint = t.closestPoint(at), angle = Math.atan2(t.body.pos.y - at.y, t.body.pos.x - at.x);
      t.takeDamage(d.damage * mult, hitPoint, at, d.id);
      if (t.isProp) continue;
      if (!t.dead) t.applyKnockback(d.enemyKnockbackForce, at);
      w.effects.playOnce(anims.hit_impact, hitPoint.x, hitPoint.y, angle, FX.hitImpactSize, A.hit.impactTint);
      w.effects.burst(hitPoint.x, hitPoint.y, angle, A.hit.sparks);
    }
  }

  onEnemyKilled() { this.reduce(); }
  onParry() { this.reduce(); }
  refreshCooldown() { this.remaining = 0; }
  reduce() { this.remaining = Math.max(0, this.remaining - this.data.cooldownReductionPerTrigger); }
}
