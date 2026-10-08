// Dash visuals: at launch a ring bursts behind the body with sparks and a kick of mist; while
// dashing the body pulls long along its path, leaves fading afterimages and sheds speed
// streaks off its edges; it brakes with a small puff and wobbles back into shape; and a ring
// closes in on the body when the dash recharges (or a parry refunds it). While Exalted the
// afterimages turn dark red, the body trails flames and embers, and the launch flares harder.
// Driven from PlayerView.render; started by PlayerView.playDash.
import { Sprite } from 'pixi.js';
import { EXALTED_FX, PLAYER } from '../data/config.js';
import { clamp01, lerp, lerpColor, randRange } from '../engine/math.js';
import { tex } from '../render/assets.js';
import { Plume } from '../render/fx.js';

const X = PLAYER.dashFx, XE = X.exalted;
const DIAMETER = 2 * PLAYER.blob.radius * PLAYER.scale; // the body's size in world units at sizeScale 1
const GHOST_PAD = 1 / 0.9; // the ghost texture's ring spans 0.9 of its width
const DEG = Math.PI / 180;
const easeOut = (t) => 1 - (1 - t) ** 3;
// Stochastic rounding, so low rates still spawn at the right average.
const spawnCount = (rate, dt) => Math.floor(rate * dt + Math.random());
const pick = ([min, max]) => randRange(min, max);

export class DashView {
  constructor(player) {
    this.player = player;
    this.world = player.world;
    const { playerBack, fx } = this.world.layers;
    this.under = playerBack; // afterimages and the launch ring lie behind the body
    this.over = fx; // the recharge ring closes onto the body's outline, so it draws on top
    this.puffs = new Plume(playerBack, tex.mist, { drag: 4, zIndex: -45 });
    this.flames = new Plume(playerBack, tex.flame, { drag: 3, lift: 1.5, zIndex: -42 });
    this.embers = new Plume(fx, tex.spark, { drag: 1, lift: 1.2 });
    this.plumes = [this.puffs, this.flames, this.embers];
    this.rings = []; // pooled ghost sprites, see ring()

    this.time = 0; // local clock; stands still while paused
    this.dashing = false;
    this.startedAt = -Infinity;
    this.endedAt = -Infinity;
    this.angle = 0;
    this.dir = { x: 1, y: 0 };
    this.lastDrop = { x: 0, y: 0 }; // where the last afterimage fell
    this.ready = true;
    this.color = X.color;
    this.warmth = 0; // 0…1 Exalted glow, from the last render
  }

  start(dir) {
    if (this.dashing) this.end(this.player.body.pos);
    const p = this.player.body.pos, s = this.player.sizeScale, r = (DIAMETER / 2) * s;
    this.dashing = true;
    this.ready = false;
    this.startedAt = this.time;
    this.dir = { x: dir.x, y: dir.y };
    this.angle = Math.atan2(dir.y, dir.x);
    this.lastDrop = { x: p.x, y: p.y };

    const back = this.angle + Math.PI, bx = p.x - dir.x * r * 0.4, by = p.y - dir.y * r * 0.4;
    const L = X.launchRing;
    this.ring(this.under, { x: bx, y: by, follow: false, life: L.life, from: 1, to: L.to, ax: L.flatten, ay: 1, alpha: L.alpha, ease: easeOut });
    this.afterimage(p.x, p.y);
    this.world.effects.burst(bx, by, back, { ...X.launchSparks, color: this.color });
    this.kick(bx, by, back, X.puffs, s);

    const w = this.warmth;
    if (w <= 0) return;
    this.world.effects.burst(bx, by, back, { ...XE.launchSparks, count: Math.round(XE.launchSparks.count * w) });
    this.kick(p.x, p.y, back, { ...XE.launchSmoke, alpha: XE.launchSmoke.alpha * w }, s);
    this.world.camera.shake(XE.shake.duration, XE.shake.strength * w, XE.shake.frequency);
  }

  end(p) {
    this.dashing = false;
    this.endedAt = this.time;
    const s = this.player.sizeScale;
    this.kick(p.x + this.dir.x * DIAMETER * s * 0.4, p.y + this.dir.y * DIAMETER * s * 0.4, this.angle, X.brakePuffs, s);
  }

  // How far the body is pulled along the dash: 0 at rest, 1 fully stretched, briefly
  // negative (squashed) as it wobbles back after the dash.
  get stretch() {
    if (this.dashing) return easeOut(clamp01((this.time - this.startedAt) / X.stretchIn));
    const u = (this.time - this.endedAt) / X.settleTime;
    return u < 1 ? (1 - u) ** 2 * Math.cos(u * 1.5 * Math.PI) : 0;
  }

  // Applies the stretch to the body container, whose base scale is `scale`.
  shape(body, scale) {
    const e = this.stretch;
    body.rotation = this.angle;
    body.scale.set(scale * (1 + X.stretch * e), scale * (1 - X.squash * e));
  }

