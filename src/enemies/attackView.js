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
//   MistBallLook   the same for the Seer's balls of blue mist.
//   CrescentLook   the same for the Lemur's spinning crescents.
//   BlobLook       the same for the Blight's blobs of goo.
//   HeadLook       the same for its heads flying free.
//   CueFlash       one parry cue star (EnemyAttackFx's, or one an attack shows on its own).
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { ATTACK_FX, BLOB as BL, CRESCENT as CR, FIXED_DT, MIST_BALL as M } from '../data/config.js';
import { clamp01, lerp, lerpColor, smoothStep01, randInsideUnitCircle, TAU } from '../engine/math.js';
import { sfx } from '../audio/sfx.js';
import { tex } from '../render/assets.js';
import { COMET_HEAD, HEAD_ART, ORB_PAD, RING_RADIUS, blightHeads } from '../render/sprites.js';

const X = ATTACK_FX, W = X.windup, S = X.strike, Z = X.zone, C = X.cue;
const FADE_IN = 0.1; // seconds for a wind-up's marks to appear
const DEG = Math.PI / 180;

// The simulation time a frame shows: bodies are interpolated from the previous step.
export const renderTime = (world, alpha) => world.time - (1 - alpha) * FIXED_DT;

// Wind-up progress, 0 → 1 as the attack is about to fire.
const progress = (a, now) => clamp01((now - a.phaseStartedAt) / Math.max(1e-3, a.phaseEndsAt - a.phaseStartedAt));
const easeOut = (t) => 1 - (1 - t) ** 2;
const tellOf = (a) => X.tells[a.data.tell] ?? X.tells.none;
// A swing's twist (radians), toward the side it comes from if the ability has a `side`.
const twistOf = (a) => (tellOf(a).twist ?? 0) * (a.side ?? 1) * DEG;

// How far (radians) a twisted body has turned `since` its strike: whipping through from its
// twist, past its facing, and settling back. 0 for an untwisted one. A held weapon turns with
// it, so its hitbox does too (SwingAbility).
export function followThrough(a, since) {
  const twist = twistOf(a);
  if (!twist || since < 0 || since >= S.followTime) return 0;
  const k = since / S.followTime;
  return k < 0.35 ? lerp(twist, -0.4 * twist, easeOut(k / 0.35)) : -0.4 * twist * (1 - smoothStep01((k - 0.35) / 0.65));
}

// A charging body's stretch along its facing (x) and across it (y), held weapon and all.
export const CHARGE_STRETCH = { x: 1 + X.body.stretch, y: 1 - X.body.stretch * 0.6 };

// A soft wedge (see ATTACK_FX.body.arcMask) masking a charge's burn to the front `arcDeg`
// of its hitbox: white, opaque inside the arc, fading out across its sides. Pointing along
// +x from the middle (the hitbox's centre).
const arcMaskTextures = new Map(); // by arcDeg
function arcMaskTexture(arcDeg) {
  let texture = arcMaskTextures.get(arcDeg);
  if (texture) return texture;
  const N = 128, c = document.createElement('canvas');
  c.width = c.height = N;
  const ctx = c.getContext('2d'), img = ctx.createImageData(N, N), half = arcDeg / 2;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const deg = Math.abs(Math.atan2(y + 0.5 - N / 2, x + 0.5 - N / 2)) / DEG;
      const i = (y * N + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(255 * (1 - smoothStep01((deg - half) / X.body.arcMask.fadeDeg + 0.5)));
    }
  }
  ctx.putImageData(img, 0, 0);
  texture = Texture.from(c);
  arcMaskTextures.set(arcDeg, texture);
  return texture;
}

