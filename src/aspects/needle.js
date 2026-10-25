// Needle: every few hits on enemies send a small grey spike out of the player, off to one side,
// homing in on the enemy hit last at full speed, in a flash and a puff of glints, streaking pale
// light and shedding motes. It breaks, in a brighter flash and a spray of sparks, on the first
// enemy it meets or on a wall; if its enemy dies first it flies on straight for a moment, then
// goes out in a smaller one.
import { Graphics, Sprite } from 'pixi.js';
import { Aspect } from './aspect.js';
import { Entity } from '../game/entity.js';
import { clamp, deltaAngle, lerp, randRange, randSign } from '../engine/math.js';
import { FX } from '../data/config.js';
import { anims, tex } from '../render/assets.js';
import { Plume } from '../render/fx.js';
import { hurtBySegment } from '../game/hurtbox.js';

const DEG = Math.PI / 180;
const U = 32; // the spike is drawn at this many units to the world unit, then scaled back down
const alive = (e) => !!e && !e.dead && !e.dying;
const pick = ([min, max]) => randRange(min, max);

export class NeedleAspect extends Aspect {
  constructor(player, data) {
    super(player, data);
    this.count = 0;
    this.lastHitAt = -Infinity;
    this.motes = new Plume(player.world.layers.fx, tex.glint, { drag: 3 });
  }

  // The HUD fills its icon toward the next needle.
  get cooldownFraction() { return 1 - this.count / this.data.everyHits; }

  // comboTime without a hit and the count is lost.
  step() { if (this.count && this.now - this.lastHitAt > this.data.comboTime) this.count = 0; }

  onEnemyDamaged(enemy) {
    this.lastHitAt = this.now;
    if (++this.count < this.data.everyHits) return;
    this.count = 0;
    const d = this.data, p = this.player.body.pos, t = enemy.body.pos;
    const toward = Math.atan2(t.y - p.y, t.x - p.x), side = randSign();
    // Out of the player's side or back, on the side it launches toward (or its centre, by a wall).
    const at = toward + side * pick(d.spawnDeg) * DEG;
    let from = { x: p.x + Math.cos(at) * d.spawnDistance, y: p.y + Math.sin(at) * d.spawnDistance };
    if (this.world.physics.circleHitsWall(from.x, from.y, d.hitRadius)) from = p;
    this.world.add(new Needle(this, from, toward + side * pick(d.launchDeg) * DEG, enemy));
    this.world.sound('needle', p);
    this.used();
  }

  render(_alpha, dt) { this.motes.update(dt); }

  dispose() { this.motes.destroy(); }
}

class Needle extends Entity {
  constructor(aspect, from, angle, target) {
    const world = aspect.world, F = aspect.data.fx;
    super(world);
    this.aspect = aspect;
    this.data = aspect.data;
    this.pos = { ...from };
    this.prev = { ...from };
    this.angle = this.prevAngle = angle;
    this.target = target;
    this.diesAt = world.time + this.data.lifetime; // brought forward to orphanTime once its enemy dies
    // A thin spike pointing along +x, centred on its middle, with a white edge down to its tip.
    const L = (F.length / 2) * U, W = (F.width / 2) * U;
    this.sprite = new Graphics()
      .poly([L, 0, -L * 0.5, W, -L, 0, -L * 0.5, -W]).fill(F.color)
      .poly([L, 0, -L * 0.5, W * 0.35, -L * 0.5, 0]).fill(F.tip);
    this.sprite.scale.set(1 / U);
    // A streak of pale light trailing back from its tip, under it.
    this.streak = new Sprite({ texture: tex.mist, anchor: { x: F.streak.anchor, y: 0.5 } });
    this.streak.blendMode = 'add';
    this.streak.tint = F.streak.color;
    this.streak.alpha = F.streak.alpha;
    this.streak.width = F.streak.length;
    this.streak.height = F.streak.width;
    world.layers.fx.addChild(this.streak, this.sprite);
    const S = F.spawn;
    this.flash(from, S.flash);
    world.deathFx.flare(tex.ring, from.x, from.y, 0, { time: S.ring.time, w0: S.ring.from, h0: S.ring.from, w1: S.ring.to, h1: S.ring.to, alpha: S.ring.alpha, color0: 0xffffff, color1: F.color });
    world.effects.burst(from.x, from.y, angle, S.glints);
  }

