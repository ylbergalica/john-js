// The player's blades, swing and parry animations, hit impacts and the small spark, glint and ring sprites.
import { seededRandom, lerp, clamp01, smoothStep01, TAU } from '../../engine/math.js';
import { PLAYER } from '../../data/player.js';
import { DEG, surface, rgba, polar, easeOut, glow, linear, radial, sparkle } from './paint.js';

// The ring and mist ring sprites' band radius, as a fraction of their width.
export const RING_RADIUS = 0.4;

// ---------------------------------------------------------------- blades

// A horn-shaped blade along a quadratic curve (cubic, given a second control point `ctrl2`
// on the base's side), sharp at the tip (t = 0) and blunt at the base (t = 1). Returns the
// outline of the part between t0 and t1, plus a point sampler. `skew` slants the base cut.
function blade(def, t0 = 0, t1 = 1, n = 48) {
  const { tip, ctrl, ctrl2, base, width, skew = 0, power = 0.55 } = def;
  const at = (t) => {
    const u = 1 - t;
    let x, y, tx, ty;
    if (ctrl2) {
      const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
      x = a * tip[0] + b * ctrl[0] + c * ctrl2[0] + d * base[0];
      y = a * tip[1] + b * ctrl[1] + c * ctrl2[1] + d * base[1];
      tx = 3 * u * u * (ctrl[0] - tip[0]) + 6 * u * t * (ctrl2[0] - ctrl[0]) + 3 * t * t * (base[0] - ctrl2[0]);
      ty = 3 * u * u * (ctrl[1] - tip[1]) + 6 * u * t * (ctrl2[1] - ctrl[1]) + 3 * t * t * (base[1] - ctrl2[1]);
    } else {
      x = u * u * tip[0] + 2 * u * t * ctrl[0] + t * t * base[0];
      y = u * u * tip[1] + 2 * u * t * ctrl[1] + t * t * base[1];
      tx = 2 * u * (ctrl[0] - tip[0]) + 2 * t * (base[0] - ctrl[0]);
      ty = 2 * u * (ctrl[1] - tip[1]) + 2 * t * (base[1] - ctrl[1]);
    }
    const len = Math.hypot(tx, ty) || 1;
    tx /= len; ty /= len;
    return { x, y, tx, ty, w: (width * Math.max(0, t) ** power) / 2 };
  };
  const left = [], right = [];
  let end;
  for (let i = 0; i <= n; i++) {
    end = at(lerp(t0, t1, i / n));
    left.push([end.x - end.ty * end.w, end.y + end.tx * end.w]);
    right.push([end.x + end.ty * end.w, end.y - end.tx * end.w]);
  }
  const path = new Path2D();
  path.moveTo(...left[0]);
  for (const p of left) path.lineTo(...p);
  if (t1 >= 1) {
    const d = (skew * width) / 2;
    left[n][0] += end.tx * d; left[n][1] += end.ty * d;
    right[n][0] -= end.tx * d; right[n][1] -= end.ty * d;
    path.lineTo(...left[n]);
    path.lineTo(...right[n]);
  } else {
    path.quadraticCurveTo(end.x + end.tx * end.w, end.y + end.ty * end.w, ...right[n]);
  }
  for (let i = n; i >= 0; i--) path.lineTo(...right[i]);
  path.closePath();
  return { path, at };
}

// A crescent along a circular arc from angle `from` to `to` (degrees) with width
// profile `profile(s)` (s = 0 at `from`, 1 at `to`); the `to` end gets a round cap.
export function arcBlade({ cx, cy, r, from, to, width, profile }, n = 56) {
  const outer = [], inner = [];
  let a, w;
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    a = lerp(from, to, s) * DEG;
    w = (width * profile(s)) / 2;
    outer.push([cx + Math.cos(a) * (r + w), cy + Math.sin(a) * (r + w)]);
    inner.push([cx + Math.cos(a) * (r - w), cy + Math.sin(a) * (r - w)]);
  }
  const dir = Math.sign(to - from);
  const tip = [cx + Math.cos(a) * r - Math.sin(a) * dir * w * 1.4, cy + Math.sin(a) * r + Math.cos(a) * dir * w * 1.4];
  const path = new Path2D();
  path.moveTo(...outer[0]);
  for (const p of outer) path.lineTo(...p);
  path.quadraticCurveTo(...tip, ...inner[n]);
  for (let i = n; i >= 0; i--) path.lineTo(...inner[i]);
  path.closePath();
  return path;
}

