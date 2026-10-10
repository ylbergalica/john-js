// Procedural sprite art: every sprite, animation frame and aspect icon is drawn here
// with Canvas 2D at load time, so there are no image files. The look is simple and
// a little astral: crisp shapes over soft glows, deep-space fills and four-point
// star glints, each keeping its original silhouette and colour.
// Drawing happens in normalised units (1 = canvas width) unless noted otherwise.
import { seededRandom, lerp, clamp01, smoothStep01, TAU } from '../engine/math.js';

const DEG = Math.PI / 180;

// Frame-based animations play at FX.animFps (48); each has the frame count below.
export function animations() {
  return {
    first_swing: swingFrames(SWINGS.first),
    second_swing: swingFrames(SWINGS.second),
    third_swing: swingFrames(SWINGS.third),
    fourth_swing: swingFrames(SWINGS.fourth),
    parry: parryFrames(),
    parry_connect: parryConnectFrames(),
    hit_impact: hitImpactFrames(),
    rift_open: riftFrames('open'),
    rift_close: riftFrames('close'),
  };
}

export function sprites() {
  return {
    goblin_idle: goblinOutline(),
    goblin_idle_void: voidFill(goblinPath(), VOIDS.goblin),
    striker_idle: strikerOutline(),
    striker_idle_void: voidFill(strikerPath(), VOIDS.striker),
    seraph_idle: seraphOutline(),
    seraph_idle_void: voidFill(seraphPath(), VOIDS.seraph),
    mauler_idle: maulerOutline(),
    mauler_idle_void: voidFill(maulerPath(), VOIDS.mauler),
    star_maul: starMaul(),
    shade_idle: shadeOutline(),
    shade_idle_void: voidFill(shadePath(), VOIDS.shade),
    shade_blade: shadeBlade(),
    seer_idle: seerOutline(),
    seer_idle_void: voidFill(seerPath(), VOIDS.seer, 'evenodd'),
    tail: tail(),
    dash_ghost: dashGhost(),
    spark: spark(),
    glint: glint(),
    ring: ring(),
    mist_ring: mistRing(),
    anchor_object: anchorObject(),
    crescent_slash: crescentSlash(),
    orb: orb(),
    comet: comet(),
    core: core(),
    hexFlat: hexFlat(),
    hexPointed: hexPointed(),
    mist: mist(),
    flame: flame(),
    ribbon: ribbon(),
  };
}

export function icons() {
  return {
    anchor_icon: anchorIcon(),
    crescent_icon: crescentIcon(),
    flash_icon: flashIcon(),
    predator_icon: predatorIcon(),
    rift_icon: riftIcon(),
    coin_icon: coinIcon(),
    ...Object.fromEntries(Object.entries(GEM_CUTS).map(([tier, cut]) => [`gem_${tier}`, gemIcon(cut)])),
  };
}

// Sprites drawn with a halo are this many times their visible body size.
export const ORB_PAD = 2;
// The ring and mist ring sprites' band radius, as a fraction of their width.
export const RING_RADIUS = 0.4;
// The comet's head as a fraction of its length.
export const COMET_HEAD = 0.9;

// ---------------------------------------------------------------- helpers

function surface(w, h = w, unit = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.setTransform(unit, 0, 0, unit, 0, 0);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  return { c, ctx, px: unit };
}

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

const polar = (cx, cy, deg, r) => [cx + Math.cos(deg * DEG) * r, cy + Math.sin(deg * DEG) * r];
const easeOut = (t) => 1 - (1 - t) ** 3;

// Runs `draw` with a soft halo of `color` (`blur` in pixels) behind whatever it paints.
function glow(ctx, color, blur, draw) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  draw();
  ctx.restore();
}

function linear(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
  return g;
}

function radial(ctx, x, y, r, stops, x0 = x, y0 = y) {
  const g = ctx.createRadialGradient(x0, y0, 0, x, y, r);
  stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
  return g;
}

