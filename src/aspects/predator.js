// Predator: an attack aimed at an enemy first blinks the player into melee range.
import { Aspect } from './aspect.js';
import { dot, norm } from '../engine/math.js';
import { PLAYER } from '../data/config.js';
import { tex } from '../render/assets.js';
import { RING_RADIUS } from '../render/sprites.js';

export class PredatorAspect extends Aspect {
  beforeAttack() {
    const player = this.player;
    const facing = player.facing;
    if (facing.x * facing.x + facing.y * facing.y <= 0.0001) return;
    const from = { ...player.body.pos };
    const target = this.findTarget(from, facing);
    if (!target) return;
    const f = norm(facing);
    const range = PLAYER.attack.attackRange;
    const dest = { x: target.x - f.x * range, y: target.y - f.y * range };
    const distance = Math.hypot(dest.x - from.x, dest.y - from.y);
    if (distance < this.data.minimumBlinkDistance || distance > this.data.targetAcquireDistance) return;
    if (this.world.physics.circleHitsWall(dest.x, dest.y, player.body.radius * 0.95)) return;
    player.body.teleport(dest.x, dest.y);
    player.body.stop();
    this.blinkFx(from, dest);
    this.world.sound('blink', null, { pitch: 1.4, volume: 0.6 });
  }

  // A light-blue afterimage of the player puffs away where they left, and a ring snaps shut on
  // the spot they land. Borrows the death effects' flares and glints.
  blinkFx(from, to) {
    const F = this.data.fx, fx = this.world.deathFx, { color, hot } = F;
    const D = F.depart;
    fx.flare(tex.mist, from.x, from.y, 0, {
      time: D.flash.time, w0: D.flash.size, h0: D.flash.size, w1: D.flash.size * D.flash.shrink, h1: D.flash.size * D.flash.shrink,
      alpha: D.flash.alpha, color0: hot, color1: color,
    });
    const g = D.ghost.size * PLAYER.radius * 2;
    fx.flare(tex.dash_ghost, from.x, from.y, 0, {
      time: D.ghost.time, w0: g, h0: g, w1: g * D.ghost.grow, h1: g * D.ghost.grow, alpha: D.ghost.alpha, color0: hot, color1: color,
    });
    fx.scatter(fx.stars, D.glints, from.x, from.y, 0.2, hot, { fade: color });

    const A = F.arrive;
    const r0 = A.ring.from / RING_RADIUS, r1 = A.ring.to / RING_RADIUS; // sprite width for that band radius
    fx.flare(tex.ring, to.x, to.y, 0, { time: A.ring.time, w0: r0, h0: r0, w1: r1, h1: r1, alpha: A.ring.alpha, color0: color, color1: hot });
    fx.flare(tex.mist, to.x, to.y, 0, {
      time: A.flash.time, w0: A.flash.size, h0: A.flash.size, w1: A.flash.size * A.flash.grow, h1: A.flash.size * A.flash.grow,
      alpha: A.flash.alpha, color0: hot, color1: color,
    });
    fx.flare(tex.glint, to.x, to.y, Math.random() * Math.PI / 2, {
      time: A.star.time, w0: A.star.size, h0: A.star.size, w1: A.star.size * 0.2, h1: A.star.size * 0.2, fade: 1.5, color0: hot, color1: color,
    });
    fx.scatter(fx.stars, A.glints, to.x, to.y, 0.2, hot, { fade: color });
  }

  // Closest point on the enemy the player is aiming at best (aim weighted over distance).
  findTarget(from, facing) {
    let best = null, bestScore = -Infinity;
    for (const e of this.world.enemies) {
      if (e.dead) continue;
      const b = e.body;
      if (Math.hypot(b.pos.x - from.x, b.pos.y - from.y) > this.data.targetAcquireDistance + b.radius) continue;
      const cp = e.closestPoint(from);
      const tx = cp.x - from.x, ty = cp.y - from.y;
      const d = Math.hypot(tx, ty);
      if (d <= 0.01) continue;
      const aim = dot(facing, { x: tx / d, y: ty / d });
      if (aim < this.data.aimDotThreshold) continue;
      const score = aim * 100 - d;
      if (score > bestScore) { bestScore = score; best = cp; }
    }
    return best;
  }
}
