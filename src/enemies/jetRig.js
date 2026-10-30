// The Jet's engines, worked out every frame (tuning in JET): a flame out of each nozzle
// at its back, red round a hotter core and flickering, over a red glow. Small pilot flames
// as it cruises, they roar up long through a wind-up, shedding sparks, and blaze longer and
// white-hot while it flies (any of its attacks under way). Cosmetic.
import { Sprite } from 'pixi.js';
import { JET as J } from '../data/config.js';
import { clamp01, lerp, lerpColor, smoothStep01, TAU } from '../engine/math.js';
import { tex } from '../render/assets.js';
import { JET_ENGINES } from '../render/sprites.js';

const FLAME_BASE = 0.2; // where along the flame texture its tongue starts

function glowSprite(texture, anchorX = 0.5) {
  const s = new Sprite(texture);
  s.anchor.set(anchorX, 0.5);
  s.blendMode = 'add';
  return s;
}

export class JetRig {
  constructor(enemy) {
    this.enemy = enemy;
    const v = enemy.view, size = enemy.type.visual.size;
    this.engines = JET_ENGINES.map(([x, y]) => {
      const at = { x: (x - 0.5) * size, y: (y - 0.5) * size };
      const glow = glowSprite(tex.mist), flame = glowSprite(tex.flame, FLAME_BASE), core = glowSprite(tex.flame, FLAME_BASE);
      for (const s of [glow, flame, core]) s.position.set(at.x, at.y);
      flame.rotation = core.rotation = Math.PI; // out the back
      glow.tint = J.glow.color;
      for (const s of [core, flame, glow]) v.addChildAt(s, 0); // behind the hull
      return { at, glow, flame, core, seed: Math.random() * TAU };
    });
    this.throttle = 0; // 0 idling, 1 wound up, 2 flying; eased
    this.lastNow = null;
    this.sparks = 0; // sparks owed to its trail
  }

  get world() { return this.enemy.world; }

  // After EnemyAttackFx has placed and posed the enemy's view for render time `now`.
  render(now) {
    const e = this.enemy, F = J.flame, G = J.glow;
    const step = this.lastNow === null ? 0 : Math.max(0, now - this.lastNow); // still while paused
    this.lastNow = now;
    let target = 0;
    for (const a of e.abilities.values()) {
      if (a.phase === 'active') target = 2;
      else if (a.phase === 'windup') target = Math.max(target, 1);
      if (a.phase === 'windup' && a.data.type === 'jetDash') this.roll(a, now);
    }
    this.throttle += (target - this.throttle) * (1 - Math.exp(-step / J.ease));
    const k = this.throttle, hot = clamp01(k - 1);
    const at = ([idle, wound, flying]) => (k <= 1 ? lerp(idle, wound, k) : lerp(wound, flying, hot));
    const length = at(F.length), height = at(F.height), glowSize = at(G.size), glowAlpha = at(G.alpha);
    for (const g of this.engines) {
      const wob = 0.5 * Math.sin(now * F.flicker[0] * TAU + g.seed) + 0.5 * Math.sin(now * F.flicker[1] * TAU + 2 * g.seed);
      const len = length * (1 + F.jitter * wob), h = height;
      g.flame.width = len;
      g.flame.height = h;
      g.flame.alpha = F.alpha;
      g.flame.tint = lerpColor(F.color, F.hotColor, hot);
      g.core.width = len * F.core;
      g.core.height = h * 0.7;
      g.core.alpha = F.alpha;
      g.core.tint = lerpColor(F.coreColor, F.hotCore, hot);
      g.glow.width = g.glow.height = glowSize;
      g.glow.alpha = glowAlpha * (0.85 + 0.15 * wob);
    }

    if (target < 1 || !e.view.visible) { this.sparks = 0; return; }
    const back = e.view.rotation + Math.PI, rate = J.sparks.rate * (target < 2 ? J.sparks.windup : 1);
    for (this.sparks += rate * step; this.sparks >= 1; this.sparks--) {
      const p = e.attackFx.toWorld(this.engines[Math.floor(Math.random() * this.engines.length)].at);
      this.world.effects.burst(p.x, p.y, back, J.sparks);
    }
  }

  // A barrel roll, once, ending as the dash launches: its span (the view's y) turning over
  // through edge-on and back.
  roll(dash, now) {
    const R = J.roll, u = clamp01((now - (dash.phaseEndsAt - R.time)) / R.time);
    if (u <= 0) return;
    const span = Math.cos(TAU * smoothStep01(u)), v = this.enemy.view;
    v.scale.y *= Math.sign(span || 1) * Math.max(R.edge, Math.abs(span));
  }

  setFlash() {}

  // Shot down, its engines sputter out in a spray of sparks.
  onDeath() {
    const b = this.enemy.body, c = Math.cos(b.rotation), s = Math.sin(b.rotation);
    for (const { at } of this.engines) {
      const x = b.pos.x + c * at.x - s * at.y, y = b.pos.y + s * at.x + c * at.y;
      this.world.effects.burst(x, y, b.rotation + Math.PI, { ...J.sparks, count: 6, speed: 5, coneDeg: 60 });
    }
  }
}