// Four-point star with a faint round halo.
function sparkle(ctx, x, y, r, color = '#ffffff', alpha = 1, rot = 0) {
  if (alpha <= 0 || r <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha *= clamp01(alpha);
  ctx.fillStyle = radial(ctx, 0, 0, r * 0.75, [rgba(color, 0.5), rgba(color, 0)]);
  ctx.fillRect(-r, -r, 2 * r, 2 * r);
  const k = r * 0.14;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.quadraticCurveTo(k, k, 0, r);
  ctx.quadraticCurveTo(-k, k, -r, 0);
  ctx.quadraticCurveTo(-k, -k, 0, -r);
  ctx.quadraticCurveTo(k, -k, r, 0);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

// Icon backdrop: deep radial gradient, coloured nebula clouds, scattered stars.
function space(ctx, rand, { core, edge, nebulae = [], stars = 40 }) {
  ctx.fillStyle = radial(ctx, 0.5, 0.5, 0.75, [core, edge]);
  ctx.fillRect(0, 0, 1, 1);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const [x, y, r, color, a] of nebulae) {
    ctx.fillStyle = radial(ctx, x, y, r, [rgba(color, a), rgba(color, a * 0.35), rgba(color, 0)]);
    ctx.fillRect(0, 0, 1, 1);
  }
  ctx.restore();
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < stars; i++) {
    ctx.globalAlpha = lerp(0.2, 0.85, rand());
    ctx.beginPath();
    ctx.arc(rand(), rand(), lerp(0.0025, 0.007, rand() ** 3), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 3; i++) sparkle(ctx, lerp(0.08, 0.92, rand()), lerp(0.08, 0.92, rand()), lerp(0.02, 0.035, rand()), '#ffffff', 0.75);
}

// Draws `paint` onto a scratch canvas the size of `ctx`'s, then stamps it back with a
// glow. Needed when a shape is built with cut-outs (destination-out).
function stamp(ctx, px, color, blur, paint) {
  const { c, ctx: l } = surface(ctx.canvas.width, ctx.canvas.height, px);
  paint(l);
  glow(ctx, color, blur, () => ctx.drawImage(c, 0, 0, c.width / px, c.height / px));
}

// ---------------------------------------------------------------- blades

// A horn-shaped blade along a quadratic curve, sharp at the tip (t = 0) and blunt at
// the base (t = 1). Returns the outline of the part between t0 and t1, plus a point
// sampler. `skew` slants the base cut.
function blade(def, t0 = 0, t1 = 1, n = 48) {
  const { tip, ctrl, base, width, skew = 0, power = 0.55 } = def;
  const at = (t) => {
    const u = 1 - t;
    const x = u * u * tip[0] + 2 * u * t * ctrl[0] + t * t * base[0];
    const y = u * u * tip[1] + 2 * u * t * ctrl[1] + t * t * base[1];
    let tx = 2 * u * (ctrl[0] - tip[0]) + 2 * t * (base[0] - ctrl[0]);
    let ty = 2 * u * (ctrl[1] - tip[1]) + 2 * t * (base[1] - ctrl[1]);
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
function arcBlade({ cx, cy, r, from, to, width, profile }, n = 56) {
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
const SLASH = { glow: rgba('#8a9cff', 0.95), body: '#dfe5ff', tipColor: '#b4c2ff' };

function paintSlash(ctx, px, path, from, to, intensity = 1) {
  glow(ctx, SLASH.glow, px * 0.05 * intensity, () => {
    ctx.fillStyle = SLASH.body;
    ctx.fill(path);
  });
  ctx.fillStyle = linear(ctx, ...from, ...to, [SLASH.tipColor, '#ffffff', '#ffffff']);
  ctx.fill(path);
}

// ---------------------------------------------------------------- swings

// Shapes measured from the original art. Swings 1-2 are the upper half of the arc,
// 3-4 the lower half; each grows from its tip while turning into place.
const SWINGS = {
  first: { tip: [0.48, 0.03], ctrl: [0.635, 0.515], base: [0.61, 0.95], width: 0.21, skew: -0.15, spin: -0.22, seed: 11 },
  second: { tip: [0.40, 0.06], ctrl: [0.57, 0.51], base: [0.64, 0.915], width: 0.2, skew: 0.45, spin: -0.22, seed: 12 },
  third: { tip: [0.45, 0.965], ctrl: [0.75, 0.48], base: [0.40, 0.08], width: 0.18, spin: 0.22, seed: 13 },
  fourth: { tip: [0.40, 0.94], ctrl: [0.57, 0.49], base: [0.64, 0.085], width: 0.2, skew: -0.45, spin: 0.22, seed: 14 },
};
const SWING_REVEAL = [0.4, 0.8, 1, 1, 1, 1];

function swingFrames(def, S = 256) {
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

// ---------------------------------------------------------------- parry

// A thin crescent on a circle centred off to the left; it sweeps from bottom to top.
const PARRY_ARC = { cx: 0.051, cy: 0.5, r: 0.559, width: 0.06 };
const PARRY_WINDOWS = [[64, 30], [60, 0], [54, -30], [45, -50], [10, -56], [-25, -60]]; // [tail, head] degrees

function parryFrames(S = 256) {
  return PARRY_WINDOWS.map(([from, to], i) => {
    const { c, ctx, px } = surface(S);
    const path = arcBlade({ ...PARRY_ARC, from, to, profile: (s) => s ** 0.6 });
    paintSlash(ctx, px, path, polar(PARRY_ARC.cx, PARRY_ARC.cy, from, PARRY_ARC.r), polar(PARRY_ARC.cx, PARRY_ARC.cy, to, PARRY_ARC.r));
    const [hx, hy] = polar(PARRY_ARC.cx, PARRY_ARC.cy, to, PARRY_ARC.r + 0.04);
    sparkle(ctx, hx, hy, 0.05 - i * 0.004, '#ffffff', 1 - i * 0.12, i * 0.3);
    return c;
  });
}

// The Crescent aspect's flying slash: the full parry arc, tapered at both ends.
function crescentSlash(S = 256) {
  const { c, ctx, px } = surface(S);
  const path = arcBlade({ ...PARRY_ARC, width: 0.08, from: 52, to: -52, profile: (s) => Math.sin(Math.PI * s) ** 0.7 });
  paintSlash(ctx, px, path, [0.4, 0.95], [0.4, 0.05]);
  sparkle(ctx, 0.62, 0.5, 0.06, '#ffffff', 0.9);
  return c;
}

// Parry connect: a core flash and cross-shaped flare, a shockwave ring rolling
// outward, and a tall ring of light that widens and breaks into motes while star
// shards spray from its poles. Drawn smaller than the texture to leave the shockwave
// room (FX.parryConnectSize is sized for the shockwave).
function parryConnectFrames(S = 384, count = 12) {
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
function hitImpactFrames(S = 256, count = 9) {
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
function spark(S = 64) {
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
function glint(S = 64) {
  const { c, ctx, px } = surface(S);
  glow(ctx, rgba('#ffffff', 0.8), px * 0.06, () => sparkle(ctx, 0.5, 0.5, 0.42, '#ffffff'));
  return c;
}

// Soft shockwave ring, white so it can be tinted: a bright band at RING_RADIUS of the
// texture width, feathering out to either side.
function ring(S = 256) {
  const { c, ctx } = surface(S);
  const g = ctx.createRadialGradient(0.5, 0.5, 0, 0.5, 0.5, 0.5);
  [[0, 0], [0.55, 0], [0.7, 0.08], [0.76, 0.35], [RING_RADIUS * 2, 1], [0.86, 0.15], [1, 0]]
    .forEach(([at, a]) => g.addColorStop(at, rgba('#ffffff', a)));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1, 1);
  return c;
}

// A thick ring of haze, white so it can be tinted: a broad soft band centred on
// RING_RADIUS of the texture width, lumpy with overlapping puffs and blurred together.
function mistRing(S = 512) {
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

// ---------------------------------------------------------------- exalted fire
// White so the Exalted effects can tint them.

// Soft cloud puff: a round haze with a few lumpy lobes, fading to nothing at the edge.
function mist(S = 128) {
  const { c, ctx } = surface(S);
  const rand = seededRandom(7);
  ctx.fillStyle = radial(ctx, 0.5, 0.5, 0.5, [rgba('#ffffff', 0.45), rgba('#ffffff', 0.16), rgba('#ffffff', 0)]);
  ctx.fillRect(0, 0, 1, 1);
  for (let i = 0; i < 7; i++) {
    const a = rand() * TAU, d = lerp(0.05, 0.18, rand()), r = lerp(0.12, 0.22, rand());
    ctx.fillStyle = radial(ctx, 0.5 + Math.cos(a) * d, 0.5 + Math.sin(a) * d, r, [rgba('#ffffff', 0.2), rgba('#ffffff', 0)]);
    ctx.fillRect(0, 0, 1, 1);
  }
  return c;
}

// Wispy flame tongue 1 texture-width long, pointing along +x: a soft base thinning into a
// long faint tip, blurred so overlapping tongues merge.
function flame(W = 128, H = 64) {
  const { c, ctx, px } = surface(W, H, W);
  const y = H / W / 2, r = 0.1;
  ctx.fillStyle = radial(ctx, 0.3, y, 0.26, [rgba('#ffffff', 0.25), rgba('#ffffff', 0)]);
  ctx.fillRect(0, 0, 1, 2 * y);
  ctx.beginPath();
  ctx.moveTo(0.96, y);
  ctx.quadraticCurveTo(0.5, y - r * 1.1, 0.28, y - r);
  ctx.arc(0.28, y, r, -Math.PI / 2, Math.PI / 2, true);
  ctx.quadraticCurveTo(0.5, y + r * 1.1, 0.96, y);
  ctx.fillStyle = linear(ctx, 0.18, 0, 0.96, 0, [rgba('#ffffff', 0.7), rgba('#ffffff', 0.3), rgba('#ffffff', 0)]);
  ctx.filter = `blur(${px * 0.025}px)`;
  glow(ctx, rgba('#ffffff', 0.5), px * 0.08, () => ctx.fill());
  return c;
}

// Ribbon strip mapped along a mesh: u runs tail (transparent) → head (solid), v across a
// soft bright core.
function ribbon(W = 128, H = 16) {
  const { c, ctx } = surface(W, H, W);
  const h = H / W;
  ctx.fillStyle = linear(ctx, 0, 0, 1, 0, [rgba('#ffffff', 0), rgba('#ffffff', 0.25), rgba('#ffffff', 1)]);
  ctx.fillRect(0, 0, 1, h);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = linear(ctx, 0, 0, 0, h, [rgba('#ffffff', 0), rgba('#ffffff', 0.45), rgba('#ffffff', 1), rgba('#ffffff', 0.45), rgba('#ffffff', 0)]);
  ctx.fillRect(0, 0, 1, h);
  return c;
}

// ---------------------------------------------------------------- rift

// Rift blades in units of the texture width (128 px), relative to the texture
// centre: the upper blade, mirrored for the lower one. Round-topped with a straight
// front edge and three scalloped bites along the back. Pure white; the aspect sheds
// motes off them while they're out (src/aspects/rift.js).
function riftBladePath() {
  const p = new Path2D();
  p.moveTo(-0.18, -0.18);
  p.lineTo(0.17, -0.18);
  p.quadraticCurveTo(0.27, -0.2, 0.27, -0.36);
  p.lineTo(0.27, -1.3);
  p.bezierCurveTo(0.27, -1.72, 0.0, -1.9, -0.32, -1.84);
  p.quadraticCurveTo(-0.06, -1.62, -0.31, -1.34);
  p.quadraticCurveTo(-0.06, -1.1, -0.30, -0.84);
  p.quadraticCurveTo(-0.07, -0.6, -0.26, -0.33);
  p.closePath();
  return p;
}
const RIFT_PIVOT = [-0.15, -0.3];

function riftFrames(mode, W = 128, H = 640) {
  const path = riftBladePath();
  const count = mode === 'open' ? 10 : 8;
  const frames = [];
  for (let i = 0; i < count; i++) {
    // `k` is how unfolded the blades are: 0 = folded forward and tiny, 1 = fully out.
    const u = (i + 1) / count;
    const k = mode === 'open' ? easeOut(u) : 1 - (i + 1) / (count + 1);
    const scale = mode === 'open' ? Math.min(1.06, lerp(0.16, 1, k) + 0.12 * Math.sin(Math.PI * u) * (u > 0.5 ? 1 : 0)) : lerp(0.16, 1, k);
    const fold = (1 - k) * 2; // folded, the blades point forward toward the centre line
    const burst = mode === 'open' ? Math.max(0, Math.sin(Math.PI * (u - 0.45) / 0.55)) * (u > 0.45 ? 1 : 0) : 0;
    const { c, ctx, px } = surface(W, H, W);
    ctx.globalAlpha = mode === 'close' ? lerp(0.55, 1, k) : 1;
    for (const sign of [-1, 1]) {
      ctx.save();
      ctx.translate(0.5, 2.5);
      ctx.scale(1, -sign); // sign -1 draws the upper blade, +1 the lower (mirrored)
      ctx.translate(...RIFT_PIVOT);
      ctx.rotate(fold);
      ctx.scale(scale, scale);
      ctx.translate(-RIFT_PIVOT[0], -RIFT_PIVOT[1]);
      glow(ctx, rgba('#ffffff', 0.75), px * lerp(0.1, 0.16, burst), () => {
        ctx.fillStyle = '#ffffff';
        ctx.fill(path);
      });
      ctx.restore();
    }
    frames.push(c);
  }
  return frames;
}

// ---------------------------------------------------------------- enemies

// Outlines are drawn at the original art's proportions so they fill the same size.
const GOBLIN = { r: 0.3255, line: 0.047, nub: [0.7345, 0.4235, 0.18, 0.153] };
const STRIKER = { r: 0.3035, line: 0.057, tip: 0.49 };
const VOIDS = {
  goblin: { core: '#10302a', edge: '#03070c', clouds: [['#2f9c6c', 0.22], ['#3b55d4', 0.14]], seed: 31 },
  striker: { core: '#33200f', edge: '#06050c', clouds: [['#d07a26', 0.2], ['#7b44d6', 0.14]], seed: 37 },
  seraph: { core: '#221547', edge: '#06040f', clouds: [['#8a63ff', 0.24], ['#3fa8ff', 0.14]], seed: 41 },
  mauler: { core: '#2b1709', edge: '#070403', clouds: [['#a8501c', 0.24], ['#6b2a10', 0.2]], seed: 43 },
  shade: { core: '#1d1e22', edge: '#050506', clouds: [['#5a5f6a', 0.2], ['#33363e', 0.22]], seed: 47 },
  seer: { core: '#0b1645', edge: '#03040f', clouds: [['#2d4fd8', 0.24], ['#16288a', 0.22]], seed: 53 },
};
// The Mauler's body: a square with heavily rounded corners ([x, y, size, corner radius]).
const MAULER = { body: [0.14, 0.14, 0.72, 0.27], line: 0.045 };
const MAULER_PALETTE = { stroke: ['#f2b97e', '#c8682a', '#7e3810'], glow: rgba('#b8581c', 0.65) };
// The star-maul, a separate sprite so it can be swung: drawn along +x from its grip, in
// world units (`w` × `h`, the grip `grip` in from the left, `unit` px per unit). The haft
// ends in a crosswise head `head` (centre along the haft, depth, width) holding a star;
// `tip` is the head's far edge.
export const MAUL_ART = { w: 1.12, h: 0.8, grip: 0.07, unit: 216, head: [0.78, 0.34, 0.66], tip: 0.95 };
// The Shade's body: rounded at the front, its back drawn out into three points, the
// tallest straight back, split by two sharp notches, mirrored. `back` lists the right half
// from the side round to the middle of the back as [angle°, height past the rim] (180° is
// straight back; below 0 cuts into the circle), joined by straight edges.
const SHADE = { r: 0.31, line: 0.045, back: [[116, 0], [143, 0.08], [159, -0.045], [180, 0.11]] };
const SHADE_PALETTE = { stroke: ['#878c96', '#878c96'], glow: rgba('#7c8392', 0.5) };
// The Shade's arms, a separate sprite so they can be swung: a crescent blade, thick in the
// middle and pointed at the tip, whose spine runs `len` along an arc of radius `bend`,
// starting from its root heading +x and curving toward -y (the right arm; the left is
// mirrored). Its inner edge is smooth, its outer edge barbed once `barb` of the way along.
// World units: the sprite is `w` × `h` with the root `rootX` in from the left and `rootY`
// down from the top, `unit` px per unit; `width` is half its thickness at the widest.
// `cue`: where along it (× len) the parry cue flashes.
export const BLADE_ART = { w: 0.86, h: 0.82, rootX: 0.08, rootY: 0.71, unit: 216, len: 1, bend: 0.68, width: 0.055, barb: 0.48, cue: 0.75 };
// A point on the blade's spine `along` from the root, in the sprite's frame (root at 0).
export function bladeAt(along) {
  const R = BLADE_ART.bend, a = along / R;
  return { x: R * Math.sin(a), y: -R * (1 - Math.cos(a)) };
}
// The Seer's body: a circle with a half-circle gulf of radius `gulf` cut into its front
// (centred on the rim), and behind it to either side a round hole of radius `hole` through
// the body, centred at `holes` (the other mirrored), the three set in a V.
const SEER = { r: 0.33, line: 0.045, gulf: 0.13, hole: 0.072, holes: [0.565, 0.34] };
const SEER_PALETTE = { stroke: ['#9fb4ff', '#3c5ee0', '#1b2f8f'], glow: rgba('#2f55ff', 0.7) };
// The Seraph's hull, nose to the right: [x, y] for the top half, mirrored below.
// Nose, wingtip, trailing edge, engine nozzle (outer, inner), tail notch.
const SERAPH_HULL = [[0.9, 0.5], [0.15, 0.18], [0.27, 0.3], [0.17, 0.35], [0.2, 0.43], [0.33, 0.5]];
const SERAPH_ENGINES = [[0.17, 0.39], [0.17, 0.61]];

function goblinPath() {
  const p = new Path2D();
  p.arc(0.5, 0.5, GOBLIN.r, 0, TAU);
  p.rect(...GOBLIN.nub);
  return p;
}

// Ring with a straight-edged ear spike on each back corner.
function strikerPath() {
  const { r, tip } = STRIKER;
  const p = new Path2D();
  const ear = (tipDeg, toDeg) => {
    p.lineTo(...polar(0.5, 0.5, tipDeg, tip));
    p.lineTo(...polar(0.5, 0.5, toDeg, r));
  };
  p.arc(0.5, 0.5, r, 254 * DEG, 466 * DEG);
  ear(131, 138);
  p.arc(0.5, 0.5, r, 138 * DEG, 222 * DEG);
  ear(229, 254);
  p.closePath();
  return p;
}

// A delta-winged star-fighter with twin engines in a notched tail.
function seraphPath() {
  const bottom = SERAPH_HULL.slice(1, -1).reverse().map(([x, y]) => [x, 1 - y]);
  const p = new Path2D();
  [...SERAPH_HULL, ...bottom].forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  p.closePath();
  return p;
}

function shadePath() {
  const { r, back } = SHADE;
  const right = back.map(([a, h]) => [a, r + h]);
  const left = right.slice(0, -1).reverse().map(([a, rad]) => [360 - a, rad]);
  const p = new Path2D();
  p.arc(0.5, 0.5, r, -back[0][0] * DEG, back[0][0] * DEG);
  for (const [a, rad] of [...right.slice(1), ...left]) p.lineTo(...polar(0.5, 0.5, a, rad));
  p.closePath();
  return p;
}

// The holes need the even-odd rule to fill.
function seerPath() {
  const { r, gulf, hole, holes: [hx, hy] } = SEER;
  // Where the gulf meets the rim: the angle round the body, and round the gulf's centre.
  const body = Math.acos(1 - (gulf * gulf) / (2 * r * r));
  const cut = Math.atan2(-Math.sin(body), Math.cos(body) - 1);
  const p = new Path2D();
  p.arc(0.5, 0.5, r, body, TAU - body);
  p.arc(0.5 + r, 0.5, gulf, cut, -cut, true);
  p.closePath();
  for (const y of [hy, 1 - hy]) {
    p.moveTo(hx + hole, y);
    p.arc(hx, y, hole, 0, TAU);
    p.closePath();
  }
  return p;
}

function maulerPath() {
  const [x, y, s, r] = MAULER.body;
  const p = new Path2D();
  p.roundRect(x, y, s, s, r);
  return p;
}

function outline(S, palette, draw) {
  const { c, ctx, px } = surface(S);
  ctx.strokeStyle = linear(ctx, 0.2, 0.15, 0.8, 0.85, palette.stroke);
  glow(ctx, palette.glow, px * 0.035, () => draw(ctx));
  return c;
}

function goblinOutline(S = 256) {
  const ring = new Path2D();
  ring.arc(0.5, 0.5, GOBLIN.r, 0, TAU);
  const nub = new Path2D();
  nub.rect(...GOBLIN.nub);
  const outsideNub = new Path2D();
  outsideNub.rect(0, 0, 1, 1);
  outsideNub.rect(...GOBLIN.nub);
  const palette = { stroke: ['#b4ffd0', '#3ddc84', '#169a4c'], glow: rgba('#2bff88', 0.7) };
  return outline(S, palette, (ctx) => {
    ctx.lineWidth = GOBLIN.line;
    ctx.save();
    ctx.clip(outsideNub, 'evenodd');
    ctx.stroke(ring);
    ctx.restore();
    ctx.stroke(nub);
  });
}

function strikerOutline(S = 256) {
  const palette = { stroke: ['#ffe2a0', '#ffad3b', '#f07c12'], glow: rgba('#ff9a2e', 0.7) };
  return outline(S, palette, (ctx) => {
    ctx.lineWidth = STRIKER.line;
    ctx.stroke(strikerPath());
  });
}

// Hull outline with faint panel seams, a crystal canopy and star-glint engines.
function seraphOutline(S = 256) {
  const palette = { stroke: ['#f4eeff', '#b9a4ff', '#6b58f0'], glow: rgba('#9a84ff', 0.75) };
  return outline(S, palette, (ctx) => {
    ctx.lineWidth = 0.04;
    ctx.stroke(seraphPath());
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 0.018;
    ctx.beginPath();
    ctx.moveTo(0.56, 0.5); ctx.lineTo(0.38, 0.5); // spine, behind the canopy
    for (const [x, y] of SERAPH_ENGINES) { ctx.moveTo(0.66, 0.5); ctx.lineTo(x + 0.08, y); } // seams out to the engines
    ctx.stroke();
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(0.76, 0.5); ctx.lineTo(0.64, 0.465); ctx.lineTo(0.57, 0.5); ctx.lineTo(0.64, 0.535);
    ctx.closePath();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
    ctx.globalAlpha = 1;
    for (const [x, y] of SERAPH_ENGINES) sparkle(ctx, x, y, 0.06, '#d9ceff', 0.95);
  });
}

// The rounded-square body with a faint brow across the front.
function maulerOutline(S = 256) {
  return outline(S, MAULER_PALETTE, (ctx) => {
    ctx.lineWidth = MAULER.line;
    ctx.stroke(maulerPath());
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 0.02;
    ctx.beginPath();
    ctx.moveTo(0.64, 0.3); ctx.quadraticCurveTo(0.73, 0.5, 0.64, 0.7);
    ctx.stroke();
  });
}

function shadeOutline(S = 256) {
  return outline(S, SHADE_PALETTE, (ctx) => {
    ctx.lineWidth = SHADE.line;
    ctx.lineJoin = 'miter'; // keeps the points and notches sharp
    ctx.stroke(shadePath());
  });
}

function seerOutline(S = 256) {
  return outline(S, SEER_PALETTE, (ctx) => {
    ctx.lineWidth = SEER.line;
    ctx.stroke(seerPath());
  });
}

// One arm: a crescent blade, widest a little before the middle, its outer edge stepping
// out to a single barb that points toward the tip.
function shadeBlade() {
  const { w, h, rootX, rootY, unit, len, bend, width, barb } = BLADE_ART;
  const { c, ctx, px } = surface(Math.round(w * unit), Math.round(h * unit), unit);
  ctx.translate(rootX, rootY);
  // Half its thickness `t` of the way along: slim at the root, full by 0.4, then tapering.
  const half = (t) => (t < 0.4 ? lerp(0.35, 1, smoothStep01(t / 0.4)) : (1 - (t - 0.4) / 0.6) ** 0.85) * width;
  // `off` > 0: outward, away from the curve's centre.
  const edge = (t, off) => {
    const a = (t * len) / bend, { x, y } = bladeAt(t * len);
    return [x + Math.sin(a) * off, y + Math.cos(a) * off];
  };
  const N = 28, outer = [], inner = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, rise = clamp01((t - (barb - 0.16)) / 0.16);
    inner.push(edge(t, -half(t)));
    if (t > barb && t - 1 / N <= barb) outer.push(edge(barb, half(barb) + width * 1.1), edge(barb + 0.01, half(barb + 0.01))); // the barb
    else outer.push(edge(t, half(t) + (t < barb ? rise * rise * width * 1.1 : 0)));
  }
  const path = new Path2D();
  path.moveTo(...inner[0]);
  for (const pt of inner.slice(1)) path.lineTo(...pt);
  for (const pt of outer.reverse()) path.lineTo(...pt);
  path.quadraticCurveTo(-width * 0.9, 0, ...inner[0]);
  ctx.fillStyle = VOIDS.shade.core;
  ctx.fill(path);
  glow(ctx, SHADE_PALETTE.glow, px * 0.03, () => {
    ctx.strokeStyle = SHADE_PALETTE.stroke[0];
    ctx.lineWidth = SHADE.line * 0.75;
    ctx.stroke(path);
  });
  return c;
}

// The star-maul: a haft with a knob at the grip end and a void-filled head with a fallen
// star glinting in it.
function starMaul() {
  const { w, h, grip, unit, head: [at, depth, width] } = MAUL_ART;
  const { c, ctx, px } = surface(Math.round(w * unit), Math.round(h * unit), unit);
  ctx.translate(grip, h / 2);
  const stroke = linear(ctx, 0, -width / 2, at, width / 2, MAULER_PALETTE.stroke);
  const headPath = new Path2D();
  headPath.roundRect(at - depth / 2, -width / 2, depth, width, 0.065);
  ctx.fillStyle = radial(ctx, at, 0, width * 0.6, [VOIDS.mauler.core, VOIDS.mauler.edge]);
  ctx.fill(headPath);
  glow(ctx, MAULER_PALETTE.glow, px * 0.03, () => {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 0.075;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(at - depth / 2, 0);
    ctx.stroke();
    ctx.fillStyle = stroke;
    ctx.beginPath();
    ctx.arc(-0.01, 0, 0.055, 0, TAU);
    ctx.fill();
    ctx.lineWidth = MAULER.line * 1.1;
    ctx.stroke(headPath);
  });
  ctx.fillStyle = radial(ctx, at, 0, depth * 0.6, [rgba('#ff9a4a', 0.45), rgba('#ff9a4a', 0)]);
  ctx.fill(headPath);
  sparkle(ctx, at, 0, 0.12, '#ffe6c8', 0.95);
  for (const [dx, dy, r] of [[-0.075, -0.21, 0.035], [0.065, 0.2, 0.03]]) sparkle(ctx, at + dx, dy, r, '#ffd2a0', 0.7);
  return c;
}

// The enemy's body: a dark nebula (the twinkling star field is laid over it at runtime).
// `rule`: the fill rule, 'evenodd' for a body with holes through it.
function voidFill(path, { core, edge, clouds, seed }, rule = 'nonzero', S = 256) {
  const { c, ctx } = surface(S);
  const rand = seededRandom(seed);
  ctx.fillStyle = radial(ctx, 0.5, 0.5, 0.42, [core, edge], 0.4, 0.38);
  ctx.fill(path, rule);
  ctx.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 5; i++) {
    const [color, a] = clouds[i % clouds.length];
    const x = lerp(0.25, 0.75, rand()), y = lerp(0.25, 0.75, rand()), r = lerp(0.12, 0.26, rand());
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rand() * TAU); ctx.scale(1, lerp(0.35, 0.7, rand()));
    ctx.fillStyle = radial(ctx, 0, 0, r, [rgba(color, a), rgba(color, 0)]);
    ctx.fillRect(-r, -r, 2 * r, 2 * r);
    ctx.restore();
  }
  return c;
}

// ---------------------------------------------------------------- player & pickups

// Tail followers: white ring around a black core, like the body.
function tail(S = 128) {
  const { c, ctx, px } = surface(S);
  ctx.beginPath();
  ctx.arc(0.5, 0.5, 0.45, 0, TAU);
  ctx.fillStyle = '#000000';
  ctx.fill();
  glow(ctx, rgba('#ffffff', 0.85), px * 0.04, () => {
    ctx.lineWidth = 0.06;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  });
  return c;
}

// Dash afterimage: the body's ring alone, glowing over a faint inner haze, white for tinting.
function dashGhost(S = 128) {
  const { c, ctx, px } = surface(S);
  ctx.beginPath();
  ctx.arc(0.5, 0.5, 0.45, 0, TAU);
  ctx.fillStyle = radial(ctx, 0.5, 0.5, 0.45, [rgba('#ffffff', 0), rgba('#ffffff', 0.06), rgba('#ffffff', 0.22)]);
  ctx.fill();
  glow(ctx, rgba('#ffffff', 0.9), px * 0.05, () => {
    ctx.lineWidth = 0.06;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  });
  return c;
}

// Octahedron crystal: four shaded facets, a light cross through the centre, dark rim.
function crystal(ctx, { x, y, hw, hh, rot = 0, facets, rim, rimWidth, cross, crossWidth }) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const T = [0, -hh], R = [hw, 0], B = [0, hh], L = [-hw, 0], C = [-hw * 0.14, -hh * 0.12];
  const diamond = new Path2D();
  diamond.moveTo(...T); diamond.lineTo(...R); diamond.lineTo(...B); diamond.lineTo(...L); diamond.closePath();
  ctx.fillStyle = facets[1];
  ctx.fill(diamond);
  [[T, L], [T, R], [B, L], [B, R]].forEach(([a, b], i) => {
    ctx.beginPath();
    ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...C); ctx.closePath();
    ctx.fillStyle = facets[i];
    ctx.fill();
  });
  ctx.strokeStyle = cross;
  ctx.lineWidth = crossWidth;
  ctx.beginPath();
  for (const v of [T, R, B, L]) { ctx.moveTo(...C); ctx.lineTo(...v); }
  ctx.stroke();
  ctx.strokeStyle = rim;
  ctx.lineWidth = rimWidth;
  ctx.stroke(diamond);
  ctx.restore();
}

// The Anchor's thrown crystal: the one on its icon, in its blues but standing upright.
function anchorObject(S = 256) {
  const { c, ctx } = surface(S);
  ctx.fillStyle = radial(ctx, 0.5, 0.5, 0.48, [rgba('#cfe0ff', 0.6), rgba('#6d8fff', 0.2), rgba('#6d8fff', 0)]);
  ctx.fillRect(0, 0, 1, 1);
  crystal(ctx, {
    x: 0.5, y: 0.5, hw: 0.25, hh: 0.36,
    facets: ['#5d84ff', '#2848f2', '#1b33c2', '#3d63ff'],
    rim: '#0a1030', rimWidth: 0.028, cross: '#e8efff', crossWidth: 0.028,
  });
  sparkle(ctx, 0.42, 0.37, 0.09, '#ffffff', 1, 0.3);
  return c;
}

// Glowing orb, white so it can be tinted. The body is 1/ORB_PAD of the texture; the
// rest is halo.
function orb(S = 128) {
  const { c, ctx } = surface(S);
  const r = 0.5 / ORB_PAD;
  ctx.fillStyle = radial(ctx, 0.5, 0.5, 0.5, [rgba('#ffffff', 0.55), rgba('#ffffff', 0.18), rgba('#ffffff', 0)]);
  ctx.fillRect(0, 0, 1, 1);
  ctx.beginPath();
  ctx.arc(0.5, 0.5, r, 0, TAU);
  ctx.fillStyle = radial(ctx, 0.5, 0.5, r, ['#ffffff', '#f2f2f2', '#c8c8c8'], 0.44, 0.42);
  ctx.fill();
  sparkle(ctx, 0.45, 0.44, r * 0.6, '#ffffff', 0.9);
  return c;
}

// Projectile trail: a soft tapering streak, 1 texture-width long, its head at COMET_HEAD
// and fading to nothing toward the left.
function comet(W = 256, H = 64) {
  const { c, ctx, px } = surface(W, H, W);
  const mid = H / W / 2, r = mid * 0.8;
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.quadraticCurveTo(COMET_HEAD * 0.55, mid - r, COMET_HEAD, mid - r);
  ctx.arc(COMET_HEAD, mid, r, -Math.PI / 2, Math.PI / 2);
  ctx.quadraticCurveTo(COMET_HEAD * 0.55, mid + r, 0, mid);
  ctx.fillStyle = linear(ctx, 0, 0, COMET_HEAD + r, 0, [rgba('#ffffff', 0), rgba('#ffffff', 0.35), rgba('#ffffff', 1)]);
  glow(ctx, rgba('#ffffff', 0.6), px * 0.012, () => ctx.fill());
  return c;
}

// Chaser core: a faceted kite gem.
function core(W = 128, H = 160) {
  const { c, ctx } = surface(W, H, W);
  const h = H / W;
  const T = [0.5, 0.02], R = [0.97, h * 0.35], B = [0.5, h - 0.02], L = [0.03, h * 0.35], C = [0.5, h * 0.35];
  [[T, L, '#ffffff'], [T, R, '#e4e8ff'], [L, B, '#c3caf4'], [R, B, '#eef0ff']].forEach(([a, b, color]) => {
    ctx.beginPath();
    ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...C); ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.01;
    ctx.stroke(); // closes hairline seams between facets
  });
  ctx.strokeStyle = rgba('#9aa6e6', 0.6);
  ctx.lineWidth = 0.02;
  ctx.beginPath();
  ctx.moveTo(...L); ctx.lineTo(...R);
  ctx.moveTo(...T); ctx.lineTo(...B);
  ctx.stroke();
  sparkle(ctx, 0.34, h * 0.24, 0.13, '#ffffff', 1, 0.1);
  return c;
}

function hexPath(w, h, flatTop) {
  const p = new Path2D();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + (flatTop ? 0 : Math.PI / 6);
    const x = w / 2 + (Math.cos(a) * w) / 2 * (flatTop ? 1 : 1 / Math.cos(Math.PI / 6));
    const y = h / 2 + (Math.sin(a) * h) / 2 * (flatTop ? 1 / Math.sin(Math.PI / 3) : 1);
    if (i === 0) p.moveTo(x, y); else p.lineTo(x, y);
  }
  p.closePath();
  return p;
}

// Hexagon that fills its texture exactly: a crystal with faint facets and a bright
// rim inside the edge (strokes are clipped so the silhouette never grows).
function hexCrystal(Wpx, Hpx, flatTop, { fill, facet, rim, inner, star }) {
  const { c, ctx } = surface(Wpx, Hpx, Wpx);
  const w = 1, h = Hpx / Wpx;
  const hex = hexPath(w, h, flatTop);
  ctx.fillStyle = typeof fill === 'function' ? fill(ctx, h) : fill;
  ctx.fill(hex);
  ctx.save();
  ctx.clip(hex);
  const s = 0.6;
  const innerHex = new Path2D();
  innerHex.addPath(hexPath(w, h, flatTop), new DOMMatrix().translate(w / 2, h / 2).scale(s).translate(-w / 2, -h / 2));
  ctx.fillStyle = inner;
  ctx.fill(innerHex);
  ctx.strokeStyle = facet;
  ctx.lineWidth = 0.014;
  ctx.stroke(innerHex);
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + (flatTop ? 0 : Math.PI / 6);
    const ox = (Math.cos(a) * w) / 2 * (flatTop ? 1 : 1 / Math.cos(Math.PI / 6));
    const oy = (Math.sin(a) * h) / 2 * (flatTop ? 1 / Math.sin(Math.PI / 3) : 1);
    ctx.moveTo(w / 2 + ox * s, h / 2 + oy * s);
    ctx.lineTo(w / 2 + ox, h / 2 + oy);
  }
  ctx.stroke();
  ctx.strokeStyle = rim;
  ctx.lineWidth = 0.06;
  ctx.stroke(hex);
  ctx.restore();
  sparkle(ctx, 0.5, h / 2, 0.12, star, 0.9);
  return c;
}

