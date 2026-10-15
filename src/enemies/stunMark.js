// The stunned mark: little stars circling over a stunned enemy's head (STUN_MARK), on a ring
// squashed as if seen from above and in front, the ones going round the back smaller and
// dimmer. Made the first time it's needed; pops in and out with the stun.
import { Container, Sprite } from 'pixi.js';
import { STUN_MARK } from '../data/config.js';
import { clamp01, lerp, TAU } from '../engine/math.js';
import { tex } from '../render/assets.js';

export class StunMark {
  constructor(enemy) {
    this.enemy = enemy;
    this.view = null;
    this.shown = 0; // 0 hidden … 1 fully out
  }

  build() {
    const S = STUN_MARK;
    this.view = new Container();
    this.stars = Array.from({ length: S.count }, () => {
      const glow = new Sprite({ texture: tex.mist, anchor: 0.5, tint: S.glow.color, blendMode: 'add' });
      const star = new Sprite({ texture: tex.glint, anchor: 0.5, tint: S.color });
      this.view.addChild(glow, star);
      return { glow, star };
    });
    this.enemy.world.layers.fx.addChild(this.view);
  }

  render(now, p, visible, dt) {
    const S = STUN_MARK, e = this.enemy;
    this.shown = clamp01(this.shown + ((e.stunned && !e.dying ? dt : -dt) / S.popTime));
    if (this.shown <= 0 && !this.view) return;
    if (!this.view) this.build();
    this.view.visible = visible && this.shown > 0;
    if (!this.view.visible) return;
    const r = e.body.radius, pop = 1 - (1 - this.shown) ** 2;
    const rx = r * S.orbit, ry = rx * S.tilt, cy = p.y - r * S.lift;
    this.stars.forEach(({ glow, star }, i) => {
      const a = (now * S.speed + i / S.count) * TAU, front = Math.sin(a); // 1 nearest, -1 round the back
      const depth = lerp(0.6, 1, (front + 1) / 2), twinkle = 0.75 + 0.25 * Math.sin(now * S.twinkle * TAU + i * 2.1);
      const size = S.size * r * depth * pop * twinkle;
      const x = p.x + Math.cos(a) * rx, y = cy + front * ry;
      star.position.set(x, y);
      star.width = star.height = size;
      star.rotation = now * 2 + i;
      star.alpha = S.alpha * depth;
      glow.position.set(x, y);
      glow.width = glow.height = size * S.glow.size;
      glow.alpha = S.glow.alpha * depth * pop;
    });
  }

  destroy() { this.view?.destroy({ children: true }); }
}