  // A soft round flash at `at`, white cooling to grey.
  flash({ x, y }, f) {
    this.world.deathFx.flare(tex.mist, x, y, 0, { time: f.time, w0: f.size, h0: f.size, w1: f.size * f.grow, h1: f.size * f.grow, alpha: f.alpha, color0: 0xffffff, color1: this.data.fx.color });
  }

  step(dt) {
    const d = this.data, w = this.world;
    this.prev.x = this.pos.x;
    this.prev.y = this.pos.y;
    this.prevAngle = this.angle;
    if (alive(this.target)) {
      // Along the circle that leaves at its heading and runs through the target: an even turn the
      // whole way there, re-fitted every step as the target moves.
      const dx = this.target.body.pos.x - this.pos.x, dy = this.target.body.pos.y - this.pos.y;
      const off = deltaAngle(this.angle, Math.atan2(dy, dx)), rate = (2 * d.speed * Math.sin(off)) / (Math.hypot(dx, dy) || 1e-6);
      this.angle += clamp(rate, -d.maxTurnRate, d.maxTurnRate) * dt;
    } else if (this.target) {
      this.target = null; // never picks another
      this.diesAt = Math.min(this.diesAt, w.time + d.orphanTime);
    }
    this.pos.x += Math.cos(this.angle) * d.speed * dt;
    this.pos.y += Math.sin(this.angle) * d.speed * dt;
    const half = d.fx.length / 2;
    const tip = { x: this.pos.x + Math.cos(this.angle) * half, y: this.pos.y + Math.sin(this.angle) * half };
    if (w.physics.circleHitsWall(tip.x, tip.y, d.hitRadius)) { this.end(tip, d.fx.hit); return; }
    const ax = this.prev.x + Math.cos(this.prevAngle) * half, ay = this.prev.y + Math.sin(this.prevAngle) * half;
    for (const t of w.props.filter((t) => t.isThread && !t.dying && hurtBySegment(t, ax, ay, tip.x, tip.y, d.hitRadius))) t.takeDamage(d.damage, t.closestPoint(tip), tip); // cut in passing
    const e = w.enemies.find((e) => alive(e) && hurtBySegment(e, ax, ay, tip.x, tip.y, d.hitRadius));
    if (e) {
      const src = { x: ax, y: ay }, hitPoint = e.closestPoint(src);
      e.takeDamage(d.damage * w.adrenaline.damageMultiplier, hitPoint, src, d.id);
      w.effects.playOnce(anims.hit_impact, hitPoint.x, hitPoint.y, this.angle, FX.hitImpactSize * d.fx.hit.impact, d.fx.hit.sparks.color);
      this.end(hitPoint, d.fx.hit);
      return;
    }
    if (w.time >= this.diesAt) this.end(this.pos, d.fx.fizzle);
  }

  // Gone at `at`: a flash and sparks thrown back the way it came.
  end(at, E) {
    this.flash(at, E.flash);
    this.world.effects.burst(at.x, at.y, this.angle + Math.PI, E.sparks);
    this.destroy();
  }

  render(alpha, dt) {
    const F = this.data.fx, M = F.motes;
    const x = lerp(this.prev.x, this.pos.x, alpha), y = lerp(this.prev.y, this.pos.y, alpha);
    const angle = this.prevAngle + deltaAngle(this.prevAngle, this.angle) * alpha;
    this.sprite.position.set(x, y);
    this.sprite.rotation = angle;
    const tipX = x + Math.cos(angle) * F.length / 2, tipY = y + Math.sin(angle) * F.length / 2;
    this.streak.position.set(tipX, tipY);
    this.streak.rotation = angle;
    // Motes shed off its back end, drifting a little to either side.
    const bx = x - Math.cos(angle) * F.length / 2, by = y - Math.sin(angle) * F.length / 2;
    for (let i = Math.floor(M.rate * dt + Math.random()); i > 0; i--) {
      this.aspect.motes.spawn({ x: bx, y: by, vx: -Math.cos(angle) * 0.5 - Math.sin(angle) * randRange(-M.spread, M.spread), vy: -Math.sin(angle) * 0.5 + Math.cos(angle) * randRange(-M.spread, M.spread), size: pick(M.size), life: pick(M.life), color: M.color, fade: M.fade, alpha: M.alpha });
    }
  }

  dispose() {
    this.sprite.destroy();
    this.streak.destroy();
  }
}
