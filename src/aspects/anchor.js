// Anchor: throw an anchor; once it settles, activate again to shrink, teleport to it
// with a knockback shockwave, and regrow. Walking over a settled anchor picks it up.
import { Container, Sprite } from 'pixi.js';
import { Aspect } from './aspect.js';
import { Entity } from '../game/entity.js';
import { Body } from '../engine/physics.js';
import { clamp01, lerp, isZero, norm, randRange, TAU } from '../engine/math.js';
import { PLAYER } from '../data/config.js';
import { tex } from '../render/assets.js';
import { RING_RADIUS } from '../render/sprites.js';
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

  get shrinking() { return this.teleport?.phase === 'shrink'; }

  tryActivate() {
    if (this.shrinking) return false;
    if (this.state === 'stowed') return this.throwAnchor();
    if (this.state !== 'settled') return false;
    this.beginTeleport();
    return true;
  }

  step(dt) {
    if (this.teleport) this.stepTeleport(dt);
    if (this.shrinking) return;
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
    this.world.sound('anchorThrow');
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
    this.world.sound('anchorLand', b.pos);
  }

  tryPickUp() {
    const pp = this.player.body.pos, ap = this.anchor.body.pos;
    const r = this.data.retrievalRadius + this.data.anchorRadius;
    if ((pp.x - ap.x) ** 2 + (pp.y - ap.y) ** 2 > r * r) return;
    this.stow();
    this.world.sound('anchorPickup');
  }

  // The player can't be hit from the moment they start shrinking until they land.
  beginTeleport() {
    this.player.teleporting = true;
    this.player.intangible = true;
    this.player.body.stop();
    this.world.sound('warp');
    this.departFx(this.player.body.pos);
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
      const dest = this.resolver.findNearestUnlimited(target, PLAYER.radius);
      if (dest) {
        this.player.body.teleport(dest.x, dest.y);
        this.player.body.stop();
      }
      this.arriveFx(this.player.body.pos);
      this.world.add(new WindPulse(this.world, target, this.data));
      this.world.sound('shockwave');
      this.stow();
      // Back in control the moment they land; the regrow is only for show.
      this.player.teleporting = false;
      this.player.intangible = false;
      this.teleport = { phase: 'grow', elapsed: 0, from: this.player.sizeScale, to: 1, duration: this.data.teleportRecoverTime };
    } else {
      this.endTeleport();
    }
  }

  // Blue light pinches in on the player as they shrink away, and blooms where they land.
  // Borrows the death effects' flares and glints.
  departFx({ x, y }) {
    const D = this.data.fx.depart, fx = this.world.deathFx, { color, hot } = this.data.fx;
    fx.flare(tex.mist, x, y, 0, {
      time: this.data.teleportWindUpTime, w0: D.flash.size, h0: D.flash.size, w1: D.flash.size * D.flash.shrink, h1: D.flash.size * D.flash.shrink,
      alpha: D.flash.alpha, color0: hot, color1: color,
    });
    fx.scatter(fx.stars, D.glints, x, y, 0.2, hot, { fade: color });
  }

  arriveFx(to) {
    const F = this.data.fx, fx = this.world.deathFx, { color, hot } = F;
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

  endTeleport() {
    this.setScale(1);
    this.player.teleporting = false;
    this.player.intangible = false;
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
    this.size = data.anchorSize;
    this.sprite.width = this.sprite.height = this.size;
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
    // Slow shimmer: the crystal breathes, always standing upright.
    this.sprite.width = this.sprite.height = this.size * (1 + 0.05 * Math.sin(this.world.time * 3));
  }

  dispose() {
    this.world.physics.remove(this.body);
    this.sprite.destroy();
  }
}

// Expanding ring that knocks back each enemy it sweeps over, once. Drawn as a thick ring
// of blue mist: two hazy layers turning opposite ways under a soft edge, shedding puffs.
class WindPulse extends Entity {
  constructor(world, origin, data) {
    super(world);
    this.origin = origin;
    this.data = data;
    this.look = data.fx.ring;
    this.elapsed = 0;
    this.radius = 0;
    this.puffDebt = 0;
    this.knocked = new Set();
    this.view = new Container();
    this.view.position.set(origin.x, origin.y);
    this.view.visible = false;
    const layer = (texture, tint) => this.view.addChild(new Sprite({ texture, anchor: 0.5, blendMode: 'add', tint, rotation: Math.random() * TAU }));
    this.haze = [layer(tex.mist_ring, this.look.color), layer(tex.mist_ring, this.look.color)];
    this.edge = layer(tex.ring, this.look.edge);
    world.layers.fx.addChild(this.view);
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
    this.shedPuffs(dt);
    if (this.progress >= 1) this.destroy();
  }

  // Mist left lingering behind the wave, drifting gently outward.
  shedPuffs(dt) {
    const P = this.look.puffs, fx = this.world.deathFx;
    this.puffDebt += P.rate * dt;
    for (; this.puffDebt >= 1; this.puffDebt--) {
      const a = Math.random() * TAU, c = Math.cos(a), s = Math.sin(a), speed = randRange(0.3, 1);
      fx.mist.spawn({
        x: this.origin.x + c * this.radius, y: this.origin.y + s * this.radius, vx: c * speed, vy: s * speed,
        size: randRange(...P.size), life: randRange(...P.life), alpha: P.alpha * (1 - this.progress), grow: 1.6,
        color: this.look.color, fade: 0x000000,
      });
    }
  }

  render(alpha, dt) {
    const L = this.look, t = this.progress;
    const size = this.radius / RING_RADIUS, fade = Math.min(1, t * 8) * (1 - t);
    this.view.visible = this.radius > 0.01;
    this.haze.forEach((s, i) => {
      s.width = s.height = size * (i ? 1.04 : 0.97);
      s.alpha = L.alpha * fade;
      s.rotation += (i ? -L.spin : L.spin) * dt;
    });
    this.edge.width = this.edge.height = size;
    this.edge.alpha = L.edgeAlpha * fade;
  }

  dispose() { this.view.destroy({ children: true }); }
}
