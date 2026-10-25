// The Alembic's globs (BlightGlobs) and the poison they leave. A Glob is a big orb of toxin
// lobbed at a spot: it flies there like any projectile, the spot marked on the floor
// meanwhile, and splats there into a PoisonPool. One that reaches the player on the way
// hurts them and splats where it hit; parried, or broken on a wall, it is gone without a
// splat. The pool lies on the floor `time` seconds, hurting the player whenever they stand
// in it and their invincibility has run out; it can't be parried. Looks: BLOB.
import { Graphics, Sprite } from 'pixi.js';
import { Entity } from '../game/entity.js';
import { circleVsCircle, circleVsCapsule } from '../engine/physics.js';
import { clamp01, fromAngle, lerp, lerpColor, randRange, TAU } from '../engine/math.js';
import { BLOB } from '../data/config.js';
import { tex } from '../render/assets.js';
import { clearGraphics } from '../render/fx.js';
import { Projectile } from './projectile.js';
import { renderTime } from './attackView.js';

const easeOut = (t) => 1 - (1 - t) ** 2;
// The floor marks are drawn this many times larger and scaled back down, so their
// circles come out round.
const U = 32;

export class Glob extends Projectile {
  // from, to: { x, y }, where it is hurled from and where it lands.
  // opts: { speed, size, damage, pool: { radius, time, damage } }
  constructor(world, sourceAbility, from, to, opts) {
    const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy);
    const dir = len > 1e-4 ? { x: dx / len, y: dy / len } : fromAngle(sourceAbility.enemy.body.rotation);
    const flight = len / opts.speed;
    super(world, sourceAbility, from.x, from.y, { dir, speed: opts.speed, lifetime: flight + 1, damage: opts.damage, size: opts.size, look: 'blob' });
    this.to = { x: to.x, y: to.y };
    this.thrownAt = world.time;
    this.landAt = world.time + flight;
    this.pool = opts.pool;
    this.marker = new Graphics();
    this.marker.blendMode = 'add';
    this.marker.scale.set(1 / U);
    world.layers.zones.addChild(this.marker);
    world.effects.burst(from.x, from.y, Math.atan2(dir.y, dir.x), { ...BLOB.launch, color: BLOB.color });
  }

  step(dt) {
    if (this.world.time >= this.landAt) { this.splat(this.to); return; }
    super.step(dt);
  }

  afterPhysics() {
    const p = this.world.hittablePlayer, b = this.body;
    if (!p || !this.overlapsCircle(p.body.pos.x, p.body.pos.y, p.body.radius)) { super.afterPhysics(); return; }
    if (p.tryParryIncoming(this) || this.dead) return;
    const dx = b.pos.x - p.body.pos.x, dy = b.pos.y - p.body.pos.y, l = Math.hypot(dx, dy) || 1;
    p.hitBy(this, this.damage, { x: p.body.pos.x + (dx / l) * p.body.radius, y: p.body.pos.y + (dy / l) * p.body.radius }, { ...b.pos });
    this.splat({ ...b.pos });
  }

  splat(at) {
    const w = this.world, S = BLOB.splat;
    w.add(new PoisonPool(w, this.sourceAbility, at, this.pool));
    w.sound('globSplat', at);
    w.effects.burst(at.x, at.y, 0, { ...S, color: BLOB.color });
    w.effects.burst(at.x, at.y, 0, { ...S, count: Math.round(S.count / 3), color: BLOB.bright });
    this.destroy();
  }

  render(alpha) {
    super.render(alpha);
    this.drawMarker(renderTime(this.world, alpha));
  }

  // Until it lands: the ring its pool will fill and a fill swelling to meet it, pulsing faster
  // as it nears (as the Seer's Omen's).
  drawMarker(now) {
    const g = this.marker, K = BLOB.marker, R = this.pool.radius * U, line = K.lineWidth * U;
    const flight = Math.max(1e-3, this.landAt - this.thrownAt), elapsed = now - this.thrownAt, t = clamp01(elapsed / flight);
    clearGraphics(g);
    if (elapsed < 0 || now >= this.landAt) return;
    g.position.set(this.to.x, this.to.y);
    const [r0, r1] = K.pulse;
    const pulse = 0.5 + 0.5 * Math.sin(TAU * (r0 * elapsed + ((r1 - r0) * elapsed * elapsed) / (2 * flight)));
    const a = clamp01(elapsed / 0.1) * lerp(0.55, 1, pulse);
    if (t > 0.01) g.circle(0, 0, R * t).fill({ color: BLOB.color, alpha: K.fillAlpha * a });
    g.circle(0, 0, R).stroke({ width: line * 3, color: BLOB.color, alpha: K.ringAlpha * 0.35 * a });
    g.circle(0, 0, R).stroke({ width: line, color: BLOB.bright, alpha: K.ringAlpha * a });
  }

  dispose() {
    super.dispose();
    this.marker.destroy();
  }
}

