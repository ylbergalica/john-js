// Adrenaline orbs and chaser cores (magnetised toward the player) and the floor exit.
import { Sprite } from 'pixi.js';
import { Entity } from './entity.js';
import { Body } from '../engine/physics.js';
import { PICKUPS } from '../data/config.js';
import { tex } from '../render/assets.js';
import { ORB_PAD } from '../render/sprites.js';
import { rectContainsCircle } from '../render/camera.js';

class MagnetPickup extends Entity {
  constructor(world, x, y, cfg, sprite) {
    super(world);
    this.cfg = cfg;
    this.body = world.physics.add(new Body({ x, y, radius: cfg.radius, solid: false }));
    this.attracted = false;
    this.sprite = sprite;
    sprite.anchor.set(0.5);
    sprite.position.set(x, y);
    world.layers.pickups.addChild(sprite);
  }

  step() {
    const p = this.world.livePlayer;
    if (!p) return;
    const dx = p.body.pos.x - this.body.pos.x, dy = p.body.pos.y - this.body.pos.y;
    const d = Math.hypot(dx, dy);
    const { magneticRange, magneticSpeed } = this.cfg;
    if (d <= magneticRange) {
      this.attracted = true;
      const speed = magneticSpeed * (1 - d / magneticRange) ** 2;
      this.body.vel.x = d > 0 ? (dx / d) * speed : 0;
      this.body.vel.y = d > 0 ? (dy / d) * speed : 0;
    } else if (this.attracted) {
      this.attracted = false;
      this.body.stop();
    }
  }

  afterPhysics() {
    const p = this.world.livePlayer;
    if (!p) return;
    const r = this.body.radius + p.body.radius;
    if ((p.body.pos.x - this.body.pos.x) ** 2 + (p.body.pos.y - this.body.pos.y) ** 2 > r * r) return;
    this.collect();
    this.destroy();
  }

  render(alpha, _dt, view) {
    const p = this.body.lerpPos(alpha);
    this.sprite.visible = rectContainsCircle(view, p.x, p.y, 1);
    this.sprite.position.set(p.x, p.y);
  }

  dispose() {
    this.world.physics.remove(this.body);
    this.sprite.destroy();
  }
}

export class AdrenalineOrb extends MagnetPickup {
  constructor(world, x, y) {
    const c = PICKUPS.adrenalineOrb;
    const sprite = new Sprite(tex.orb);
    sprite.width = sprite.height = c.size * ORB_PAD;
    sprite.tint = c.color;
    super(world, x, y, c, sprite);
  }
  collect() { this.world.adrenaline.add(PICKUPS.adrenalineOrb.adrenalineValue); }
}

export class ChaserCore extends MagnetPickup {
  constructor(world, x, y) {
    const c = PICKUPS.chaserCore;
    const sprite = new Sprite(tex.core);
    sprite.width = c.width; sprite.height = c.height;
    super(world, x, y, c, sprite);
  }
  collect() { this.world.cores.collected++; }
}

// Advances to the next floor while the player stands on it with every core collected.
export class Exit extends Entity {
  constructor(world, x, y) {
    super(world);
    const c = PICKUPS.exit;
    this.pos = { x, y };
    this.radius = c.radius;
    this.sprite = new Sprite(tex.hexPointed);
    this.sprite.anchor.set(0.5);
    this.sprite.width = c.width; this.sprite.height = c.height;
    this.sprite.tint = c.color;
    this.sprite.position.set(x, y);
    world.layers.exit.addChild(this.sprite);
  }

  afterPhysics() {
    const p = this.world.livePlayer;
    if (!p || !this.world.hasRequiredCores) return;
    const r = this.radius + p.body.radius;
    if ((p.body.pos.x - this.pos.x) ** 2 + (p.body.pos.y - this.pos.y) ** 2 <= r * r) this.world.requestNextFloor();
  }

  dispose() { this.sprite.destroy(); }
}