// A charge's glow in the enemy's own shape (see ATTACK_FX.body.halo): its white
// silhouette blurred, with `pad` of its size spare on each side for the blur to spread into.
const haloTextures = new Map(); // by silhouette texture
function haloTexture(silhouette) {
  let texture = haloTextures.get(silhouette);
  if (texture) return texture;
  const H = X.body.halo, src = silhouette.source.resource, w = src.width, h = src.height;
  const c = document.createElement('canvas');
  c.width = Math.round(w * (1 + 2 * H.pad));
  c.height = Math.round(h * (1 + 2 * H.pad));
  const ctx = c.getContext('2d');
  ctx.filter = `blur(${H.blur * Math.max(w, h)}px)`;
  for (let i = 0; i < H.passes; i++) ctx.drawImage(src, w * H.pad, h * H.pad);
  texture = Texture.from(c);
  haloTextures.set(silhouette, texture);
  return texture;
}

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
    this.arcMasks = null; // [glow's, tint's], cutting a charge's burn to its hitbox, created as needed
    this.maskedArc = null; // the hitbox shape they are cut to, if any
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
      if (a.phase === 'active' && a.kind === 'body' && (a.burning ?? true)) burning = a; // `burning`: false while a charge's weapon does the hurting
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
      turn = twistOf(windup) * ease;
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
    if (!windup && last) turn = followThrough(last, since);
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
      ({ x: sx, y: sy } = CHARGE_STRETCH);
      if (now - this.lastAfterimageAt >= X.body.afterimageInterval) this.dropAfterimage(now, p, rot);
    }

    // A charge that hurts only across its front glows in its own shape, cut to that front.
    const shaped = burning?.hitbox.shape.arcDeg ? burning.hitbox.shape : null, H = X.body.halo;
    this.maskToArc(shaped);
    this.glow.visible = glow > 0;
    this.glow.texture = shaped ? haloTexture(this.silhouette.texture) : tex.mist;
    if (shaped) {
      this.glow.alpha = H.alpha;
      this.glow.width = this.silhouette.width * (1 + 2 * H.pad);
      this.glow.height = this.silhouette.height * (1 + 2 * H.pad);
    } else {
      this.glow.alpha = glow;
      this.glow.width = this.glow.height = W.glowSize * r * 2;
    }
    this.tint.visible = tint > 0;
    this.tint.alpha = Math.min(1, tint);
    this.tint.tint = tintColor;
    view.scale.set(sx, sy);
    view.rotation = rot + turn;
    this.updateAfterimages(now);
  }

  // A charge that hurts only across its front (a hitbox `shape` with `arcDeg`) burns only
  // there: its glow and tint are cut to that arc, fading away across its sides (see
  // arcMaskTexture). Null: uncut. The masks are only on the view while in use, as a mask off
  // duty would be drawn like anything else.
  maskToArc(shape) {
    if (shape === this.maskedArc) return;
    this.maskedArc = shape;
    if (!shape) {
      this.glow.mask = this.tint.mask = null;
      for (const m of this.arcMasks) m.removeFromParent();
      return;
    }
    const s = this.silhouette, size = 2 * Math.max(s.width, s.height) * (1 + 2 * X.body.halo.pad); // past the halo
    this.arcMasks ??= [new Sprite(), new Sprite()];
    for (const m of this.arcMasks) {
      m.texture = arcMaskTexture(shape.arcDeg);
      m.anchor.set(0.5);
      m.position.set(shape.forward ?? 0, 0);
      m.width = m.height = size;
      this.enemy.view.addChild(m);
    }
    [this.glow.mask, this.tint.mask] = this.arcMasks;
  }

  // The parry cue, once any rig has posed the enemy's weapon: a star flashing on each of the
  // latest cued attack's cue points, throwing sparks and a ring out as it appears.
  renderCue(now, visible) {
    let cued = null;
    for (const a of this.enemy.abilities.values()) if (!cued || a.cueAt > cued.cueAt) cued = a;
    const k = cued ? (now - cued.cueAt) / C.time : -1;
    const points = visible && k >= 0 && k < 1 ? cued.cuePoints().map((p) => this.toWorld(p)) : [];
    while (this.cues.length < points.length) this.cues.push(new CueFlash(this.enemy.world));
    if (points.length && cued.cueAt !== this.sparkedCueAt) {
      this.sparkedCueAt = cued.cueAt;
      for (const cue of this.cues) cue.sparked = false;
    }
    const scale = Math.sqrt(this.radius / 0.5);
    this.cues.forEach((cue, i) => cue.render(points[i] ?? null, k, scale));
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
    this.maskToArc(null);
    for (const m of this.arcMasks ?? []) m.destroy();
    for (const { sprite: s } of this.afterimages) s.destroy();
    for (const cue of this.cues) cue.destroy();
  }
}

// One parry cue star at a world point (see ATTACK_FX.cue), throwing its sparks the first
// frame it shows (again once `sparked` is reset).
export class CueFlash {
  constructor(world) {
    this.world = world;
    const fx = world.layers.fx;
    this.sprites = {
      halo: sprite(tex.mist, fx, { blendMode: 'add', tint: C.haloColor }),
      ring: sprite(tex.ring, fx, { blendMode: 'add', tint: C.color }),
      star: sprite(tex.glint, fx, { blendMode: 'add', tint: C.color }),
      core: sprite(tex.glint, fx, { blendMode: 'add', tint: C.coreColor }),
    };
    this.sparked = false;
  }

