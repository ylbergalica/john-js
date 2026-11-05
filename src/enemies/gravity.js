// The Collapsar's gravity and what it throws (tuning in COLLAPSAR and its abilities). Anything
// that drags the player goes in World.gravities with a pullOn(player): a velocity, which
// Player.gravityVelocity adds to their walking.
//   gravityPull        the pull toward a point: falling off with distance, cut off by walls.
//   Infall             the streaks falling in on what pulls.
//   WellOrb            the dark orb: flies to where the player stood, and settles there.
//   GravityWell        what it settles into: pulls for a while, then caves in, bursting in shards.
//   EjectaShot         one of the shots thrown off its disc: swings in round it, then flies out.
//   CollapsarImplosion its death: all of it dropping inward, then blasting back out.
import { Container, Graphics, Sprite } from 'pixi.js';
import { Entity } from '../game/entity.js';
import { clamp01, dist, fromAngle, lerp, lerpColor, randRange, smoothStep01, TAU } from '../engine/math.js';
import { COLLAPSAR as C, DEATH_FX } from '../data/config.js';
import { tex } from '../render/assets.js';
import { rectContainsCircle } from '../render/camera.js';
import { clearGraphics, thinned } from '../render/fx.js';
import { COLLAPSAR_ART, RING_RADIUS } from '../render/sprites.js';
import { Projectile } from './projectile.js';
import { renderTime } from './attackView.js';

const NONE = { x: 0, y: 0 };

// The velocity drawing `body` toward `from`: `near` right by it, falling to nothing at `reach`
// as (1 - d / reach) ^ `curve`, × `k`. None with a wall between them.
export function gravityPull(world, from, body, { reach, near, curve }, k = 1) {
  const dx = from.x - body.pos.x, dy = from.y - body.pos.y, d = Math.hypot(dx, dy);
  if (k <= 0 || d >= reach || d < 1e-3) return NONE;
  if (world.physics.rayLength(from.x, from.y, -dx / d, -dy / d, d, 0.25) < d) return NONE;
  const v = near * (1 - d / reach) ** curve * k;
  return { x: (dx / d) * v, y: (dy / d) * v };
}

// Streaks of dust falling in on a point, spawned with a clear line to it, so none comes
// through a wall. On the floor, under the bodies, cosmetic; still while paused.
export class Infall {
  constructor(world) {
    this.world = world;
    this.gfx = new Graphics();
    this.gfx.blendMode = 'add';
    world.layers.telegraphs.addChild(this.gfx);
    this.streaks = []; // { a, r, v, born, S }
    this.owed = 0;
  }

  // This frame, `step` seconds on: falling on (x, y), new ones coming as `S` says (see
  // COLLAPSAR.infall, `rate` scaled by `amount`) from within `reach`, down to `inner`.
  render(x, y, step, S, amount, reach, inner) {
    const g = this.gfx, physics = this.world.physics, I = C.infall;
    clearGraphics(g);
    if (step > 0) {
      for (this.owed += S.rate * amount * step; this.owed >= 1; this.owed--) {
        if (!thinned(1)) continue;
        const a = Math.random() * TAU, r = randRange(inner + 0.5, reach);
        if (physics.rayLength(x, y, Math.cos(a), Math.sin(a), r, 0.25) >= r) this.streaks.push({ a, r, v: S.speed * randRange(0.7, 1.1), born: r, S });
      }
    }
    let w = 0;
    for (const s of this.streaks) {
      s.v += s.S.accel * step;
      s.r -= s.v * step;
      if (s.r <= inner) continue;
      this.streaks[w++] = s;
      const c = Math.cos(s.a), n = Math.sin(s.a), len = s.S.length * Math.min(1, s.v / s.S.speed);
      const fall = clamp01((s.born - s.r) / 0.5), near = clamp01((reach - s.r) / Math.max(1e-3, reach - inner));
      const alpha = s.S.alpha * fall * clamp01((s.r - inner) / 0.4);
      if (alpha <= 0.01) continue;
      g.moveTo(x + c * s.r, y + n * s.r).lineTo(x + c * (s.r + len), y + n * (s.r + len)).stroke({ width: s.S.width, color: lerpColor(I.far, I.near, near), alpha });
    }
    this.streaks.length = w;
  }