// The Warden: a white crystal hexagon.
function hexFlat() {
  return hexCrystal(256, 222, true, {
    fill: (ctx, h) => linear(ctx, 0, 0, 0, h, ['#ffffff', '#f1f2f8', '#dfe2ee']),
    inner: '#f6f7fc', facet: rgba('#c3c8de', 0.9), rim: '#ffffff', star: '#c5cbe6',
  });
}

// The exit: a hex portal with a bright rim and core (tinted grey in game).
function hexPointed() {
  return hexCrystal(222, 256, false, {
    fill: (ctx, h) => radial(ctx, 0.5, h / 2, 0.6, ['#e6e6e6', '#bdbdbd', '#a4a4a4']),
    inner: '#d2d2d2', facet: rgba('#ffffff', 0.55), rim: '#ffffff', star: '#ffffff',
  });
}

// ---------------------------------------------------------------- aspect icons

function anchorIcon(S = 256) {
  const { c, ctx, px } = surface(S);
  space(ctx, seededRandom(101), {
    core: '#0b1236', edge: '#020309',
    nebulae: [[0.5, 0.5, 0.48, '#4f7dff', 0.45], [0.3, 0.7, 0.3, '#7a4dff', 0.18]],
  });
  ctx.fillStyle = radial(ctx, 0.5, 0.5, 0.42, [rgba('#cfe0ff', 0.55), rgba('#6d8fff', 0.18), rgba('#6d8fff', 0)]);
  ctx.fillRect(0, 0, 1, 1);
  // A cut gem: a bright table set off-centre toward the light, ringed by eight bevel
  // facets shaded from the top-left, a light-catching upper rim and faint rays behind.
  ctx.save();
  ctx.translate(0.5, 0.5);
  ctx.rotate(35 * DEG);
  const hw = 0.2, hh = 0.3;
  ctx.save();
  ctx.filter = `blur(${px * 0.005}px)`;
  for (const [len, w, a] of [[0.47, 0.016, 0], [0.47, 0.016, 180], [0.33, 0.012, 90], [0.33, 0.012, 270]]) {
    ctx.save();
    ctx.rotate((a - 90) * DEG);
    ctx.fillStyle = linear(ctx, 0, 0, len, 0, [rgba('#ffffff', 0.9), rgba('#b9cbff', 0.6), rgba('#6d8fff', 0)]);
    ctx.beginPath();
    ctx.moveTo(0, -w); ctx.lineTo(len, 0); ctx.lineTo(0, w); ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  const O = [[0, -hh], [hw, 0], [0, hh], [-hw, 0]]; // top, right, bottom, left
  const C = [-hw * 0.12, -hh * 0.1];
  const I = O.map(([x, y]) => [C[0] + x * 0.42, C[1] + y * 0.42]);
  const outline = new Path2D();
  O.forEach((p, i) => (i ? outline.lineTo(...p) : outline.moveTo(...p)));
  outline.closePath();
  glow(ctx, rgba('#6d8fff', 0.95), px * 0.07, () => { ctx.fillStyle = '#2848f2'; ctx.fill(outline); });
  // Bevels, edge by edge (top→right, right→bottom, bottom→left, left→top): [outer, inner] shades.
  const bevels = [['#7d9dff', '#5d84ff'], ['#1b33c2', '#2442d8'], ['#2848f2', '#3157f5'], ['#a9c0ff', '#86a3ff']];
  const tri = (a, b, d, color) => {
    ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...d); ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 0.003; ctx.stroke(); // closes hairline seams
  };
  O.forEach((o, i) => {
    const j = (i + 1) % 4;
    tri(o, O[j], I[j], bevels[i][0]);
    tri(o, I[j], I[i], bevels[i][1]);
  });
  const table = new Path2D();
  I.forEach((p, i) => (i ? table.lineTo(...p) : table.moveTo(...p)));
  table.closePath();
  ctx.fillStyle = linear(ctx, I[3][0], I[0][1], I[1][0], I[2][1], ['#dbe5ff', '#7f9cff', '#3d63ff']);
  ctx.fill(table);
  // Facet edges, the table's rim, then the outline: dark, with the upper edges lit.
  ctx.strokeStyle = rgba('#e8efff', 0.45);
  ctx.lineWidth = 0.006;
  ctx.beginPath();
  O.forEach((o, i) => { ctx.moveTo(...o); ctx.lineTo(...I[i]); ctx.moveTo(...o); ctx.lineTo(...I[(i + 3) % 4]); });
  ctx.stroke();
  ctx.strokeStyle = rgba('#ffffff', 0.85);
  ctx.lineWidth = 0.008;
  ctx.stroke(table);
  ctx.strokeStyle = '#0a1030';
  ctx.lineWidth = 0.02;
  ctx.stroke(outline);
  ctx.strokeStyle = rgba('#ffffff', 0.9);
  ctx.lineWidth = 0.007;
  ctx.beginPath();
  ctx.moveTo(...O[3]); ctx.lineTo(...O[0]); ctx.lineTo(...O[1]);
  ctx.stroke();
  // A soft gloss across the table.
  ctx.save();
  ctx.clip(table);
  ctx.fillStyle = radial(ctx, I[3][0] * 0.6 + C[0] * 0.4, I[0][1] * 0.6 + C[1] * 0.4, 0.06, [rgba('#ffffff', 0.75), rgba('#ffffff', 0)]);
  ctx.fillRect(-hw, -hh, 2 * hw, 2 * hh);
  ctx.restore();
  ctx.restore();
  sparkle(ctx, 0.41, 0.36, 0.075, '#ffffff', 1, 0.3);
  sparkle(ctx, 0.63, 0.66, 0.035, '#dfe8ff', 0.85, -0.2);
  sparkle(ctx, 0.66, 0.31, 0.025, '#dfe8ff', 0.7);
  return c;
}

