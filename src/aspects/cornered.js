// Feral (code name Cornered Cat): every bit of damage the player deals grows with the health
// they've lost, up to `multiplier` at `threshold` of their health and below. At that height
// they burn with a dark red light, swelling with a heartbeat, motes of it drifting off them;
// driven there, it flares up in a flash, a ring and a spray of sparks with a hiss.
import { Sprite } from 'pixi.js';
import { Aspect } from './aspect.js';
import { clamp01, lerp, randRange, TAU } from '../engine/math.js';
import { tex } from '../render/assets.js';
import { RING_RADIUS } from '../render/sprites.js';
import { Plume } from '../render/fx.js';

const pick = ([min, max]) => randRange(min, max);
const easeOut = (t) => 1 - (1 - t) ** 3;

export class CorneredAspect extends Aspect {
  constructor(player, data) {
    super(player, data);
    const F = data.fx;
    this.raging = false; // at the height of it
    this.level = 0; // how far the look is shown, easing in and out
    this.enteredAt = -Infinity;
    const { player: front, playerBack, fx } = player.world.layers;
    const light = (texture, tint) => {
      const s = new Sprite({ texture, anchor: 0.5 });
      s.blendMode = 'add';
      s.tint = tint;
      s.visible = false;
      return s;
    };
    // The halo and core under the tail, the rim just behind the body.
    this.halo = light(tex.mist, F.color);
    this.core = light(tex.mist, F.hot);
    this.halo.zIndex = this.core.zIndex = -1;
    playerBack.addChild(this.halo, this.core);
    this.rim = light(tex.ring, F.hot);
    front.addChildAt(this.rim, 0);
    this.lights = [this.halo, this.core, this.rim];
    this.motes = new Plume(fx, tex.glint, { drag: 4 });
    this.moteDebt = 0;
  }

  // 0 at full health, 1 at the threshold and below.
  get fury() { return clamp01((1 - this.player.healthFraction) / (1 - this.data.threshold)); }
  get damageDealtMultiplier() { return lerp(1, this.data.multiplier, this.fury); }
  // The HUD fills its icon as health is lost, full at the threshold.
  get cooldownFraction() { return 1 - this.fury; }
  get available() { return this.raging; }

  step(dt) {
    const p = this.player, raging = !p.death && this.fury >= 1;
    if (raging) this.tally(dt);
    if (raging === this.raging) return;
    this.raging = raging;
    if (!raging) return;
    this.enteredAt = this.now;
    // Arriving on a floor already this low, it's just there as the player appears.
    if (p.hidden) return;
    this.used();
    this.world.sound('feral', p.body.pos);
    this.enterFx();
  }

  enterFx() {
    const F = this.data.fx, E = F.enter, fx = this.world.deathFx, { x, y } = this.player.body.pos;
    fx.flare(tex.mist, x, y, 0, {
      time: E.flash.time, w0: E.flash.size, h0: E.flash.size, w1: E.flash.size * E.flash.grow, h1: E.flash.size * E.flash.grow,
      alpha: E.flash.alpha, color0: F.hot, color1: F.color,
    });
    const d0 = E.ring.from / RING_RADIUS, d1 = E.ring.to / RING_RADIUS; // sprite width for that band radius
    fx.flare(tex.ring, x, y, 0, { time: E.ring.time, w0: d0, h0: d0, w1: d1, h1: d1, alpha: E.ring.alpha, color0: F.hot, color1: F.color });
    this.world.effects.burst(x, y, 0, { ...E.sparks, color: F.color });
    this.world.camera.shakeAtLeast(E.shake);
  }

  // Two beats, the second softer, every `beat.every` seconds: 0 at rest, 1 on the first.
  heartbeat(t) {
    const H = this.data.fx.beat, k = t % H.every;
    return Math.exp(-k * H.decay) + (k >= H.second ? 0.6 * Math.exp(-(k - H.second) * H.decay) : 0);
  }

  render(_alpha, dt) {
    const p = this.player, F = this.data.fx, L = F.light, now = this.now;
    this.level = this.raging ? 1 : Math.max(0, this.level - dt / F.fadeOut);
    const shown = this.level > 0 && !p.hidden && !p.shrouded && !p.death;
    for (const s of this.lights) s.visible = shown;
    if (shown) {
      const { x, y } = p.view.body.position, size = p.sizeScale * p.bodyScale;
      const beat = this.heartbeat(now - this.enteredAt), since = (now - this.enteredAt) / F.enter.time;
      const flare = since < 1 ? lerp(F.enter.flare, 1, easeOut(since)) : 1;
      const flicker = 1 + L.flicker.amount * (Math.sin(now * L.flicker.rate) * 0.6 + Math.sin(now * L.flicker.rate * 2.3 + 1) * 0.4);
      const scale = size * flare * (1 + beat * F.beat.swell), bright = easeOut(this.level) * p.bodyAlpha * flicker * (0.75 + 0.25 * beat);
      for (const s of this.lights) s.position.set(x, y);
      this.halo.width = this.halo.height = L.halo.size * scale;
      this.halo.alpha = L.halo.alpha * bright;
      this.core.width = this.core.height = L.core.size * scale;
      this.core.alpha = L.core.alpha * bright;
      this.rim.width = this.rim.height = (L.rim.radius * scale) / RING_RADIUS;
      this.rim.alpha = L.rim.alpha * bright;

      const M = F.motes;
      for (this.moteDebt += M.rate * this.level * dt; this.moteDebt >= 1; this.moteDebt--) {
        const a = Math.random() * TAU, d = L.rim.radius * size + Math.random() * M.spread, v = pick(M.speed);
        this.motes.spawn({
          x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          size: pick(M.size), life: pick(M.life), alpha: M.alpha * p.bodyAlpha, color: F.hot, fade: F.deep,
        });
      }
    } else this.moteDebt = 0;
    this.motes.update(dt);
  }

  dispose() {
    for (const s of this.lights) s.destroy();
    this.motes.destroy();
  }
}
