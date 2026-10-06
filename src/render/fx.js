// Cosmetic effects: pooled cone bursts of glowing sparks in one ParticleContainer, one-shot
// sprite animations, and the frame-animation helper used by sprites elsewhere.
import { Particle, ParticleContainer, Sprite } from 'pixi.js';
import { randRange } from '../engine/math.js';
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
  playOnce(frames, x, y, rotation, size) {
    const sprite = new Sprite(frames[0]);
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