  // `p`: where, or null to hide; `k`: 0 → 1 through the cue's time; `scale`: its size.
  render(p, k, scale) {
    const { halo, ring, star, core } = this.sprites, on = !!p && k >= 0 && k < 1;
    for (const sp of Object.values(this.sprites)) sp.visible = on;
    if (!on) return;
    if (!this.sparked) {
      this.sparked = true;
      this.world.effects.burst(p.x, p.y, 0, C.sparks);
    }
    const s = k < C.rise ? easeOut(k / C.rise) : 1 - smoothStep01((k - C.rise) / (1 - C.rise));
    const size = scale * s, R = lerp(C.ring.from, C.ring.to, easeOut(k)) * scale;
    halo.position.set(p.x, p.y);
    halo.width = halo.height = C.haloSize * size;
    halo.alpha = C.haloAlpha * s;
    ring.position.set(p.x, p.y);
    ring.width = ring.height = R / RING_RADIUS;
    ring.alpha = C.ring.alpha * (1 - k);
    // The star and its core: one shape at two sizes.
    for (const [sp, part] of [[star, 1], [core, C.core]]) {
      sp.position.set(p.x, p.y);
      sp.rotation = C.spin * k;
      sp.width = C.size * C.stretch * size * part;
      sp.height = C.size * size * part;
    }
  }

  destroy() { for (const sp of Object.values(this.sprites)) sp.destroy(); }
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
    ability.world.layers.zones.addChild(this.gfx);
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

// A throw: each projectile's orb grows exactly where it will be released (the ability's
// chargePoints) while the ability says one is forming (its charge: over the wind-up, unless
// it says otherwise, or a point's own `t`), to `chargeSize` if given, else the projectile's size.
export class ChargeView {
  constructor(ability) {
    this.ability = ability;
    this.Look = PROJECTILE_LOOKS[ability.data.look ?? 'orb'];
    this.looks = []; // one per charge point, created as needed
  }

  strike() {}