function flashIcon(S = 256) {
  const { c, ctx, px } = surface(S);
  space(ctx, seededRandom(202), {
    core: '#1d1606', edge: '#030302',
    nebulae: [[0.5, 0.5, 0.45, '#ffcc00', 0.35], [0.7, 0.3, 0.25, '#ff8a00', 0.12]],
  });
  ctx.fillStyle = radial(ctx, 0.5, 0.5, 0.36, [rgba('#ffe14a', 0.6), rgba('#ffc400', 0.2), rgba('#ffc400', 0)]);
  ctx.fillRect(0, 0, 1, 1);
  // A burst of light rather than a star: two hazy four-arm flares crossed at an odd angle,
  // faint rays scattering between them and a bloom swallowing the middle. Everything is
  // blurred and fades out along its length, so no edge reads crisp.
  const rand = seededRandom(212);
  const fadeOut = (r, a) => radial(ctx, 0, 0, r, [rgba('#ffffff', a), rgba('#ffe680', a), rgba('#ffc42a', 0.85 * a), rgba('#f59a00', 0.5 * a), rgba('#f59a00', 0)]);
  ctx.save();
  ctx.translate(0.5, 0.5); ctx.rotate(-14 * DEG);
  // The duplicate behind, turned 38° and a little shorter.
  ctx.save();
  ctx.rotate(38 * DEG);
  ctx.filter = `blur(${px * 0.016}px)`;
  ctx.fillStyle = fadeOut(0.38, 0.9);
  ctx.fill(roughStar([0.33, 0.38, 0.29, 0.36], 0.07, rand));
  ctx.restore();
  // Faint rays: long thin slivers fading to nothing.
  ctx.save();
  ctx.filter = `blur(${px * 0.008}px)`;
  for (let i = 0; i < 7; i++) {
    const len = lerp(0.24, 0.42, rand()), w = lerp(0.008, 0.016, rand());
    ctx.save();
    ctx.rotate(((i + rand() * 0.6) / 7) * TAU);
    ctx.fillStyle = linear(ctx, 0, 0, len, 0, [rgba('#fff1a6', 0.55), rgba('#ffc42a', 0)]);
    ctx.beginPath();
    ctx.moveTo(0, -w); ctx.lineTo(len, 0); ctx.lineTo(0, w); ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  // The main flare, smeared by a few offset ghosts of itself.
  const arms = [0.4, 0.47, 0.36, 0.45];
  ctx.save();
  ctx.filter = `blur(${px * 0.022}px)`;
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.translate(lerp(-0.02, 0.02, rand()), lerp(-0.02, 0.02, rand()));
    ctx.rotate(lerp(-7, 7, rand()) * DEG);
    ctx.fillStyle = fadeOut(0.45, 0.4);
    ctx.fill(roughStar(arms.map((a) => a * lerp(0.9, 1.08, rand())), 0.09, rand));
    ctx.restore();
  }
  ctx.restore();
  glow(ctx, rgba('#ffcf3a', 0.9), px * 0.08, () => {
    ctx.filter = `blur(${px * 0.012}px)`;
    ctx.fillStyle = fadeOut(0.47, 1);
    ctx.fill(roughStar(arms, 0.06, rand));
  });
  // Bloom: a wide soft haze and a white-hot heart.
  ctx.filter = `blur(${px * 0.01}px)`;
  ctx.fillStyle = radial(ctx, 0, 0, 0.2, [rgba('#fff6cf', 0.45), rgba('#ffd65a', 0.15), rgba('#ffc42a', 0)]);
  ctx.fillRect(-0.25, -0.25, 0.5, 0.5);
  ctx.fillStyle = radial(ctx, 0, 0, 0.09, ['#ffffff', rgba('#ffffff', 0.8), rgba('#ffffff', 0)]);
  ctx.fillRect(-0.1, -0.1, 0.2, 0.2);
  ctx.restore();
  sparkle(ctx, 0.77, 0.28, 0.055, '#fff6cf', 0.8, 0.2);
  sparkle(ctx, 0.25, 0.74, 0.04, '#fff6cf', 0.65, -0.3);
  return c;
}

