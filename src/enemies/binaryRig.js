// One of the Binary's stars, worked out every frame (tuning in BINARY): its body turning
// slowly on its own, its own way, over a soft glow of its colour that pulses gently. Its
// colour is its hue, the colour of its hits. Cosmetic; the light binding it to its twin is
// the Tether's (tether.js).
import { Sprite } from 'pixi.js';
import { BINARY as B } from '../data/config.js';
import { TAU } from '../engine/math.js';
import { tex } from '../render/assets.js';

export class BinaryRig {
  constructor(enemy) {
    this.enemy = enemy;
    this.hue = B.colors[enemy.visual === enemy.type.visual ? 0 : 1]; // the twin's look, its own
    this.glow = new Sprite(tex.mist);
    this.glow.anchor.set(0.5);
    this.glow.blendMode = 'add';
    this.glow.tint = this.hue;
    enemy.view.addChildAt(this.glow, 0);
    this.spin = (Math.random() < 0.5 ? -1 : 1) * B.turn;
    this.seed = Math.random() * TAU;
  }

  // After EnemyAttackFx has placed and posed the enemy's view for render time `now`.
  render(now) {
    const e = this.enemy, G = B.glow, turn = this.seed + now * this.spin;
    for (const s of [e.voidSprite, e.stars.container, e.outline, e.attackFx.tint]) s.rotation = turn;
    const beat = 0.5 + 0.5 * Math.sin(now * G.pulse * TAU + this.seed);
    this.glow.width = this.glow.height = G.size * (0.92 + 0.08 * beat);
    this.glow.alpha = G.alpha * (0.75 + 0.25 * beat);
  }

  setFlash() {}

  onDeath() {}
}
