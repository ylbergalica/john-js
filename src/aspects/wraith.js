// Wraith: dashing turns the player into a small, sharp shard of black mist. While mist they
// pass through enemies, props and walls and nothing hits them, and each enemy or prop they pass
// through is cut once (enemies thrown aside from the dash's line). Still inside one as the dash
// runs out, the dash carries on through it (up to lingerTime longer); still in a wall after
// that, they re-form at the nearest open spot (clearSpot), so they're never left stuck.
// The body bursts into mist and the shard pops out of it; the shard, white-hot at the tip,
// sheds black and white wisps and a few pale motes; as it ends the mist is drawn back in,
// the shard collapses and the body swells back out of it (Player.bodyScale). Its rim and the
// whites take the player's tint.
import { Sprite } from 'pixi.js';
import { Aspect } from './aspect.js';
import { segmentPointDistSq } from '../engine/physics.js';
import { EXALTED_FX, FIXED_DT, FX } from '../data/config.js';
import { clamp01, lerp, lerpColor, randRange, TAU } from '../engine/math.js';
import { anims, tex } from '../render/assets.js';
import { Plume } from '../render/fx.js';
import { RING_RADIUS } from '../render/sprites.js';

const DEG = Math.PI / 180;
const LAND_SEARCH = 8; // how far out clearSpot looks for open floor
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
    // can run on), from: where it began, hit: enemies and props cut this dash }.
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
    this.form = { dir: { ...dir }, angle: Math.atan2(dir.y, dir.x), born: this.time, lingerUntil, from: { ...b.pos }, hit: new Set() };
    this.reform = null;
    this.player.bodyScale = 1;
    this.player.shrouded = true;
    b.collideWalls = false; // the player keeps it off while shrouded
    b.ignores = new Set([...this.world.enemies, ...this.world.props].map((e) => e.body));
    this.used();
    this.burst(b.pos, this.form.angle);
  }

  step() {
    const f = this.form, p = this.player;
    if (!f) return;
    if (!p.dashing) { this.end(); return; }
    // Still inside an enemy, prop or wall as the dash runs out: carry on through it, up to lingerTime longer.
    if (this.now < f.lingerUntil && this.insideSomething()) p.dashEndsAt = Math.max(p.dashEndsAt, Math.min(f.lingerUntil, this.now + 1.5 * FIXED_DT));
  }

  afterPhysics() {
    const f = this.form;
    if (!f) return;
    // Swept over the whole step, so nothing slips between one step's spot and the next.
    const { pos: p, prev: q } = this.player.body, r = this.data.hitRadius;
    for (const e of [...this.world.enemies, ...this.world.props]) {
      if (e.dead || f.hit.has(e) || segmentPointDistSq(q.x, q.y, p.x, p.y, e.body.pos.x, e.body.pos.y) > (e.body.radius + r) ** 2) continue;
      f.hit.add(e);
      this.cut(e);
    }
  }

  insideSomething() {
    const b = this.player.body;
    if (this.world.physics.circleHitsWall(b.pos.x, b.pos.y, b.radius)) return true;
    return [...this.world.enemies, ...this.world.props].some((e) => !e.dead && (e.body.pos.x - b.pos.x) ** 2 + (e.body.pos.y - b.pos.y) ** 2 < (e.body.radius + b.radius) ** 2);
  }

  // Thrown aside from the dash's line, as if it parted them.
  cut(enemy) {
    const f = this.form, p = this.player.body.pos, e = enemy.body.pos, d = f.dir;
    const along = (e.x - p.x) * d.x + (e.y - p.y) * d.y;
    const src = { x: p.x + d.x * along, y: p.y + d.y * along };
    const hitPoint = enemy.closestPoint(p);
    enemy.takeDamage(this.data.damage * this.world.adrenaline.damageMultiplier, hitPoint, src, this.data.id);
    if (!enemy.dead && !enemy.isProp) enemy.applyKnockback(this.data.enemyKnockbackForce, src);
    const C = this.data.fx.cut;
    this.world.effects.playOnce(anims.hit_impact, hitPoint.x, hitPoint.y, f.angle, FX.hitImpactSize, C.impactTint);
    this.world.effects.burst(hitPoint.x, hitPoint.y, f.angle, C.sparks);
    this.puff(hitPoint, f.angle, C.wisps);
  }

  end() {
    const { angle, from } = this.form, b = this.player.body;
    this.form = null;
    this.player.shrouded = false;
    b.ignores = null;
    b.collideWalls = true; // the player turns it back off under noclip
    const spot = this.clearSpot(b.pos, angle) ?? from;
    if (spot !== b.pos) { b.pos.x = spot.x; b.pos.y = spot.y; b.stop(); }
    if (this.player.death) return;
    this.reform = { born: this.time, angle };
    this.player.bodyScale = this.data.fx.reform.from;
    this.gather(this.player.body.pos);
  }

  // `pos` if the player fits there clear of walls, else the nearest spot that is, or null if
  // there's none within LAND_SEARCH. Of spots as near, those along the dash's line win (ahead
  // first, then back), over ones off to the side.
  clearSpot(pos, angle) {
    const ph = this.world.physics, r = this.player.body.radius * 1.05;
    if (!ph.circleHitsWall(pos.x, pos.y, r)) return pos;
    for (let d = 0.1; d <= LAND_SEARCH; d += 0.1) {
      const step = TAU / Math.max(8, Math.ceil((TAU * d) / 0.1));
      for (let k = 0; k * step <= Math.PI / 2; k++) {
        for (const a of [angle + k * step, angle - k * step, angle + Math.PI - k * step, angle + Math.PI + k * step]) {
          const x = pos.x + Math.cos(a) * d, y = pos.y + Math.sin(a) * d;
          if (!ph.circleHitsWall(x, y, r)) return { x, y };
        }
      }
    }
    return null;
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
    if (this.form) { this.player.shrouded = false; this.player.body.ignores = null; this.player.body.collideWalls = true; }
    this.player.bodyScale = 1;
    this.sprite.destroy();
    this.wisps.destroy();
    this.haze.destroy();
    this.motes.destroy();
  }
}