// Player slashes share one palette: white cores over a periwinkle glow.
export const SLASH = { glow: rgba('#8a9cff', 0.95), body: '#dfe5ff', tipColor: '#b4c2ff' };

// `stops`: [offset, colour] along the line from `from` (the tip) to `to`, in place of the
// usual pale tip fading to white.
function paintSlash(ctx, px, path, from, to, intensity = 1, stops = null) {
  glow(ctx, SLASH.glow, px * 0.05 * intensity, () => {
    ctx.fillStyle = SLASH.body;
    ctx.fill(path);
  });
  if (stops) {
    const g = ctx.createLinearGradient(...from, ...to);
    for (const [at, color] of stops) g.addColorStop(at, color);
    ctx.fillStyle = g;
  } else ctx.fillStyle = linear(ctx, ...from, ...to, [SLASH.tipColor, '#ffffff', '#ffffff']);
  ctx.fill(path);
}

// ---------------------------------------------------------------- swings

// Shapes measured from the original art, played in this order. Swings 1 and 3 are the upper
// half of the arc, 2 and 4 the lower half, so each comes back the other way; each grows
// from its tip while turning into place.
export const SWINGS = {
  first: { tip: [0.48, 0.03], ctrl: [0.635, 0.515], base: [0.61, 0.95], width: 0.21, skew: -0.15, spin: -0.22, seed: 11 },
  second: { tip: [0.45, 0.965], ctrl: [0.75, 0.48], base: [0.40, 0.08], width: 0.18, spin: 0.22, seed: 13 },
  third: { tip: [0.40, 0.06], ctrl: [0.57, 0.51], base: [0.64, 0.915], width: 0.2, skew: 0.45, spin: -0.22, seed: 12 },
  fourth: { tip: [0.40, 0.94], ctrl: [0.57, 0.49], base: [0.64, 0.085], width: 0.2, skew: -0.45, spin: 0.22, seed: 14 },
};

const SWING_REVEAL = [0.4, 0.8, 1, 1, 1, 1];

export function swingFrames(def, S = 256) {
  const rand = seededRandom(def.seed * 7919);
  const motes = Array.from({ length: 5 }, () => ({
    t: lerp(0.18, 0.92, rand()), off: lerp(0.015, 0.06, rand()),
    r: lerp(0.018, 0.034, rand()), phase: rand() * TAU, rot: rand() * 0.6,
  }));
  // Sparkles sit on the convex side (the side the control point bulges toward).
  const mid = [(def.tip[0] + def.base[0]) / 2, (def.tip[1] + def.base[1]) / 2];
  const { at } = blade(def);
  const m = at(0.5);
  const side = Math.sign((def.ctrl[0] - mid[0]) * m.ty - (def.ctrl[1] - mid[1]) * m.tx) || 1;

  return SWING_REVEAL.map((p, i) => {
    const { c, ctx, px } = surface(S);
    const turn = (angle) => { ctx.translate(0.5, 0.5); ctx.rotate(angle); ctx.translate(-0.5, -0.5); };
    if (p >= 1) {
      // Fading after-image on the side the blade swept in from.
      ctx.save();
      turn(def.spin * 0.35);
      ctx.globalAlpha = 0.24 - (i - 2) * 0.05;
      paintSlash(ctx, px, blade(def).path, def.tip, def.base, 0.6);
      ctx.restore();
    }
    turn(def.spin * (1 - p));
    paintSlash(ctx, px, blade(def, 0, p).path, def.tip, def.base, p < 1 ? 0.8 : 1);
    for (const mo of motes) {
      if (mo.t > p) continue;
      const q = at(mo.t);
      const d = side * (q.w + mo.off);
      const tw = 0.5 + 0.5 * Math.sin(mo.phase + i * 1.9);
      sparkle(ctx, q.x + q.ty * d, q.y - q.tx * d, mo.r * lerp(0.6, 1, tw), '#ffffff', lerp(0.35, 1, tw), mo.rot);
    }
    return c;
  });
}

