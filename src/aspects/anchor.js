// Anchor: throw an anchor; once it settles, activate again to shrink, teleport to it
// with a knockback shockwave, and regrow. Walking over a settled anchor picks it up.
import { Graphics, Sprite } from 'pixi.js';
import { Aspect } from './aspect.js';
import { Entity } from '../game/entity.js';
import { Body } from '../engine/physics.js';
import { clamp01, lerp, isZero, norm } from '../engine/math.js';
import { PLAYER } from '../data/config.js';
import { tex } from '../render/assets.js';
import { TeleportResolver } from '../level/teleport.js';

export class AnchorAspect extends Aspect {
  constructor(player, data) {
    super(player, data);
    this.resolver = new TeleportResolver(player.world, player.body);
    this.anchor = player.world.add(new AnchorObject(player.world, data));
    this.state = 'stowed'; // stowed | flying | settled
    this.settleTimer = 0;
    this.teleport = null; // { phase: 'shrink' | 'grow', elapsed, from, to, duration }
  }

  tryActivate() {
    if (this.teleport) return false;
    if (this.state === 'stowed') return this.throwAnchor();
    if (this.state !== 'settled') return false;
    this.beginTeleport();
    return true;
  }

  step(dt) {
    if (this.teleport) { this.stepTeleport(dt); return; }
    if (this.state === 'flying') this.stepSettle(dt);
    else if (this.state === 'settled') this.tryPickUp();
  }

  throwAnchor() {
    const from = { ...this.player.body.pos };
    const cursor = this.player.cursorWorld();
    let dir = { x: cursor.x - from.x, y: cursor.y - from.y };
    if (isZero(dir)) dir = this.player.facing;
    if (isZero(dir)) dir = { x: 1, y: 0 };
    const n = norm(dir);
    const b = this.anchor.body;
    b.teleport(from.x, from.y);
    b.stop();
    b.addImpulse(n.x * this.data.throwImpulse, n.y * this.data.throwImpulse);
    this.anchor.setActive(true);
    this.state = 'flying';
    this.settleTimer = 0;
    return true;
  }

  // Settles once it has been slow for a grace period; snaps out of walls if needed.
  stepSettle(dt) {
    const b = this.anchor.body;
    if (b.vel.x * b.vel.x + b.vel.y * b.vel.y > this.data.settleSpeedThreshold ** 2) { this.settleTimer = 0; return; }
    this.settleTimer += dt;
    if (this.settleTimer < this.data.settleGraceTime) return;
    this.state = 'settled';
    b.stop();
    if (this.resolver.isWall(b.pos)) {
      const p = this.resolver.findNearestUnlimited(b.pos);
      if (p) b.teleport(p.x, p.y);
    }
  }

  tryPickUp() {
    const pp = this.player.body.pos, ap = this.anchor.body.pos;
    const r = this.data.retrievalRadius + this.data.anchorRadius;
    if ((pp.x - ap.x) ** 2 + (pp.y - ap.y) ** 2 <= r * r) this.stow();
  }

  beginTeleport() {
    this.player.teleporting = true;
    this.player.body.stop();
    this.teleport = { phase: 'shrink', elapsed: 0, from: 1, to: this.data.teleportDotScale, duration: this.data.teleportWindUpTime };
  }

  stepTeleport(dt) {
    const t = this.teleport;
    t.elapsed += dt;
    const k = t.duration > 0 ? clamp01(t.elapsed / t.duration) : 1;
    this.setScale(lerp(t.from, t.to, k));
    if (k < 1) return;

    if (t.phase === 'shrink') {
      const target = { ...this.anchor.body.pos };
      const dest = this.resolver.findNearestUnlimited(target);
      if (dest) {
        this.player.body.teleport(dest.x, dest.y);
        this.player.body.stop();
      }
      this.world.add(new WindPulse(this.world, target, this.data));
      this.stow();
      this.teleport = { phase: 'grow', elapsed: 0, from: this.player.sizeScale, to: 1, duration: this.data.teleportRecoverTime };
    } else {
      this.endTeleport();
    }
  }

  endTeleport() {
    this.setScale(1);
    this.player.teleporting = false;
    this.teleport = null;
  }

  setScale(s) {
    this.player.sizeScale = s;
    this.player.body.radius = PLAYER.radius * s;
  }

  stow() {
    this.anchor.body.stop();
    this.anchor.setActive(false);
    this.state = 'stowed';
    this.settleTimer = 0;
  }

  dispose() {
    if (this.teleport) this.endTeleport();
    this.anchor.destroy();
  }
}

class AnchorObject extends Entity {
  constructor(world, data) {
    super(world);
    this.body = world.physics.add(new Body({ radius: data.anchorRadius, mass: data.anchorMass, damping: data.anchorDamping, solid: false }));
    this.body.enabled = false;
    this.sprite = new Sprite(tex.anchor_object);
    this.sprite.anchor.set(0.5);
    this.sprite.width = this.sprite.height = data.anchorSize;
    this.sprite.tint = data.anchorTint;
    this.sprite.visible = false;
    world.layers.pickups.addChild(this.sprite);
  }

  setActive(on) {
    this.body.enabled = on;
    this.sprite.visible = on;
  }

  render(alpha) {
    if (!this.sprite.visible) return;
    const p = this.body.lerpPos(alpha);
    this.sprite.position.set(p.x, p.y);
  }

  dispose() {
    this.world.physics.remove(this.body);
    this.sprite.destroy();
  }
}

// Expanding ring that knocks back each enemy it sweeps over, once.
class WindPulse extends Entity {
  constructor(world, origin, data) {
    super(world);
    this.origin = origin;
    this.data = data;
    this.elapsed = 0;
    this.radius = 0;
    this.knocked = new Set();
    this.gfx = new Graphics();
    world.layers.fx.addChild(this.gfx);
  }

  get progress() { return this.data.windDuration > 0 ? clamp01(this.elapsed / this.data.windDuration) : 1; }

  step(dt) {
    this.elapsed += dt;
    this.radius = this.data.windRadius * this.progress;
    const inner = Math.max(0, this.radius - this.data.windRingWidth);
    for (const e of this.world.enemies) {
      if (e.dead || this.knocked.has(e)) continue;
      const d2 = (e.body.pos.x - this.origin.x) ** 2 + (e.body.pos.y - this.origin.y) ** 2;
      if (d2 > (this.radius + e.body.radius) ** 2 || d2 < inner * inner) continue;
      this.knocked.add(e);
      e.applyKnockback(this.data.windForce, this.origin);
    }
    if (this.progress >= 1) this.destroy();
  }

  render() {
    const g = this.gfx, t = this.progress, { x, y } = this.origin;
    g.clear();
    if (this.radius <= 0.01) return;
    g.circle(x, y, this.radius).stroke({ width: this.data.windRingWidth, color: 0xffffff, alpha: 0.35 * (1 - t) });
    g.circle(x, y, this.radius).stroke({ width: 0.05, color: 0xffffff, alpha: 0.8 * (1 - t) });
  }

  dispose() { this.gfx.destroy(); }
}