function crescentIcon(S = 256) {
  const { c, ctx, px } = surface(S);
  space(ctx, seededRandom(303), {
    core: '#141640', edge: '#020208',
    nebulae: [[0.55, 0.5, 0.45, '#5d73ff', 0.35], [0.3, 0.35, 0.28, '#9b5cff', 0.15]],
  });
  stamp(ctx, px, rgba('#9fb4ff', 0.95), px * 0.1, (l) => {
    l.fillStyle = radial(l, 0.5, 0.5, 0.34, ['#ffffff', '#e8ecff', '#b9c6ff'], 0.62, 0.45);
    l.beginPath(); l.arc(0.5, 0.5, 0.34, 0, TAU); l.fill();
    l.globalCompositeOperation = 'destination-out';
    l.beginPath(); l.arc(0.36, 0.5, 0.3, 0, TAU); l.fill();
  });
  sparkle(ctx, 0.3, 0.32, 0.05, '#ffffff', 0.9);
  return c;
}

// A sweeping white claw: one broad blade with a thinner crescent hooked beneath it.
function riftIcon(S = 256) {
  const { c, ctx, px } = surface(S);
  space(ctx, seededRandom(404), {
    core: '#170c30', edge: '#030208',
    nebulae: [[0.4, 0.55, 0.45, '#9b5cff', 0.35], [0.75, 0.3, 0.25, '#5d73ff', 0.15]],
  });
  const main = new Path2D();
  main.moveTo(0.1, 0.86);
  main.bezierCurveTo(0.12, 0.42, 0.5, 0.12, 0.9, 0.1);
  main.bezierCurveTo(0.6, 0.32, 0.44, 0.58, 0.36, 0.84);
  main.quadraticCurveTo(0.22, 0.95, 0.1, 0.86);
  const hook = new Path2D();
  hook.moveTo(0.4, 0.94);
  hook.bezierCurveTo(0.72, 0.92, 0.92, 0.66, 0.9, 0.3);
  hook.bezierCurveTo(0.82, 0.58, 0.66, 0.74, 0.46, 0.8);
  hook.quadraticCurveTo(0.38, 0.86, 0.4, 0.94);
  glow(ctx, rgba('#b57cff', 0.95), px * 0.07, () => {
    ctx.fillStyle = '#ece2ff';
    ctx.fill(main);
    ctx.fill(hook);
  });
  ctx.fillStyle = linear(ctx, 0.15, 0.85, 0.85, 0.15, ['#ffffff', '#ffffff', '#d4c4ff']);
  ctx.fill(main);
  ctx.fill(hook);
  sparkle(ctx, 0.9, 0.1, 0.07, '#ffffff', 1, 0.3);
  sparkle(ctx, 0.9, 0.3, 0.05, '#ffffff', 0.9, 0.1);
  return c;
}