  // Off screen, none: they'd only hang there, still, until it came back.
  clear() {
    this.streaks.length = 0;
    this.owed = 0;
    clearGraphics(this.gfx);
  }

  destroy() { this.gfx.destroy(); }
}

// How many wells there are on the floor, their orbs in flight included.
export const wellsIn = (world) => world.entities.reduce((n, e) => n + (!e.dead && (e instanceof WellOrb || e instanceof GravityWell) ? 1 : 0), 0);

// The orb, flying to `to`, or short of a wall in the way, the spot marked on the floor as it
// comes. It settles into a well when it gets there, or on what it hits first; parried, it's
// just gone. opts: { speed, size, damage, well }.
export class WellOrb extends Projectile {
  constructor(world, sourceAbility, from, to, opts) {
    const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy) || 1, dir = { x: dx / len, y: dy / len };
    const free = Math.min(len, world.physics.rayLength(from.x, from.y, dir.x, dir.y, len + opts.size) - opts.size);
    const flight = Math.max(0.1, free) / opts.speed;
    super(world, sourceAbility, from.x, from.y, { dir, speed: opts.speed, lifetime: flight, damage: opts.damage, size: opts.size, look: 'darkOrb' });
    this.well = opts.well;
    this.to = { x: from.x + dir.x * free, y: from.y + dir.y * free };
    this.marker = new Graphics();
    this.marker.blendMode = 'add';
    world.layers.zones.addChild(this.marker);
  }

  spent() {
    const w = this.world, { x, y } = this.body.pos;
    w.add(new GravityWell(w, this.sourceAbility, x, y, this.well));
  }

  render(alpha) {
    super.render(alpha);
    const g = this.marker, K = C.well.marker, now = renderTime(this.world, alpha);
    const t = clamp01((now - this.spawnedAt) / Math.max(1e-3, this.expiresAt - this.spawnedAt)), R = this.well.reach * lerp(1.25, 1, t);
    clearGraphics(g);
    g.circle(this.to.x, this.to.y, R).stroke({ width: K.line, color: C.well.ringColor, alpha: K.alpha * clamp01(t * 4) });
  }

  dispose() {
    super.dispose();
    this.marker.destroy();
  }
}

// The well: pulling (well.reach, near, curve) for its `time`, harder as it caves in over its
// last `warn`, then gone in a ring of shards. It answers to its maker: stunned it lets go, and
// dead it caves in at once with no shards, so a kill ends what it left behind.
export class GravityWell extends Entity {
  constructor(world, sourceAbility, x, y, well) {
    super(world);
    this.sourceAbility = sourceAbility;
    this.maker = sourceAbility.enemy;
    this.x = x;
    this.y = y;
    this.well = well;
    this.bornAt = world.time;
    this.endsAt = world.time + well.time;
    this.fizzling = false;
    this.caving = false;
    this.hold = 0; // how hard it has hold, 0 → 1
    const W = C.well, layer = world.layers.telegraphs;
    this.infall = new Infall(world);
    this.glow = new Sprite(tex.mist);
    this.glow.blendMode = 'add';
    this.glow.tint = W.glowColor;
    this.reach = new Sprite(tex.ring);
    this.reach.blendMode = 'add';
    this.reach.tint = W.ringColor;
    this.pit = new Sprite(tex.collapsar_well);
    for (const s of [this.glow, this.reach, this.pit]) {
      s.anchor.set(0.5);
      s.position.set(x, y);
      layer.addChild(s);
    }
    this.angle = Math.random() * TAU;
    this.lastNow = null;
    world.effects.burst(x, y, 0, W.settle);
    world.sound('wellForm', { x, y });
    world.gravities.add(this);
  }

  get pos() { return { x: this.x, y: this.y }; }

  pullOn(player) { return gravityPull(this.world, this.pos, player.body, this.well, this.hold); }