// Momentum's empowered swing (src/aspects/momentum.js): the swings' blade, thicker and
// brighter, brought down from over the player's shoulder, across the outer half of their body,
// nearly straight at first, then hooking hard round into its point on the far edge of the
// hitbox. Laid out in world units about the attack point, aiming along +x, the player's centre
// at x = -attackRange and the shoulder at +y (the sprite is mirrored for the other one); the
// hitbox's far edge is at x = hitboxDepth / 2. The art is a square `size` across centred
// `center` along the aim from the attack point. The blade's point is `tip`, its thick back
// by the shoulder `base`, `width` across there; it's a cubic curve, `ctrl` (close by the
// point, off to the side: the hook) and `ctrl2` (the long, gently bowed back). Its frames: `draw` (fractions of the blade, from the point, still to come) shoots it out
// from the back to the point, turning the last `spin` into place; then `follow` (fractions
// still shown, from the point) wipes it away from the back toward the point, as if it
// carried on down into the floor.
export const CHOP = {
  size: 2.6, center: -0.45,
  tip: [PLAYER.attack.hitboxDepth / 2, 0], ctrl: [0.38, 0.42], ctrl2: [-0.3, 0.5], base: [-1.0, 0.18],
  width: 0.48, power: 0.7, skew: 0.3, spin: 0.25, seed: 21,
  colors: [[0, '#ff7a2e'], [0.04, '#ff7a2e'], [0.15, '#ffffff'], [1, '#ffffff']], // along it from the point: orange, then white
  draw: [0.6, 0.25, 0],
  follow: [0.88, 0.74, 0.6, 0.47, 0.35, 0.24, 0.14, 0.06],
};
export const CHOP_DRAW_FRAMES = CHOP.draw.length; // the frames shooting out; the next lands it on the spot

export function chopFrames(S = 384) {
  const D = CHOP, x0 = D.center - D.size / 2, y0 = -D.size / 2;
  const uv = ([x, y]) => [(x - x0) / D.size, (y - y0) / D.size];
  const def = { tip: uv(D.tip), ctrl: uv(D.ctrl), ctrl2: uv(D.ctrl2), base: uv(D.base), width: D.width / D.size, power: D.power, skew: D.skew };
  const rand = seededRandom(D.seed * 7919);
  const motes = Array.from({ length: 8 }, () => ({
    t: lerp(0.15, 0.95, rand()), off: lerp(0.01, 0.04, rand()),
    r: lerp(0.012, 0.022, rand()), phase: rand() * TAU, rot: rand() * 0.6,
  }));
  const { at } = blade(def);
  // [from, to] of the blade shown, each frame: shooting out, whole, then wiped from the back.
  const spans = [...D.draw.map((a) => [a, 1]), [0, 1], ...D.follow.map((b) => [0, b])];
  return spans.map(([a, b], i) => {
    const { c, ctx, px } = surface(S);
    const turn = (angle) => { ctx.translate(0.5, 0.5); ctx.rotate(angle); ctx.translate(-0.5, -0.5); };
    if (i < D.draw.length) turn(D.spin * a);
    paintSlash(ctx, px, blade(def, a, b).path, def.tip, def.base, 1.15, D.colors);
    for (const mo of motes) {
      if (mo.t < a || mo.t > b) continue;
      const q = at(mo.t), d = q.w + mo.off; // on its outer edge
      const tw = 0.5 + 0.5 * Math.sin(mo.phase + i * 1.9);
      sparkle(ctx, q.x + q.ty * d, q.y - q.tx * d, mo.r * lerp(0.6, 1, tw), '#ffffff', lerp(0.35, 1, tw), mo.rot);
    }
    return c;
  });
}

// ---------------------------------------------------------------- parry

// A thin crescent on a circle centred off to the left (PLAYER.parry.look, which the hitbox
// follows too); it sweeps from bottom to top.
const PARRY_LOOK = PLAYER.parry.look;

export const PARRY_ARC = { ...PARRY_LOOK.arc, width: 0.035 };

// Its head (degrees; 0 is straight ahead along the aim) sweeps up from `head[0]` to
// `head[1]` along the timing curve `ease` (gentle at both ends, quick between), and its tail
// follows from `tail[0]` to `tail[1]` along the same curve run backwards, hanging back
// before catching up. So the crescent starts short, stretches out and draws back in behind
// the head as it fades (PLAYER.parry.fadeTime). The tail's path mirrors the head's across
// the aim, so the sweep is symmetrical about it: each frame is the mirror image of its
// counterpart from the other end. The star on the line at its head grows from `star` of
// its full size to full halfway, then shrinks back. `PARRY_FRAMES` frames, played over the
// same time whatever their number (see PlayerView).
const PARRY_SWEEP = { head: [48, -PARRY_LOOK.sweepDeg], tail: [PARRY_LOOK.sweepDeg, -48], ease: [0.5, 0.02, 0.18, 1], star: 0.5 };

