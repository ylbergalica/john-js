// Flight: a run through the air, the base of the Jet's and the Comet's.
import { AIState } from '../ai.js';
import { HitboxAbility } from './ability.js';

// Body: the Jet's flights, which never stop it to wind up. Through each wind-up it keeps
// circling the player at `strafeSpeed` (unless a blow has just knocked it about, or it's
// coasting on from a dash into another, `chained`), turning
// after them until its aim locks; then `aimLocked` turns it. In flight it gathers speed
// (`cruise`) and passes over the player, the other enemies and the props; over the recovery
// it skids to a halt (`skidEase`).
export class FlightAbility extends HitboxAbility {
  constructor(enemy, data) {
    super(enemy, data, { type: 'circle', r: data.hitboxRadius, arcDeg: data.hitboxArcDeg }, null, {
      kind: 'body', stopsOnStart: false, parryKnockback: data.parryKnockback, strikeSound: data.strikeSound,
    });
  }

  step(dt) {
    super.step(dt);
    const e = this.enemy, ai = e.ai, b = e.body;
    if (this.phase === 'windup' && this.player) {
      if (this.chained) this.skid(dt); // straight on from a dash, coasting
      else if (this.world.time >= ai.movementSuppressedUntil) ai.strafe(this.data.strafeSpeed);
      if (!this.tracking()) this.aimLocked(dt);
      else if (ai.state !== AIState.WindUp) ai.turnToward(this.dirToPlayer(), dt); // a chained wind-up: its AI no longer turns it
    } else if (this.phase === 'recovery') this.skid(dt);
  }

  skid(dt) {
    const b = this.enemy.body, k = Math.exp(-dt / this.data.skidEase);
    b.vel.x *= k;
    b.vel.y *= k;
  }

  aimLocked() {}

  // Setting off along `dir`: from however fast it already goes that way.
  takeOff(dir) {
    const w = this.world, b = this.enemy.body;
    this.launchSpeed = Math.max(0, b.vel.x * dir.x + b.vel.y * dir.y);
    b.ignores = new Set([...w.enemies, ...w.props, w.livePlayer, this.player].filter((t) => t?.body).map((t) => t.body));
  }

  // How fast it flies, gathering speed from its launch up to `speed` over `launchTime`.
  cruise() {
    const d = this.data, t = this.world.time - this.strikeAt;
    return Math.min(d.speed, this.launchSpeed + (d.speed * t) / d.launchTime);
  }

  endActive() {
    super.endActive();
    this.enemy.body.ignores = null;
  }

  dispose() {
    super.dispose();
    this.enemy.body.ignores = null;
  }
}
