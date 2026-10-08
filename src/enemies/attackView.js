// How enemy attacks read: one visual language for every enemy (tuning and the rules in
// ATTACK_FX). Abilities pick the view for their kind and the views derive everything
// from the ability's phase and timestamps, so nothing here affects the simulation.
//   EnemyAttackFx  per enemy: the wind-up glow, pose and tell (different for each attack),
//                  the parry cue, the strike pop, and a charging body's burn and afterimages.
//   ZoneView       per zone ability: the struck area, burning while it can hurt.
//   ChargeView     per throw: the projectiles' orbs growing where they will be released.
//   BeamView       per laser: the charge gathering at the muzzle, then the beam out to the
//                  wall, humming while it burns.
//   ProjectileLook a glowing orb with a comet trail, shared by projectiles and ChargeView.
import { Container, Graphics, Sprite } from 'pixi.js';
import { ATTACK_FX, FIXED_DT } from '../data/config.js';
import { clamp01, lerp, lerpColor, smoothStep01, randInsideUnitCircle, TAU } from '../engine/math.js';
import { sfx } from '../audio/sfx.js';
import { tex } from '../render/assets.js';
import { COMET_HEAD, ORB_PAD, RING_RADIUS } from '../render/sprites.js';

const X = ATTACK_FX, W = X.windup, S = X.strike, Z = X.zone, C = X.cue;
const FADE_IN = 0.1; // seconds for a wind-up's marks to appear
const DEG = Math.PI / 180;

// The simulation time a frame shows: bodies are interpolated from the previous step.
export const renderTime = (world, alpha) => world.time - (1 - alpha) * FIXED_DT;

// Wind-up progress, 0 → 1 as the attack is about to fire.
const progress = (a, now) => clamp01((now - a.phaseStartedAt) / Math.max(1e-3, a.phaseEndsAt - a.phaseStartedAt));
const easeOut = (t) => 1 - (1 - t) ** 2;
const tellOf = (a) => X.tells[a.data.tell] ?? X.tells.none;

function sprite(texture, parent, { blendMode = 'normal', tint = X.color } = {}) {
  const s = new Sprite(texture);
  s.anchor.set(0.5);
  s.blendMode = blendMode;
  s.tint = tint;
  s.visible = false;
  parent?.addChild(s);
  return s;
}

// ── per enemy ──────────────────────────────────────────────────────
export class EnemyAttackFx {
  // silhouette: { texture, width, height }, the white version of the enemy's outline.
  constructor(enemy, silhouette) {
    this.enemy = enemy;
    this.silhouette = silhouette;
    this.glow = sprite(tex.mist, null, { blendMode: 'add' });
    enemy.view.addChildAt(this.glow, 0);
    this.tint = sprite(silhouette.texture, enemy.view);
    this.tint.width = silhouette.width; this.tint.height = silhouette.height;
    this.tell = new Graphics(); // the wind-up's tell, redrawn each frame
    this.tell.blendMode = 'add';
    enemy.world.layers.fx.addChild(this.tell);
    this.afterimages = []; // { sprite, bornAt }, created on the first charge
    this.lastAfterimageAt = -Infinity;
    this.cues = []; // { halo, star } per cue point, created as needed
    this.sparkedCueAt = -Infinity; // the last cue whose sparks have flown
  }

  get radius() { return this.enemy.body.radius; }

  // A point in the enemy's frame → world, through its view as last placed (posed and
  // scaled by render).
  toWorld(p) {
    const v = this.enemy.view, c = Math.cos(v.rotation), s = Math.sin(v.rotation);
    const x = p.x * v.scale.x, y = p.y * v.scale.y;
    return { x: v.position.x + c * x - s * y, y: v.position.y + s * x + c * y };
  }

