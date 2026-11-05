// The Comet's tail and fire, worked out every frame (tuning in COMET): a rope of points behind
// its head that lengthens with its speed and wags when it's slow, a glow round it and a star at
// its heart. It turns its nose the way it's going, on to its aim through a wind-up. Stunned, all
// of it gutters low. Dead, the tail and then its wake burst back along the line (Wake.burstBack).
// Cosmetic; the hurting is its wake's and its attacks'.
import { Sprite } from 'pixi.js';
import { COMET as C } from '../data/config.js';
import { clamp01, deltaAngle, lerp, TAU } from '../engine/math.js';
import { tex } from '../render/assets.js';
import { Strand } from '../render/fx.js';

export class CometRig {
  constructor(enemy) {
    this.enemy = enemy;
    const v = enemy.view, layer = enemy.world.layers.enemies, T = C.tail;
    this.tail = new Strand(layer, T.points, 1, 0, 0xffffff, 0, { texture: tex.comet_tail });
    layer.addChildAt(this.tail.mesh, layer.getChildIndex(v)); // under its head
    this.glow = new Sprite(tex.mist);
    this.glow.anchor.set(0.5);
    this.glow.blendMode = 'add';
    this.glow.tint = C.glowColor;
    this.glow.width = this.glow.height = C.glowSize;
    v.addChildAt(this.glow, 0);
    this.star = new Sprite(tex.glint);
    this.star.anchor.set(0.5);
    this.star.blendMode = 'add';
    this.star.position.set(C.star.at, 0);
    this.star.width = this.star.height = C.star.size;
    v.addChild(this.star);
    const b = enemy.body;
    this.pts = Array.from({ length: T.points }, () => ({ x: b.pos.x, y: b.pos.y }));
    this.look = { ...C.idle };
    this.face = b.rotation;
    this.lastNow = null;
    this.sparks = 0; // sparks owed to its tail
    this.seed = Math.random() * TAU;
  }

  get world() { return this.enemy.world; }

  target() {
    const e = this.enemy;
    if (e.stunned) return C.still;
    let on = C.idle;
    for (const a of e.abilities.values()) {
      if (a.phase === 'active') return C.run;
      if (a.phase === 'windup') on = C.windup;
    }
    return on;
  }

  // After EnemyAttackFx has placed and posed the enemy's view for render time `now`.
  render(now) {
    const step = this.lastNow === null ? 0 : Math.max(0, now - this.lastNow); // still while paused
    this.lastNow = now;
    const e = this.enemy, v = e.view, b = e.body, to = this.target(), L = this.look, k = 1 - Math.exp(-step / C.ease), T = C.tail;
    for (const key of ['width', 'alpha', 'glow', 'star']) L[key] = lerp(L[key], to[key], k);
    const speed = Math.hypot(b.vel.x, b.vel.y), fast = clamp01(speed / T.fullSpeed);

    // Its nose: on to its aim winding up, the way it's going otherwise.
    const want = to === C.windup || speed < 1 ? v.rotation : Math.atan2(b.vel.y, b.vel.x);
    this.face += deltaAngle(this.face, want) * (1 - Math.exp(-step / T.faceEase));
    if (!e.stunned) v.rotation = this.face;
    else this.face = v.rotation;

    this.glow.alpha = L.glow;
    this.star.alpha = L.star;
    this.star.rotation = now * C.star.spin;
    const m = this.tail.mesh;
    m.visible = v.visible;
    if (!v.visible) return;
    this.rope(now, step, v, fast);
    if (step > 0) this.shed(step, fast, to);
  }

  // Each point held no further than a segment behind the one before, easing round to trail
  // straight behind it, wagging the slower it goes.
  rope(now, step, v, fast) {
    const T = C.tail, pts = this.pts, n = pts.length, c = Math.cos(this.face), s = Math.sin(this.face), L = this.look;
    const seg = lerp(T.seg[0], T.seg[1], fast), relax = 1 - Math.exp(-step / T.relax), W = T.wave;
    pts[0].x = v.position.x - c * T.root;
    pts[0].y = v.position.y - s * T.root;
    for (let i = 1; i < n; i++) {
      const p = pts[i], q = pts[i - 1], u = i / (n - 1);
      const sway = W.amount * u * (1 - fast * 0.8) * Math.sin(now * W.speed * TAU - i * W.along + this.seed);
      p.x += (q.x - c * seg - s * sway - p.x) * relax;
      p.y += (q.y - s * seg + c * sway - p.y) * relax;
      const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy);
      if (d > seg) {
        p.x = q.x + (dx / d) * seg;
        p.y = q.y + (dy / d) * seg;
      }
    }
    const t = this.tail, F = T.flicker, width = T.width * L.width;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      t.pts[2 * i] = pts[i].x;
      t.pts[2 * i + 1] = pts[i].y;
      t.widths[i] = width * (1 - u) ** 0.8 * (1 + F.amount * Math.sin(now * F.speed * TAU * 0.2 - i * 1.3 + this.seed));
    }
    t.build();
    t.mesh.alpha = L.alpha;
  }

  // Off its tail, flung back along it, the more the faster it goes.
  shed(step, fast, to) {
    const S = C.tail.sparks, rate = to === C.still ? 0 : S.rate * Math.max(fast, to === C.windup ? 0.5 : 0);
    const back = this.face + Math.PI, pts = this.pts;
    for (this.sparks += rate * step; this.sparks >= 1; this.sparks--) {
      const p = pts[Math.floor(Math.random() * pts.length * 0.7)];
      this.world.effects.burst(p.x, p.y, back, S);
    }
  }

  setFlash() {}

  // Its tail bursts, and on back along its wake.
  onDeath() {
    const e = this.enemy;
    this.world.sound('cometDeath', e.body.pos, { pitch: e.type.sfxPitch });
    e.abilities.get('CometWake').wake.burstBack(this.pts.filter((_, i) => i % 3 === 0).map((p) => ({ x: p.x, y: p.y })));
  }

  destroy() { this.tail.destroy(); }
}
