// A thin trail of mist from where the player stood to the exit (EXIT_TRAIL), laid once
// after the floor's last guardian bursts and never re-routed. Lies on the floor under the
// exit; purely cosmetic, driven by render time. The guardian trail (GUARDIAN_TRAIL,
// guardianTrail.js) is the same mist in red, laid with its own config and faded away
// (fadeAway) when it's no longer wanted.
import { Particle, ParticleContainer } from 'pixi.js';
import { Entity } from './entity.js';
import { EXIT_TRAIL } from '../data/config.js';
import { clamp01, randRange, randSign, TAU } from '../engine/math.js';
import { trailPath } from '../level/trailPath.js';
import { tex } from '../render/assets.js';

export class ExitTrail extends Entity {
  // → the trail, or null when there's no way from `from` to `to`.
  static lay(world, from, to, cfg = EXIT_TRAIL) {
    const points = trailPath(world.level.grid, from, to, cfg);
    return points?.length ? world.add(new ExitTrail(world, points, cfg)) : null;
  }

  constructor(world, points, T) {
    super(world);
    this.cfg = T;
    const texture = tex.mist;
    this.unit = 1 / texture.width;
    this.container = new ParticleContainer({
      texture,
      dynamicProperties: { position: true, vertex: true, color: true, rotation: true, uvs: false },
    });
    this.container.blendMode = 'add';
    world.layers.exit.addChildAt(this.container, 0);
    this.puffs = points.map((p, i) => {
      const prev = points[Math.max(0, i - 1)], next = points[Math.min(points.length - 1, i + 1)];
      const len = Math.hypot(next.x - prev.x, next.y - prev.y) || 1, j = randRange(-T.jitter, T.jitter);
      const puff = new Particle({ texture, anchorX: 0.5, anchorY: 0.5, rotation: Math.random() * TAU, tint: T.color, alpha: 0 });
      Object.assign(puff, {
        x0: p.x - ((next.y - prev.y) / len) * j, y0: p.y + ((next.x - prev.x) / len) * j,
        s: p.s - points[0].s, size: randRange(...T.size) * this.unit, peak: randRange(...T.alpha),
        speed: randRange(...T.driftSpeed) * TAU, phase: Math.random() * TAU, spin: randSign() * T.spin * randRange(0.5, 1),
      });
      puff.x = puff.x0; puff.y = puff.y0;
      puff.scaleX = puff.scaleY = 0;
      return puff;
    });
    this.container.particleChildren.push(...this.puffs);
    this.container.update();
    this.t = 0;
    this.fade = null; // { t, time } while fading away
  }

  // Fades the whole trail out over `time` seconds, then removes it.
  fadeAway(time = this.cfg.fadeOut) {
    this.fade ??= { t: 0, time: Math.max(0.01, time) };
  }

  render(_alpha, dt) {
    if (dt <= 0) return;
    this.t += dt;
    let fade = 1;
    if (this.fade) {
      this.fade.t += dt;
      fade = 1 - clamp01(this.fade.t / this.fade.time);
      if (fade <= 0) { this.destroy(); return; }
    }
    const T = this.cfg, t = this.t, F = T.flow;
    for (const m of this.puffs) {
      const age = t - m.s / T.reveal;
      if (age <= 0) continue;
      const a = t * m.speed + m.phase;
      const swell = Math.max(0, Math.cos(((m.s - t * F.speed) / F.wavelength) * TAU)) ** 4; // flowing toward the exit
      m.x = m.x0 + Math.cos(a) * T.drift;
      m.y = m.y0 + Math.sin(a * 0.8) * T.drift;
      m.rotation += m.spin * dt;
      m.alpha = clamp01(age / 0.6) * (m.peak + F.alpha * swell) * fade;
      m.scaleX = m.scaleY = m.size * (1 + T.breathe * Math.sin(a * 1.3) + F.grow * swell);
    }
  }

  dispose() { this.container.destroy(); }
}
