// Shards of broken props and wards: flung out spinning, they skid across the floor and
// settle, glancing off walls, then fade. Pooled in one ParticleContainer; purely cosmetic,
// driven by render time, so they freeze while paused.
import { Particle, ParticleContainer } from 'pixi.js';
import { randRange, TAU } from '../engine/math.js';
import { tex } from './assets.js';

const DRAG = 5; // per second: they skid to a stop
const BOUNCE = 0.45; // fraction of its speed a shard keeps glancing off a wall
const FADE = 0.3; // fraction of its life spent fading out, at the end

export class Debris {
  // isWall(cellX, cellY): whether a tile stops shards.
  constructor(layer, isWall) {
    this.isWall = isWall;
    this.texture = tex.shard;
    this.unit = 1 / this.texture.width; // scale for a shard one world unit long
    this.container = new ParticleContainer({
      texture: this.texture,
      dynamicProperties: { position: true, vertex: true, color: true, rotation: true, uvs: false },
    });
    layer.addChild(this.container);
    this.live = [];
    this.pool = [];
  }

  // `count` shards from (x, y), heading within `cone` radians either side of `angle`, each
  // starting up to `spread` along its way out (from all through a body, not just its centre).
  // opts: { count, speed: [min, max], size: [min, max] (length), spin (rad/s, at most),
  // life: [min, max], colors, spread = 0 }
  burst(x, y, angle, cone, { count, speed, size, spin, life, colors, spread = 0 }) {
    for (let i = 0; i < count; i++) {
      const a = angle + randRange(-cone, cone), v = randRange(...speed), len = randRange(...size);
      const p = this.pool.pop() ?? new Particle({ texture: this.texture, anchorX: 0.5, anchorY: 0.5 });
      const out = Math.random() * spread;
      p.x = x + Math.cos(a) * out; p.y = y + Math.sin(a) * out;
      p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v;
      p.rotation = Math.random() * TAU;
      p.spin = randRange(-spin, spin);
      p.sx = len * this.unit;
      p.sy = len * this.unit * randRange(0.45, 1); // stretched differently, so they don't look stamped
      p.scaleX = p.sx; p.scaleY = p.sy;
      p.tint = colors[Math.floor(Math.random() * colors.length)];
      p.alpha = 1;
      p.age = 0;
      p.life = randRange(...life);
      this.live.push(p);
      this.container.particleChildren.push(p);
    }
  }

  update(dt) {
    if (this.live.length === 0) return;
    const drag = Math.exp(-DRAG * dt);
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
      p.vx *= drag; p.vy *= drag; p.spin *= drag;
      // Glance off walls one axis at a time.
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
      if (this.isWall(Math.floor(nx), Math.floor(p.y))) p.vx *= -BOUNCE;
      else p.x = nx;
      if (this.isWall(Math.floor(p.x), Math.floor(ny))) p.vy *= -BOUNCE;
      else p.y = ny;
      p.rotation += p.spin * dt;
      const k = Math.min(1, (1 - p.age / p.life) / FADE);
      p.alpha = k;
      p.scaleX = p.sx * (0.6 + 0.4 * k);
      p.scaleY = p.sy * (0.6 + 0.4 * k);
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