  // Poses the enemy's view (already placed at `p`, rotated to `rot`) and draws the wind-up
  // and strike effects. `visible`: whether the enemy is on screen.
  render(now, p, rot, visible) {
    const e = this.enemy, view = e.view, r = this.radius;
    let windup = null, burning = null, last = null;
    for (const a of e.abilities.values()) {
      if (a.phase === 'windup') windup = a;
      if (a.phase === 'active' && a.kind === 'body') burning = a;
      if (!last || a.strikeAt > last.strikeAt) last = a;
    }
    let glow = 0, tint = 0, tintColor = X.color, sx = 1, sy = 1, turn = 0;
    const g = this.tell;
    g.clear();
    g.position.set(p.x, p.y);
    g.rotation = rot;
    g.visible = visible;

    if (windup) {
      const tell = tellOf(windup);
      const elapsed = now - windup.phaseStartedAt, duration = windup.phaseEndsAt - windup.phaseStartedAt;
      const t = progress(windup, now), fade = clamp01(elapsed / FADE_IN), ease = smoothStep01(t);
      // The pulse quickens over the wind-up (phase is the integral of a linearly rising rate).
      const [r0, r1] = W.pulseSpeed;
      const pulse = 0.5 + 0.5 * Math.sin(TAU * (r0 * elapsed + ((r1 - r0) * elapsed * elapsed) / (2 * Math.max(1e-3, duration))));
      const strength = fade * lerp(0.5, 1, t);
      glow = W.glowAlpha * strength * lerp(0.6, 1, pulse);
      tint = W.tintAlpha * strength * lerp(0.7, 1, pulse);
      // The attack's pose, trembling harder as the strike nears.
      const lean = tell.lean * r * ease, j = randInsideUnitCircle(), shake = W.tremble * r * t;
      view.position.set(p.x - Math.cos(rot) * lean + j.x * shake, p.y - Math.sin(rot) * lean + j.y * shake);
      const swell = 1 + tell.swell * ease;
      sx = swell * (1 - tell.squash * ease);
      sy = swell * (1 + tell.squash * 0.5 * ease);
      turn = (tell.twist ?? 0) * DEG * ease;
      this.drawTell(tell, r, elapsed, t, W.alpha * fade * lerp(0.45, 1, t), 0);
    }

    // The strike: the body swells and flashes white-hot, and the tell bursts outward.
    const since = last ? now - last.strikeAt : Infinity;
    if (!windup && since >= 0 && since < S.popTime) {
      const k = since / S.popTime;
      sx = sy = 1 + S.pop * (1 - k) ** 2;
      tint = Math.max(tint, 1 - k);
      tintColor = X.hot;
      glow = Math.max(glow, W.glowAlpha * (1 - k));
    }
    // A swing whips through from its twist, past its facing, and settles back.
    const twist = last ? (tellOf(last).twist ?? 0) * DEG : 0;
    if (!windup && twist && since >= 0 && since < S.followTime) {
      const k = since / S.followTime;
      turn = k < 0.35 ? lerp(twist, -0.4 * twist, easeOut(k / 0.35)) : -0.4 * twist * (1 - smoothStep01((k - 0.35) / 0.65));
    }
    if (!windup && since >= 0 && since < S.releaseTime) {
      const k = since / S.releaseTime;
      this.drawTell(tellOf(last), r, 0, 1, W.alpha * (1 - k), easeOut(k) * S.releaseReach * r);
    }

    // A charging body burns and stretches along its path, leaving afterimages.
    if (burning) {
      const k = clamp01((now - burning.strikeAt) / 0.15);
      glow = W.glowAlpha;
      tint = Math.max(tint, W.tintAlpha);
      tintColor = lerpColor(X.hot, X.color, k);
      sx = 1 + X.body.stretch; sy = 1 - X.body.stretch * 0.6;
      if (now - this.lastAfterimageAt >= X.body.afterimageInterval) this.dropAfterimage(now, p, rot);
    }

    this.glow.visible = glow > 0;
    this.glow.alpha = glow;
    this.glow.width = this.glow.height = W.glowSize * r * 2;
    this.tint.visible = tint > 0;
    this.tint.alpha = Math.min(1, tint);
    this.tint.tint = tintColor;
    view.scale.set(sx, sy);
    view.rotation = rot + turn;
    this.updateAfterimages(now);
  }

