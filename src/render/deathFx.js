// Enemy deaths, all set off at the killing blow (tuning and the look in DEATH_FX): the
// enemy's silhouette pops white and swells away, light flashes, shockwave rings race out,
// sparks spray, the stars of its void spill out and a puff of its colour lingers. Guardians
// add light rays, drifting embers and a screen-wide shockwave. Purely cosmetic, driven by
// render time, so it freezes while paused.
import { Container, Sprite } from 'pixi.js';
import { DEATH_FX } from '../data/config.js';
import { lerp, lerpColor, randRange, TAU } from '../engine/math.js';
import { tex } from './assets.js';
import { Plume } from './fx.js';
import { RING_RADIUS } from './sprites.js';

const easeOut = (t) => 1 - (1 - t) ** 3;
const pick = ([min, max]) => randRange(min, max);

export class DeathFx {
  constructor(world) {
    this.world = world;
    const { telegraphs, fx } = world.layers;
    this.mist = new Plume(telegraphs, tex.mist, { drag: 2.2, lift: 0.2 });
    this.flares = new Container();
    fx.addChild(this.flares);
    this.stars = new Plume(fx, tex.glint, { drag: 2.5 });
    this.embers = new Plume(fx, tex.spark, { drag: 1.6, lift: 1.4 });
    this.plumes = [this.mist, this.stars, this.embers];
    this.live = []; // flares: { sprite, age, delay, time, w0, h0, w1, h1, alpha, fade, color0, color1 }
  }

  // `dir`: the killing blow's direction (unit vector).
  play(enemy, dir) {
    const { type, body } = enemy, w = this.world;
    const D = type.isChaser ? DEATH_FX.guardian : DEATH_FX.enemy;
    const { x, y } = body.pos, r = body.radius, color = type.hitColor;
    const blowAngle = Math.atan2(dir.y, dir.x);

    // The silhouette pops white and swells away, cooling to the enemy's colour.
    const sil = enemy.silhouette;
    this.flare(sil.texture, x, y, body.rotation, {
      time: D.pop.time, w0: sil.width, h0: sil.height, w1: sil.width * D.pop.scale, h1: sil.height * D.pop.scale,
      color0: 0xffffff, color1: color, fade: 1.5,
    });
    const fl = D.flash, fs = fl.size * r;
    this.flare(tex.mist, x, y, 0, { time: fl.time, w0: fs, h0: fs, w1: fs * fl.grow, h1: fs * fl.grow, alpha: fl.alpha, color0: 0xffffff, color1: color });
    for (const ring of D.rings) {
      const d0 = (ring.from * r) / RING_RADIUS, d1 = (ring.to * r) / RING_RADIUS; // sprite width for that band radius
      const c = ring.color ?? color;
      this.flare(tex.ring, x, y, 0, { delay: ring.delay, time: ring.time, w0: d0, h0: d0, w1: d1, h1: d1, alpha: ring.alpha, color0: c, color1: color });
    }
    if (D.rays) {
      const R = D.rays, offset = Math.random() * TAU;
      for (let i = 0; i < R.count; i++) {
        const a = offset + ((i + randRange(-0.3, 0.3)) / R.count) * TAU;
        const len = pick(R.length) * r, wid = pick(R.width) * r;
        // The spark streak starts 0.14 of its texture in, so anchoring there roots the ray at the centre.
        this.flare(tex.spark, x, y, a, {
          time: pick(R.time), w0: len * 0.2, h0: wid, w1: len, h1: 0, color0: 0xffffff, color1: color, anchorX: 0.14,
        });
      }
    }

    for (const s of D.sparks) w.effects.burst(x, y, 0, { ...s, color: s.color ?? color });
    w.effects.burst(x + dir.x * r, y + dir.y * r, blowAngle, { ...D.blow, color: D.blow.color ?? color });
    this.scatter(this.stars, D.stars, x, y, r * 0.5, color, { fade: color, color: D.stars.color });
    this.scatter(this.mist, D.mist, x, y, r * 0.4, color, { alpha: D.mist.alpha, grow: D.mist.grow, fade: 0x000000 });
    if (D.embers) this.scatter(this.embers, D.embers, x, y, r * 0.5, color, { fade: lerpColor(color, 0x000000, 0.6), orient: true, sway: 3 });

    // A small kill's shake shouldn't cut short a stronger one still playing (a guardian's, say).
    const sh = D.shake, cur = w.camera.shakeState;
    if (!cur || cur.strength * (1 - cur.elapsed / cur.duration) < sh.strength) w.camera.shake(sh.duration, sh.strength, sh.frequency);
    if (D.ripple) {
      const k = D.ripple.glow;
      const tint = [((color >> 16) & 255) / 255 * k, ((color >> 8) & 255) / 255 * k, (color & 255) / 255 * k];
      w.ripple.play(body.pos, { ...D.ripple, tint });
    }
  }

  // `count` particles flung evenly all around from within `spread` of the centre.
  scatter(plume, cfg, x, y, spread, color, extra) {
    const offset = Math.random() * TAU;
    for (let i = 0; i < cfg.count; i++) {
      const a = offset + ((i + Math.random()) / cfg.count) * TAU, c = Math.cos(a), s = Math.sin(a);
      const speed = pick(cfg.speed), d = Math.random() * spread;
      plume.spawn({ color, ...extra, x: x + c * d, y: y + s * d, vx: c * speed, vy: s * speed, size: pick(cfg.size), life: pick(cfg.life) });
    }
  }

  // A one-shot sprite growing from (w0, h0) to (w1, h1) and fading over `time`, after `delay`.
  flare(texture, x, y, rotation, { delay = 0, time, w0, h0, w1, h1, alpha = 1, fade = 1, color0, color1 = color0, anchorX = 0.5 }) {
    const sprite = new Sprite(texture);
    sprite.anchor.set(anchorX, 0.5);
    sprite.blendMode = 'add';
    sprite.position.set(x, y);
    sprite.rotation = rotation;
    sprite.visible = false;
    this.flares.addChild(sprite);
    this.live.push({ sprite, age: 0, delay, time, w0, h0, w1, h1, alpha, fade, color0, color1 });
  }

  update(dt) {
    if (dt <= 0) return;
    for (const p of this.plumes) p.update(dt);
    for (let i = this.live.length - 1; i >= 0; i--) {
      const f = this.live[i], s = f.sprite;
      f.age += dt;
      const t = (f.age - f.delay) / f.time;
      if (t >= 1) {
        s.destroy();
        this.live[i] = this.live[this.live.length - 1];
        this.live.pop();
        continue;
      }
      s.visible = t >= 0;
      if (t < 0) continue;
      const e = easeOut(t);
      s.width = lerp(f.w0, f.w1, e);
      s.height = lerp(f.h0, f.h1, e);
      s.alpha = f.alpha * (1 - t) ** f.fade;
      s.tint = lerpColor(f.color0, f.color1, t);
    }
  }

  clear() {
    for (const p of this.plumes) p.clear();
    for (const f of this.live) f.sprite.destroy();
    this.live.length = 0;
  }
}