  render(now, alpha) {
    const a = this.ability, d = a.data, c = a.player ? a.charge(now) : null;
    const points = c ? a.chargePoints(alpha, now) : [];
    while (this.looks.length < points.length) this.looks.push(new this.Look(a.world.layers.projectiles, { trail: false }));
    const fade = clamp01((c?.since ?? 0) / FADE_IN);
    this.looks.forEach((look, i) => {
      const pt = points[i];
      look.container.visible = !!pt;
      if (!pt) return;
      const t = pt.t ?? c.t; // a point can say how far its own orb has formed
      look.render(now, pt.x, pt.y, pt.rot, (d.chargeSize ?? d.projectileSize) * lerp(X.projectile.chargeFrom, 1, t), { glow: fade * lerp(0.4, 1, t) });
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
// `color`: what it bursts into when it breaks; `maxTrail`: how long its trail grows.
export class ProjectileLook {
  get color() { return X.color; }
  get maxTrail() { return X.projectile.trailLength; }

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

// A Seer's ball of mist (MIST_BALL): a dark heart wrapped in glowing blue mist that swirls
// around it, with a faint glimmer at the centre and, once hurled, a trail. Drawn like
// ProjectileLook; `alpha` fades the whole ball.
export class MistBallLook {
  get color() { return M.color; }
  get maxTrail() { return M.trail; }

  constructor(parent, { trail = true } = {}) {
    this.container = new Container();
    this.halo = sprite(tex.mist, this.container, { blendMode: 'add', tint: M.color });
    this.trail = trail ? sprite(tex.comet, this.container, { blendMode: 'add', tint: M.color }) : null;
    this.trail?.anchor.set(COMET_HEAD, 0.5);
    this.core = sprite(tex.orb, this.container, { tint: M.deep });
    this.puffs = Array.from({ length: M.puffs.count }, (_, i) => sprite(tex.mist, this.container, { blendMode: 'add', tint: i % 2 ? M.bright : M.color }));
    this.heart = sprite(tex.mist, this.container, { blendMode: 'add', tint: M.bright });
    for (const s of this.container.children) s.visible = true;
    parent.addChild(this.container);
  }

  render(now, x, y, rot, size, { glow = 1, trailLength = 0, alpha = 1 } = {}) {
    const P = M.puffs, pulse = 0.5 + 0.5 * Math.sin(now * M.pulseSpeed * TAU);
    this.container.position.set(x, y);
    this.container.alpha = alpha;
    this.halo.width = this.halo.height = size * M.halo.size * lerp(0.92, 1.08, pulse);
    this.halo.alpha = M.halo.alpha * glow;
    this.core.width = this.core.height = size * M.core.size * ORB_PAD;
    this.core.alpha = M.core.alpha;
    // Every other puff circles the other way, each swelling and fading out of step.
    this.puffs.forEach((s, i) => {
      const a = now * P.spin * (i % 2 ? -1 : 1) + (TAU * i) / P.count, wobble = 0.5 + 0.5 * Math.sin(now * 2.3 + i * 1.7);
      s.position.set(Math.cos(a) * P.orbit * size, Math.sin(a) * P.orbit * size);
      s.rotation = a;
      s.width = s.height = size * P.size * lerp(0.85, 1.15, wobble);
      s.alpha = P.alpha * glow * lerp(0.6, 1, wobble);
    });
    this.heart.width = this.heart.height = size * M.heart.size * lerp(0.8, 1.2, pulse);
    this.heart.alpha = M.heart.alpha * glow;
    if (!this.trail) return;
    this.trail.visible = trailLength > 0.01;
    this.trail.rotation = rot;
    this.trail.width = trailLength / COMET_HEAD;
    this.trail.height = size * M.trailWidth;
  }

  destroy() { this.container.destroy({ children: true }); }
}

// A Lemur's crescent (CRESCENT): the hostile orb's glow round a white-hot crescent spinning
// like a boomerang (`spin`: 1 or -1, the way it turns), with a streak trailing back along
// the curve it has flown. Drawn like ProjectileLook.
export class CrescentLook {
  get color() { return X.color; }
  get maxTrail() { return X.projectile.trailLength; }

  constructor(parent, { trail = true, spin = 1 } = {}) {
    this.trail = trail ? new Graphics() : null;
    if (this.trail) {
      this.trail.blendMode = 'add';
      parent.addChild(this.trail);
    }
    this.container = new Container();
    this.glow = sprite(tex.mist, this.container, { blendMode: 'add' });
    this.core = sprite(tex.crescent, this.container, { tint: X.hot });
    for (const s of this.container.children) s.visible = true;
    parent.addChild(this.container);
    this.spin = spin;
    this.path = []; // where it has been, oldest first: [{ x, y }]
  }

  render(now, x, y, rot, size, { glow = 1, trailLength = 0 } = {}) {
    const pulse = 0.5 + 0.5 * Math.sin(now * CR.pulseSpeed * TAU);
    this.container.position.set(x, y);
    this.glow.width = this.glow.height = size * CR.glowSize * lerp(0.9, 1.1, pulse);
    this.glow.alpha = CR.glowAlpha * glow * lerp(0.75, 1, pulse);
    this.core.width = this.core.height = size * ORB_PAD;
    this.core.rotation = now * CR.spin * this.spin;
    if (this.trail) this.drawTrail(x, y, size, trailLength);
  }

  // Back along the last `length` of its path from (x, y), tapering and fading to nothing:
  // a band in the glow's colour round a white-hot core.
  drawTrail(x, y, size, length) {
    const path = this.path, last = path[path.length - 1], g = this.trail;
    if (!last || Math.hypot(x - last.x, y - last.y) > 0.03) path.push({ x, y });
    const pts = [{ x, y, d: 0 }];
    for (let i = path.length - 1; i >= 0 && pts[pts.length - 1].d < length; i--) {
      const q = pts[pts.length - 1], p = path[i], d = q.d + Math.hypot(p.x - q.x, p.y - q.y);
      if (d > q.d + 1e-4) pts.push({ x: p.x, y: p.y, d });
    }
    path.splice(0, Math.max(0, path.length - pts.length - 1)); // forget what has fallen off its end
    g.clear();
    if (pts.length < 2 || length <= 0.01) return;
    // Each point's offset across the trail, from the way it runs through there.
    const across = pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
      return { x: -dy / l, y: dx / l, k: Math.max(0, 1 - p.d / length) };
    });
    for (const [width, color, alpha] of [[CR.trailWidth, X.color, CR.trailAlpha], [CR.trailWidth * 0.35, X.hot, CR.trailAlpha]]) {
      const w = size * width;
      for (let i = 0; i < pts.length - 1; i++) {
        const p = pts[i], q = pts[i + 1], n = across[i], m = across[i + 1];
        const wp = w * n.k, wq = w * m.k;
        g.poly([p.x + n.x * wp, p.y + n.y * wp, q.x + m.x * wq, q.y + m.y * wq, q.x - m.x * wq, q.y - m.y * wq, p.x - n.x * wp, p.y - n.y * wp])
          .fill({ color, alpha: alpha * n.k });
      }
    }
  }

  destroy() {
    this.trail?.destroy();
    this.container.destroy({ children: true });
  }
}

// A Blight's blob of goo (BLOB): a dark green ball wobbling in a sickly glow, a gleam on it
// and, once spat, a trail. Drawn like ProjectileLook.
export class BlobLook {
  get color() { return BL.color; }
  get maxTrail() { return BL.trail; }

  constructor(parent, { trail = true } = {}) {
    this.container = new Container();
    this.halo = sprite(tex.mist, this.container, { blendMode: 'add', tint: BL.color });
    this.trail = trail ? sprite(tex.comet, this.container, { blendMode: 'add', tint: BL.color }) : null;
    this.trail?.anchor.set(COMET_HEAD, 0.5);
    this.core = sprite(tex.orb, this.container, { tint: BL.deep });
    this.gleam = sprite(tex.mist, this.container, { blendMode: 'add', tint: BL.bright });
    for (const s of this.container.children) s.visible = true;
    this.seed = Math.random() * TAU; // so blobs side by side don't wobble as one
    parent.addChild(this.container);
  }

  render(now, x, y, rot, size, { glow = 1, trailLength = 0 } = {}) {
    const pulse = 0.5 + 0.5 * Math.sin(now * BL.pulseSpeed * TAU), W = BL.wobble;
    const wob = W.amount * Math.sin(now * W.speed * TAU + this.seed), c = size * BL.core.size * ORB_PAD;
    this.container.position.set(x, y);
    this.halo.width = this.halo.height = size * BL.halo.size * lerp(0.9, 1.1, pulse);
    this.halo.alpha = BL.halo.alpha * glow;
    this.core.rotation = rot;
    this.core.width = c * (1 + wob);
    this.core.height = c * (1 - wob);
    this.core.alpha = BL.core.alpha;
    this.gleam.position.set(-size * BL.gleam.at, -size * BL.gleam.at);
    this.gleam.width = this.gleam.height = size * BL.gleam.size * 2;
    this.gleam.alpha = BL.gleam.alpha * glow;
    if (!this.trail) return;
    this.trail.visible = trailLength > 0.01;
    this.trail.rotation = rot;
    this.trail.width = trailLength / COMET_HEAD;
    this.trail.height = size * BL.trailWidth;
  }

  destroy() { this.container.destroy({ children: true }); }
}

// One of a Blight's heads torn free: gaping and outlined like any projectile, rocking as it
// flies mouth first, in the goo's glow, with its trail. Its size is its width across;
// `variant`: which of the Blight's heads it is (any, if not given).
export class HeadLook {
  get color() { return BL.color; }
  get maxTrail() { return BL.trail; }

  constructor(parent, { trail = true, variant = Math.floor(Math.random() * blightHeads().length) } = {}) {
    this.container = new Container();
    this.halo = sprite(tex.mist, this.container, { blendMode: 'add', tint: BL.color });
    this.trail = trail ? sprite(tex.comet, this.container, { blendMode: 'add', tint: BL.color }) : null;
    this.trail?.anchor.set(COMET_HEAD, 0.5);
    this.head = sprite(tex[`blight_head_${variant}_loose`], this.container, { tint: 0xffffff });
    for (const s of this.container.children) s.visible = true;
    this.seed = Math.random() * TAU;
    parent.addChild(this.container);
  }

  render(now, x, y, rot, size, { glow = 1, trailLength = 0 } = {}) {
    this.container.position.set(x, y);
    this.halo.width = this.halo.height = size * BL.halo.size;
    this.halo.alpha = BL.halo.alpha * glow;
    this.head.rotation = rot + BL.rock * Math.sin(now * BL.rockRate * TAU + this.seed);
    this.head.width = this.head.height = size / 2 / HEAD_ART.body;
    if (!this.trail) return;
    this.trail.visible = trailLength > 0.01;
    this.trail.rotation = rot;
    this.trail.width = trailLength / COMET_HEAD;
    this.trail.height = size * BL.trailWidth;
  }

  destroy() { this.container.destroy({ children: true }); }
}

// Projectile looks by an ability's `look`.
export const PROJECTILE_LOOKS = { orb: ProjectileLook, mist: MistBallLook, crescent: CrescentLook, blob: BlobLook, head: HeadLook };
// The colour a look bursts into, by an ability's `look`.
export const lookColor = (look) => ({ mist: M.color, blob: BL.color, head: BL.color })[look] ?? X.color;
