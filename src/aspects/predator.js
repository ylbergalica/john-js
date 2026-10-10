// Predator: an attack aimed at an enemy first blinks the player into melee range.
import { Aspect } from './aspect.js';
import { dot, norm, randRange } from '../engine/math.js';
import { PLAYER } from '../data/config.js';
import { tex } from '../render/assets.js';

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
    this.world.session.aspectUsed(this.data.id);
    this.world.sound('blink', null, { pitch: 1.4, volume: 0.6 });
  }

  // Where the player left, a few glints and a little mist blown back the way they came; where
  // they land, a faint puff and a star. Borrows the death effects' flares, glints and mist.
  blinkFx(from, to) {
    const F = this.data.fx, fx = this.world.deathFx, { color, hot } = F;
    const D = F.depart, M = D.mist;
    fx.scatter(fx.stars, D.glints, from.x, from.y, 0.2, hot, { fade: color });
    const back = Math.atan2(from.y - to.y, from.x - to.x), r = PLAYER.radius * 0.4;
    const mx = from.x + Math.cos(back) * r, my = from.y + Math.sin(back) * r; // just behind where the body was
    for (let i = 0; i < M.count; i++) {
      const a = back + (randRange(-M.spreadDeg, M.spreadDeg) * Math.PI) / 180, speed = randRange(...M.speed);
      fx.mist.spawn({
        x: mx, y: my, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        size: randRange(...M.size), life: randRange(...M.life), alpha: M.alpha, grow: M.grow, color: hot, fade: M.fade,
      });
    }

    const A = F.arrive;
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
