// Adrenaline orbs and chaser cores (magnetised toward the player) and the floor exit.
import { Container, Sprite } from 'pixi.js';
import { Entity } from './entity.js';
import { Body } from '../engine/physics.js';
import { clamp01, lerp, lerpColor, randRange, TAU } from '../engine/math.js';
import { EXIT_FX, EXIT_WARP, PICKUPS } from '../data/config.js';
import { tex } from '../render/assets.js';
import { HEX_FRAME_INSET, ORB_PAD } from '../render/sprites.js';
import { rectContainsCircle } from '../render/camera.js';
import { Plume } from '../render/fx.js';

const easeOut = (t) => 1 - (1 - t) ** 3;

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
  // The blip rises in pitch as the meter fills.
  collect() {
    const a = this.world.adrenaline;
    a.add(PICKUPS.adrenalineOrb.adrenalineValue);
    if (!a.isExalted) this.world.sound('orb', null, { pitch: 1 + a.current / a.max });
  }
}

export class ChaserCore extends MagnetPickup {
  constructor(world, x, y) {
    const c = PICKUPS.chaserCore;
    const sprite = new Sprite(tex.core);
    sprite.width = c.width; sprite.height = c.height;
    super(world, x, y, c, sprite);
  }
  collect() {
    this.world.cores.collected++;
    this.world.sound(this.world.hasRequiredCores ? 'exitOpen' : 'core');
  }
}

// Advances to the next floor while the player stands on it with every core collected.
// Sealed it's a dull grey hex; once every core is in it flares open and stands bright and
// solid amid turning frames, rays, ripples and rising motes (EXIT_FX).
export class Exit extends Entity {
  constructor(world, x, y) {
    super(world);
    const c = PICKUPS.exit;
    this.pos = { x, y };
    this.radius = c.radius;
    this.root = new Container();
    this.root.position.set(x, y);
    world.layers.exit.addChild(this.root);
    this.sprite = new Sprite(tex.hexPointed);
    this.sprite.anchor.set(0.5);
    this.sprite.width = c.width; this.sprite.height = c.height;
    this.sprite.tint = c.color;
    this.root.addChild(this.sprite);
    this.open = null; // the open look's parts, from the moment it opens
    this.surge = 0; // 0…1 as it draws the player in (World.updateWarp)
  }

  afterPhysics() {
    const p = this.world.livePlayer;
    if (!p || !this.world.hasRequiredCores) return;
    const r = this.radius + p.body.radius;
    if ((p.body.pos.x - this.pos.x) ** 2 + (p.body.pos.y - this.pos.y) ** 2 <= r * r) this.world.enterExit();
  }

  // Builds the open look behind the crystal and flares it open.
  startOpening() {
    const X = EXIT_FX, w = this.world, { x, y } = this.pos;
    this.radius = X.radius;
    const glow = (texture, anchorX = 0.5) => {
      const s = new Sprite(texture);
      s.anchor.set(anchorX, 0.5);
      s.blendMode = 'add';
      s.tint = X.color;
      s.alpha = 0;
      return s;
    };
    const halo = glow(tex.mist);
    const rays = Array.from({ length: X.rays.count }, (_, i) => {
      const s = glow(tex.spark, 0.14); // the streak starts 0.14 in, so this roots it at the centre
      s.rotation = (i / X.rays.count) * TAU;
      s.width = randRange(...X.rays.length);
      s.height = X.rays.width;
      s.phase = Math.random() * TAU;
      return s;
    });
    const frames = X.frames.map(() => glow(tex.hexFrame));
    const ripples = [];
    const back = new Container();
    back.addChild(halo, ...rays, ...frames);
    this.root.addChildAt(back, 0);
    const portal = new Sprite(tex.exitPortal);
    portal.anchor.set(0.5);
    portal.alpha = 0;
    const star = glow(tex.glint);
    star.tint = 0xffffff;
    this.root.addChild(portal, star);
    const motes = new Plume(w.layers.exit, tex.glint, { drag: 1.2, lift: X.motes.lift });
    this.open = { t: 0, back, halo, rays, frames, ripples, portal, star, motes, nextRipple: X.openTime * 0.5, nextMote: 0 };

    const F = X.flare;
    w.flareAt(this.pos, F, X.color);
    if (rectContainsCircle(w.camera.viewRect(0), x, y, 1)) w.camera.shake(F.shake.duration, F.shake.strength, F.shake.frequency);
  }

