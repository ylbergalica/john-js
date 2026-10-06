// Damped follow camera with Perlin shake. Maps world units to screen pixels so the
// view is always `2 * orthoSize` units tall.
import { perlinNoise, randInsideUnitCircle } from '../engine/math.js';
import { CAMERA } from '../data/config.js';

const LN_001 = Math.log(0.01); // follow reaches 99% of the way in `damping` seconds

export class Camera {
  constructor() {
    this.x = 0; this.y = 0;
    this.shakeX = 0; this.shakeY = 0;
    this.shakeState = null;
    this.viewW = 1; this.viewH = 1; this.ppu = 1;
  }

  resize(w, h) {
    this.viewW = w; this.viewH = h;
    this.ppu = h / (CAMERA.orthoSize * 2);
  }

  snapTo(p) { this.x = p.x; this.y = p.y; }

  shake(duration, strength, frequency) {
    const seed = randInsideUnitCircle();
    this.shakeState = { duration, strength, frequency: Math.max(1, frequency), elapsed: 0, sx: seed.x * 1000, sy: seed.y * 1000 };
  }

  update(dt, target) {
    if (dt <= 0) return;
    if (target) {
      const k = 1 - Math.exp((LN_001 * dt) / CAMERA.followDamping);
      this.x += (target.x - this.x) * k;
      this.y += (target.y - this.y) * k;
    }
    const s = this.shakeState;
    this.shakeX = this.shakeY = 0;
    if (s) {
      s.elapsed += dt;
      if (s.elapsed >= s.duration) {
        this.shakeState = null;
      } else {
        const amp = s.strength * (1 - s.elapsed / s.duration);
        const t = s.elapsed * s.frequency;
        this.shakeX = (perlinNoise(s.sx, t) * 2 - 1) * amp;
        this.shakeY = (perlinNoise(s.sy, t) * 2 - 1) * amp;
      }
    }
  }

  get viewX() { return this.x + this.shakeX; }
  get viewY() { return this.y + this.shakeY; }

  apply(container) {
    container.scale.set(this.ppu);
    container.position.set(this.viewW / 2 - this.viewX * this.ppu, this.viewH / 2 - this.viewY * this.ppu);
  }

  screenToWorld(sx, sy) {
    return { x: (sx - this.viewW / 2) / this.ppu + this.viewX, y: (sy - this.viewH / 2) / this.ppu + this.viewY };
  }

  // Visible world rect, grown by `margin` units.
  viewRect(margin = 0) {
    const hw = this.viewW / 2 / this.ppu + margin, hh = this.viewH / 2 / this.ppu + margin;
    return { x0: this.viewX - hw, y0: this.viewY - hh, x1: this.viewX + hw, y1: this.viewY + hh };
  }
}

export const rectContainsCircle = (r, x, y, radius) =>
  x + radius >= r.x0 && x - radius <= r.x1 && y + radius >= r.y0 && y - radius <= r.y1;