  step(dt) {
    const w = this.world, V = this.well;
    if (this.maker.dead && !this.fizzling) {
      this.fizzling = true;
      this.endsAt = Math.min(this.endsAt, w.time + V.fizzle);
    }
    if (w.time >= this.endsAt) { this.implode(); return; }
    if (!this.caving && !this.fizzling && w.time >= this.endsAt - V.warn) {
      this.caving = true;
      w.sound('wellCave', this.pos);
    }
    const formed = smoothStep01(clamp01((w.time - this.bornAt) / V.form));
    const to = this.maker.stunned || this.fizzling ? 0 : formed * (this.caving ? V.hard : 1);
    this.hold = lerp(this.hold, to, 1 - Math.exp(-dt / V.ease));
  }

  implode() {
    const w = this.world, { x, y } = this, W = C.well, S = this.well.shards, color = C.ember.violet.color;
    if (!this.fizzling) {
      const turn = Math.random() * TAU, damage = this.maker.damage * this.sourceAbility.data.damageMultiplier * S.damageMultiplier;
      for (let i = 0; i < S.count; i++) {
        const dir = fromAngle(turn + (TAU * i) / S.count);
        if (w.physics.circleHitsWall(x + dir.x * S.wallClear, y + dir.y * S.wallClear, S.size / 2)) continue; // straight into a wall beside it
        w.add(new Projectile(w, this.sourceAbility, x, y, { dir, speed: S.speed, lifetime: S.lifetime, damage, size: S.size, look: S.look, variant: S.variant }));
      }
      w.blastWall(x, y, W.wall, true);
    }
    w.sound('wellImplode', this.pos, this.fizzling ? { volume: 0.6 } : {});
    w.effects.burst(x, y, 0, W.sparks);
    w.deathFx.flare(tex.mist, x, y, 0, { time: W.flash.time, w0: W.flash.from, h0: W.flash.from, w1: W.flash.to, h1: W.flash.to, color0: 0xffffff, color1: color, fade: 1.5 });
    w.deathFx.flare(tex.ring, x, y, 0, { time: W.ring.time, w0: W.ring.from, h0: W.ring.from, w1: W.ring.to, h1: W.ring.to, color0: 0xffffff, color1: color, fade: 1.5 });
    this.destroy();
  }

  // Opening up with a swell, turning, its reach ringed on the floor; caving in, it shrinks and
  // whirls and the ring closes in with it. Let go, it dims and all but stops.
  render(alpha, dt, view) {
    const W = C.well, V = this.well, now = renderTime(this.world, alpha);
    const step = this.lastNow === null ? 0 : Math.max(0, now - this.lastNow);
    this.lastNow = now;
    const opened = smoothStep01(clamp01((now - this.bornAt) / V.form));
    const warn = this.fizzling ? V.fizzle : V.warn, cave = clamp01((now - (this.endsAt - warn)) / warn), slack = this.maker.stunned ? W.slack : 1;
    this.angle += lerp(W.spin, W.warnSpin, cave * cave) * slack * step;
    const size = W.size * opened * lerp(1, 0.45, cave * cave);
    this.pit.rotation = this.angle;
    this.pit.width = this.pit.height = size;
    this.pit.alpha = lerp(1, 0.55, 1 - slack);
    this.glow.width = this.glow.height = W.size * W.glowSize * opened * lerp(1, 0.6, cave);
    this.glow.alpha = W.glowAlpha * slack * lerp(1, 1.6, cave);
    this.reach.width = this.reach.height = (V.reach * opened * (1 - 0.86 * cave)) / RING_RADIUS;
    this.reach.alpha = W.ringAlpha * slack * lerp(1, 3.5, cave);
    if (!rectContainsCircle(view, this.x, this.y, V.reach)) { this.infall.clear(); return; }
    const S = {};
    for (const key of Object.keys(W.infall.calm)) S[key] = lerp(W.infall.calm[key], W.infall.hard[key], cave);
    this.infall.render(this.x, this.y, step, S, this.hold > 0.05 ? 1 : 0, V.reach, W.inner);
  }

  dispose() {
    this.world.gravities.delete(this);
    this.infall.destroy();
    this.glow.destroy();
    this.reach.destroy();
    this.pit.destroy();
  }
}

// A shot off its disc: swinging round (`curve`, `curveTime`, as any Projectile), still in
// orbit, then flying straight on at `flingSpeed`, its trail only starting there.
export class EjectaShot extends Projectile {
  constructor(world, sourceAbility, x, y, opts) {
    super(world, sourceAbility, x, y, opts);
    this.flingSpeed = opts.flingSpeed;
  }

