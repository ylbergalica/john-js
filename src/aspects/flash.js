// Flash: blink toward the cursor. Kills and parries shave time off the cooldown.
import { Aspect } from './aspect.js';
import { clamp01, clampLength } from '../engine/math.js';
import { TeleportResolver } from '../level/teleport.js';

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
    this.remaining = this.data.baseCooldown;
    return true;
  }

  onEnemyKilled() { this.reduce(); }
  onParry() { this.reduce(); }
  refreshCooldown() { this.remaining = 0; }
  reduce() { this.remaining = Math.max(0, this.remaining - this.data.cooldownReductionPerTrigger); }
}