  // The parry cue, once any rig has posed the enemy's weapon: a star flashing on each of the
  // latest cued attack's cue points, throwing sparks and a ring out as it appears.
  renderCue(now, visible) {
    let cued = null;
    for (const a of this.enemy.abilities.values()) if (!cued || a.cueAt > cued.cueAt) cued = a;
    const k = cued ? (now - cued.cueAt) / C.time : -1;
    const points = visible && k >= 0 && k < 1 ? cued.cuePoints().map((p) => this.toWorld(p)) : [];
    const fx = this.enemy.world.layers.fx;
    while (this.cues.length < points.length) {
      this.cues.push({
        halo: sprite(tex.mist, fx, { blendMode: 'add', tint: C.haloColor }),
        ring: sprite(tex.ring, fx, { blendMode: 'add', tint: C.color }),
        star: sprite(tex.glint, fx, { blendMode: 'add', tint: C.color }),
        core: sprite(tex.glint, fx, { blendMode: 'add', tint: C.coreColor }),
      });
    }
    if (points.length && cued.cueAt !== this.sparkedCueAt) {
      this.sparkedCueAt = cued.cueAt;
      for (const p of points) this.enemy.world.effects.burst(p.x, p.y, 0, C.sparks);
    }
    const s = k < C.rise ? easeOut(k / C.rise) : 1 - smoothStep01((k - C.rise) / (1 - C.rise));
    const scale = Math.sqrt(this.radius / 0.5), size = scale * s;
    const R = lerp(C.ring.from, C.ring.to, easeOut(k)) * scale;
    this.cues.forEach((cue, i) => {
      const p = points[i], { halo, ring } = cue;
      for (const sp of Object.values(cue)) sp.visible = !!p;
      if (!p) return;
      halo.position.set(p.x, p.y);
      halo.width = halo.height = C.haloSize * size;
      halo.alpha = C.haloAlpha * s;
      ring.position.set(p.x, p.y);
      ring.width = ring.height = R / RING_RADIUS;
      ring.alpha = C.ring.alpha * (1 - k);
      // The star and its core: one shape at two sizes.
      for (const [sp, part] of [[cue.star, 1], [cue.core, C.core]]) {
        sp.position.set(p.x, p.y);
        sp.rotation = C.spin * k;
        sp.width = C.size * C.stretch * size * part;
        sp.height = C.size * size * part;
      }
    });
  }

  // Draws a tell in the enemy's frame (+x forward). `t`: wind-up progress, the tell tightening
  // to land at 1; `out`: how far it has burst outward since the strike.
  drawTell(tell, r, elapsed, t, alpha, out) {
    if (alpha <= 0) return;
    const g = this.tell, color = lerpColor(X.color, X.hot, 0.3 * t);
    const radius = () => lerp(r * (1 + tell.reach), r * tell.to, t) + out;
    switch (tell.shape) {
      case 'ring': {
        const R = radius();
        this.stroke(color, alpha, () => g.circle(0, 0, R));
        break;
      }
      case 'arc': {
        const half = (tell.arcDeg * Math.PI) / 360;
        for (let i = 0; i < tell.lines; i++) {
          const R = radius() + i * 0.25 * r;
          this.stroke(color, alpha * (1 - i * 0.35), () => g.moveTo(Math.cos(-half) * R, Math.sin(-half) * R).arc(0, 0, R, -half, half));
        }
        break;
      }
      case 'chevrons': {
        // Streams forward, speeding up from 1 to 3.5 spacings a second (its integral).
        const flow = elapsed * (1 + 1.25 * t) + out / (tell.spacing * r);
        const size = tell.size * r;
        for (let i = 0; i < tell.count; i++) {
          const u = (i + (flow % 1)) / tell.count; // 0 → 1 along the stream
          const x = r * 1.05 + u * tell.count * tell.spacing * r + size * 0.8;
          this.stroke(color, alpha * Math.sin(Math.PI * u), () => g.moveTo(x - size * 0.8, -size).lineTo(x, 0).lineTo(x - size * 0.8, size));
        }
        break;
      }
      case 'focus': {
        // Short streaks pointing at the muzzle, spiralling inward as the charge gathers.
        const cx = tell.at * r, R = lerp(r * tell.reach, r * tell.to, t) + out, len = r * 0.25 * (1 - 0.5 * t);
        const spin = elapsed * 2.5;
        for (let i = 0; i < tell.count; i++) {
          const a = (TAU * i) / tell.count + spin, c = Math.cos(a), s = Math.sin(a);
          this.stroke(color, alpha, () => g.moveTo(cx + c * (R + len), s * (R + len)).lineTo(cx + c * R, s * R));
        }
        break;
      }
    }
  }