  step(dt) {
    if (this.speed !== this.flingSpeed && this.world.time >= this.curveUntil) this.speed = this.flingSpeed;
    super.step(dt);
  }

  render(alpha) {
    const p = this.body.lerpPos(alpha), now = renderTime(this.world, alpha);
    const trail = Math.min(this.look.maxTrail, Math.max(0, now - this.curveUntil) * this.flingSpeed);
    this.look.render(now, p.x, p.y, this.body.rotation, this.size, { trailLength: trail });
  }
}

// A slain Collapsar: its body gone from the fight, this is what's left of it for COLLAPSAR.death's
// `time`, dropping inward as it whirls, dragging the player and the walls after it. Then it
// blasts back out: DeathFx.explode (which shoves the walls), a shove, the rest of its death.
export class CollapsarImplosion extends Entity {
  constructor(world, enemy, angle) {
    super(world);
    const D = C.death, { x, y } = enemy.body.pos;
    this.x = x;
    this.y = y;
    this.r = enemy.body.radius;
    this.color = enemy.hitColor;
    this.silhouette = enemy.silhouette;
    this.pitch = enemy.type.sfxPitch;
    this.bornAt = world.time;
    this.endsAt = world.time + D.time;
    this.angle = angle;
    this.lastNow = null;
    this.view = new Container();
    this.view.position.set(x, y);
    this.view.rotation = enemy.body.rotation;
    const part = (name, size) => {
      const s = new Sprite(tex[name]);
      s.anchor.set(0.5);
      s.width = s.height = size;
      this.view.addChild(s);
      return s;
    };
    this.wisps = part('collapsar_wisps', COLLAPSAR_ART.size);
    this.disc = part('collapsar_disc', COLLAPSAR_ART.size);
    for (const s of [this.wisps, this.disc]) s.blendMode = 'add';
    part(enemy.visual.void, enemy.visual.size);
    part(enemy.visual.outline, enemy.visual.size);
    world.layers.enemies.addChild(this.view);
    this.infall = new Infall(world);
    world.gravities.add(this);
    world.sound('collapsarImplode', this.pos, { pitch: this.pitch });
    world.blastWall(x, y, D.wall, true);
    const dir = enemy.lastHitDir ?? fromAngle(enemy.body.rotation), B = DEATH_FX.enemy.blow;
    world.effects.burst(x + dir.x * this.r, y + dir.y * this.r, Math.atan2(dir.y, dir.x), { ...B, color: B.color ?? this.color });
  }

  get pos() { return { x: this.x, y: this.y }; }

  pullOn(player) { return gravityPull(this.world, this.pos, player.body, C.death.pull); }

  step() {
    if (this.world.time >= this.endsAt) this.blast();
  }

  blast() {
    const w = this.world, D = C.death, { x, y, r, color } = this, sil = this.silhouette;
    w.deathFx.flare(sil.texture, x, y, this.view.rotation, { time: DEATH_FX.enemy.pop.time, w0: sil.width * D.end, h0: sil.height * D.end, w1: sil.width * 2.4, h1: sil.height * 2.4, color0: 0xffffff, color1: color, fade: 1.5 });
    w.deathFx.explode(x, y, r, color, D.blast);
    w.shove(this.pos, D.shove);
    w.holdStill(D.hold);
    w.sound('kill', this.pos, { pitch: this.pitch });
    w.sound('collapsarBlast', this.pos);
    this.destroy();
  }

  render(alpha) {
    const D = C.death, now = renderTime(this.world, alpha), k = clamp01((now - this.bornAt) / D.time);
    const step = this.lastNow === null ? 0 : Math.max(0, now - this.lastNow);
    this.lastNow = now;
    this.angle += D.spin * step;
    this.view.scale.set(lerp(1, D.end, k * k * (3 - 2 * k)));
    this.disc.rotation = this.angle;
    this.wisps.rotation = this.angle * C.outerPace;
    this.infall.render(this.x, this.y, step, D.infall, 1, D.pull.reach, this.r);
  }

  dispose() {
    this.world.gravities.delete(this);
    this.infall.destroy();
    this.view.destroy({ children: true });
  }
}