const PARRY_FRAMES = 12;

const PARRY_STAR = 0.068; // the solid star at its head, shrinking as it sweeps

// Room around the parry's art (a fraction of it, each side) so the star at the head isn't
// cut off at the top.
export const PARRY_PAD = 0.08;

// A cubic Bézier timing curve through (0, 0), (x1, y1), (x2, y2), (1, 1), as in CSS.
function cubicBezier(x1, y1, x2, y2) {
  const at = (a, b, s) => 3 * (1 - s) ** 2 * s * a + 3 * (1 - s) * s * s * b + s ** 3;
  return (t) => {
    let lo = 0, hi = 1, s = t;
    for (let i = 0; i < 30; i++) {
      s = (lo + hi) / 2;
      if (at(x1, x2, s) < t) lo = s; else hi = s;
    }
    return at(y1, y2, s);
  };
}

export function parryFrames(S = 256) {
  const { head, tail, ease: [x1, y1, x2, y2], star } = PARRY_SWEEP;
  const headEase = cubicBezier(x1, y1, x2, y2), tailEase = cubicBezier(1 - x2, 1 - y2, 1 - x1, 1 - y1);
  return Array.from({ length: PARRY_FRAMES }, (_, j) => {
    const t = j / (PARRY_FRAMES - 1);
    const to = lerp(head[0], head[1], headEase(t));
    const from = lerp(tail[0], tail[1], tailEase(t));
    const starSize = lerp(star, 1, smoothStep01(1 - Math.abs(2 * t - 1)));
    const { c, ctx, px } = surface(Math.round(S * (1 + 2 * PARRY_PAD)), undefined, S);
    ctx.translate(PARRY_PAD, PARRY_PAD);
    const path = arcBlade({ ...PARRY_ARC, from, to, profile: (s) => s ** 0.6 });
    paintSlash(ctx, px, path, polar(PARRY_ARC.cx, PARRY_ARC.cy, from, PARRY_ARC.r), polar(PARRY_ARC.cx, PARRY_ARC.cy, to, PARRY_ARC.r));
    const [hx, hy] = polar(PARRY_ARC.cx, PARRY_ARC.cy, to, PARRY_ARC.r);
    sparkle(ctx, hx, hy, PARRY_STAR * starSize, '#ffffff', 1, 1.5 * t);
    return c;
  });
}