  // `p`: the interpolated body position; `warmth`: 0…1 Exalted glow.
  render(p, dt, warmth) {
    const player = this.player;
    if (this.dashing && !player.dashing) this.end(p);
    const ready = !player.dashing && player.now >= player.dashReadyAt;
    if (ready && !this.ready) {
      const R = X.ready;
      this.ring(this.over, { follow: true, life: R.life, from: R.from, to: 1, ax: 1, ay: 1, alpha: R.alpha, ease: easeOut, swell: true });
    }
    this.ready = ready;
    if (dt <= 0) return;
    this.time += dt;
    this.warmth = warmth;
    this.color = lerpColor(X.color, EXALTED_FX.tint, warmth);

    if (this.dashing) {
      // Afterimages at even spacing along the path, however far it went this frame.
      const step = X.afterimageSpacing * player.sizeScale;
      let dx = p.x - this.lastDrop.x, dy = p.y - this.lastDrop.y, d = Math.hypot(dx, dy);
      while (d >= step) {
        this.lastDrop.x += (dx / d) * step;
        this.lastDrop.y += (dy / d) * step;
        this.afterimage(this.lastDrop.x, this.lastDrop.y);
        dx = p.x - this.lastDrop.x; dy = p.y - this.lastDrop.y; d = Math.hypot(dx, dy);
      }
      // Speed streaks peeling off the body's flanks.
      const r = (DIAMETER / 2) * player.sizeScale, nx = -this.dir.y, ny = this.dir.x;
      for (let i = spawnCount(X.streakRate, dt); i > 0; i--) {
        const side = randRange(-1, 1) * r, behind = r * randRange(0, 0.6);
        this.world.effects.burst(p.x + nx * side - this.dir.x * behind, p.y + ny * side - this.dir.y * behind,
          this.angle + Math.PI, { ...X.streaks, color: this.color });
      }
      if (warmth > 0) this.burn(p, dt, r);
    }

    for (const g of this.rings) this.updateRing(g, p);
    for (const pl of this.plumes) pl.update(dt);
  }

  // Exalted: flame tongues streaming off the back of the body, and embers left along the path.
  burn(p, dt, r) {
    const w = this.warmth, F = XE.flames, E = XE.embers, d = this.dir, nx = -d.y, ny = d.x;
    for (let i = spawnCount(XE.flameRate * w, dt); i > 0; i--) {
      const side = randRange(-0.8, 0.8) * r, speed = pick(F.speed);
      this.flames.spawn({
        x: p.x + nx * side - d.x * r * 0.5, y: p.y + ny * side - d.y * r * 0.5,
        vx: -d.x * speed + nx * side * 2, vy: -d.y * speed + ny * side * 2,
        size: pick(F.size) * this.player.sizeScale, grow: 0.5, life: pick(F.life),
        color: F.color, fade: F.fade, alpha: F.alpha * w, sway: 3, orient: true,
      });
    }
    for (let i = spawnCount(XE.emberRate * w, dt); i > 0; i--) {
      this.embers.spawn({
        x: p.x + randRange(-r, r), y: p.y + randRange(-r, r), vx: randRange(-0.6, 0.6) - d.x, vy: -pick(E.speed) - d.y,
        size: pick(E.size), grow: 0.5, life: pick(E.life), color: E.color, fade: E.fade, sway: 5, orient: true,
      });
    }
  }

  // White, or dark red while Exalted: blended normally then, since added light can't be dark
  // and the overlapping rings would build up into a bright red tube.
  afterimage(x, y) {
    const e = this.stretch, w = this.warmth;
    this.ring(this.under, {
      x, y, follow: false, life: X.afterimageLife, from: 1, to: 1 - X.afterimageShrink,
      ax: 1 + X.stretch * e, ay: 1 - X.squash * e, ease: (t) => t,
      alpha: lerp(X.afterimageAlpha, XE.afterimageAlpha, w),
      color: lerpColor(X.afterimageColor, XE.afterimageColor, w),
      fade: lerpColor(X.afterimageFade, XE.afterimageFade, w),
      blendMode: w > 0.5 ? 'normal' : 'add',
    });
  }

  // Mist puffs fanning out around `angle`, in `o.color` → `o.fade` if given.
  kick(x, y, angle, o, s) {
    for (let i = 0; i < o.count; i++) {
      const a = angle + randRange(-o.spreadDeg, o.spreadDeg) * DEG, speed = o.speed * randRange(0.5, 1);
      this.puffs.spawn({
        x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, size: o.size * s * randRange(0.7, 1),
        grow: o.grow, life: o.life * randRange(0.7, 1), color: o.color ?? this.color, fade: o.fade ?? X.fade, alpha: o.alpha,
      });
    }
  }

  // A ghost of the body's ring on `layer`, sized from `from` to `to` × the body over `life`,
  // stretched ax × ay along / across the dash. It fades out, or swells in and out with `swell`,
  // shifts from `color` (default: the dash colour) to `fade` if given, and rides on the body
  // with `follow`. Glows (additive) unless `blendMode` says otherwise.
  ring(layer, o) {
    let g = this.rings.find((r) => !r.sprite.visible && r.layer === layer);
    if (!g) {
      const sprite = new Sprite({ texture: tex.dash_ghost, anchor: 0.5, zIndex: -40 });
      layer.addChild(sprite);
      g = { sprite, layer };
      this.rings.push(g);
    }
    Object.assign(g, { x: 0, y: 0, swell: false, color: this.color, fade: null, blendMode: 'add' }, o, {
      born: this.time, size: DIAMETER * GHOST_PAD * this.player.sizeScale, rotation: this.angle,
    });
    g.sprite.visible = true;
    g.sprite.blendMode = g.blendMode;
    this.updateRing(g, this.player.body.pos);
  }

  updateRing(g, p) {
    const s = g.sprite;
    if (!s.visible) return;
    const k = (this.time - g.born) / g.life;
    if (k >= 1) { s.visible = false; return; }
    const size = g.size * lerp(g.from, g.to, g.ease(k));
    s.position.set(g.follow ? p.x : g.x, g.follow ? p.y : g.y);
    s.rotation = g.rotation;
    s.width = size * g.ax;
    s.height = size * g.ay;
    s.alpha = g.alpha * (g.swell ? Math.sin(Math.PI * k) : 1 - k);
    s.tint = g.fade === null ? g.color : lerpColor(g.color, g.fade, k);
  }

  destroy() {
    for (const g of this.rings) g.sprite.destroy();
    for (const pl of this.plumes) pl.destroy();
  }
}
