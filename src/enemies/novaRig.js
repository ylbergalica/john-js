// The Nova's light, worked out every frame (tuning in NOVA): a corona in its colour behind
// it and a white bloom over it, both flaring on every flicker. It flickers faster the closer
// it is to whoever it hunts, faster still as it swells and once lit (FlareAbility), its
// colour drifting round every hue. It swells up as it winds up, a little more as it goes
// critical, and rushing or launched it sheds sparks of its colour. Its colour is what its
// hits spray (Enemy.hitColor). Cosmetic.
import { Sprite } from 'pixi.js';
import { NOVA as N } from '../data/config.js';
import { clamp01, dist, lerp, lerpColor, smoothStep01, TAU } from '../engine/math.js';
import { tex } from '../render/assets.js';

const progress = (a, now) => clamp01((now - a.phaseStartedAt) / Math.max(1e-3, a.phaseEndsAt - a.phaseStartedAt));

// The colour `u` turns round the hues (wrapping).
function hueAt(u) {
  const n = N.hues.length, x = (((u % 1) + 1) % 1) * n, i = Math.floor(x);
  return lerpColor(N.hues[i], N.hues[(i + 1) % n], x - i);
}

function glowSprite(texture) {
  const s = new Sprite(texture);
  s.anchor.set(0.5);
  s.blendMode = 'add';
  return s;
}

export class NovaRig {
  constructor(enemy) {
    this.enemy = enemy;
    const v = enemy.view;
    this.flare = [...enemy.abilities.values()].find((a) => a.ignite) ?? null;
    this.corona = glowSprite(tex.mist);
    v.addChildAt(this.corona, 0); // behind all of it
    this.bloom = glowSprite(tex[`${enemy.type.visual.void}_white`]);
    this.bloom.width = this.bloom.height = enemy.type.visual.size;
    v.addChildAt(this.bloom, v.getChildIndex(enemy.outline)); // over its light, under its rim
    this.turn = Math.random(); // the flicker's phase, in turns
    this.hueTurn = Math.random();
    this.hue = hueAt(this.hueTurn);
    this.lastNow = null;
    this.sparks = 0; // sparks owed to its trail
    this.flashing = false;
  }

  get world() { return this.enemy.world; }

  // After EnemyAttackFx has placed and posed the enemy's view for render time `now`.
  render(now) {
    const e = this.enemy, a = this.flare, view = e.view, r = e.body.radius, phase = a?.phase;
    const step = this.lastNow === null ? 0 : Math.max(0, now - this.lastNow); // still while paused
    this.lastNow = now;
    const lit = phase === 'active' || phase === 'launched' || phase === 'fuse';
    const q = e.player, near = q ? clamp01((N.far - dist(e.body.pos, q.body.pos)) / (N.far - N.near)) : 0;
    let rate = lerp(N.rate[0], N.rate[1], near * near), grow = 0;
    if (phase === 'windup') {
      const t = progress(a, now);
      rate = lerp(rate, N.swellRate, t);
      grow = N.swell * smoothStep01(t);
    } else if (phase === 'active') grow = N.swell + N.critical;
    else if (phase === 'fuse') grow = (N.swell + N.critical) * smoothStep01(progress(a, now));
    else if (phase === 'launched') grow = N.lit;
    if (lit) rate = N.litRate;
    this.turn += rate * step;
    this.hueTurn += N.hueSpeed * step;
    this.hue = hueAt(this.hueTurn);
    const flick = clamp01(0.5 + 1.5 * Math.sin(this.turn * TAU)); // mostly on or off, not a smooth pulse

    const k = 1 + grow + 0.04 * flick;
    view.scale.x *= k;
    view.scale.y *= k;
    const C = N.corona, c = this.corona;
    c.tint = this.hue;
    c.alpha = Math.min(1, lerp(C.alpha[0], C.alpha[1], flick) * (lit ? 1.4 : 1));
    c.width = c.height = C.size * r * 2 * (1 + 0.12 * flick);
    const b = this.bloom;
    b.visible = !this.flashing;
    b.tint = lerpColor(0xffffff, this.hue, 0.35);
    b.alpha = N.flash * flick * (lit ? 1.6 : lerp(0.6, 1, near));

    const trail = phase === 'launched' ? N.trail : phase === 'rush' ? N.rushTrail : null;
    if (!trail) { this.sparks = 0; return; }
    const v = e.body.vel, back = Math.atan2(-v.y, -v.x);
    for (this.sparks += trail.rate * step; this.sparks >= 1; this.sparks--) {
      this.world.effects.burst(view.position.x, view.position.y, back, { ...trail, color: this.hue });
    }
  }

  setFlash(on) { this.flashing = on; }

  // Struck down (not bursting), a little of every colour spills out of it.
  onDeath() {
    if (this.enemy.detonated) return;
    const { x, y } = this.enemy.body.pos;
    for (const color of N.hues) this.world.effects.burst(x, y, 0, { count: 3, speed: 7, lifetime: 0.4, size: 0.32, coneDeg: 180, color });
  }
}
