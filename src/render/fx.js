// Cosmetic effects: pooled cone bursts of glowing sparks in one ParticleContainer, one-shot
// sprite animations, the frame-animation helper used by sprites elsewhere, and Plume, a
// pool of soft drifting particles for smoke and fire.
import { Particle, ParticleContainer, Sprite } from 'pixi.js';
import { randRange, lerpColor } from '../engine/math.js';
import { FX } from '../data/config.js';
import { tex } from './assets.js';

const SPARK_DRAG = 4; // per second: sparks shoot out and slow down

// Steps a sprite through `frames` at `fps`; loops or holds the last frame.
export class FrameAnim {
  constructor(sprite, frames, { fps = FX.animFps, loop = false } = {}) {
    this.sprite = sprite;
    this.frames = frames;
    this.fps = fps;
    this.loop = loop;
    this.t = 0;
    this.speed = 1;
    this.playing = false;
  }

  play(speed = 1) {
    this.t = 0;
    this.speed = speed;
    this.playing = true;
    this.sprite.texture = this.frames[0];
  }

  stop() { this.playing = false; }

  update(dt) {
    if (!this.playing) return;
    this.t += dt * this.speed;
    let i = Math.floor(this.t * this.fps);
    if (this.loop) i %= this.frames.length;
    else if (i >= this.frames.length) { i = this.frames.length - 1; this.playing = false; }
    this.sprite.texture = this.frames[i];
  }
}

export class Effects {
  constructor(layer) {
    this.layer = layer;
    this.spark = tex.spark;
    this.sparkScale = 1 / this.spark.width; // scale for a spark one world unit long
    this.particles = new ParticleContainer({
      texture: this.spark,
      dynamicProperties: { position: true, vertex: true, color: true, rotation: false, uvs: false },
    });
    this.particles.blendMode = 'add';
    layer.addChild(this.particles);
    this.live = [];
    this.pool = [];
    this.anims = [];
  }

  // Cone burst of fading sparks, each pointing along its flight. opts: { count, speed, lifetime, size, coneDeg, color }
  burst(x, y, angle, opts) {
    const cone = (opts.coneDeg * Math.PI) / 180;
    for (let i = 0; i < opts.count; i++) {
      const a = angle + randRange(-cone, cone);
      const speed = opts.speed * randRange(0.5, 1);
      const p = this.pool.pop() ?? new Particle({ texture: this.spark, anchorX: 0.5, anchorY: 0.5 });
      p.x = x; p.y = y;
      p.rotation = a;
      p.tint = opts.color;
      p.alpha = 1;
      p.vx = Math.cos(a) * speed;
      p.vy = Math.sin(a) * speed;
      p.size = opts.size * randRange(0.6, 1) * this.sparkScale;
      p.scaleX = p.scaleY = p.size;
      p.age = 0;
      p.life = opts.lifetime * randRange(0.6, 1);
      this.particles.particleChildren.push(p);
      this.live.push(p);
    }
    this.particles.update();
  }

  // Plays `frames` once on a new sprite, then removes it.
  playOnce(frames, x, y, rotation, size, tint = 0xffffff) {
    const sprite = new Sprite(frames[0]);
    sprite.tint = tint;
    sprite.anchor.set(0.5);
    sprite.width = sprite.height = size;
    sprite.position.set(x, y);
    sprite.rotation = rotation;
    this.layer.addChild(sprite);
    const anim = new FrameAnim(sprite, frames);
    anim.play();
    this.anims.push(anim);
  }

  update(dt) {
    let removed = false;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.live[i] = this.live[this.live.length - 1];
        this.live.pop();
        this.pool.push(p);
        removed = true;
        continue;
      }
      const k = 1 - p.age / p.life;
      const drag = Math.exp(-SPARK_DRAG * dt);
      p.vx *= drag; p.vy *= drag;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.scaleX = p.scaleY = p.size * k;
      p.alpha = k;
    }
    if (removed) {
      this.particles.particleChildren.length = 0;
      this.particles.particleChildren.push(...this.live);
      this.particles.update();
    }

    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      a.update(dt);
      if (a.playing) continue;
      a.sprite.destroy();
      this.anims.splice(i, 1);
    }
  }

  clear() {
    this.pool.push(...this.live);
    this.live.length = 0;
    this.particles.particleChildren.length = 0;
    this.particles.update();
    for (const a of this.anims) a.sprite.destroy();
    this.anims.length = 0;
  }
}

// Soft drifting particles with their own texture: mist, flame tongues, embers. Each one
// slows with drag, rises with `lift`, sways, grows by `grow` over its life, shifts from
// `color` to `fade`, and fades in quickly then out. Positions are in the parent's space.
// spawn opts: { x, y, vx, vy, size, life, color, fade = color, grow = 1, alpha = 1, sway = 0, orient = false }
export class Plume {
  constructor(parent, texture, { blendMode = 'add', drag = 2, lift = 0, zIndex = 0 } = {}) {
    this.container = new ParticleContainer({
      texture,
      dynamicProperties: { position: true, vertex: true, color: true, rotation: true, uvs: false },
    });
    this.container.blendMode = blendMode;
    this.container.zIndex = zIndex;
    parent.addChild(this.container);
    this.texture = texture;
    this.unit = 1 / texture.width; // scale for a particle one world unit across
    this.drag = drag;
    this.lift = lift;
    this.live = [];
    this.pool = [];
  }

  get count() { return this.live.length; }

  spawn(o) {
    const p = this.pool.pop() ?? new Particle({ texture: this.texture, anchorX: 0.5, anchorY: 0.5 });
    p.x = o.x; p.y = o.y;
    p.vx = o.vx ?? 0; p.vy = o.vy ?? 0;
    p.size = o.size * this.unit;
    p.grow = o.grow ?? 1;
    p.color0 = o.color;
    p.color1 = o.fade ?? o.color;
    p.peak = o.alpha ?? 1;
    p.sway = o.sway ?? 0;
    p.seed = Math.random() * 100;
    p.orient = o.orient ?? false;
    p.rotation = p.orient ? Math.atan2(p.vy, p.vx) : Math.random() * Math.PI * 2;
    p.age = 0;
    p.life = o.life;
    p.alpha = 0;
    p.scaleX = p.scaleY = p.size;
    p.tint = p.color0;
    this.live.push(p);
    this.container.particleChildren.push(p);
  }

  update(dt) {
    if (this.live.length === 0) return;
    const drag = Math.exp(-this.drag * dt);
    let removed = false;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.live[i] = this.live[this.live.length - 1];
        this.live.pop();
        this.pool.push(p);
        removed = true;
        continue;
      }
      const t = p.age / p.life;
      p.vx = p.vx * drag + Math.sin(p.seed + p.age * 7) * p.sway * dt;
      p.vy = p.vy * drag - this.lift * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.orient) p.rotation = Math.atan2(p.vy, p.vx);
      p.scaleX = p.scaleY = p.size * (1 + (p.grow - 1) * t);
      p.alpha = p.peak * Math.min(1, t * 6) * (1 - t);
      p.tint = lerpColor(p.color0, p.color1, t);
    }
    if (removed) {
      this.container.particleChildren.length = 0;
      this.container.particleChildren.push(...this.live);
    }
    this.container.update();
  }

  clear() {
    this.pool.push(...this.live);
    this.live.length = 0;
    this.container.particleChildren.length = 0;
    this.container.update();
  }

  destroy() { this.container.destroy(); }
}