// Parry connect: a core flash and cross-shaped flare, a shockwave ring rolling
// outward, and a tall ring of light that widens and breaks into motes while star
// shards spray from its poles. Drawn smaller than the texture to leave the shockwave
// room (FX.parryConnectSize is sized for the shockwave).
export function parryConnectFrames(S = 384, count = 12) {
  const rand = seededRandom(4242);
  const shards = Array.from({ length: 18 }, (_, i) => {
    const fromPole = i < 10;
    const pole = i % 2 ? 1 : -1;
    const a = fromPole ? pole * 90 + lerp(-40, 40, rand()) : rand() * 360;
    return {
      pole: fromPole ? pole : 0, a: a * DEG, speed: lerp(0.07, 0.2, rand()),
      r: lerp(0.014, 0.032, rand()), rot: rand() * TAU, life: lerp(0.55, 1, rand()),
    };
  });
  const frames = [];
  for (let i = 0; i < count; i++) {
    const u = i / (count - 1);
    const { c, ctx, px } = surface(S);
    const k = 0.9 + 0.22 * easeOut(u);
    const rx = 0.058 * k, ry = 0.27 * k;

    // Core flash.
    if (u < 0.35) {
      const f = 1 - u / 0.35;
      ctx.fillStyle = radial(ctx, 0.5, 0.5, 0.24, [rgba('#ffffff', 0.85 * f), rgba('#ffe3a0', 0.35 * f), rgba('#ffd27a', 0)]);
      ctx.fillRect(0, 0, 1, 1);
    }
    // Flare: a long streak along the ring and a shorter one across it.
    if (u < 0.55) {
      const f = 1 - u / 0.55;
      glow(ctx, rgba('#ffd27a', 0.9), px * 0.03, () => {
        streak(ctx, 0.5, 0.5, 0.46 * (0.7 + 0.3 * f), 0.012 * f + 0.003, Math.PI / 2, '#fffaf0', f);
        streak(ctx, 0.5, 0.5, 0.2 * f, 0.01 * f + 0.002, 0, '#fffaf0', f);
      });
    }
    // Shockwave.
    const wave = easeOut(Math.min(1, u * 1.15));
    ctx.save();
    ctx.globalAlpha = 0.85 * (1 - u) ** 1.4;
    glow(ctx, rgba('#ffcf6a', 0.9), px * 0.025, () => {
      ctx.lineWidth = lerp(0.022, 0.003, u);
      ctx.strokeStyle = '#fff3d6';
      ctx.beginPath();
      ctx.arc(0.5, 0.5, lerp(0.1, 0.47, wave), 0, TAU);
      ctx.stroke();
    });
    ctx.restore();

    // The tall ring.
    ctx.save();
    ctx.globalAlpha = 1 - u * u * 0.85;
    if (u > 0.3) {
      const b = (u - 0.3) / 0.7;
      ctx.setLineDash([lerp(0.4, 0.025, b), lerp(0.01, 0.05, b)]);
      ctx.lineDashOffset = b * 0.1;
    }
    glow(ctx, rgba('#ffd27a', 0.95), px * 0.035, () => {
      ctx.lineWidth = lerp(0.015, 0.005, u);
      ctx.strokeStyle = '#fffaf0';
      ctx.beginPath();
      ctx.ellipse(0.5, 0.5, rx, ry, 0, 0, TAU);
      ctx.stroke();
    });
    ctx.setLineDash([]);
    const pole = 0.09 * Math.sin(Math.PI * Math.min(1, 0.4 + u * 0.75));
    sparkle(ctx, 0.5, 0.5 - ry, pole, '#fff6dc', 1, u * 0.8);
    sparkle(ctx, 0.5, 0.5 + ry, pole, '#fff6dc', 1, -u * 0.8);
    ctx.restore();

    for (const s of shards) {
      const d = 0.03 + s.speed * easeOut(u);
      const ox = 0.5, oy = 0.5 + s.pole * ry * 0.9;
      const fade = 1 - u / s.life;
      sparkle(ctx, ox + Math.cos(s.a) * d, oy + Math.sin(s.a) * d, s.r * (1 - u * 0.4), '#ffe7a8', fade, s.rot + u * 2.5);
    }
    frames.push(c);
  }
  return frames;
}

// Attack hit: a quick white pop with a thin cut streak across the strike, a ring
// pushing outward and a few motes thrown forward. Points along +x (the strike
// direction) and is kept small and brief so it sits under the spark burst.
export function hitImpactFrames(S = 256, count = 9) {
  const rand = seededRandom(5150);
  const motes = Array.from({ length: 4 }, () => ({
    a: lerp(-50, 50, rand()) * DEG, speed: lerp(0.16, 0.3, rand()), r: lerp(0.02, 0.035, rand()), rot: rand() * TAU,
  }));
  const frames = [];
  for (let i = 0; i < count; i++) {
    const u = i / (count - 1);
    const { c, ctx, px } = surface(S);

    // Core pop.
    if (u < 0.45) {
      const f = 1 - u / 0.45;
      ctx.fillStyle = radial(ctx, 0.5, 0.5, 0.2 * (0.8 + 0.4 * u), [rgba('#ffffff', 0.9 * f), rgba('#b4c2ff', 0.35 * f), rgba('#8a9cff', 0)]);
      ctx.fillRect(0, 0, 1, 1);
    }
    // Cut streak across the strike, snapping out then thinning away.
    if (u < 0.7) {
      const f = 1 - u / 0.7;
      glow(ctx, SLASH.glow, px * 0.03, () => {
        streak(ctx, 0.5, 0.5, 0.36 * (0.55 + 0.45 * easeOut(Math.min(1, u * 3))), 0.03 * f + 0.004, Math.PI / 2 + 0.35, '#ffffff', f);
      });
    }
    // Ring.
    ctx.save();
    ctx.globalAlpha = 0.7 * (1 - u) ** 1.5;
    glow(ctx, SLASH.glow, px * 0.02, () => {
      ctx.lineWidth = lerp(0.02, 0.004, u);
      ctx.strokeStyle = '#dfe5ff';
      ctx.beginPath();
      ctx.arc(0.5, 0.5, lerp(0.07, 0.3, easeOut(u)), 0, TAU);
      ctx.stroke();
    });
    ctx.restore();
    // Motes thrown forward.
    for (const m of motes) {
      const d = 0.04 + m.speed * easeOut(u);
      sparkle(ctx, 0.5 + Math.cos(m.a) * d, 0.5 + Math.sin(m.a) * d, m.r * (1 - u * 0.5), '#ffffff', 1 - u, m.rot + u * 2);
    }
    frames.push(c);
  }
  return frames;
}

