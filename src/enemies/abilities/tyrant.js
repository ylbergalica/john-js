// The Tyrant's abilities.
import { clamp, clampLength, dist, dirTo, fromAngle, randRange } from '../../engine/math.js';
import { Shell } from '../projectile.js';
import { DEG } from './ability.js';
import { CannonsAbility } from './throw.js';

// Projectile: the Tyrant's guns, cannons firing a set list of `volleys` (see TyrantSnap in
// data/abilities.js). Only the next volley's shots show, and with `lead` it turns after where
// the player's going. `jitterDeg` scatters its shots, `stalk` has it walk after the player as
// it fires, `shards` makes each shot a shell. Its barrels (tyrantRig.js) read `poses` and `fired`.
export class TyrantGunsAbility extends CannonsAbility {
  execute() {
    super.execute();
    if (this.data.spoolSound) this.sound(this.data.spoolSound);
  }

  step(dt) {
    super.step(dt);
    const S = this.data.stalk;
    if (!S || this.phase !== 'active' || !this.player) return;
    const b = this.enemy.body, go = dist(b.pos, this.player.body.pos) > S.stop ? S.speed : 0, dir = fromAngle(b.rotation);
    b.vel.x += (dir.x * go - b.vel.x) * S.ease;
    b.vel.y += (dir.y * go - b.vel.y) * S.ease;
  }

  aimDir() {
    const d = this.data;
    if (!d.lead) return super.aimDir();
    const p = this.player.body, from = this.enemy.body.pos, t = (dist(from, p.pos) / d.projectileSpeed) * d.lead;
    const ahead = clampLength({ x: p.vel.x * t, y: p.vel.y * t }, d.maxLead);
    return dirTo(from, { x: p.pos.x + ahead.x, y: p.pos.y + ahead.y });
  }

  scatter() { return this.data.jitterDeg ? randRange(-this.data.jitterDeg, this.data.jitterDeg) * DEG : 0; }

  launch(x, y, rot) {
    const d = this.data, S = d.shards;
    if (!S) { super.launch(x, y, rot); return; }
    const damage = this.enemy.damage * d.damageMultiplier;
    this.world.add(new Shell(this.world, this, x, y, {
      dir: fromAngle(rot), speed: d.projectileSpeed, lifetime: clamp(dist(this.enemy.body.pos, this.player.body.pos) / d.projectileSpeed, ...d.fuse),
      damage, size: d.projectileSize, look: d.look, shards: { ...S, damage: damage * S.damageMultiplier },
    }));
  }

  loaded() { return new Set(this.salvos[this.fired] ?? []); }
}
