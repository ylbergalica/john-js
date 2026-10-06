// Twinkling stars scattered inside a sprite's silhouette (the enemies' "void" fill).
// Stars are placed by sampling the silhouette's alpha, so no mask is needed.
import { Container, Sprite, Texture } from 'pixi.js';
import { clamp01, lerp, seededRandom, TAU } from '../engine/math.js';
import { VOID_SPARKLES as VS } from '../data/config.js';
import { alphaMask } from './assets.js';

let seedCounter = 0;

// 0..1 twinkle level at `time` (the wall shader evaluates the same curve on the GPU).
function twinkle(time, speed, phase) {
  return 0.5 + 0.5 * Math.sin(time * speed + phase);
}

export class StarField {
  // maskName: texture whose alpha defines the shape; size: rendered size in world units.
  constructor(maskName, size, count) {
    this.container = new Container();
    const mask = alphaMask(maskName);
    const rand = seededRandom(7331 + ++seedCounter * 7919);
    this.stars = [];
    const lo = clamp01(Math.min(VS.minAlpha, VS.maxAlpha)), hi = clamp01(Math.max(VS.minAlpha, VS.maxAlpha));
    this.alphaRange = [lo, hi];
    for (let i = 0, tries = 0; i < count && tries < count * 50; tries++) {
      const u = rand(), v = rand();
      const mx = Math.min(mask.res - 1, Math.floor(u * mask.res)), my = Math.min(mask.res - 1, Math.floor(v * mask.res));
      if (mask.data[mx + my * mask.res] < 128) continue;
      const sprite = new Sprite(Texture.WHITE);
      sprite.anchor.set(0.5);
      sprite.tint = VS.color;
      sprite.position.set((u - 0.5) * size, (v - 0.5) * size);
      sprite.rotation = rand() * TAU;
      this.container.addChild(sprite);
      this.stars.push({
        sprite,
        size: lerp(VS.sizeRange.x, VS.sizeRange.y, rand()),
        phase: rand() * TAU,
        speed: lerp(VS.twinkleSpeedRange.x, VS.twinkleSpeedRange.y, rand()),
      });
      i++;
    }
  }

  update(time) {
    const [lo, hi] = this.alphaRange;
    const dip = clamp01(VS.twinkleScaleAmount);
    for (const s of this.stars) {
      const t = twinkle(time, s.speed, s.phase);
      s.sprite.alpha = lerp(lo, hi, t);
      s.sprite.scale.set(s.size * lerp(1 - dip, 1, t));
    }
  }
}