// Thin pinched diamond: `len` and `wid` are half-extents along and across `rot`.
function streak(ctx, x, y, len, wid, rot, color, alpha = 1) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha *= clamp01(alpha);
  ctx.beginPath();
  ctx.moveTo(len, 0);
  ctx.quadraticCurveTo(0, wid * 0.4, 0, wid);
  ctx.quadraticCurveTo(0, wid * 0.4, -len, 0);
  ctx.quadraticCurveTo(0, -wid * 0.4, 0, -wid);
  ctx.quadraticCurveTo(0, -wid * 0.4, len, 0);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

// Particle spark: a glowing streak, 1 texture-width long and pointing along +x.
export function spark(S = 64) {
  const { c, ctx, px } = surface(S);
  ctx.fillStyle = radial(ctx, 0.5, 0.5, 0.5, [rgba('#ffffff', 0.35), rgba('#ffffff', 0)]);
  ctx.save();
  ctx.translate(0.5, 0.5); ctx.scale(1, 0.45); ctx.translate(-0.5, -0.5);
  ctx.fillRect(0, 0, 1, 1);
  ctx.restore();
  glow(ctx, rgba('#ffffff', 0.9), px * 0.08, () => streak(ctx, 0.5, 0.5, 0.36, 0.11, 0, '#ffffff'));
  return c;
}

// Four-point star glint, white so it can be tinted: the stars spilling out of a dying enemy's void.
export function glint(S = 64) {
  const { c, ctx, px } = surface(S);
  glow(ctx, rgba('#ffffff', 0.8), px * 0.06, () => sparkle(ctx, 0.5, 0.5, 0.42, '#ffffff'));
  return c;
}

// Soft shockwave ring, white so it can be tinted: a bright band at RING_RADIUS of the
// texture width, feathering out to either side.
export function ring(S = 256) {
  const { c, ctx } = surface(S);
  const g = ctx.createRadialGradient(0.5, 0.5, 0, 0.5, 0.5, 0.5);
  [[0, 0], [0.55, 0], [0.7, 0.08], [0.76, 0.35], [RING_RADIUS * 2, 1], [0.86, 0.15], [1, 0]]
    .forEach(([at, a]) => g.addColorStop(at, rgba('#ffffff', a)));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1, 1);
  return c;
}

// A ward's rim, white so it can be tinted: the shockwave ring's band at RING_RADIUS, but
// narrower, so wards stacked close still read as separate layers.
export function wardRing(S = 256) {
  const { c, ctx } = surface(S);
  const g = ctx.createRadialGradient(0.5, 0.5, 0, 0.5, 0.5, 0.5);
  [[0, 0], [0.66, 0], [0.74, 0.1], [0.775, 0.4], [RING_RADIUS * 2, 1], [0.83, 0.25], [0.88, 0.04], [1, 0]]
    .forEach(([at, a]) => g.addColorStop(at, rgba('#ffffff', a)));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1, 1);
  return c;
}

// A thick ring of haze, white so it can be tinted: a broad soft band centred on
// RING_RADIUS of the texture width, lumpy with overlapping puffs and blurred together.
export function mistRing(S = 512) {
  const { c, ctx, px } = surface(S);
  const rand = seededRandom(17);
  const g = ctx.createRadialGradient(0.5, 0.5, 0, 0.5, 0.5, 0.5);
  [[0, 0], [0.5, 0], [0.64, 0.12], [RING_RADIUS * 2, 0.4], [0.9, 0.12], [1, 0]]
    .forEach(([at, a]) => g.addColorStop(at, rgba('#ffffff', a)));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1, 1);
  ctx.filter = `blur(${px * 0.012}px)`;
  for (let i = 0; i < 48; i++) {
    const a = ((i + rand()) / 48) * TAU, d = RING_RADIUS + lerp(-0.035, 0.03, rand()), r = lerp(0.035, 0.06, rand());
    const x = 0.5 + Math.cos(a) * d, y = 0.5 + Math.sin(a) * d;
    ctx.fillStyle = radial(ctx, x, y, r, [rgba('#ffffff', lerp(0.18, 0.35, rand())), rgba('#ffffff', 0)]);
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  return c;
}