  // A crisp line with a soft halo, along the path `path` draws (once per stroke).
  stroke(color, alpha, path) {
    if (alpha <= 0) return;
    path().stroke({ width: W.lineWidth * 3, color, alpha: alpha * 0.3 });
    path().stroke({ width: W.lineWidth, color: lerpColor(color, X.hot, 0.35), alpha });
  }

  dropAfterimage(now, p, rot) {
    this.lastAfterimageAt = now;
    let slot = this.afterimages.find((s) => now - s.bornAt >= X.body.afterimageLife);
    if (!slot) {
      const s = sprite(this.silhouette.texture, this.enemy.world.layers.telegraphs, { blendMode: 'add' });
      slot = { sprite: s, bornAt: now };
      this.afterimages.push(slot);
    }
    slot.bornAt = now;
    const s = slot.sprite;
    s.position.set(p.x, p.y);
    s.rotation = rot;
    s.width = this.silhouette.width; s.height = this.silhouette.height;
    s.visible = true;
    const B = X.body.sparks;
    this.enemy.world.effects.burst(p.x, p.y, rot + Math.PI, { ...B, color: X.color });
  }

  updateAfterimages(now) {
    for (const { sprite: s, bornAt } of this.afterimages) {
      const k = (now - bornAt) / X.body.afterimageLife;
      s.visible = k >= 0 && k < 1;
      s.alpha = X.body.afterimageAlpha * (1 - k);
    }
  }

  destroy() {
    this.tell.destroy();
    for (const { sprite: s } of this.afterimages) s.destroy();
    for (const cue of this.cues) for (const sp of Object.values(cue)) sp.destroy();
  }
}


// ── per ability ────────────────────────────────────────────────────
// A zone attack's area, shown only once it strikes (the wind-up never gives away where it
// will land). Shapes are in the enemy's local frame, +x forward:
//   { type: 'box', near, far, hh }         from `near` to `far` ahead, `hh` to each side
//   { type: 'circle', r, from, growTime }  all around, spreading from radius `from` to `r`
//                                          over `growTime` if given
// The area stays where it was struck, or where the ability pins it. It burns from the
// ability's `zoneAt`.
export class ZoneView {
  constructor(ability, shape) {
    this.ability = ability;
    this.shape = shape;
    this.r = shape.r; // a spreading circle's radius as last drawn
    this.gfx = new Graphics();
    this.gfx.blendMode = 'add';
    this.gfx.visible = false;
    ability.world.layers.telegraphs.addChild(this.gfx);
  }

  // `at`: { x, y, rotation } to pin the area there instead of on the enemy.
  strike(at) {
    const b = this.ability.enemy.body;
    this.gfx.position.set(at?.x ?? b.pos.x, at?.y ?? b.pos.y);
    this.gfx.rotation = at?.rotation ?? b.rotation;
    this.strikeSparks();
  }

  strikeSparks() {
    const { x, y } = this.gfx.position, rot = this.gfx.rotation, s = this.shape, fx = this.ability.world.effects;
    if (s.type === 'circle') {
      const r = s.from ?? s.r, n = Math.max(6, Math.round((TAU * r) / (Z.sparkSpacing * 2)));
      const opts = { ...Z.sparks, count: Math.ceil(Z.sparks.count / 2), color: X.color };
      for (let i = 0; i < n; i++) {
        const a = (TAU * i) / n;
        fx.burst(x + Math.cos(a) * r, y + Math.sin(a) * r, a, opts);
      }
      return;
    }
    // Along the far edge, flying forward.
    const c = Math.cos(rot), sn = Math.sin(rot);
    const n = Math.max(2, Math.round((s.hh * 2) / Z.sparkSpacing));
    for (let i = 0; i < n; i++) {
      const side = lerp(-s.hh, s.hh, (i + 0.5) / n);
      fx.burst(x + c * s.far - sn * side, y + sn * s.far + c * side, rot, { ...Z.sparks, color: X.color });
    }
  }

  render(now) {
    const a = this.ability, g = this.gfx, s = this.shape;
    g.clear();
    g.visible = true;
    if (a.phase === 'active') {
      if (now < a.zoneAt) return;
      const since = now - a.zoneAt;
      if (s.growTime) this.r = lerp(s.from, s.r, easeOut(clamp01(since / s.growTime)));
      this.drawBurn(since, now);
    } else if (a.phase !== 'windup') {
      const k = (now - a.activeEndedAt) / Z.fadeTime;
      if (k >= 0 && k < 1) this.fill(Z.burnAlpha * (1 - k), X.color);
    }
  }