// The eye in the dark: one slit-pupilled light-blue eye glaring out, already locked on. The
// upper lid slants down toward the nose, the iris is starry and streaked out from the
// pupil, the slit holds the glint of its prey, and a wet catchlight sits on top. No
// outline or glow: the eye's edge just feathers away into the dark.
function predatorIcon(S = 256) {
  const { c, ctx, px } = surface(S);
  const rand = seededRandom(505);
  space(ctx, rand, {
    core: '#06121c', edge: '#010204', stars: 30,
    nebulae: [[0.5, 0.5, 0.5, '#2f8fd6', 0.3], [0.8, 0.2, 0.28, '#7ad0ff', 0.12]],
  });
  const ex = 0.52, ey = 0.54; // iris centre
  const eye = new Path2D();
  eye.moveTo(0.04, 0.6);
  eye.bezierCurveTo(0.26, 0.3, 0.64, 0.2, 0.96, 0.34);
  eye.bezierCurveTo(0.84, 0.84, 0.32, 0.94, 0.04, 0.6);
  // Painted on its own layer, then cut to a blurred eye shape so every edge fades out.
  const { c: layer, ctx: l } = surface(S);
  l.fillStyle = radial(l, ex, ey, 0.46, ['#3f8fc4', '#1d5a86', '#0f3352']);
  l.fillRect(0, 0, 1, 1);
  // Iris: near white round the pupil, deepening to blue and melting into the rest of the eye.
  const R = 0.33;
  l.beginPath();
  l.arc(ex, ey, R, 0, TAU);
  l.fillStyle = radial(l, ex, ey, R, ['#f0fbff', '#bfeaff', '#6cccff', '#2a8fd0', rgba('#2a8fd0', 0)]);
  l.fill();
  l.lineWidth = 0.005;
  for (let i = 0; i < 120; i++) {
    const a = rand() * TAU, r0 = lerp(0.04, 0.1, rand()), r1 = lerp(0.18, 0.31, rand());
    l.strokeStyle = rand() < 0.55 ? rgba('#0d3a5a', lerp(0.25, 0.6, rand())) : rgba('#e6f8ff', lerp(0.15, 0.45, rand()));
    l.beginPath();
    l.moveTo(ex + Math.cos(a) * r0, ey + Math.sin(a) * r0);
    l.lineTo(ex + Math.cos(a) * r1, ey + Math.sin(a) * r1);
    l.stroke();
  }
  for (let i = 0; i < 14; i++) {
    const a = rand() * TAU, d = lerp(0.09, 0.27, rand());
    sparkle(l, ex + Math.cos(a) * d, ey + Math.sin(a) * d, lerp(0.009, 0.02, rand()), '#eefaff', lerp(0.4, 0.9, rand()));
  }
  // The slit, glowing at its edge, with the prey's glint caught inside.
  const slit = new Path2D();
  slit.moveTo(ex, 0.2);
  slit.quadraticCurveTo(ex + 0.075, ey, ex, 0.9);
  slit.quadraticCurveTo(ex - 0.075, ey, ex, 0.2);
  glow(l, rgba('#bff0ff', 0.95), px * 0.05, () => { l.fillStyle = '#010306'; l.fill(slit); });
  sparkle(l, ex, ey + 0.05, 0.026, '#ffffff', 0.95);
  // The lid's shadow, heavier toward the nose, and a little rim light along the bottom lid.
  l.fillStyle = linear(l, 0.3, 0.24, 0.38, 0.56, [rgba('#000000', 0.8), rgba('#000000', 0.35), rgba('#000000', 0)]);
  l.fillRect(0, 0, 1, 1);
  l.fillStyle = linear(l, 0, 0.88, 0, 0.7, [rgba('#a8e4ff', 0.35), rgba('#a8e4ff', 0)]);
  l.fillRect(0, 0, 1, 1);
  const { c: mask, ctx: m } = surface(S);
  m.filter = `blur(${px * 0.05}px)`;
  m.fill(eye);
  l.globalCompositeOperation = 'destination-in';
  l.drawImage(mask, 0, 0, 1, 1);
  ctx.drawImage(layer, 0, 0, 1, 1);
  // Catchlight.
  ctx.beginPath();
  ctx.ellipse(0.4, 0.46, 0.034, 0.02, -0.5, 0, TAU);
  ctx.fillStyle = rgba('#ffffff', 0.85); ctx.fill();
  sparkle(ctx, 0.4, 0.46, 0.085, '#ffffff', 1, 0.25);
  return c;
}