  render(_alpha, dt, view) {
    if (!this.open && this.world.hasRequiredCores) this.startOpening();
    const o = this.open;
    if (!o) return;
    o.motes.update(dt);
    const visible = rectContainsCircle(view, this.pos.x, this.pos.y, 6);
    this.root.visible = visible;
    if (!visible || dt <= 0) return;
    const X = EXIT_FX, c = PICKUPS.exit, { x, y } = this.pos, surge = this.surge;
    // Drawing the player in, it spins up: everything below runs faster.
    const t = (o.t += dt * (1 + (EXIT_WARP.spinUp - 1) * surge)), k = easeOut(clamp01(t / X.openTime));
    this.root.scale.set(1 + EXIT_WARP.surge * surge);

    // The grey crystal brightens into the lit one and grows, then breathes.
    const grow = lerp(1, X.grow, k) * (1 + X.breathe * Math.sin(t * X.breatheSpeed * TAU) * k);
    this.sprite.tint = lerpColor(c.color, 0xffffff, k);
    this.sprite.visible = k < 1;
    o.portal.alpha = k;
    for (const s of [this.sprite, o.portal]) { s.width = c.width * grow; s.height = c.height * grow; }

    const H = X.halo, pulse = 0.5 + 0.5 * Math.sin(t * H.pulse * TAU);
    o.halo.alpha = k * lerp(H.alpha[0], H.alpha[1], Math.max(pulse, surge));
    o.halo.width = o.halo.height = H.size * (0.9 + 0.1 * pulse);
    o.star.alpha = k * X.star.alpha * (0.75 + 0.25 * Math.sin(t * X.star.pulse * TAU));
    o.star.width = o.star.height = X.star.size * grow;
    o.star.rotation = t * X.star.spin;
    const R = X.rays;
    for (const r of o.rays) {
      r.rotation += R.spin * dt;
      r.alpha = k * R.alpha * (0.6 + 0.4 * Math.sin(t * R.flicker + r.phase));
    }
    X.frames.forEach((f, i) => {
      const s = o.frames[i], size = (f.size * lerp(0.6, 1, k)) / HEX_FRAME_INSET;
      s.alpha = k * f.alpha;
      s.rotation = t * f.spin;
      s.width = size; s.height = size * (tex.hexFrame.height / tex.hexFrame.width);
    });

    // Hex ripples sent out on a beat.
    const P = X.ripples;
    if (t >= o.nextRipple) {
      o.nextRipple += P.every;
      const s = new Sprite(tex.hexFrame);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.tint = X.color;
      s.born = t;
      o.back.addChild(s);
      o.ripples.push(s);
    }
    for (let i = o.ripples.length - 1; i >= 0; i--) {
      const s = o.ripples[i], u = (t - s.born) / P.time;
      if (u >= 1) { s.destroy(); o.ripples.splice(i, 1); continue; }
      const size = lerp(P.from, P.to, easeOut(u)) / HEX_FRAME_INSET;
      s.width = size; s.height = size * (tex.hexFrame.height / tex.hexFrame.width);
      s.alpha = P.alpha * (1 - u) ** 1.5;
    }

    // Motes of light drifting up off it.
    const M = X.motes;
    while (o.nextMote <= t) {
      o.nextMote += 1 / M.rate;
      const a = Math.random() * TAU, d = Math.random() * M.spread, v = randRange(...M.speed);
      o.motes.spawn({
        x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.7, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5,
        size: randRange(...M.size), life: randRange(...M.life), color: 0xffffff, fade: X.color, sway: 1.5,
      });
    }
  }

  dispose() {
    this.open?.motes.destroy();
    this.root.destroy({ children: true });
  }
}