  // A white-hot flash settling into a flickering burn, with a band sweeping across it (the
  // rim of a spreading circle).
  drawBurn(since, now) {
    const s = this.shape, sweepTime = s.growTime ?? Z.sweepTime;
    const flash = Math.max(0, 1 - since / Z.flashTime);
    const color = lerpColor(X.color, X.hot, flash * 0.75);
    this.fill(Z.burnAlpha + Z.flicker * Math.sin(now * 55) + Z.flashAlpha * flash, color);
    this.outline(color, 0.6 + 0.4 * flash);
    if (since < sweepTime) this.sweep(easeOut(since / sweepTime), X.hot, 1 - since / sweepTime);
  }

  // Shape geometry ------------------------------------------------------
  path() {
    const g = this.gfx, s = this.shape;
    if (s.type === 'circle') return g.circle(0, 0, this.r);
    return g.rect(s.near, -s.hh, s.far - s.near, s.hh * 2);
  }

  outline(color, alpha) { this.path().stroke({ width: Z.outlineWidth, color, alpha }); }

  fill(alpha, color) {
    if (alpha > 0) this.path().fill({ color, alpha: clamp01(alpha) });
  }

  // A bright band at fraction t of the way across the area: a ring for circles (at the rim
  // of a spreading one), a bar for boxes.
  sweep(t, color, alpha) {
    const g = this.gfx, s = this.shape, width = Z.sweepWidth;
    if (s.type === 'circle') {
      const r = s.growTime ? this.r : s.r * t;
      if (r > width) g.circle(0, 0, r).stroke({ width, color, alpha });
      return;
    }
    g.rect(lerp(s.near, s.far, t) - width / 2, -s.hh, width, s.hh * 2).fill({ color, alpha: clamp01(alpha) });
  }

  destroy() { this.gfx.destroy(); }
}

// A throw: each projectile's orb grows over the wind-up exactly where it will be released
// (the ability's chargePoints).
export class ChargeView {
  constructor(ability) {
    this.ability = ability;
    this.looks = []; // one per charge point, created as needed
  }

  strike() {}

  render(now, alpha) {
    const a = this.ability;
    const points = a.phase === 'windup' && a.player ? a.chargePoints(alpha) : [];
    while (this.looks.length < points.length) this.looks.push(new ProjectileLook(a.world.layers.projectiles, { trail: false }));
    const t = progress(a, now);
    const size = a.data.projectileSize * lerp(X.projectile.chargeFrom, 1, t);
    const glow = clamp01((now - a.phaseStartedAt) / FADE_IN) * lerp(0.4, 1, t);
    this.looks.forEach((look, i) => {
      const pt = points[i];
      look.container.visible = !!pt;
      if (pt) look.render(now, pt.x, pt.y, pt.rot, size, { glow });
    });
  }

  destroy() { for (const look of this.looks) look.destroy(); }
}

// A laser: the charge gathers at the muzzle over the wind-up (brightening once the aim
// locks), then the beam reaches out to the wall the hitbox found, flickering and throwing
// sparks off the wall until it stops. Hums while it burns.
export class BeamView {
  constructor(ability) {
    this.ability = ability;
    this.muzzle = new ProjectileLook(ability.world.layers.projectiles, { trail: false });
    this.gfx = new Graphics();
    this.gfx.blendMode = 'add';
    ability.world.layers.projectiles.addChild(this.gfx);
    this.hum = null; // sfx loop handle
    this.lastSparkAt = -Infinity;
  }

  strike() {}