// ---------------------------------------------------------------- ui icons

// Four-point star outline (the sparkle's shape, without its halo).
function starPath(x, y, r, pinch = 0.14) {
  const k = r * pinch, p = new Path2D();
  p.moveTo(x + r, y);
  p.quadraticCurveTo(x + k, y + k, x, y + r);
  p.quadraticCurveTo(x - k, y + k, x - r, y);
  p.quadraticCurveTo(x - k, y - k, x, y - r);
  p.quadraticCurveTo(x + k, y - k, x + r, y);
  return p;
}

// A hand-drawn-looking four-point star at the origin: `arms` are the right, down, left and
// up arm lengths, and each tip and waist is nudged a little at random.
function roughStar(arms, pinch, rand) {
  const p = new Path2D();
  const r = Math.max(...arms), k = r * pinch;
  const tips = arms.map((a, i) => {
    const ang = (i * 90 + lerp(-3, 3, rand())) * DEG;
    return [Math.cos(ang) * a, Math.sin(ang) * a];
  });
  const waist = [[k, k], [-k, k], [-k, -k], [k, -k]];
  p.moveTo(...tips[0]);
  for (let i = 0; i < 4; i++) {
    const [wx, wy] = waist[i], j = lerp(0.7, 1.3, rand());
    p.quadraticCurveTo(wx * j, wy * j, ...tips[(i + 1) % 4]);
  }
  p.closePath();
  return p;
}

