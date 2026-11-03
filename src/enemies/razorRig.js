// The Razor's blades, worked out every frame (tuning in RAZOR): a blurred disc spinning round
// its body, the blades themselves barely showing through it. It winds up faster and brighter
// through a wind-up and burns hottest through a strike, shedding sparks; stunned, it slows
// until the blades can be told apart. It throws sparks where it grinds on a wall, and
// shatters when the Razor dies. Cosmetic; the hurting is RazorBlades' (BladeDiscAbility).
import { Sprite } from 'pixi.js';
import { RAZOR as R } from '../data/config.js';
import { lerp, TAU } from '../engine/math.js';
import { tex } from '../render/assets.js';
import { RAZOR_ART } from '../render/sprites.js';
import { wallContacts } from './hitbox.js';

function discSprite(texture, parent) {
  const s = new Sprite(texture);
  s.anchor.set(0.5);
  s.width = s.height = RAZOR_ART.size;
  parent.addChildAt(s, 0);
  return s;
}

export class RazorRig {
  constructor(enemy) {
    this.enemy = enemy;
    const v = enemy.view;
    this.blades = discSprite(tex.razor_blades, v);
    this.blur = discSprite(tex.razor_disc, v);
    this.glow = new Sprite(tex.mist);
    this.glow.anchor.set(0.5);
    this.glow.blendMode = 'add';
    this.glow.tint = R.glowColor;
    this.glow.width = this.glow.height = R.glowSize;
    v.addChildAt(this.glow, 0);
    this.look = { ...R.idle };
    this.angle = Math.random() * TAU;
    this.lastNow = null;
    this.sparks = 0; // sparks owed to its rim
    this.grinds = 0; // sparks owed to the wall it's grinding on
  }

  get world() { return this.enemy.world; }

  target() {
    const e = this.enemy;
    if (e.stunned) return R.still;
    let on = R.idle;
    for (const a of e.abilities.values()) {
      if (a.phase === 'active') return R.strike;
      if (a.phase === 'windup') on = R.windup;
    }
    return on;
  }

  // After EnemyAttackFx has placed and posed the enemy's view for render time `now`.
  render(now) {
    const step = this.lastNow === null ? 0 : Math.max(0, now - this.lastNow); // still while paused
    this.lastNow = now;
    const to = this.target(), L = this.look, k = 1 - Math.exp(-step / R.ease);
    for (const key of ['spin', 'blur', 'blades', 'glow']) L[key] = lerp(L[key], to[key], k);
    this.angle = (this.angle + L.spin * step) % TAU;
    this.blur.rotation = this.angle;
    this.blades.rotation = this.angle * 2.3; // strobing a little against the blur at speed
    this.blur.alpha = L.blur;
    this.blades.alpha = L.blades;
    this.glow.alpha = L.glow;
    this.glow.visible = L.glow > 0.005;
    if (!this.enemy.view.visible || step <= 0) return;
    this.shed(to, step);
    this.grind(step);
  }

  // Off its rim, flung round the way it turns, while it strikes.
  shed(to, step) {
    if (to !== R.strike) { this.sparks = 0; return; }
    const b = this.enemy.body;
    for (this.sparks += R.sparks.rate * step; this.sparks >= 1; this.sparks--) {
      const a = Math.random() * TAU;
      this.world.effects.burst(b.pos.x + Math.cos(a) * R.disc.outer, b.pos.y + Math.sin(a) * R.disc.outer, a + Math.PI / 2, R.sparks);
    }
  }

  // Where its disc reaches into a wall.
  grind(step) {
    const e = this.enemy, b = e.body;
    if (e.stunned) { this.grinds = 0; return; }
    const hits = wallContacts({ type: 'circle', x: b.pos.x, y: b.pos.y, r: R.disc.outer }, this.world.physics);
    if (hits.length === 0) { this.grinds = 0; return; }
    for (this.grinds += R.grind.rate * step; this.grinds >= 1; this.grinds--) {
      const h = hits[Math.floor(Math.random() * hits.length)];
      this.world.effects.burst(h.x, h.y, Math.atan2(b.pos.y - h.y, b.pos.x - h.x) + Math.PI / 2, R.grind);
    }
  }

  // Struck: its disc and blades flash white with the rest of it.
  setFlash(on) {
    this.blur.texture = on ? tex.razor_disc_white : tex.razor_disc;
    this.blades.texture = on ? tex.razor_blades_white : tex.razor_blades;
  }

  // Its blades fly apart.
  onDeath() {
    const b = this.enemy.body;
    this.world.effects.burst(b.pos.x, b.pos.y, Math.random() * TAU, R.shatter);
    this.world.sound('razorShatter', b.pos, { pitch: this.enemy.type.sfxPitch });
  }
}