  render(now, alpha, dt) {
    const a = this.ability, B = X.beam, shape = a.hitbox.shape, g = this.gfx;
    const p = a.enemy.body.lerpPos(alpha), rot = a.enemy.body.lerpRotation(alpha), c = Math.cos(rot), s = Math.sin(rot);
    g.clear();
    g.position.set(p.x, p.y);
    g.rotation = rot;

    // Beam strength: grows in on the strike, fades once it stops.
    let k = 0;
    if (a.phase === 'active') k = clamp01((now - a.strikeAt) / B.growTime);
    else if (a.phase !== 'windup') k = 1 - clamp01((now - a.activeEndedAt) / B.fadeTime);

    const charging = a.phase === 'windup';
    this.muzzle.container.visible = charging || k > 0;
    if (charging) {
      const t = progress(a, now), fade = clamp01((now - a.phaseStartedAt) / FADE_IN);
      this.muzzle.render(now, p.x + c * shape.from, p.y + s * shape.from, rot, a.data.orbSize * lerp(X.projectile.chargeFrom, 1, t), {
        glow: fade * lerp(0.4, 1, t) * (a.locked ? B.lockGlow : 1),
      });
    } else if (k > 0) {
      this.muzzle.render(now, p.x + c * shape.from, p.y + s * shape.from, rot, a.data.orbSize * k, { glow: B.lockGlow * k });
      if (shape.length > 0) this.drawBeam(now, k, shape);
      if (a.phase === 'active' && now - this.lastSparkAt >= B.sparkInterval) {
        this.lastSparkAt = now;
        const end = shape.from + shape.length;
        a.world.effects.burst(p.x + c * end, p.y + s * end, rot + Math.PI, { ...B.sparks, color: X.color });
      }
    }
    this.updateHum(a.phase === 'active', p, dt);
  }

  // In the enemy's frame, +x forward.
  drawBeam(now, k, shape) {
    const g = this.gfx, B = X.beam, a = this.ability;
    const flash = a.phase === 'active' ? Math.max(0, 1 - (now - a.strikeAt) / B.flashTime) : 0;
    const w = shape.r * 2 * k * (1 + B.flicker * Math.sin(now * 60)) * (1 + 0.6 * flash);
    const x0 = shape.from, len = shape.length, color = lerpColor(X.color, X.hot, flash * 0.6);
    const band = (width, fill) => g.rect(x0, -width / 2, len, width).fill(fill);
    band(w * B.glowWidth, { color: X.color, alpha: 0.18 * k });
    band(w, { color, alpha: 0.55 * k });
    band(w * B.coreWidth, { color: X.hot, alpha: 0.95 * k });
    g.circle(x0 + len, 0, w * 0.9).fill({ color, alpha: 0.5 * k });
    g.circle(x0 + len, 0, w * 0.45).fill({ color: X.hot, alpha: 0.8 * k });
  }

  // Hushed while paused (dt = 0) and faded with distance like any positional sound.
  updateHum(on, p, dt) {
    if (on && !this.hum) this.hum = sfx.loop('laser', { fadeIn: 0.05 });
    else if (!on && this.hum) { this.hum.stop(0.15); this.hum = null; }
    this.hum?.setLevel(dt > 0 ? this.ability.world.positional(p).volume : 0);
  }

  destroy() {
    this.hum?.stop(0.1);
    this.muzzle.destroy();
    this.gfx.destroy();
  }
}

// A hostile orb: a pulsing glow around a white-hot core, with a comet trail behind it.
export class ProjectileLook {
  constructor(parent, { trail = true } = {}) {
    this.container = new Container();
    this.glow = sprite(tex.mist, this.container, { blendMode: 'add' });
    this.trail = trail ? sprite(tex.comet, this.container, { blendMode: 'add' }) : null;
    this.trail?.anchor.set(COMET_HEAD, 0.5);
    this.core = sprite(tex.orb, this.container, { tint: X.hot });
    for (const s of this.container.children) s.visible = true;
    parent.addChild(this.container);
  }

  // `trailLength`: how much trail to show (it grows from the release point).
  render(now, x, y, rot, size, { glow = 1, trailLength = 0 } = {}) {
    const P = X.projectile;
    const pulse = 0.5 + 0.5 * Math.sin(now * P.pulseSpeed * TAU);
    this.container.position.set(x, y);
    this.glow.width = this.glow.height = size * P.glowSize * lerp(0.9, 1.1, pulse);
    this.glow.alpha = P.glowAlpha * glow * lerp(0.75, 1, pulse);
    this.core.width = this.core.height = size * ORB_PAD;
    if (!this.trail) return;
    this.trail.visible = trailLength > 0.01;
    this.trail.rotation = rot;
    this.trail.width = trailLength / COMET_HEAD;
    this.trail.height = size * P.trailWidth * 1.25;
  }

  destroy() { this.container.destroy({ children: true }); }
}