// A gold coin struck with the four-point star: bevelled rim around a recessed face,
// lit from the top left. No backdrop, so it sits inline next to text.
function coinIcon(S = 128) {
  const { c, ctx, px } = surface(S);
  const R = 0.44, F = 0.34;
  glow(ctx, rgba('#ffcf3a', 0.55), px * 0.06, () => {
    ctx.beginPath();
    ctx.arc(0.5, 0.5, R, 0, TAU);
    ctx.fillStyle = linear(ctx, 0.15, 0.1, 0.85, 0.9, ['#fff3b8', '#ffd447', '#d99a12', '#8a5206']);
    ctx.fill();
  });
  // Recessed face: lit the other way round, so it reads as sunk below the rim.
  ctx.beginPath();
  ctx.arc(0.5, 0.5, F, 0, TAU);
  ctx.fillStyle = linear(ctx, 0.2, 0.2, 0.8, 0.8, ['#b97a0c', '#e9ad1f', '#ffd75a']);
  ctx.fill();
  ctx.strokeStyle = rgba('#5c3503', 0.55);
  ctx.lineWidth = 0.018;
  ctx.stroke();
  // Raised star: dark drop to the bottom right, then the bright face.
  const star = starPath(0.5, 0.5, 0.24, 0.16);
  ctx.save();
  ctx.translate(0.014, 0.018);
  ctx.fillStyle = rgba('#5c3503', 0.6);
  ctx.fill(star);
  ctx.restore();
  ctx.fillStyle = radial(ctx, 0.5, 0.5, 0.26, ['#fffbe6', '#ffe78a', '#f2b72a'], 0.44, 0.42);
  ctx.fill(star);
  // Rim highlight along the lit edge.
  ctx.beginPath();
  ctx.arc(0.5, 0.5, R - 0.02, Math.PI * 0.95, Math.PI * 1.6);
  ctx.strokeStyle = rgba('#ffffff', 0.75);
  ctx.lineWidth = 0.02;
  ctx.stroke();
  sparkle(ctx, 0.27, 0.25, 0.1, '#ffffff', 1, 0.2);
  return c;
}

function mixHex(a, b, t) {
  const p = (h) => [0, 8, 16].map((s) => (parseInt(h.slice(1), 16) >> (16 - s)) & 255);
  const ca = p(a), cb = p(b);
  return `rgb(${ca.map((v, i) => Math.round(lerp(v, cb[i], t))).join(',')})`;
}

// Shop gems, one per aspect tier, each a fancier cut than the last: a rhombus for Gift, a
// long hexagon for Prestige and an eight-point star brilliant for Mythic (`notch` pulls
// every other point in). Bevel facets lit from the top left around a bright table, a white
// rim, a sheen and a glint. No backdrop.
const GEM_CUTS = {
  gift: { color: '#5999ff', sides: 4, rx: 0.3, ry: 0.42, table: 0.45 },
  prestige: { color: '#9459f2', sides: 6, rx: 0.32, ry: 0.42, table: 0.5 },
  mythic: { color: '#ffae1f', sides: 16, rx: 0.43, ry: 0.43, table: 0.42, notch: 0.68 },
};

function gemIcon({ color, sides, rx, ry, table, notch = 1 }, S = 192) {
  const { c, ctx, px } = surface(S);
  const ring = (k, dent) => Array.from({ length: sides }, (_, i) => {
    const a = (-90 + (360 / sides) * i) * DEG, r = k * (i % 2 ? dent : 1);
    return [0.5 + Math.cos(a) * rx * r, 0.5 + Math.sin(a) * ry * r];
  });
  const outer = ring(1, notch), inner = ring(table, 1); // the table stays round, so star points read as facets
  const trace = (pts) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  };
  glow(ctx, rgba(color, 0.9), px * 0.12, () => { trace(outer); ctx.fillStyle = color; ctx.fill(); });

  // Bevel: one facet per edge, brighter the more it faces the light.
  const lx = -0.6, ly = -0.8;
  for (let i = 0; i < sides; i++) {
    const a = outer[i], b = outer[(i + 1) % sides], ia = inner[i], ib = inner[(i + 1) % sides];
    const mx = (a[0] + b[0]) / 2 - 0.5, my = (a[1] + b[1]) / 2 - 0.5, m = Math.hypot(mx, my) || 1;
    const lit = (mx * lx + my * ly) / m;
    ctx.fillStyle = lit > 0 ? mixHex(color, '#ffffff', lit * 0.6) : mixHex(color, '#000000', -lit * 0.55);
    trace([a, b, ib, ia]);
    ctx.fill();
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 0.004;
    ctx.stroke(); // closes hairline seams between facets
  }
  trace(inner);
  ctx.fillStyle = radial(ctx, 0.5, 0.5, Math.max(rx, ry) * table, [mixHex(color, '#ffffff', 0.85), mixHex(color, '#ffffff', 0.3), color], 0.44, 0.4);
  ctx.fill();

  ctx.strokeStyle = rgba('#ffffff', 0.4);
  ctx.lineWidth = 0.006;
  ctx.beginPath();
  for (let i = 0; i < sides; i++) { ctx.moveTo(...inner[i]); ctx.lineTo(...outer[i]); }
  ctx.stroke();
  trace(inner);
  ctx.stroke();

  // A diagonal sheen across the stone, then the rim and a glint on the lit side.
  ctx.save();
  trace(outer);
  ctx.clip();
  ctx.fillStyle = linear(ctx, 0.25, 0.2, 0.62, 0.6, [rgba('#ffffff', 0), rgba('#ffffff', 0.3), rgba('#ffffff', 0)]);
  ctx.fillRect(0, 0, 1, 1);
  ctx.restore();
  trace(outer);
  ctx.strokeStyle = rgba('#ffffff', 0.85);
  ctx.lineWidth = 0.01;
  ctx.stroke();
  sparkle(ctx, 0.5 - rx * 0.45, 0.5 - ry * 0.5, 0.1, '#ffffff', 1, 0.2);
  return c;
}