export class PoisonPool extends Entity {
  // at: { x, y }; { radius, time, damage }
  constructor(world, sourceAbility, at, { radius, time, damage }) {
    super(world);
    this.sourceAbility = sourceAbility; // who to blame (the Alembic)
    this.x = at.x;
    this.y = at.y;
    this.radius = radius;
    this.damage = damage;
    this.bornAt = world.time;
    this.endsAt = world.time + time;
    this.seed = Math.random() * TAU;
    this.glow = new Sprite(tex.mist);
    this.glow.anchor.set(0.5);
    this.glow.blendMode = 'add';
    this.glow.tint = BLOB.color;
    this.gfx = new Graphics();
    this.gfx.scale.set(1 / U);
    world.layers.telegraphs.addChild(this.glow, this.gfx);
    this.bubbles = []; // { x, y, size, at, life }, rising in it
    const S = BLOB.pool.stars;
    this.stars = Array.from({ length: S.count }, () => { // glinting in it: { x, y, size, rate, phase }
      const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * 0.7;
      return { x: Math.cos(a) * d, y: Math.sin(a) * d, size: randRange(...S.size), rate: randRange(...S.twinkle), phase: Math.random() * TAU };
    });
  }

  step() {
    const w = this.world;
    if (w.time >= this.endsAt + BLOB.pool.fade) { this.destroy(); return; }
    const p = w.hittablePlayer;
    if (w.time >= this.endsAt || !p || !this.overlapsCircle(p.body.pos.x, p.body.pos.y, p.body.radius)) return;
    p.hitBy(this, this.damage, { ...p.body.pos }, { x: this.x, y: this.y });
  }

  worldShape() { return { type: 'circle', x: this.x, y: this.y, r: this.radius }; }
  overlapsCircle(x, y, r) { return circleVsCircle(x, y, r, this.x, this.y, this.radius); }
  overlapsCapsule(cap) { return circleVsCapsule(this.x, this.y, this.radius, cap); }

  closestPoint(cap) {
    const dx = cap.cx - this.x, dy = cap.cy - this.y, l = Math.hypot(dx, dy) || 1, reach = Math.min(this.radius, l);
    return { x: this.x + (dx / l) * reach, y: this.y + (dy / l) * reach };
  }

  parry() { return false; } // poison can't be parried

  // Spreading out with a flash, its edge rippling, bubbles rising and popping and stars
  // glinting in it and fumes drifting off it; shrinking and fading once spent.
  render(alpha, dt) {
    const P = BLOB.pool, now = renderTime(this.world, alpha), g = this.gfx, fx = this.world.effects;
    const since = now - this.bornAt, gone = clamp01((now - this.endsAt) / P.fade), fade = 1 - gone;
    const flash = Math.max(0, 1 - since / P.flash);
    const R = this.radius * lerp(P.from, 1, easeOut(clamp01(since / P.spread))) * lerp(1, 0.85, gone);
    g.clear();
    g.position.set(this.x, this.y);
    const edge = (scale) => {
      const pts = [], N = 48;
      for (let i = 0; i < N; i++) {
        const a = (TAU * i) / N;
        const k = 1 + P.ripple.reduce((sum, [lobes, amount, speed]) => sum + amount * Math.sin(lobes * a + speed * now + this.seed * lobes), 0);
        pts.push(Math.cos(a) * R * k * scale * U, Math.sin(a) * R * k * scale * U);
      }
      return pts;
    };
    const outer = edge(1);
    g.poly(outer).fill({ color: lerpColor(P.fill, BLOB.bright, flash * 0.5), alpha: P.fillAlpha * fade });
    g.poly(edge(0.62)).fill({ color: P.inner, alpha: P.innerAlpha * fade });
    g.poly(outer).stroke({ width: P.rimWidth * U, color: P.rim, alpha: P.rimAlpha * fade * (0.8 + 0.2 * Math.sin(now * 3 + this.seed)) });
    this.glow.position.set(this.x, this.y);
    this.glow.width = this.glow.height = P.glow.size * R;
    this.glow.alpha = P.glow.alpha * fade * (1 + flash);

    if (dt > 0 && gone === 0) {
      if (Math.random() < P.bubbles * dt) {
        const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * 0.75;
        this.bubbles.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, size: randRange(...P.bubble.size), at: now, life: randRange(...P.bubble.life) });
      }
      if (Math.random() < P.fumes * dt) {
        const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * R * 0.8;
        fx.burst(this.x + Math.cos(a) * d, this.y + Math.sin(a) * d, -Math.PI / 2, P.fume);
      }
    }
    for (const s of this.stars) { // a four-point star, twinkling
      const tw = 0.5 + 0.5 * Math.sin(now * s.rate * TAU + s.phase), r = s.size * R * lerp(0.5, 1, tw) * U, k = r * 0.18;
      const x = s.x * R * U, y = s.y * R * U;
      g.poly([x + r, y, x + k, y + k, x, y + r, x - k, y + k, x - r, y, x - k, y - k, x, y - r, x + k, y - k]).fill({ color: BLOB.bright, alpha: lerp(0.25, 0.9, tw) * fade });
    }
    this.bubbles = this.bubbles.filter((b) => {
      const k = (now - b.at) / b.life;
      if (k >= 1) {
        if (dt > 0) fx.burst(this.x + b.x * R, this.y + b.y * R, 0, P.pop);
        return false;
      }
      const r = b.size * R * easeOut(k) * U;
      g.circle(b.x * R * U, b.y * R * U, r).fill({ color: P.fill, alpha: 0.8 * fade });
      g.circle(b.x * R * U, b.y * R * U, r).stroke({ width: 0.025 * U, color: BLOB.bright, alpha: 0.7 * fade });
      return true;
    });
  }

  dispose() {
    this.glow.destroy();
    this.gfx.destroy();
  }
}
