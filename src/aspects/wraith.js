// Wraith: dashing turns the player into a small, sharp shard of black mist. While mist they
// pass through enemies and nothing hits them, and each enemy they pass through is cut once,
// thrown aside from the dash's line. Still inside one as the dash runs out, the dash carries
// on through it (up to lingerTime longer), so they're never left stuck in it.
// The body bursts into mist and the shard pops out of it; the shard, white-hot at the tip,
// sheds black and white wisps and a few pale motes; as it ends the mist is drawn back in,
// the shard collapses and the body swells back out of it (Player.bodyScale). Its rim and the
// whites take the player's tint.
import { Sprite } from 'pixi.js';
import { Aspect } from './aspect.js';
import { EXALTED_FX, FIXED_DT, FX } from '../data/config.js';
import { clamp01, lerp, lerpColor, randRange, TAU } from '../engine/math.js';
import { anims, tex } from '../render/assets.js';
import { Plume } from '../render/fx.js';
import { RING_RADIUS } from '../render/sprites.js';

const DEG = Math.PI / 180;
const WISP_DRAG = 3;
const pick = ([min, max]) => randRange(min, max);
const easeIn = (t) => t * t;
const easeOutBack = (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2; // overshoots, then settles
// Stochastic rounding, so low rates still spawn at the right average.
const spawnCount = (rate, dt) => Math.floor(rate * dt + Math.random());

export class WraithAspect extends Aspect {
  constructor(player, data) {
    super(player, data);
    // While the player is mist: { dir, angle, born (render clock), lingerUntil (latest the dash
    // can run on), hit: enemies cut this dash }.
    this.form = null;
    this.reform = null; // { born, angle } while the shard collapses and the body swells back
    const { player: layer, playerBack, fx } = player.world.layers;
    this.sprite = new Sprite({ texture: tex.wraith_form, anchor: 0.5, visible: false });
    layer.addChild(this.sprite);
    this.wisps = new Plume(playerBack, tex.mist, { blendMode: 'normal', drag: WISP_DRAG, zIndex: -44 }); // black smoke can't be added light
    this.haze = new Plume(playerBack, tex.mist, { drag: WISP_DRAG, zIndex: -46 }); // under it, so it shows on the dark floor
    this.motes = new Plume(fx, tex.glint, { drag: 4 });
    this.time = 0; // render clock; stands still while paused
  }

  onDash(dir) {
    const b = this.player.body;
    const lingerUntil = this.player.dashEndsAt + this.data.lingerTime;
    this.form = { dir: { ...dir }, angle: Math.atan2(dir.y, dir.x), born: this.time, lingerUntil, hit: new Set() };
    this.reform = null;
    this.player.bodyScale = 1;
    this.player.shrouded = true;
    b.ignores = new Set(this.world.enemies.map((e) => e.body));
    this.used();
    this.burst(b.pos, this.form.angle);
  }

  step() {
    const f = this.form, p = this.player;
    if (!f) return;
    if (!p.dashing) { this.end(); return; }
    // Still inside an enemy as the dash runs out: carry on through it, up to lingerTime longer.
    if (this.now < f.lingerUntil && this.insideEnemy()) p.dashEndsAt = Math.max(p.dashEndsAt, Math.min(f.lingerUntil, this.now + 1.5 * FIXED_DT));
  }

  afterPhysics() {
    const f = this.form;
    if (!f) return;
    const p = this.player.body.pos, r = this.data.hitRadius;
    for (const e of this.world.enemies) {
      if (e.dead || f.hit.has(e) || (e.body.pos.x - p.x) ** 2 + (e.body.pos.y - p.y) ** 2 > (e.body.radius + r) ** 2) continue;
      f.hit.add(e);
      this.cut(e);
    }
  }

  insideEnemy() {
    const b = this.player.body;
    return this.world.enemies.some((e) => !e.dead && (e.body.pos.x - b.pos.x) ** 2 + (e.body.pos.y - b.pos.y) ** 2 < (e.body.radius + b.radius) ** 2);
  }

  // Thrown aside from the dash's line, as if it parted them.
  cut(enemy) {
    const f = this.form, p = this.player.body.pos, e = enemy.body.pos, d = f.dir;
    const along = (e.x - p.x) * d.x + (e.y - p.y) * d.y;
    const src = { x: p.x + d.x * along, y: p.y + d.y * along };
    const hitPoint = enemy.closestPoint(p);
    enemy.takeDamage(this.data.damage * this.world.adrenaline.damageMultiplier, hitPoint, src, this.data.id);
    if (!enemy.dead) enemy.applyKnockback(this.data.enemyKnockbackForce, src);
    const C = this.data.fx.cut;
    this.world.effects.playOnce(anims.hit_impact, hitPoint.x, hitPoint.y, f.angle, FX.hitImpactSize, C.impactTint);
    this.world.effects.burst(hitPoint.x, hitPoint.y, f.angle, C.sparks);
    this.puff(hitPoint, f.angle, C.wisps);
  }

  end() {
    const angle = this.form.angle;
    this.form = null;
    this.player.shrouded = false;
    this.player.body.ignores = null;
    if (this.player.death) return;
    this.reform = { born: this.time, angle };
    this.player.bodyScale = this.data.fx.reform.from;
    this.gather(this.player.body.pos);
  }

  // The body blowing apart into a cloud of black: a white flash, rays of light, a ring of
  // haze, and mist blasted out all around and harder back the way it came.
  burst(pos, angle) {
    const B = this.data.fx.burst, fx = this.world.deathFx, white = this.light(0xffffff);
    fx.flare(tex.mist, pos.x, pos.y, 0, {
      time: B.flash.time, w0: B.flash.size, h0: B.flash.size, w1: B.flash.size * B.flash.grow, h1: B.flash.size * B.flash.grow,
      alpha: B.flash.alpha, color0: white, color1: this.light(B.ring.color),
    });
    const r0 = B.ring.from / RING_RADIUS, r1 = B.ring.to / RING_RADIUS; // band radius → sprite size
    fx.flare(tex.mist_ring, pos.x, pos.y, Math.random() * TAU, {
      time: B.ring.time, w0: r0, h0: r0, w1: r1, h1: r1, alpha: B.ring.alpha, color0: white, color1: this.light(B.ring.color),
    });
    for (let i = 0; i < B.core.count; i++) {
      const a = Math.random() * TAU, speed = pick(B.core.speed);
      this.smoke(pos.x, pos.y, Math.cos(a) * speed, Math.sin(a) * speed, pick(B.core.size), pick(B.core.life), B.core.grow, false);
    }
    this.world.effects.burst(pos.x, pos.y, 0, { ...B.rays, color: white });
    this.puff(pos, 0, B.around);
    this.puff(pos, angle + Math.PI, B.back);
    this.world.camera.shake(B.shake.duration, B.shake.strength, B.shake.frequency);
  }

  // Mist drawn back in from all around to `pos`, each wisp arriving as it fades, in a small white flash.
  gather(pos) {
    const R = this.data.fx.reform, W = R.wisps;
    for (let i = 0; i < W.count; i++) {
      const a = Math.random() * TAU, r = pick(W.radius), life = pick(W.life);
      const speed = (r * WISP_DRAG) / (1 - Math.exp(-WISP_DRAG * life)); // covers r before drag stops it
      this.smoke(pos.x + Math.cos(a) * r, pos.y + Math.sin(a) * r, -Math.cos(a) * speed, -Math.sin(a) * speed, pick(W.size), life, 0.5);
    }
    this.world.deathFx.flare(tex.mist, pos.x, pos.y, 0, {
      time: R.flash.time, w0: R.flash.size, h0: R.flash.size, w1: R.flash.size * R.flash.grow, h1: R.flash.size * R.flash.grow,
      alpha: R.flash.alpha, color0: this.light(0xffffff), color1: this.light(this.data.fx.burst.ring.color),
    });
  }

  render(alpha, dt) {
    if (this.form && this.player.death) this.end(); // dying stops the player's step, so it ends here
    this.time += dt;
    this.wisps.update(dt);
    this.haze.update(dt);
    this.motes.update(dt);
    const { form: F, reform: R } = this.data.fx;
    const f = this.form, g = this.reform;
    if (g) {
      const k = clamp01((this.time - g.born) / R.time);
      this.player.bodyScale = lerp(R.from, 1, easeOutBack(k));
      if (k >= 1) { this.player.bodyScale = 1; this.reform = null; }
    }
    // The shard pops out of the burst, and collapses as the body comes back.
    const shard = f ? lerp(F.from, 1, easeOutBack(clamp01((this.time - f.born) / F.formTime)))
      : g ? 1 - easeIn(clamp01((this.time - g.born) / R.collapse)) : 0;
    const s = this.sprite;
    s.visible = shard > 0 && !this.player.hidden;
    if (!s.visible) return;
    const k = this.player.sizeScale, p = this.player.body.lerpPos(alpha);
    const flicker = 1 + F.flicker * Math.sin(this.time * 53) * Math.sin(this.time * 31);
    s.position.set(p.x, p.y);
    s.rotation = f ? f.angle : g.angle;
    s.width = F.length * k * shard * flicker;
    s.height = F.width * k * shard / flicker;
    s.tint = this.player.view.tint;
    if (f && dt > 0) this.shed(p, dt, k);
  }

  // Black and white wisps torn off the shard's tail, white mist streaming off its tip, and
  // the odd pale mote.
  shed(p, dt, k) {
    const { form: F, wisps: W, tip: T, motes: M } = this.data.fx, d = this.form.dir, nx = -d.y, ny = d.x;
    const tx = p.x - d.x * F.length * k * 0.25, ty = p.y - d.y * F.length * k * 0.25, half = (F.width * k) / 2;
    for (let i = spawnCount(W.rate, dt); i > 0; i--) {
      const side = randRange(-1, 1) * half, speed = pick(W.speed);
      this.smoke(tx + nx * side, ty + ny * side, -d.x * speed + nx * side * W.spread, -d.y * speed + ny * side * W.spread, pick(W.size) * k, pick(W.life));
    }
    const hx = p.x + d.x * F.length * k * 0.4, hy = p.y + d.y * F.length * k * 0.4;
    for (let i = spawnCount(T.rate, dt); i > 0; i--) {
      const speed = pick(T.speed), side = randRange(-0.3, 0.3);
      this.smoke(hx, hy, -d.x * speed + nx * side, -d.y * speed + ny * side, pick(T.size) * k, pick(T.life), W.grow, true);
    }
    for (let i = spawnCount(M.rate, dt); i > 0; i--) {
      const side = randRange(-1, 1) * half, speed = pick(M.speed);
      this.motes.spawn({
        x: p.x + nx * side, y: p.y + ny * side, vx: -d.x * speed + randRange(-0.5, 0.5), vy: -d.y * speed + randRange(-0.5, 0.5),
        size: pick(M.size), life: pick(M.life), color: this.light(M.color),
      });
    }
  }

  // Wisps fanning out up to o.spreadDeg either side of `angle`.
  puff({ x, y }, angle, o) {
    for (let i = 0; i < o.count; i++) {
      const a = angle + randRange(-o.spreadDeg, o.spreadDeg) * DEG, speed = pick(o.speed);
      this.smoke(x, y, Math.cos(a) * speed, Math.sin(a) * speed, pick(o.size) * this.player.sizeScale, pick(o.life));
    }
  }

  // One wisp: pure white mist a share of the time (or with `white`), otherwise black, over a
  // faint pale haze some of the time.
  smoke(x, y, vx, vy, size, life, grow = this.data.fx.wisps.grow, white = Math.random() < this.data.fx.white.share) {
    const { wisps: W, white: L, haze: H } = this.data.fx;
    if (white) {
      this.wisps.spawn({ x, y, vx, vy, size, grow, life, color: this.light(L.color), fade: this.light(L.fade), alpha: L.alpha });
      return;
    }
    this.wisps.spawn({ x, y, vx, vy, size, grow, life, color: W.color, fade: W.fade, alpha: W.alpha });
    if (Math.random() < H.share) this.haze.spawn({ x, y, vx, vy, size: size * H.size, grow, life, color: H.color, fade: H.fade, alpha: H.alpha });
  }

  // A light colour, warmed toward the Exalted tint with the rest of the player.
  light(color) { return lerpColor(color, EXALTED_FX.tint, this.player.view.exalted.glow); }

  dispose() {
    if (this.form) { this.player.shrouded = false; this.player.body.ignores = null; }
    this.player.bodyScale = 1;
    this.sprite.destroy();
    this.wisps.destroy();
    this.haze.destroy();
    this.motes.destroy();
  }
}
