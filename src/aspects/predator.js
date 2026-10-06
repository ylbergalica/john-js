// Predator: an attack aimed at an enemy first blinks the player into melee range.
import { Aspect } from './aspect.js';
import { dot, norm } from '../engine/math.js';
import { PLAYER } from '../data/config.js';

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
    this.world.sound('blink', null, { pitch: 1.4, volume: 0.6 });
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
