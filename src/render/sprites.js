// Procedural sprite art: every sprite, animation frame and aspect icon is drawn here
// with Canvas 2D at load time, so there are no image files. The look is simple and
// a little astral: crisp shapes over soft glows, deep-space fills and four-point
// star glints, each keeping its original silhouette and colour.
// Drawing happens in normalised units (1 = canvas width) unless noted otherwise.
import { seededRandom, lerp, lerpColor, clamp01, smoothStep01, TAU } from '../engine/math.js';
import { ASPECTS } from '../data/aspects.js';
import { PLAYER } from '../data/player.js';
import { BLIGHT, LEMUR_TAIL } from '../data/effects.js';
import { ENEMY_TYPES } from '../data/enemies.js';
import { antlerParts, mirrored } from './antlerShape.js';

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
    lemur_idle: lemurOutline(),
    lemur_idle_void: lemurVoid(),
    lemur_spade: lemurSpade(),
    lemur_spade_rim: lemurSpade(true),
    boxer_idle: boxerOutline(),
    boxer_idle_void: voidFill(boxerPath(), VOIDS.boxer),
    boxer_fist: boxerFist(),
    gunner_idle: gunnerOutline(),
    gunner_idle_void: voidFill(gunnerPath(), VOIDS.gunner),
    corsair_idle: corsairOutline(),
    corsair_idle_void: corsairVoid(),
    scimitar: scimitar(),
    blight_idle: blightOutline(),
    blight_idle_void: blightVoid(),
    ...blightHeadSprites(),
    tail: tail(),
    dash_ghost: dashGhost(),
    spark: spark(),
    glint: glint(),
    ring: ring(),
    ward_ring: wardRing(),
    mist_ring: mistRing(),
    anchor_object: anchorObject(),
    cleave_slash: cleaveSlash(),
    wraith_form: wraithForm(),
    astral_blade: astralBlade(),
    astral_blade_exalted: astralBlade(ASTRAL_EXALTED),
    orb: orb(),
    crescent: crescent(),
    comet: comet(),
    core: core(),
    hexFlat: hexFlat(),
    hexPointed: hexPointed(),
    exitPortal: exitPortal(),
    hexFrame: hexFrame(),
    mist: mist(),
    flame: flame(),
    ribbon: ribbon(),
    feathers: feathers(),
    feather: feather(),
    bloom_outer: bloomOuter(),
    ...Object.fromEntries(LOTUS_RINGS.map((R, i) => [`lotus_petal_${i}`, lotusPetalSprite(R)])),
    lotus_core: lotusCore(),
    bloom_wisp: bloomWisp(),
    bloom_inner: bloomInner(),
    bloom_wave: bloomWave(),
    bloom_petal: bloomPetal(),
    ...propSprites(),
    shard: shard(),
    oracle_disc: oracleDisc(),
    oracle_disc_exalted: oracleDisc(ORACLE.exalted),
    oracle_glow: oracleGlow(),
  };
}

export function icons() {
  return {
    anchor_icon: anchorIcon(),
    cleave_icon: cleaveIcon(),
    flash_icon: flashIcon(),
    predator_icon: predatorIcon(),
    rift_icon: riftIcon(),
    wraith_icon: wraithIcon(),
    astral_icon: astralIcon(),
    thunder_icon: thunderIcon(),
    phoenix_icon: phoenixIcon(),
    needle_icon: needleIcon(),
    momentum_icon: momentumIcon(),
    afterimage_icon: afterimageIcon(),
    feral_icon: feralIcon(),
    gravebloom_icon: gravebloomIcon(),
    warding_icon: wardingIcon(),
    bloodthirst_icon: bloodthirstIcon(),
    antlers_icon: antlersIcon(),
    oracle_icon: oracleIcon(),
    blackrose_icon: blackRoseIcon(),
    coin_icon: coinIcon(),
    anger_sign: angerSign(),
    buff_swift: swiftGlyph(),
    buff_ward: wardGlyph(),
    buff_fury: furyGlyph(),
    buff_haste: hasteGlyph(),
    ...Object.fromEntries(Object.entries(GEM_CUTS).map(([tier, cut]) => [`gem_${tier}`, gemIcon(cut)])),
  };
}

// Sprites drawn with a halo are this many times their visible body size.
export const ORB_PAD = 2;
// The ring and mist ring sprites' band radius, as a fraction of their width.
export const RING_RADIUS = 0.4;
// The Gravebloom wave sprite's arc: its radius, as a fraction of the width, out from the middle
// of its left edge, how far it spans either side, and the sprite's height as a fraction of its
// width (room for the arc's ends).
export const BLOOM_WAVE = { reach: 0.8, halfDeg: 50, height: 1.36 };
// The hex frame sprite's outline width, as a fraction of its width.
export const HEX_FRAME_INSET = 0.8;
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

// A thin crescent on a circle centred off to the left (PLAYER.parry.look, which the hitbox
// follows too); it sweeps from bottom to top.
const PARRY_LOOK = PLAYER.parry.look;
const PARRY_ARC = { ...PARRY_LOOK.arc, width: 0.035 };
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

function parryFrames(S = 256) {
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

// Cleave's palette: solid black edged in dark red.
const CLEAVE = { body: '#000000', edge: '#8c0d16', glow: rgba('#6e0610', 0.7) };

// A vesica (the lens where two circles overlap) centred on the origin, its long axis on y:
// half-length L, half-width w. Each edge is an arc of radius R on a circle centred `off`
// across from it. Returns the outline and its left and right edges, both running from -L to L.
function vesica(L, w, n = 48) {
  const R = (L * L / w + w) / 2, off = R - w;
  const edge = (side) => Array.from({ length: n + 1 }, (_, i) => {
    const y = lerp(-L, L, i / n);
    return [side * (Math.sqrt(R * R - y * y) - off), y];
  });
  const left = edge(-1), right = edge(1);
  const path = new Path2D();
  [...right, ...[...left].reverse()].forEach((p, i) => (i ? path.lineTo(...p) : path.moveTo(...p)));
  path.closePath();
  return { path, left, right };
}

// Cleave's look: a black shape outlined in red. The outline is stroked under the fill so
// only its outer half shows.
function paintCleave(ctx, path, { line, edge = CLEAVE.edge, glowColor, blur }) {
  glow(ctx, glowColor, blur, () => {
    ctx.strokeStyle = edge;
    ctx.lineWidth = line;
    ctx.stroke(path);
  });
  ctx.fillStyle = CLEAVE.body;
  ctx.fill(path);
}

// The Cleave aspect's flying slash: the full parry arc, tapered at both ends, with a bolder
// edge than the icon's so it holds up small and moving. Exported so the aspect can shed
// motes from along it.
export const CLEAVE_ARC = { ...PARRY_ARC, width: 0.12, from: 52, to: -52 };

function cleaveSlash(S = 256) {
  const { c, ctx, px } = surface(S);
  const path = arcBlade({ ...CLEAVE_ARC, profile: (s) => Math.sin(Math.PI * s) ** 0.7 });
  paintCleave(ctx, path, { line: 0.05, edge: '#a8101d', glowColor: rgba('#8c0d16', 0.85), blur: px * 0.045 });
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

// A ward's rim, white so it can be tinted: the shockwave ring's band at RING_RADIUS, but
// narrower, so wards stacked close still read as separate layers.
function wardRing(S = 256) {
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

// Tattered feathers for the Exalted wings, pointing along +x from the quill at the left: a
// dark vane under a bright shaft and rim, its edges ragged and split between the barbs.
// Grey so the tint lands dark, the rim and shaft at its full colour. `feathers` stacks
// FEATHER_ROWS different ones, a row each, mapped along the wing's meshes; `feather` is a
// single loose one, shed as the wings dissolve.
export const FEATHER_ROWS = 4;

function feathers(W = 256, H = 64) {
  const { c, ctx } = surface(W, H * FEATHER_ROWS, W);
  const h = H / W;
  for (let r = 0; r < FEATHER_ROWS; r++) drawFeather(ctx, (r + 0.5) * h, h * 0.42, seededRandom(31 + r * 13));
  return haunted(c);
}

function feather(W = 128, H = 32) {
  const { c, ctx } = surface(W, H, W);
  drawFeather(ctx, H / W / 2, (H / W) * 0.42, seededRandom(5));
  return haunted(c);
}

// Feathers half dissolved into smoke: blurred into a haze around a faint trace of their
// shape, fading away toward the tip and the quill.
function haunted(src) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const ctx = c.getContext('2d');
  ctx.filter = `blur(${src.width / 90}px)`;
  ctx.drawImage(src, 0, 0);
  ctx.drawImage(src, 0, 0);
  ctx.filter = 'none';
  ctx.globalAlpha = 0.4;
  ctx.drawImage(src, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'destination-in';
  const g = ctx.createLinearGradient(0, 0, c.width, 0);
  [[0, 0.1], [0.22, 0.75], [0.5, 1], [0.82, 0.55], [1, 0]].forEach(([at, a]) => g.addColorStop(at, rgba('#ffffff', a)));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

// One feather along y = `y`, its wider (lower) half `half` across at most.
function drawFeather(ctx, y, half, rand) {
  const Q = 0.14, TIP = 0.98, N = 36; // the bare quill ends at Q
  // Vane half-width along it: swelling fast off the quill, tapering to a point.
  const width = (s) => Math.sin((Math.PI / 2) * Math.min(1, s / 0.22)) * (1 - s ** 3) ** 0.6;
  const edge = (side) => Array.from({ length: N + 1 }, (_, i) => {
    const s = i / N, ragged = i === 0 || i === N ? 1 : lerp(0.75, 1, rand());
    return [lerp(Q, TIP, s), y + side * half * (side < 0 ? 0.6 : 1) * width(s) * ragged];
  });
  const vane = new Path2D(), top = edge(-1), bottom = edge(1).reverse();
  vane.moveTo(Q, y);
  for (const [x, ey] of [...top, ...bottom]) vane.lineTo(x, ey);
  vane.closePath();
  ctx.fillStyle = linear(ctx, Q, 0, TIP, 0, [rgba('#7c7c7c', 0.96), rgba('#666666', 0.96), rgba('#505050', 0.85)]);
  ctx.fill(vane);
  // Barbs raking forward off the shaft.
  ctx.save();
  ctx.clip(vane);
  ctx.strokeStyle = rgba('#ffffff', 0.13);
  ctx.lineWidth = 0.004;
  for (let i = 0; i < 90; i++) {
    const x = lerp(Q, TIP, i / 70), side = i % 2 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + half * 1.1, y + side * half);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = rgba('#ffffff', 0.6);
  ctx.lineWidth = 0.007;
  glow(ctx, rgba('#ffffff', 0.5), 4, () => ctx.stroke(vane));
  // Splits torn into the vane between the barbs, from the edge in toward the shaft.
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 7; i++) {
    const x = lerp(Q + 0.1, TIP - 0.12, rand()), side = rand() < 0.5 ? -1 : 1, deep = lerp(0.3, 0.9, rand());
    ctx.beginPath();
    ctx.moveTo(x, y + side * half * 0.08);
    ctx.lineTo(x + half * 1.2 * deep, y + side * half * 1.2);
    ctx.lineTo(x + half * 1.2 * deep + lerp(0.015, 0.045, rand()), y + side * half * 1.2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  // The shaft, thinning toward the tip.
  ctx.beginPath();
  ctx.moveTo(0.02, y - 0.006);
  ctx.lineTo(TIP - 0.03, y);
  ctx.lineTo(0.02, y + 0.006);
  ctx.closePath();
  ctx.fillStyle = rgba('#ffffff', 0.9);
  glow(ctx, rgba('#ffffff', 0.6), 3, () => ctx.fill());
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
  lemur: { core: '#17361d', edge: '#040a05', clouds: [['#3f8a3a', 0.18], ['#6b4320', 0.26]], seed: 59 },
  boxer: { core: '#2e0a0e', edge: '#070304', clouds: [['#b02030', 0.2], ['#5e0e1a', 0.24]], seed: 61 },
  gunner: { core: '#0b2a3a', edge: '#03080c', clouds: [['#3fb4e8', 0.22], ['#1c5c8a', 0.2]], seed: 67 },
  corsair: { core: '#33270a', edge: '#090602', clouds: [['#c8961e', 0.22], ['#7a5a12', 0.24]], seed: 71 },
  blight: { core: '#1d3312', edge: '#050903', clouds: [['#4f8a22', 0.26], ['#8a9a26', 0.14], ['#2a4a14', 0.3]], seed: 73 },
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
// The Lemur's body: a plain circle, dark green with brown `patches` on it, each [x, y,
// radius, turn, squash] (squashed across to `squash` of its radius).
const LEMUR = { r: 0.31, line: 0.045, patch: '#6e4522', patches: [[0.37, 0.37, 0.13, 0.5, 0.65], [0.6, 0.65, 0.1, -0.4, 0.75], [0.67, 0.37, 0.065, 0.2, 0.9]] };
const LEMUR_PALETTE = { stroke: ['#d6f0a8', '#7cbc4c', '#7a5228'], glow: rgba('#66c03c', 0.6) };
// The spade at the end of the Lemur's tail, a separate sprite so the tail can swing it: its
// point `len` along +x from the stem, where the stalk joins. World units: the sprite is `w`
// × `h`, the stem's end `rootX` in from the left and halfway down, `unit` px per unit.
// `muzzle`: how far along it (× len) the crescents form and are flung from.
export const SPADE_ART = { w: 0.78, h: 0.62, rootX: 0.08, unit: 216, len: 0.56, line: 0.05, muzzle: 0.45 };
// The Boxer's body: a decagon of circumradius `r` with a flat face ahead, its corners
// rounded by `corner`, with a faint brow `brow` in from the face.
const BOXER = { r: 0.33, line: 0.05, corner: 0.02, brow: 0.07 };
const BOXER_PALETTE = { stroke: ['#ffa8a8', '#d8303e', '#7a1018'], glow: rgba('#c8202e', 0.65) };
// A conjured fist, a separate sprite: a circle `body` of the texture's width in radius (the
// rest is room for its glow).
export const FIST_ART = { body: 0.36, line: 0.07 };
// The Gunner's body: bubbly, a ring of `bumps` round lobes end to end, each `bulge` degrees
// of its own circle, meeting at radius `r`, one joint straight ahead so it is symmetrical.
// Three cannons side by side, `gauge` thick: one out of each front lobe, `spread` out to
// either side, its barrel from `barrel[0]` to `[1]` along +x, and one out of the notch
// between them, from `middle[0]` to `[1]`, a little shorter. Its muzzles
// (GunnerCascade.muzzles) are the barrels' ends, at its sprite's size.
const GUNNER = { r: 0.27, bumps: 6, bulge: 120, line: 0.045, barrel: [0.7, 0.9], middle: [0.67, 0.85], gauge: 0.12, spread: 0.19 };
const GUNNER_PALETTE = { stroke: ['#e0f7ff', '#7fd6ff', '#2f9fd8'], glow: rgba('#5cc8ff', 0.65) };
// The Corsair's body: a plain circle, dark yellow with pale yellow `patches` on it, each [x,
// y, radius, turn, squash] (squashed across to `squash` of its radius). Its cape is cloth,
// simulated and drawn by its rig (CAPES, src/enemies/cape.js).
const CORSAIR = { r: 0.31, line: 0.045, patch: '#f6e6a4', patches: [[0.36, 0.6, 0.12, -0.5, 0.6], [0.6, 0.36, 0.09, 0.6, 0.7], [0.66, 0.62, 0.06, 0.1, 0.9]] };
const CORSAIR_PALETTE = { stroke: ['#fff2bc', '#e8b830', '#9a6c10'], glow: rgba('#e0a820', 0.65) };
// The Corsair's scimitar, a separate sprite so it can be swung: a curved blade `len` along
// +x from the guard, its spine bowing `curve` toward +y by the tip (the right hand's; the
// left is mirrored), so its cutting edge, the convex one, faces -y. Slim at the guard, its
// back (+y) runs `back` from the spine until `bumpAt` of the way along, where it steps
// sharply out to `bump`, leaving a crisp corner: the scimitar's bump. From there the back
// tapers steadily down to the point, which curls back with the spine, while the edge
// swells out into a belly `belly` thick (`bellyAt` of the way along) and rounds off into
// it. Behind the guard, a yellow `handle` and a pommel. World units: the sprite is `w` × `h`
// with the guard `rootX` in from the left and `rootY` down from the top, `unit` px per
// unit. `cue`: where along it (× len) the parry cue flashes.
export const SCIMITAR_ART = {
  w: 1.24, h: 0.62, rootX: 0.26, rootY: 0.17, unit: 216, len: 0.88, curve: 0.34, handle: 0.16, cue: 0.72,
  back: 0.034, bumpAt: 0.46, bump: 0.14, belly: 0.075, bellyAt: 0.66,
};
// The Blight's body: rotten flesh (`rot`) inside one lumpy outline traced round its heads,
// swelling over each rim head (`over` × its size past its centre) and sagging between them
// to `sag` out from its centre, the two blended smoothly (`blend`: higher is sharper),
// roughened by `lumps`, each [waves, depth (× radius), phase]. World units, in its frame.
// Its heads, and the puckers and sinews joining them, are drawn over it by its rig (BLIGHT,
// src/enemies/blightRig.js). The rot: a sickly `base`, mottled with `blotches` ([colour,
// alpha]), creased with folds, threaded with dark `vein`s and pocked with pits and `pus`.
const BLIGHT_BODY = { over: 1.25, sag: 0.95, blend: 14, line: 0.04, lumps: [[3, 0.025, 1.1], [7, 0.015, 2.3], [13, 0.008, 0.4]] };
const ROT = {
  base: ['#3d4629', '#2b311e', '#14180c'],
  blotches: [['#3a2433', 0.35], ['#7a7430', 0.16], ['#080b05', 0.5], ['#5a6040', 0.22], ['#4a2a22', 0.3], ['#1e2a12', 0.4]],
  vein: '#3a1622', pus: '#c8bf5a',
};
const BLIGHT_PALETTE = { stroke: ['#d8f2a4', '#6fa83a', '#2f5a18'], glow: rgba('#5a9a2a', 0.7) };
// A head, its own sprite so the rig can move each one, drawn round a head `size` 1 spanning
// `body` of the texture's width (its shape reaching past that; the rest room for a glow),
// its face looking along +x, crown back, jaw forward. On the Blight it has no edge at all:
// it fades over `feather` (of the texture's width) into the flesh and the heads round it,
// so they grow into each other. Torn loose it is outlined (`line`) like any projectile.
export const HEAD_ART = { body: 0.27, line: 0.045, feather: 0.045 };
const HEAD_PALETTE = { stroke: ['#d8f2a4', '#6fa83a', '#2f5a18'], glow: rgba('#5a9a2a', 0.7) };

// The Blight's heads at rest in its frame (+x forward, world units), its rim heads first,
// the first straight ahead (BLIGHT): [{ x, y, size, rot, rim, shape }], `rot` the way it
// faces, `shape` how it is deformed (see headPoint) and its face.
let blightHeadList = null;
export function blightHeads() {
  if (blightHeadList) return blightHeadList;
  const { rim, inner, shape: S } = BLIGHT, J = rim.jitter, jr = seededRandom(rim.seed);
  const heads = [
    ...Array.from({ length: rim.count }, (_, i) => {
      const k = i ? 1 : 0; // the first stays straight ahead
      const a = (TAU * i) / rim.count + k * lerp(-J.angle, J.angle, jr()) * DEG, r = rim.r + lerp(-J.r, J.r, jr());
      return { x: Math.cos(a) * r, y: Math.sin(a) * r, size: rim.size * lerp(...J.size, jr()), rot: a + k * lerp(-J.facing, J.facing, jr()) * DEG, rim: true };
    }),
    ...inner.map(([x, y, size, deg]) => ({ x, y, size, rot: deg * DEG, rim: false })),
  ];
  blightHeadList = heads.map((h, i) => {
    const r = seededRandom(S.seed + i * 7919), side = () => (r() < 0.5 ? -1 : 1);
    const shape = {
      len: lerp(...S.length, r()), wid: lerp(...S.width, r()), pinch: lerp(...S.pinch, r()),
      skew: side() * S.skew * r(), bend: side() * S.bend * r(),
      waves: [2, 3, 5].map((n) => [n, S.wobble * r(), r() * TAU]),
      skin: S.skin[Math.floor(r() * S.skin.length)],
      eyes: [1, -1].map((v) => ({ v: v * lerp(0.34, 0.46, r()), u: lerp(-0.3, -0.12, r()), size: lerp(0.8, 1.3, r()), tilt: v * lerp(0.05, 0.3, r()) })),
      mouth: { v: lerp(-0.08, 0.08, r()), size: lerp(0.85, 1.2, r()), tilt: lerp(-0.2, 0.2, r()) },
      seed: Math.floor(r() * 1e6),
    };
    return { ...h, shape };
  });
  return blightHeadList;
}

// A point of a head's face, `u` along it (crown -1, jaw +1) and `v` across (-1 to 1), as
// deformed by its `shape`, × its size round its centre (+x the way it faces).
export function headPoint(shape, u, v) {
  const x = u * shape.len, y = v * shape.wid * (1 - shape.pinch * Math.max(0, u));
  return { x, y: y + shape.skew * x + shape.bend * x * x };
}

// The heads near enough to be strung together by sinews (BLIGHT.flesh.reach): [[i, j]],
// indices into blightHeads().
let blightFleshList = null;
export function blightFlesh() {
  if (blightFleshList) return blightFleshList;
  const heads = blightHeads(), reach = BLIGHT.flesh.reach;
  blightFleshList = [];
  heads.forEach((a, i) => heads.forEach((b, j) => {
    if (j > i && Math.hypot(a.x - b.x, a.y - b.y) < (a.size + b.size) * reach) blightFleshList.push([i, j]);
  }));
  return blightFleshList;
}

// Where head `h`'s mouth is, pushed `push` out along the way it faces, in the Blight's frame.
export function blightMouth(h, push = 0) {
  const m = headPoint(h.shape, BLIGHT.mouth, h.shape.mouth.v), c = Math.cos(h.rot), s = Math.sin(h.rot);
  const x = m.x * h.size + push, y = m.y * h.size;
  return { x: h.x + c * x - s * y, y: h.y + s * x + c * y };
}
// A point on the scimitar's spine `along` from the guard, in the sprite's frame (guard at 0).
export function scimitarAt(along) {
  const t = along / SCIMITAR_ART.len;
  return { x: along, y: SCIMITAR_ART.curve * t * t };
}
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

function lemurPath() {
  const p = new Path2D();
  p.arc(0.5, 0.5, LEMUR.r, 0, TAU);
  return p;
}

function lemurOutline(S = 256) {
  return outline(S, LEMUR_PALETTE, (ctx) => {
    ctx.lineWidth = LEMUR.line;
    ctx.stroke(lemurPath());
  });
}

// Its dark nebula with soft-edged brown patches laid over it.
function lemurVoid() {
  const c = voidFill(lemurPath(), VOIDS.lemur), ctx = c.getContext('2d'); // still drawing only over the body
  for (const [x, y, r, turn, squash] of LEMUR.patches) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(turn); ctx.scale(1, squash);
    ctx.fillStyle = radial(ctx, 0, 0, r, [rgba(LEMUR.patch, 0.6), rgba(LEMUR.patch, 0.5), rgba(LEMUR.patch, 0)]);
    ctx.fillRect(-r, -r, 2 * r, 2 * r);
    ctx.restore();
  }
  return c;
}

// The tail's spine at rest in the Lemur's frame (+x forward), root first: out of its back,
// each link bending off the last by its rest bend (LEMUR_TAIL).
export function lemurTailRest(T = LEMUR_TAIL) {
  let x = -T.root, y = 0, a = Math.PI;
  const pts = [{ x, y }];
  for (let i = 0; i < T.segments; i++) {
    a += T.bends[i];
    x += Math.cos(a) * T.segment;
    y += Math.sin(a) * T.segment;
    pts.push({ x, y });
  }
  return pts;
}

// The edges of a tail along spine `pts` (root first), tapering from half-thickness
// `width[0]` at the root to `width[1]` at the tip: [x, y]s down each side.
export function tailEdges(pts, [w0, w1]) {
  const n = pts.length, left = [], right = [];
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1, w = lerp(w0, w1, i / (n - 1));
    left.push([p.x - (dy / l) * w, p.y + (dx / l) * w]);
    right.push([p.x + (dy / l) * w, p.y - (dx / l) * w]);
  });
  return { left, right };
}

// Whether link `i` of the tail is one of its brown rings.
export const tailBanded = (i, T = LEMUR_TAIL) => Math.floor((i * T.bands * 2) / T.segments) % 2 === 1;

// The spade: a point swelling out to two round lobes, a short stem between them. Its parts
// are stroked double width, then filled over, leaving the outline round the outside of them
// all; the stem's open end, where the stalk joins, is left unstroked. `rim`: the outline
// alone, cut out of the middle instead of filled (warmed by a wind-up, like the body's).
function lemurSpade(rim = false) {
  const { w, h, rootX, unit, len, line } = SPADE_ART, k = len / 0.4; // drawn 0.4 long, scaled up
  const { c, ctx, px } = surface(Math.round(w * unit), Math.round(h * unit), unit);
  const body = new Path2D();
  body.moveTo(0.4, 0);
  body.bezierCurveTo(0.33, 0.03, 0.22, 0.17, 0.12, 0.15);
  body.lineTo(0.12, -0.15);
  body.bezierCurveTo(0.22, -0.17, 0.33, -0.03, 0.4, 0);
  body.closePath();
  const lobes = [1, -1].map((side) => {
    const p = new Path2D();
    p.arc(0.12, 0.075 * side, 0.075, 0, TAU);
    return p;
  });
  const stem = new Path2D();
  stem.rect(0, -0.03, 0.12, 0.06);
  const stemSides = new Path2D();
  for (const side of [1, -1]) { stemSides.moveTo(0, 0.03 * side); stemSides.lineTo(0.1, 0.03 * side); }
  const parts = [body, ...lobes];
  ctx.translate(rootX, h / 2);
  ctx.scale(k, k);
  ctx.strokeStyle = linear(ctx, 0, -0.15, 0.4, 0.15, LEMUR_PALETTE.stroke);
  ctx.lineWidth = (line * 2) / k;
  glow(ctx, LEMUR_PALETTE.glow, px * 0.03, () => { for (const p of [...parts, stemSides]) ctx.stroke(p); });
  const fill = surface(c.width, c.height, unit), f = fill.ctx;
  f.translate(rootX, h / 2);
  f.scale(k, k);
  f.fillStyle = radial(f, 0.2, 0, 0.24, [VOIDS.lemur.core, VOIDS.lemur.edge], 0.17, -0.03);
  for (const p of [...parts, stem]) f.fill(p);
  f.globalCompositeOperation = 'source-atop';
  f.fillStyle = radial(f, 0.11, 0.07, 0.11, [rgba(LEMUR.patch, 0.6), rgba(LEMUR.patch, 0.5), rgba(LEMUR.patch, 0)]);
  f.fillRect(-1, -1, 3, 3);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (rim) ctx.globalCompositeOperation = 'destination-out';
  ctx.drawImage(fill.c, 0, 0);
  return c;
}

function boxerPath() {
  const { r, corner } = BOXER, pts = Array.from({ length: 10 }, (_, i) => polar(0.5, 0.5, 18 + 36 * i, r));
  const p = new Path2D(), mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  p.moveTo(...mid(pts[9], pts[0]));
  pts.forEach((pt, i) => p.arcTo(...pt, ...pts[(i + 1) % 10], corner));
  p.closePath();
  return p;
}

// The decagon, with a faint brow across the front.
function boxerOutline(S = 256) {
  return outline(S, BOXER_PALETTE, (ctx) => {
    ctx.lineWidth = BOXER.line;
    ctx.lineJoin = 'round';
    ctx.stroke(boxerPath());
    const face = 0.5 + BOXER.r * Math.cos(18 * DEG) - BOXER.brow;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 0.02;
    ctx.beginPath();
    ctx.moveTo(face - 0.03, 0.39); ctx.quadraticCurveTo(face + 0.015, 0.5, face - 0.03, 0.61);
    ctx.stroke();
  });
}

// A fist: a dark red ball under a bright red rim, glinting, so it reads on the dark floor.
function boxerFist(S = 128) {
  const { c, ctx, px } = surface(S), r = FIST_ART.body;
  ctx.beginPath();
  ctx.arc(0.5, 0.5, r, 0, TAU);
  ctx.fillStyle = radial(ctx, 0.5, 0.5, r, ['#6a1420', '#2a060c', '#120205'], 0.42, 0.4);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = radial(ctx, 0.42, 0.4, r * 0.7, [rgba('#ff5a66', 0.4), rgba('#ff5a66', 0)]);
  ctx.fillRect(0, 0, 1, 1);
  ctx.restore();
  glow(ctx, BOXER_PALETTE.glow, px * 0.05, () => {
    ctx.strokeStyle = linear(ctx, 0.2, 0.15, 0.8, 0.85, ['#ffc0c0', '#ff4a58', '#a01826']);
    ctx.lineWidth = FIST_ART.line;
    ctx.beginPath();
    ctx.arc(0.5, 0.5, r, 0, TAU);
    ctx.stroke();
  });
  sparkle(ctx, 0.41, 0.39, r * 0.4, '#ffd6d6', 0.85);
  return c;
}

function gunnerBarrels() {
  const { barrel, middle, gauge, spread } = GUNNER, p = new Path2D();
  for (const [y, [x0, x1]] of [[0.5 - spread, barrel], [0.5, middle], [0.5 + spread, barrel]]) {
    p.roundRect(x0, y - gauge / 2, x1 - x0, gauge, gauge * 0.3);
  }
  return p;
}

// The lobes, clockwise from the joint straight ahead: each an arc whose centre sits inward
// along its middle, far enough that its ends land on the joints.
function gunnerBody(p = new Path2D()) {
  const { r, bumps, bulge } = GUNNER, half = Math.PI / bumps, a = (bulge * DEG) / 2;
  const radius = (r * Math.sin(half)) / Math.sin(a), centre = r * Math.cos(half) - radius * Math.cos(a);
  for (let i = 0; i < bumps; i++) {
    const mid = (2 * i + 1) * half;
    p.arc(0.5 + Math.cos(mid) * centre, 0.5 + Math.sin(mid) * centre, radius, mid - a, mid + a);
  }
  p.closePath();
  return p;
}

function gunnerPath() {
  const p = gunnerBody();
  p.addPath(gunnerBarrels());
  return p;
}

// The bumps, broken where the barrels pass through them, and the barrels.
function gunnerOutline(S = 256) {
  const barrels = gunnerBarrels();
  const outsideBarrels = new Path2D();
  outsideBarrels.rect(0, 0, 1, 1);
  outsideBarrels.addPath(barrels);
  return outline(S, GUNNER_PALETTE, (ctx) => {
    ctx.lineWidth = GUNNER.line;
    ctx.lineJoin = 'round';
    ctx.save();
    ctx.clip(outsideBarrels, 'evenodd');
    ctx.stroke(gunnerBody());
    ctx.restore();
    ctx.stroke(barrels);
  });
}

function corsairPath() {
  const p = new Path2D();
  p.arc(0.5, 0.5, CORSAIR.r, 0, TAU);
  return p;
}

function corsairOutline(S = 256) {
  return outline(S, CORSAIR_PALETTE, (ctx) => {
    ctx.lineWidth = CORSAIR.line;
    ctx.stroke(corsairPath());
  });
}

// Its dark golden nebula with soft-edged pale patches laid over it.
function corsairVoid() {
  const c = voidFill(corsairPath(), VOIDS.corsair), ctx = c.getContext('2d'); // still drawing only over the body
  for (const [x, y, r, turn, squash] of CORSAIR.patches) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(turn); ctx.scale(1, squash);
    ctx.fillStyle = radial(ctx, 0, 0, r, [rgba(CORSAIR.patch, 0.55), rgba(CORSAIR.patch, 0.42), rgba(CORSAIR.patch, 0)]);
    ctx.fillRect(-r, -r, 2 * r, 2 * r);
    ctx.restore();
  }
  return c;
}

// In texture units (its visual.size across), traced round its rim heads (BLIGHT_BODY).
function blightPath() {
  const B = BLIGHT_BODY, size = ENEMY_TYPES.blight.visual.size, rim = blightHeads().filter((h) => h.rim), p = new Path2D(), N = 240;
  for (let i = 0; i <= N; i++) {
    const a = (TAU * i) / N, dx = Math.cos(a), dy = Math.sin(a);
    let sum = Math.exp(B.blend * B.sag);
    for (const h of rim) { // how far this way the circle over the head reaches
      const R = h.size * B.over, t = h.x * dx + h.y * dy, d2 = R * R - (h.x * h.x + h.y * h.y - t * t);
      if (d2 > 0 && t > 0) sum += Math.exp(B.blend * (t + Math.sqrt(d2)));
    }
    const r = (Math.log(sum) / B.blend) * (1 + B.lumps.reduce((s, [w, depth, phase]) => s + depth * Math.sin(w * a + phase), 0));
    const x = 0.5 + (dx * r) / size, y = 0.5 + (dy * r) / size;
    if (i) p.lineTo(x, y); else p.moveTo(x, y);
  }
  p.closePath();
  return p;
}

function blightOutline(S = 320) {
  return outline(S, BLIGHT_PALETTE, (ctx) => {
    ctx.lineWidth = BLIGHT_BODY.line;
    ctx.stroke(blightPath());
  });
}

// Its rotten flesh (ROT): a sickly base, mottled with bruises and rot, creased with folds,
// threaded with dark veins, pocked with pits and swollen with pus.
function blightVoid(S = 512) {
  const { c, ctx } = surface(S), rand = seededRandom(73), R = ROT;
  ctx.save();
  ctx.clip(blightPath());
  ctx.fillStyle = radial(ctx, 0.5, 0.5, 0.4, R.base, 0.46, 0.44);
  ctx.fillRect(0, 0, 1, 1);
  const at = () => [lerp(0.12, 0.88, rand()), lerp(0.12, 0.88, rand())];
  for (let i = 0; i < 110; i++) {
    const [color, a] = R.blotches[i % R.blotches.length], [x, y] = at(), r = lerp(0.012, 0.07, rand() ** 1.6);
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rand() * TAU); ctx.scale(1, lerp(0.35, 1, rand()));
    ctx.fillStyle = radial(ctx, 0, 0, r, [rgba(color, a), rgba(color, a * 0.5), rgba(color, 0)]);
    ctx.fillRect(-r, -r, 2 * r, 2 * r);
    ctx.restore();
  }
  // Folds: a dark crease with a pale lip along it.
  for (let i = 0; i < 40; i++) {
    const [x, y] = at(), a = rand() * TAU, len = lerp(0.03, 0.09, rand()), bow = lerp(-0.03, 0.03, rand());
    const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len, mx = (x + ex) / 2 - Math.sin(a) * bow, my = (y + ey) / 2 + Math.cos(a) * bow;
    for (const [color, alpha, width, off] of [['#060804', 0.5, 0.006, 0], ['#7a7a52', 0.16, 0.003, 0.006]]) {
      ctx.strokeStyle = rgba(color, alpha);
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(x, y + off); ctx.quadraticCurveTo(mx, my + off, ex, ey + off);
      ctx.stroke();
    }
  }
  // Veins wandering and forking.
  const vein = (x, y, a, width, steps) => {
    ctx.strokeStyle = rgba(R.vein, 0.55);
    for (let s = 0; s < steps; s++) {
      const nx = x + Math.cos(a) * 0.012, ny = y + Math.sin(a) * 0.012;
      ctx.lineWidth = width * (1 - s / steps) + 0.001;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
      if (rand() < 0.12 && width > 0.003) vein(nx, ny, a + (rand() < 0.5 ? -1 : 1) * lerp(0.5, 1.1, rand()), width * 0.6, Math.floor(steps * 0.6));
      x = nx; y = ny; a += (rand() - 0.5) * 0.9;
    }
  };
  for (let i = 0; i < 16; i++) { const [x, y] = at(); vein(x, y, rand() * TAU, lerp(0.004, 0.008, rand()), 10 + Math.floor(rand() * 10)); }
  // Pits, and pustules of pus.
  for (let i = 0; i < 45; i++) {
    const [x, y] = at(), r = lerp(0.004, 0.014, rand());
    if (rand() < 0.5) {
      ctx.fillStyle = radial(ctx, x, y, r * 1.6, ['#000000', rgba('#000000', 0.6), rgba('#000000', 0)]);
      ctx.fillRect(x - r * 1.6, y - r * 1.6, r * 3.2, r * 3.2);
    } else {
      ctx.fillStyle = radial(ctx, x, y, r, [rgba(R.pus, 0.9), rgba(R.pus, 0.7), rgba('#3a3a14', 0.8)], x - r * 0.3, y - r * 0.3);
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
  return c;
}

// Head `h` (blightHeads): its deformed skull in rotten skin, blotched and bruised, fading
// out at its edge into whatever it grows from, and a scream for a face: hollow cheeks, eyes
// and a long mouth all but black holes. `open`: the mouth gaping wider, a sickly glow deep
// in it (as it spits). `loose`: torn free, its edge crisp and ringed in the Blight's outline.
function blightHead(h, open, loose = false, S = 160) {
  const { c, ctx, px } = surface(S), sh = h.shape, B = HEAD_ART.body, rand = seededRandom(sh.seed);
  const to = (u, v) => { const p = headPoint(sh, u, v); return [0.5 + p.x * B, 0.5 + p.y * B]; };
  const skull = new Path2D(), N = 72;
  for (let i = 0; i <= N; i++) {
    const a = (TAU * i) / N, w = 1 + sh.waves.reduce((s, [n, amp, ph]) => s + amp * Math.sin(n * a + ph), 0);
    const [x, y] = to(Math.cos(a) * w, Math.sin(a) * w);
    if (i) skull.lineTo(x, y); else skull.moveTo(x, y);
  }
  skull.closePath();
  const [light, mid, dark] = sh.skin, [cx, cy] = to(-0.3, -0.1);
  ctx.fillStyle = radial(ctx, 0.5, 0.5, B * sh.len * 1.1, [light, mid, dark], cx, cy);
  ctx.fill(skull);
  ctx.save();
  ctx.clip(skull);
  const blot = (u, v, r, color, alpha) => {
    const [x, y] = to(u, v);
    ctx.fillStyle = radial(ctx, x, y, r, [rgba(color, alpha), rgba(color, 0)]);
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  };
  for (let i = 0; i < 7; i++) blot(lerp(-0.9, 0.9, rand()), lerp(-0.9, 0.9, rand()), B * lerp(0.15, 0.4, rand()), ['#2a1622', '#0a0e06', '#6a6420', '#3a2a20'][i % 4], lerp(0.25, 0.5, rand()));
  // Sunken cheeks and temples, bags under the eyes.
  for (const v of [-1, 1]) {
    blot(0.22, v * 0.55, B * 0.32, '#000000', 0.45);
    blot(-0.5, v * 0.6, B * 0.22, '#000000', 0.3);
    const e = sh.eyes[v > 0 ? 0 : 1];
    blot(e.u + 0.22, e.v, B * 0.2, '#1a0a10', 0.5);
  }
  // Furrows across the brow.
  ctx.strokeStyle = rgba('#050703', 0.45);
  ctx.lineWidth = 0.012;
  for (let i = 0; i < 3; i++) {
    const u = -0.45 - i * 0.12 + lerp(-0.04, 0.04, rand());
    ctx.beginPath();
    for (let k = 0; k <= 8; k++) { const [x, y] = to(u + 0.06 * Math.sin((k / 8) * Math.PI), lerp(-0.45, 0.45, k / 8)); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.stroke();
  }
  // A hole: black, its edge soft, along the face `ru` × `rv` (× the head), turned `tilt`.
  const hole = (u, v, ru, rv, tilt, glow = null) => {
    const [x, y] = to(u, v);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt + Math.atan(sh.skew + 2 * sh.bend * u * sh.len));
    ctx.scale(ru * sh.len * B, rv * sh.wid * B);
    ctx.fillStyle = radial(ctx, 0, 0, 1.25, ['#000000', '#000000', '#020201', rgba('#000000', 0)]);
    ctx.beginPath(); ctx.arc(0, 0, 1.25, 0, TAU); ctx.fill();
    if (glow) {
      ctx.fillStyle = radial(ctx, 0.1, 0, 0.7, [rgba(glow, 0.75), rgba(glow, 0.2), rgba(glow, 0)]);
      ctx.beginPath(); ctx.arc(0.1, 0, 0.7, 0, TAU); ctx.fill();
    }
    ctx.restore();
  };
  for (const e of sh.eyes) hole(e.u, e.v, 0.15 * e.size, 0.13 * e.size, e.tilt);
  for (const v of [-0.08, 0.08]) hole(0.04, v, 0.045, 0.035, 0);
  const m = sh.mouth, gape = open ? 1.3 : 1;
  hole(BLIGHT.mouth, m.v, 0.36 * m.size * gape, 0.21 * m.size * gape, m.tilt, open ? '#8fdc4a' : null);
  ctx.restore();
  if (!loose) {
    // Fading out all round its edge: kept only where a blurred copy of its shape is (the
    // shape's shadow, cast back from off the canvas; a shadow's blur is in pixels whatever
    // the drawing's scale).
    const mask = surface(S).ctx;
    mask.shadowColor = '#000000';
    mask.shadowBlur = S * HEAD_ART.feather;
    mask.shadowOffsetX = S * 2;
    mask.translate(-2, 0);
    mask.fill(skull);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(mask.canvas, 0, 0);
    ctx.restore();
    return c;
  }
  glow(ctx, HEAD_PALETTE.glow, px * 0.035, () => {
    ctx.strokeStyle = linear(ctx, 0.2, 0.15, 0.8, 0.85, HEAD_PALETTE.stroke);
    ctx.lineWidth = HEAD_ART.line;
    ctx.stroke(skull);
  });
  return c;
}

// Every head's textures: on the Blight (mouth open, and gaping), and torn loose.
function blightHeadSprites() {
  return Object.fromEntries(blightHeads().flatMap((h, i) => [
    [`blight_head_${i}`, blightHead(h, false)],
    [`blight_head_${i}_open`, blightHead(h, true)],
    [`blight_head_${i}_loose`, blightHead(h, true, true)],
  ]));
}

// The scimitar: a pale steel blade with a white-hot cutting edge and a groove down its back,
// a gold guard with balled ends, a yellow handle bound in darker bands, and a pommel.
function scimitar() {
  const { w, h, rootX, rootY, unit, len, handle, back, bumpAt, bump, belly, bellyAt } = SCIMITAR_ART;
  const { c, ctx, px } = surface(Math.round(w * unit), Math.round(h * unit), unit);
  ctx.translate(rootX, rootY);
  // `off` > 0 toward the edge (-y), square to the spine.
  const at = (t, off) => {
    const { x, y } = scimitarAt(t * len), slope = (2 * SCIMITAR_ART.curve * t) / len, l = Math.hypot(1, slope);
    return [x + (slope / l) * off, y - off / l];
  };
  // The edge swells into its belly, then rounds off into the point.
  const edgeW = (t) => (t < bellyAt ? lerp(0.04, belly, smoothStep01(t / bellyAt)) : belly * Math.sqrt(1 - ((t - bellyAt) / (1 - bellyAt)) ** 2));
  // Past the bump, the back tapers steadily down to the point.
  const from = bumpAt + 0.012, backW = (t) => bump * (1 - (t - from) / (1 - from)) ** 1.15;
  const N = 60, edge = [], spine = [];
  for (let i = 0; i <= N; i++) edge.push(at(i / N, edgeW(i / N)));
  for (let i = N; i >= 0 && i / N > from; i--) spine.push(at(i / N, -backW(i / N)));
  spine.push(at(from, -bump)); // the bump's corner
  spine.push(at(bumpAt, -back)); // and the step down at its foot
  for (let i = Math.floor(bumpAt * N); i >= 0; i--) spine.push(at(i / N, -back));
  const blade = new Path2D();
  blade.moveTo(...edge[0]);
  for (const pt of [...edge.slice(1), ...spine]) blade.lineTo(...pt);
  blade.closePath();
  ctx.save();
  ctx.lineJoin = 'miter'; // keeps the bump's corner and the point sharp
  glow(ctx, rgba('#ffe7a0', 0.8), px * 0.05, () => {
    ctx.strokeStyle = '#fff6dc';
    ctx.lineWidth = 0.032;
    ctx.stroke(blade);
  });
  ctx.restore();
  ctx.fillStyle = linear(ctx, 0, -0.06, 0, 0.24, ['#f4f0e2', '#b8b2a2', '#6e6858']);
  ctx.fill(blade);
  ctx.strokeStyle = '#ffffff'; // the cutting edge
  ctx.lineWidth = 0.016;
  ctx.beginPath();
  edge.slice(2).forEach((pt, i) => (i ? ctx.lineTo(...pt) : ctx.moveTo(...pt)));
  ctx.stroke();
  ctx.globalAlpha = 0.6; // the groove
  ctx.strokeStyle = '#5e584a';
  ctx.lineWidth = 0.01;
  ctx.beginPath();
  ctx.moveTo(...at(1 / N, -0.006));
  for (let i = 2; i <= Math.floor(N * bumpAt * 0.9); i++) ctx.lineTo(...at(i / N, -0.006));
  ctx.stroke();
  ctx.globalAlpha = 1;
  const gold = linear(ctx, 0, -0.08, 0, 0.08, ['#fff0a8', '#e8b830', '#8a5c0c']);
  glow(ctx, CORSAIR_PALETTE.glow, px * 0.03, () => {
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.roundRect(-handle, -0.026, handle, 0.052, 0.018); // the handle
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-handle - 0.022, 0, 0.032, 0, TAU); // the pommel
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(-0.03, -0.075, 0.034, 0.15, 0.014); // the guard
    for (const y of [-0.08, 0.08]) { ctx.moveTo(-0.013 + 0.026, y); ctx.arc(-0.013, y, 0.026, 0, TAU); }
    ctx.fill();
  });
  ctx.strokeStyle = rgba('#6a4808', 0.75); // the binding
  ctx.lineWidth = 0.012;
  ctx.beginPath();
  for (let x = -handle + 0.025; x < -0.035; x += 0.028) { ctx.moveTo(x, -0.024); ctx.lineTo(x + 0.012, 0.024); }
  ctx.stroke();
  sparkle(ctx, -handle - 0.022, 0, 0.04, '#fff6d0', 0.8);
  return c;
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
  nebula(ctx, rand, clouds);
  return c;
}

// `count` soft, squashed clouds of the given [colour, alpha]s, scattered over the box
// x0…x1, y0…y1 (drawn over whatever the context's compositing allows).
function nebula(ctx, rand, clouds, count = 5, [x0, x1, y0, y1] = [0.25, 0.75, 0.25, 0.75]) {
  for (let i = 0; i < count; i++) {
    const [color, a] = clouds[i % clouds.length];
    const x = lerp(x0, x1, rand()), y = lerp(y0, y1, rand()), r = lerp(0.12, 0.26, rand());
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rand() * TAU); ctx.scale(1, lerp(0.35, 0.7, rand()));
    ctx.fillStyle = radial(ctx, 0, 0, r, [rgba(color, a), rgba(color, 0)]);
    ctx.fillRect(-r, -r, 2 * r, 2 * r);
    ctx.restore();
  }
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

// The Lemur's crescent, white so it can be tinted, sized like the orb (its outer edge
// 1/ORB_PAD of the texture, the rest halo): a disc with an offset disc cut out of it, its
// horns opening toward +x, a glint in the thick of its back.
function crescent(S = 128) {
  const { c, ctx } = surface(S);
  const r = 0.5 / ORB_PAD;
  ctx.fillStyle = radial(ctx, 0.5, 0.5, 0.5, [rgba('#ffffff', 0.45), rgba('#ffffff', 0.12), rgba('#ffffff', 0)]);
  ctx.fillRect(0, 0, 1, 1);
  const k = surface(S);
  k.ctx.beginPath();
  k.ctx.arc(0.5, 0.5, r, 0, TAU);
  k.ctx.fillStyle = radial(k.ctx, 0.5, 0.5, r, ['#ffffff', '#f2f2f2', '#c8c8c8'], 0.4, 0.5);
  k.ctx.fill();
  k.ctx.globalCompositeOperation = 'destination-out';
  k.ctx.beginPath();
  k.ctx.arc(0.5 + r * 0.42, 0.5, r * 0.86, 0, TAU);
  k.ctx.fill();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(k.c, 0, 0);
  ctx.setTransform(S, 0, 0, S, 0, 0);
  sparkle(ctx, 0.5 - r * 0.72, 0.5, r * 0.45, '#ffffff', 0.9);
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

// The opened exit: the same hex portal, bright and solid, lit from within by a star.
function exitPortal() {
  const c = hexCrystal(222, 256, false, {
    fill: (ctx, h) => radial(ctx, 0.5, h / 2, 0.62, ['#ffffff', '#dfe6ff', '#8d9ff0']),
    inner: '#e6ebff', facet: rgba('#6f82dc', 0.8), rim: '#ffffff', star: '#ffffff',
  });
  const ctx = c.getContext('2d'), h = 256 / 222;
  ctx.save();
  ctx.clip(hexPath(1, h, false));
  ctx.fillStyle = radial(ctx, 0.5, h / 2, 0.26, [rgba('#ffffff', 0.7), rgba('#ffffff', 0)]);
  ctx.fillRect(0, 0, 1, h);
  ctx.restore();
  sparkle(ctx, 0.5, h / 2, 0.16, '#ffffff');
  return c;
}

// A glowing outline of the exit's hex, white so it can be tinted: the frames turning
// around the opened exit and the ripples it sends out. The outline spans HEX_FRAME_INSET
// of the texture's width.
function hexFrame(W = 256) {
  const H = Math.round((W * 256) / 222);
  const { c, ctx, px } = surface(W, H, W);
  const h = H / W, s = HEX_FRAME_INSET;
  const p = new Path2D();
  p.addPath(hexPath(1, h, false), new DOMMatrix().translate(0.5, h / 2).scale(s).translate(-0.5, -h / 2));
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 0.02;
  glow(ctx, rgba('#ffffff', 0.9), px * 0.05, () => { ctx.stroke(p); ctx.stroke(p); });
  return c;
}

// ---------------------------------------------------------------- props

// Destroyable props (src/game/props.js): one sprite per crack stage, `${name}_${stage}`.
// Each is a shape of void in a glowing outline like the enemies, cracks of the light sealed
// inside spreading through it stage by stage (each stage keeps the last one's cracks).
function propSprites() {
  const out = {};
  for (const name of Object.keys(PROP_ART)) {
    for (let stage = 0; stage < propStageCount(name); stage++) out[`${name}_${stage}`] = propSprite(name, stage);
  }
  return out;
}

export const propStageCount = (name) => PROP_ART[name].cracks.length;

const PROP_ART = {
  // A closed bud seen from above: petals curling round into the middle, starlight glowing
  // through the seams between them (a star peeks out where they meet, at runtime).
  starPod: {
    path: podPath, line: 0.034, cracks: [0],
    palette: { stroke: ['#f0e4ff', '#c8a8ff', '#6a4aa8'], glow: rgba('#b48cff', 0.7) },
    fill: (ctx) => radial(ctx, 0.5, 0.5, 0.4, ['#2a1c44', '#0a0614'], 0.44, 0.42),
    clouds: [['#9a6cff', 0.2], ['#5a7cff', 0.12]], seed: 61,
    detail: podDetail,
  },
  // A star (drawn at runtime) held in a cage of light seen from above: an outer ring and
  // two tilted orbits crossing it, slowly turning.
  cagedStar: {
    path: () => circlePath(CAGE.r), line: 0.03, cracks: [0],
    palette: { stroke: ['#ffffff', '#9fd8ff', '#3f7cc4'], glow: rgba('#7fc8ff', 0.8) },
    fill: (ctx) => radial(ctx, 0.5, 0.5, CAGE.r, [rgba('#16305a', 0.55), rgba('#060c1c', 0.35)]),
    clouds: [['#3f8cff', 0.12]], seed: 67,
    detail: cageDetail,
  },
  // A speckled egg of void lying on its side, something bright stirring inside; its shell
  // cracks before it bursts.
  starEgg: {
    path: eggPath, line: 0.034, cracks: [0, 4],
    palette: { stroke: ['#fff0e8', '#ffb8a0', '#a85a4a'], glow: rgba('#ff9a80', 0.6) },
    fill: (ctx) => radial(ctx, 0.5, 0.5, 0.4, ['#3a2230', '#0c0608'], 0.42, 0.4),
    clouds: [['#ff8a6a', 0.16], ['#8a4adc', 0.12]], seed: 89,
    crack: '#fff0e8', crackGlow: rgba('#ffb8a0', 0.95),
    detail: eggDetail,
  },
  // A lump of void rock, a cluster of crystal poking out of one side, light leaking
  // through its cracks.
  geode: {
    path: geodePath, line: 0.034, cracks: [2, 4, 6],
    palette: { stroke: ['#d6d0ee', '#8c85ad', '#4a4466'], glow: rgba('#6fe0c4', 0.4) },
    fill: (ctx) => radial(ctx, 0.5, 0.5, 0.4, ['#262236', '#09080f'], 0.42, 0.4),
    clouds: [['#2fae8c', 0.16], ['#5a46b0', 0.18]], seed: 73,
    crack: '#e6fff8', crackGlow: rgba('#7af0d0', 0.95),
    detail: geodeDetail, over: geodeCrystals,
  },
  // A gilded hex casket: an inner hex sealing a star, straps of gold out to studs at its
  // corners.
  reliquary: {
    path: reliquaryPath, line: 0.04, cracks: [0, 2, 4, 6, 8],
    palette: { stroke: ['#fff4d6', '#ffd27a', '#a8701e'], glow: rgba('#ffb347', 0.7) },
    fill: (ctx) => radial(ctx, 0.5, 0.5, 0.42, ['#2a1d08', '#080502'], 0.44, 0.42),
    clouds: [['#d99a2a', 0.18], ['#7a3ec0', 0.12]], seed: 79,
    crack: '#fff6dc', crackGlow: rgba('#ffc85a', 0.95),
    detail: reliquaryDetail,
  },
  // A spawner: a wound in the void, a crown of uneven thorns round a slit of an eye, red
  // veins throbbing out from it to every thorn. Cracks split it wide before it bursts. Each
  // spawner in play grows its own (spawnerSprites); this one is the spawn menu's.
  spawner: spawnerArt(137),
};

function propSprite(name, stage, S = 256, A = PROP_ART[name]) {
  const { c, ctx, px } = surface(S);
  const shape = A.path();
  ctx.fillStyle = A.fill(ctx);
  ctx.fill(shape);
  ctx.save();
  ctx.clip(shape);
  nebula(ctx, seededRandom(A.seed), A.clouds, 5, A.cloudBox);
  A.detail(ctx, px);
  // Cracks: a soft glow under a thin white-hot line, both brighter each stage.
  const heat = A.cracks.length > 1 ? stage / (A.cracks.length - 1) : 0;
  for (let i = 0; i < A.cracks[stage]; i++) {
    const p = crackPath(seededRandom(A.seed * 31 + i * 97), 0.42);
    glow(ctx, A.crackGlow, px * lerp(0.03, 0.06, heat), () => {
      ctx.strokeStyle = A.crackGlow;
      ctx.lineWidth = lerp(0.02, 0.03, heat);
      ctx.stroke(p);
    });
    ctx.strokeStyle = A.crack;
    ctx.lineWidth = lerp(0.008, 0.014, heat);
    ctx.stroke(p);
  }
  ctx.restore();
  ctx.strokeStyle = linear(ctx, 0.2, 0.15, 0.8, 0.85, A.palette.stroke);
  glow(ctx, A.palette.glow, px * 0.035, () => {
    ctx.lineWidth = A.line;
    ctx.stroke(shape);
  });
  A.over?.(ctx, px);
  return c;
}

// A crack wandering out from near the centre past `reach`, with the odd short branch.
function crackPath(rand, reach) {
  const p = new Path2D();
  const walk = (x, y, heading, len, branchy) => {
    p.moveTo(x, y);
    for (let d = 0; d < len;) {
      const step = lerp(0.03, 0.055, rand()), a = heading + lerp(-0.75, 0.75, rand());
      x += Math.cos(a) * step; y += Math.sin(a) * step; d += step;
      p.lineTo(x, y);
      if (branchy && rand() < 0.2) {
        walk(x, y, heading + lerp(0.6, 1.1, rand()) * (rand() < 0.5 ? -1 : 1), (len - d) * 0.5, false);
        p.moveTo(x, y);
      }
    }
  };
  const a = rand() * TAU, r = rand() * 0.06;
  walk(0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r, a, reach, true);
  return p;
}

function circlePath(r) {
  const p = new Path2D();
  p.arc(0.5, 0.5, r, 0, TAU);
  return p;
}

// The star pod's petals: `n` of them round to radius `r`, each bulging out to `bulge` × r
// between the seams; the seams curl `twist` degrees round on their way in.
const POD = { n: 6, r: 0.32, bulge: 1.32, twist: 34 };

// Where seam `i` meets the rim (degrees, radius).
const podSeam = (i) => [(i / POD.n) * 360 - 90, POD.r];

function podPath() {
  const p = new Path2D();
  for (let i = 0; i <= POD.n; i++) {
    const [a, r] = podSeam(i), [x, y] = polar(0.5, 0.5, a, r);
    if (i === 0) { p.moveTo(x, y); continue; }
    const [cx, cy] = polar(0.5, 0.5, a - 180 / POD.n, r * POD.bulge);
    p.quadraticCurveTo(cx, cy, x, y);
  }
  p.closePath();
  return p;
}

// The petals, every other one catching the light, and the seams between them glowing.
function podDetail(ctx, px) {
  const seam = (i) => {
    const [a, r] = podSeam(i), [x, y] = polar(0.5, 0.5, a, r), [cx, cy] = polar(0.5, 0.5, a - POD.twist, r * 0.55);
    return { x, y, cx, cy };
  };
  for (let i = 0; i < POD.n; i += 2) {
    const s0 = seam(i), s1 = seam(i + 1), [bx, by] = polar(0.5, 0.5, podSeam(i + 1)[0] - 180 / POD.n, POD.r * POD.bulge);
    const p = new Path2D();
    p.moveTo(0.5, 0.5);
    p.quadraticCurveTo(s0.cx, s0.cy, s0.x, s0.y);
    p.quadraticCurveTo(bx, by, s1.x, s1.y);
    p.quadraticCurveTo(s1.cx, s1.cy, 0.5, 0.5);
    ctx.fillStyle = rgba('#b48cff', 0.1);
    ctx.fill(p);
  }
  const seams = new Path2D();
  for (let i = 0; i < POD.n; i++) {
    const s = seam(i);
    seams.moveTo(0.5, 0.5);
    seams.quadraticCurveTo(s.cx, s.cy, s.x, s.y);
  }
  glow(ctx, rgba('#c8a8ff', 0.95), px * 0.05, () => {
    ctx.strokeStyle = rgba('#c8a8ff', 0.9);
    ctx.lineWidth = 0.026;
    ctx.stroke(seams);
  });
  ctx.strokeStyle = '#f4ecff';
  ctx.lineWidth = 0.009;
  ctx.stroke(seams);
  ctx.fillStyle = radial(ctx, 0.5, 0.5, 0.12, [rgba('#e8dcff', 0.7), rgba('#b48cff', 0)]);
  ctx.fillRect(0.38, 0.38, 0.24, 0.24);
}

// The caged star's outer ring (`r`), the two orbits crossing it (`orbit`: half-length,
// half-width, tilt in degrees either way), and an inner ring (`inner`).
const CAGE = { r: 0.42, orbit: [0.4, 0.15, 32], inner: 0.2 };

function cageDetail(ctx, px) {
  const [ox, oy, tilt] = CAGE.orbit;
  const rings = new Path2D();
  for (const t of [tilt, -tilt]) {
    rings.moveTo(0.5 + Math.cos(t * DEG) * ox, 0.5 + Math.sin(t * DEG) * ox); // no line joining it to the last
    rings.ellipse(0.5, 0.5, ox, oy, t * DEG, 0, TAU);
  }
  rings.moveTo(0.5 + CAGE.inner, 0.5);
  rings.arc(0.5, 0.5, CAGE.inner, 0, TAU);
  glow(ctx, rgba('#7fc8ff', 0.9), px * 0.04, () => {
    ctx.strokeStyle = rgba('#bfe4ff', 0.85);
    ctx.lineWidth = 0.018;
    ctx.stroke(rings);
  });
  // Beads of light riding the orbits.
  for (const [t, at] of [[tilt, 40], [-tilt, 200], [tilt, 250]]) {
    const a = at * DEG, c = Math.cos(t * DEG), s = Math.sin(t * DEG);
    const ex = Math.cos(a) * ox, ey = Math.sin(a) * oy;
    sparkle(ctx, 0.5 + ex * c - ey * s, 0.5 + ex * s + ey * c, 0.04, '#ffffff', 0.9);
  }
  ctx.fillStyle = radial(ctx, 0.5, 0.5, 0.18, [rgba('#cfeaff', 0.55), rgba('#7fc8ff', 0)]);
  ctx.fillRect(0.32, 0.32, 0.36, 0.36);
}

// An egg on its side, rounder at one end.
function eggPath() {
  const p = new Path2D();
  p.moveTo(0.13, 0.5);
  p.bezierCurveTo(0.13, 0.3, 0.4, 0.21, 0.57, 0.21);
  p.bezierCurveTo(0.76, 0.21, 0.87, 0.34, 0.87, 0.5);
  p.bezierCurveTo(0.87, 0.66, 0.76, 0.79, 0.57, 0.79);
  p.bezierCurveTo(0.4, 0.79, 0.13, 0.7, 0.13, 0.5);
  p.closePath();
  return p;
}

// Pale speckles over the shell and a soft sheen along its top.
function eggDetail(ctx) {
  const rand = seededRandom(97);
  for (let i = 0; i < 22; i++) {
    ctx.fillStyle = rgba('#ffd8c8', lerp(0.15, 0.45, rand()));
    ctx.beginPath();
    ctx.arc(lerp(0.18, 0.84, rand()), lerp(0.25, 0.75, rand()), lerp(0.005, 0.016, rand()), 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = rgba('#ffffff', 0.4);
  ctx.lineWidth = 0.022;
  ctx.beginPath();
  ctx.moveTo(0.3, 0.32); ctx.quadraticCurveTo(0.5, 0.25, 0.7, 0.29);
  ctx.stroke();
  ctx.fillStyle = radial(ctx, 0.56, 0.52, 0.2, [rgba('#ffb8a0', 0.35), rgba('#ffb8a0', 0)]);
  ctx.fillRect(0.3, 0.3, 0.5, 0.45);
}

// A lumpy, angular rock: a seeded ring of points at jittered radii.
function geodePath() {
  const rand = seededRandom(71), n = 11, p = new Path2D();
  for (let i = 0; i < n; i++) {
    const a = ((i + lerp(-0.25, 0.25, rand())) / n) * TAU, r = lerp(0.3, 0.385, rand());
    const x = 0.5 + Math.cos(a) * r, y = 0.5 + Math.sin(a) * r;
    if (i === 0) p.moveTo(x, y); else p.lineTo(x, y);
  }
  p.closePath();
  return p;
}

// Faint facet edges catching the light across the rock.
function geodeDetail(ctx) {
  const rand = seededRandom(83);
  ctx.strokeStyle = rgba('#b8b0e0', 0.12);
  ctx.lineWidth = 0.012;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = rand() * TAU, b = a + lerp(0.8, 1.6, rand());
    ctx.moveTo(0.5 + Math.cos(a) * 0.38, 0.5 + Math.sin(a) * 0.38);
    ctx.lineTo(0.5 + Math.cos(a) * 0.12 + lerp(-0.05, 0.05, rand()), 0.5 + Math.sin(a) * 0.12);
    ctx.lineTo(0.5 + Math.cos(b) * 0.38, 0.5 + Math.sin(b) * 0.38);
  }
  ctx.stroke();
}

// Teal crystals breaking out of its lower right.
function geodeCrystals(ctx, px) {
  const shards = [[38, 0.3, 0.16, 0.05], [22, 0.31, 0.11, 0.035], [56, 0.29, 0.1, 0.034]]; // angle°, root radius, length, half width
  glow(ctx, rgba('#7af0d0', 0.8), px * 0.04, () => {
    for (const [deg, r0, len, w] of shards) {
      const a = deg * DEG, [x, y] = polar(0.5, 0.5, deg, r0);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(-0.02, -w); ctx.lineTo(len * 0.7, -w * 0.8); ctx.lineTo(len, 0); ctx.lineTo(len * 0.7, w * 0.8); ctx.lineTo(-0.02, w);
      ctx.closePath();
      ctx.fillStyle = linear(ctx, 0, -w, 0, w, ['#d8fff4', '#4fd8b4', '#1c7a64']);
      ctx.fill();
      ctx.strokeStyle = '#eafffa';
      ctx.lineWidth = 0.01;
      ctx.stroke();
      ctx.restore();
    }
  });
}

const RELIQUARY_HEX = { w: 0.84, inner: 0.52 };

function reliquaryHex(scale = 1) {
  const w = RELIQUARY_HEX.w, h = w * Math.sin(Math.PI / 3), p = new Path2D();
  p.addPath(hexPath(w, h, true), new DOMMatrix().translate(0.5, 0.5).scale(scale).translate(-w / 2, -h / 2));
  return p;
}

function reliquaryPath() { return reliquaryHex(); }

// The inner hex, gold straps out to studded corners, and the sealed star.
function reliquaryDetail(ctx, px) {
  const R = RELIQUARY_HEX, corners = Array.from({ length: 6 }, (_, i) => polar(0.5, 0.5, i * 60, R.w / 2));
  ctx.strokeStyle = rgba('#ffd27a', 0.45);
  ctx.lineWidth = 0.014;
  ctx.beginPath();
  for (const [x, y] of corners) {
    ctx.moveTo(lerp(0.5, x, R.inner), lerp(0.5, y, R.inner));
    ctx.lineTo(lerp(0.5, x, 0.9), lerp(0.5, y, 0.9));
  }
  ctx.stroke();
  ctx.strokeStyle = rgba('#ffe2a0', 0.8);
  ctx.lineWidth = 0.018;
  ctx.stroke(reliquaryHex(R.inner));
  ctx.fillStyle = '#ffe2a0';
  for (const [x, y] of corners) {
    ctx.beginPath();
    ctx.arc(lerp(0.5, x, 0.8), lerp(0.5, y, 0.8), 0.018, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = radial(ctx, 0.5, 0.5, 0.2, [rgba('#ffd27a', 0.45), rgba('#ffd27a', 0)]);
  ctx.fillRect(0.3, 0.3, 0.4, 0.4);
  glow(ctx, rgba('#ffc85a', 0.9), px * 0.05, () => sparkle(ctx, 0.5, 0.5, 0.13, '#fff4d6'));
}

// A spawner's crown, laid out afresh from each spawner's own seed so no two look alike:
// `count` thorns (picked in range) round a core of radius `r`, spaced evenly but for a
// little `jitter` (× the spacing), each pointing straight out to its own length past the
// core (`reach`), its own width (`width`, × the spacing either side), its sides bowing out
// or in a touch alike (`bow`).
const SPAWNER = { count: [6, 12], r: [0.2, 0.27], reach: [0.06, 0.2], width: [0.26, 0.4], jitter: 0.08, bow: [-0.25, 0.35] };

function spawnerCrown(seed) {
  const S = SPAWNER, rand = seededRandom(seed);
  const n = S.count[0] + Math.floor(rand() * (S.count[1] - S.count[0] + 1));
  const step = 360 / n, turn = rand() * 360, r = lerp(...S.r, rand());
  const thorns = Array.from({ length: n }, (_, i) => ({
    a: turn + (i + lerp(-S.jitter, S.jitter, rand())) * step,
    tip: r + lerp(...S.reach, rand()),
    half: step * lerp(...S.width, rand()),
    bow: lerp(...S.bow, rand()),
  }));
  return { r, thorns };
}

// The art (as PROP_ART's) of the spawner grown from `seed`.
function spawnerArt(seed) {
  let crown = null;
  const get = () => (crown ??= spawnerCrown(seed)); // only once it's drawn: SPAWNER isn't set yet while PROP_ART is
  return {
    path: () => spawnerPath(get()), line: 0.03, cracks: [0, 2, 3, 5, 7, 9],
    palette: { stroke: ['#ff9a8a', '#c0141c', '#3a0208'], glow: rgba('#ff1a10', 0.75) },
    fill: (ctx) => radial(ctx, 0.5, 0.5, 0.44, ['#30040a', '#0a0004', '#020001'], 0.5, 0.5),
    clouds: [['#c0101a', 0.22], ['#5a0a3a', 0.18], ['#ff3a24', 0.08]], seed, cloudBox: [0.2, 0.8, 0.2, 0.8],
    crack: '#ffd8cc', crackGlow: rgba('#ff3a24', 0.95),
    detail: (ctx, px) => spawnerDetail(ctx, px, get(), seed), over: spawnerEye,
  };
}

// A spawner's own sprites, one per crack stage, grown from `seed` (src/game/spawner.js).
export function spawnerSprites(seed) {
  const A = spawnerArt(seed);
  return A.cracks.map((_, stage) => propSprite('spawner', stage, 256, A));
}

// Each thorn straight out from the core, its sides bowed alike; between thorns the rim
// sags in a little toward the core.
function spawnerPath({ r, thorns }) {
  const p = new Path2D();
  thorns.forEach((t, i) => {
    const [lx, ly] = polar(0.5, 0.5, t.a - t.half, r), [tx, ty] = polar(0.5, 0.5, t.a, t.tip);
    const [rx, ry] = polar(0.5, 0.5, t.a + t.half, r), mid = (r + t.tip) / 2, side = t.half * 0.5 * (1 + t.bow);
    const [c1x, c1y] = polar(0.5, 0.5, t.a - side, mid), [c2x, c2y] = polar(0.5, 0.5, t.a + side, mid);
    if (i === 0) p.moveTo(lx, ly); else p.lineTo(lx, ly);
    p.quadraticCurveTo(c1x, c1y, tx, ty);
    p.quadraticCurveTo(c2x, c2y, rx, ry);
    const next = thorns[(i + 1) % thorns.length], gap = ((next.a - next.half + 360 - (t.a + t.half)) % 360) / 2;
    const [sx, sy] = polar(0.5, 0.5, t.a + t.half + gap, r * 0.9);
    const [nx, ny] = polar(0.5, 0.5, next.a - next.half, r);
    p.quadraticCurveTo(sx, sy, nx, ny);
  });
  p.closePath();
  return p;
}

// Veins: a branching red line from the eye out to the tip of every thorn, throbbing hot
// near the middle, and the darkness pooling round the eye.
function spawnerDetail(ctx, px, { thorns }, seed) {
  const rand = seededRandom(seed + 7), veins = new Path2D();
  for (const t of thorns) {
    let x = 0.5, y = 0.5;
    const a = t.a * DEG, [ex, ey] = polar(0.5, 0.5, t.a, t.tip * 0.92);
    veins.moveTo(x, y);
    for (let k = 1; k <= 6; k++) {
      const f = k / 6, wob = lerp(-0.035, 0.035, rand()) * (1 - f * 0.6);
      x = lerp(0.5, ex, f) - Math.sin(a) * wob;
      y = lerp(0.5, ey, f) + Math.cos(a) * wob;
      veins.lineTo(x, y);
      if (k === 3 && rand() < 0.7) { // a short fork off to the side
        const side = rand() < 0.5 ? -1 : 1, fa = a + side * lerp(0.5, 0.9, rand()), len = lerp(0.04, 0.08, rand());
        veins.moveTo(x, y);
        veins.lineTo(x + Math.cos(fa) * len, y + Math.sin(fa) * len);
        veins.moveTo(x, y);
      }
    }
  }
  glow(ctx, rgba('#ff1a10', 0.9), px * 0.04, () => {
    ctx.strokeStyle = rgba('#b0101a', 0.85);
    ctx.lineWidth = 0.018;
    ctx.stroke(veins);
  });
  ctx.strokeStyle = rgba('#ff6a50', 0.55);
  ctx.lineWidth = 0.006;
  ctx.stroke(veins);
  ctx.fillStyle = radial(ctx, 0.5, 0.5, 0.2, [rgba('#000000', 0.85), rgba('#000000', 0)]);
  ctx.fillRect(0.3, 0.3, 0.4, 0.4);
}

// The eye, over everything: an almond slit, hot red rimmed in black, a darker slit of a
// pupil down it and a glint, so it reads however the spawner lies.
function spawnerEye(ctx, px) {
  const w = 0.075, hh = 0.15, eye = new Path2D();
  eye.moveTo(0.5, 0.5 - hh);
  eye.quadraticCurveTo(0.5 + w * 2, 0.5, 0.5, 0.5 + hh);
  eye.quadraticCurveTo(0.5 - w * 2, 0.5, 0.5, 0.5 - hh);
  glow(ctx, rgba('#ff2a10', 1), px * 0.07, () => {
    ctx.fillStyle = radial(ctx, 0.5, 0.5, hh, ['#ffe0c8', '#ff3a1a', '#8a0008']);
    ctx.fill(eye);
  });
  ctx.strokeStyle = '#0a0002';
  ctx.lineWidth = 0.014;
  ctx.stroke(eye);
  const pupil = new Path2D();
  pupil.moveTo(0.5, 0.5 - hh * 0.75);
  pupil.quadraticCurveTo(0.5 + w * 0.42, 0.5, 0.5, 0.5 + hh * 0.75);
  pupil.quadraticCurveTo(0.5 - w * 0.42, 0.5, 0.5, 0.5 - hh * 0.75);
  ctx.fillStyle = '#120004';
  ctx.fill(pupil);
  sparkle(ctx, 0.5 + w * 0.45, 0.5 - hh * 0.4, 0.035, '#ffffff', 0.9);
}

// An angry guardian's sign (ANGER_SIGN, src/ui/angerSign.js): nothing but a churning cloud
// of red mist, with the mist missing in three places: two long slits of eyes slanting down
// hard toward each other, and a mouth torn wide in a roar, its corners hooked up, its edges
// ragged into fangs of the mist itself. Dark seeps into the holes, so they read as void
// over anything, the guardian included.
function angerSign(S = 256) {
  const { c, ctx, px } = surface(S);
  const rand = seededRandom(151);
  // The cloud: dark at its ragged rim, hotter toward its heart, with tendrils curling off it.
  ctx.save();
  ctx.filter = `blur(${Math.round(px * 0.028)}px)`;
  for (let i = 0; i < 70; i++) {
    const a = rand() * TAU, d = Math.sqrt(rand()) * 0.37, edge = d / 0.37;
    const x = 0.5 + Math.cos(a) * d, y = 0.54 + Math.sin(a) * d * 1.05, r = lerp(0.08, 0.17, rand());
    const color = edge > 0.8 ? '#7a0810' : rand() < 0.45 ? '#d4141a' : '#8a0810';
    ctx.fillStyle = radial(ctx, x, y, r, [rgba(color, lerp(0.6, 0.9, rand())), rgba(color, 0.3), rgba(color, 0)]);
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 9; i++) { // tendrils
    const a = (i / 9) * TAU + lerp(-0.3, 0.3, rand()), len = lerp(0.06, 0.1, rand());
    for (let k = 0; k < 5; k++) {
      const d = 0.36 + (k / 4) * len, bend = Math.sin(k * 0.9) * 0.05, r = lerp(0.05, 0.02, k / 4);
      const x = 0.5 + Math.cos(a + bend) * d, y = 0.54 + Math.sin(a + bend) * d * 1.05;
      ctx.fillStyle = radial(ctx, x, y, r, [rgba('#6a0a10', 0.6 * (1 - k / 5)), rgba('#6a0a10', 0)]);
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  ctx.restore();

  // Eyes: long thin slits, the inner ends dropped low, the outer ends flicked up to points.
  const eye = (side) => {
    const p = new Path2D(), o = side;
    p.moveTo(0.5 + o * 0.035, 0.47);
    p.quadraticCurveTo(0.5 + o * 0.15, 0.39, 0.5 + o * 0.29, 0.315);
    p.quadraticCurveTo(0.5 + o * 0.2, 0.45, 0.5 + o * 0.045, 0.495);
    p.closePath();
    return p;
  };
  // The mouth: corners hooked up, the upper edge ragged with fangs hanging in, the lower
  // dropped deep with fangs jutting up.
  const mouth = new Path2D(), L = 0.24, R = 0.76, half = (R - L) / 2;
  const top = (x) => 0.6 - 0.05 * ((x - 0.5) / half) ** 4;
  const bottom = (x) => 0.6 + 0.25 * (1 - ((x - 0.5) / half) ** 2) ** 0.7;
  const upper = [[0.3, 0.06], [0.355, 0.11], [0.42, 0.05], [0.47, 0.035], [0.53, 0.035], [0.58, 0.05], [0.645, 0.11], [0.7, 0.06]];
  const lower = [[0.67, 0.05], [0.6, 0.09], [0.53, 0.04], [0.47, 0.04], [0.4, 0.09], [0.33, 0.05]];
  mouth.moveTo(L, 0.54);
  for (const [x, len] of upper) {
    const w = len * 0.32;
    mouth.lineTo(x - w, top(x - w));
    mouth.lineTo(x + lerp(-0.006, 0.006, rand()), top(x) + len);
    mouth.lineTo(x + w, top(x + w));
  }
  mouth.lineTo(R, 0.54);
  mouth.quadraticCurveTo(R - 0.01, 0.66, 0.71, bottom(0.71));
  for (const [x, len] of lower) {
    const w = len * 0.36;
    mouth.lineTo(x + w, bottom(x + w));
    mouth.lineTo(x + lerp(-0.006, 0.006, rand()), bottom(x) - len);
    mouth.lineTo(x - w, bottom(x - w));
  }
  mouth.lineTo(0.29, bottom(0.29));
  mouth.quadraticCurveTo(L + 0.01, 0.66, L, 0.54);
  mouth.closePath();

  // Cut out of the cloud, soft at the rims and clean through in the middle...
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  for (const [blur, alpha] of [[0.022, 0.8], [0.008, 1]]) {
    ctx.filter = `blur(${Math.round(px * blur)}px)`;
    ctx.fillStyle = rgba('#000000', alpha);
    for (const p of [eye(-1), eye(1), mouth]) ctx.fill(p);
  }
  // ...and darkness seeping into them, so they're void whatever's behind.
  ctx.globalCompositeOperation = 'destination-over';
  ctx.filter = `blur(${Math.round(px * 0.01)}px)`;
  ctx.fillStyle = rgba('#050001', 0.92);
  for (const p of [eye(-1), eye(1), mouth]) ctx.fill(p);
  ctx.restore();
  return c;
}

// A shard of a broken prop or ward, white so it can be tinted (src/render/debris.js): a
// jagged sliver, pale with a bright edge, pointing along +x. Stretched at random for variety.
function shard(S = 64) {
  const { c, ctx } = surface(S);
  const p = new Path2D();
  p.moveTo(0.94, 0.5); p.lineTo(0.42, 0.22); p.lineTo(0.08, 0.44); p.lineTo(0.3, 0.6); p.lineTo(0.5, 0.78);
  p.closePath();
  ctx.fillStyle = linear(ctx, 0.1, 0.3, 0.9, 0.7, ['#ffffff', '#bcbcbc', '#909090']);
  ctx.fill(p);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 0.05;
  ctx.stroke(p);
  return c;
}

// ---------------------------------------------------------------- buff glyphs

// The buffs' faces (src/player/buffs.js): on their pickups and in the HUD's list, in their
// BUFFS colours on nothing, white-hot at the heart.

// Swift: a star streaking right, three trails of light behind it.
function swiftGlyph(S = 128) {
  const { c, ctx, px } = surface(S);
  const col = '#7fe8ff';
  glow(ctx, rgba(col, 0.9), px * 0.06, () => {
    for (const [y, x0, x1, w] of [[0.33, 0.14, 0.6, 0.035], [0.5, 0.06, 0.6, 0.05], [0.67, 0.14, 0.6, 0.035]]) {
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y - w);
      ctx.arc(x1, y, w, -Math.PI / 2, Math.PI / 2);
      ctx.closePath();
      ctx.fillStyle = linear(ctx, x0, 0, x1 + w, 0, [rgba(col, 0), rgba(col, 0.75), '#ffffff']);
      ctx.fill();
    }
    sparkle(ctx, 0.68, 0.5, 0.3, col);
  });
  sparkle(ctx, 0.68, 0.5, 0.16, '#ffffff');
  return c;
}

// Ward: a crystal shield, a star at its heart.
function wardGlyph(S = 128) {
  const { c, ctx, px } = surface(S);
  const col = '#c8d4ff';
  const p = new Path2D();
  p.moveTo(0.5, 0.1);
  p.quadraticCurveTo(0.68, 0.19, 0.84, 0.19);
  p.quadraticCurveTo(0.86, 0.64, 0.5, 0.91);
  p.quadraticCurveTo(0.14, 0.64, 0.16, 0.19);
  p.quadraticCurveTo(0.32, 0.19, 0.5, 0.1);
  p.closePath();
  ctx.fillStyle = radial(ctx, 0.5, 0.45, 0.45, [rgba(col, 0.5), rgba('#6f82dc', 0.35), rgba('#2a3470', 0.5)]);
  ctx.fill(p);
  ctx.strokeStyle = rgba('#ffffff', 0.35);
  ctx.lineWidth = 0.02;
  ctx.beginPath();
  ctx.moveTo(0.5, 0.12); ctx.lineTo(0.5, 0.88);
  ctx.moveTo(0.17, 0.3); ctx.lineTo(0.83, 0.3);
  ctx.stroke();
  glow(ctx, rgba(col, 0.95), px * 0.06, () => {
    ctx.strokeStyle = linear(ctx, 0.2, 0.1, 0.8, 0.9, ['#ffffff', col, '#8d9ff0']);
    ctx.lineWidth = 0.06;
    ctx.stroke(p);
  });
  sparkle(ctx, 0.5, 0.48, 0.17, '#ffffff');
  return c;
}

// Haste: a bolt of lightning, white-hot at its heart.
function hasteGlyph(S = 128) {
  const { c, ctx, px } = surface(S);
  const col = '#ffe95a';
  const p = new Path2D();
  [[0.6, 0.06], [0.24, 0.54], [0.47, 0.54], [0.36, 0.94], [0.78, 0.4], [0.54, 0.4], [0.7, 0.06]]
    .forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  p.closePath();
  glow(ctx, rgba('#ffd21f', 0.95), px * 0.07, () => {
    ctx.fillStyle = linear(ctx, 0.5, 0.06, 0.5, 0.94, ['#fffbe0', col, '#e0a010']);
    ctx.fill(p);
  });
  ctx.strokeStyle = rgba('#ffffff', 0.85);
  ctx.lineWidth = 0.02;
  ctx.beginPath();
  ctx.moveTo(0.6, 0.14); ctx.lineTo(0.38, 0.5); ctx.lineTo(0.5, 0.5); ctx.lineTo(0.42, 0.8);
  ctx.stroke();
  return c;
}

// Fury: three claw slashes raked across it, white-hot down their middles.
function furyGlyph(S = 128) {
  const { c, ctx, px } = surface(S);
  const col = '#ff5fc8';
  const slash = (ax, ay, bx, by, bow, w) => {
    const mx = (ax + bx) / 2, my = (ay + by) / 2, len = Math.hypot(bx - ax, by - ay);
    const nx = -(by - ay) / len, ny = (bx - ax) / len, cx = mx + nx * bow, cy = my + ny * bow;
    const p = new Path2D();
    p.moveTo(ax, ay);
    p.quadraticCurveTo(cx + nx * w, cy + ny * w, bx, by);
    p.quadraticCurveTo(cx - nx * w, cy - ny * w, ax, ay);
    return p;
  };
  const claws = [-0.17, 0, 0.17].map((o) => slash(0.74 + o, 0.14 + o, 0.2 + o, 0.68 + o, 0.05, o ? 0.05 : 0.065));
  glow(ctx, rgba(col, 0.95), px * 0.07, () => {
    ctx.fillStyle = linear(ctx, 0.8, 0.1, 0.2, 0.9, ['#ffd6f4', col, '#b0207e']);
    for (const p of claws) ctx.fill(p);
  });
  ctx.fillStyle = rgba('#ffffff', 0.85);
  for (const o of [-0.17, 0, 0.17]) ctx.fill(slash(0.7 + o, 0.2 + o, 0.26 + o, 0.62 + o, 0.045, 0.014));
  return c;
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

// A slim black vesica (the lens where two circles overlap) laid on the diagonal, edged in
// dark red over a red haze, with a thin lit sliver along one edge.
function cleaveIcon(S = 256) {
  const { c, ctx, px } = surface(S);
  space(ctx, seededRandom(303), {
    core: '#1c0307', edge: '#030001', stars: 30,
    nebulae: [[0.5, 0.5, 0.45, '#b3121f', 0.4], [0.7, 0.3, 0.26, '#ff3b2f', 0.12]],
  });
  ctx.fillStyle = radial(ctx, 0.5, 0.5, 0.4, [rgba('#d4202c', 0.45), rgba('#8c0d16', 0.15), rgba('#8c0d16', 0)]);
  ctx.fillRect(0, 0, 1, 1);
  const L = 0.47;
  const { path: lens, left } = vesica(L, 0.075);
  ctx.save();
  ctx.translate(0.5, 0.5);
  ctx.rotate(45 * DEG);
  paintCleave(ctx, lens, { line: 0.03, glowColor: rgba('#e0202e', 0.9), blur: px * 0.08 });
  // A sharp highlight hugging the upper-left edge, fading toward the tips.
  ctx.save();
  ctx.clip(lens);
  ctx.translate(0.012, 0);
  ctx.strokeStyle = linear(ctx, 0, -L, 0, L, [rgba('#ff5a4f', 0), rgba('#ff5a4f', 0.6), rgba('#ff5a4f', 0)]);
  ctx.lineWidth = 0.012;
  ctx.beginPath();
  left.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
  ctx.stroke();
  ctx.restore();
  ctx.restore();
  const [tx, ty] = [0.5 + Math.SQRT1_2 * L, 0.5 - Math.SQRT1_2 * L];
  sparkle(ctx, tx, ty, 0.06, '#ffd0cc', 0.9, 0.3);
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

// ---------------------------------------------------------------- wraith

// The Wraith's mist shard in a 1 × 0.5 box, pointing along +x: a needle tip sweeping back
// into a body that tears into ragged tendrils, the longest trailing from the middle.
function wraithPath() {
  const p = new Path2D();
  p.moveTo(0.98, 0.25);
  p.quadraticCurveTo(0.8, 0.17, 0.62, 0.15);
  p.lineTo(0.4, 0.05);
  p.quadraticCurveTo(0.47, 0.11, 0.47, 0.15);
  p.lineTo(0.22, 0.08);
  p.quadraticCurveTo(0.29, 0.14, 0.3, 0.18);
  p.lineTo(0.07, 0.15);
  p.quadraticCurveTo(0.15, 0.2, 0.2, 0.22);
  p.lineTo(0, 0.26);
  p.lineTo(0.2, 0.29);
  p.quadraticCurveTo(0.14, 0.33, 0.05, 0.37);
  p.lineTo(0.3, 0.32);
  p.quadraticCurveTo(0.3, 0.36, 0.2, 0.43);
  p.lineTo(0.47, 0.35);
  p.quadraticCurveTo(0.48, 0.39, 0.4, 0.45);
  p.lineTo(0.63, 0.35);
  p.quadraticCurveTo(0.8, 0.33, 0.98, 0.25);
  p.closePath();
  return p;
}

// Paints the shard (in its 1 × 0.5 box): a black haze behind, a body black at the head and
// thinning to smoke along the tendrils, a white-hot tip, and a white rim, bright at the tip
// and gone by the tail.
function paintWraith(ctx, px, rim = 0.012) {
  const path = wraithPath();
  ctx.save();
  ctx.filter = `blur(${px * 0.025}px)`;
  ctx.fillStyle = linear(ctx, 0, 0, 1, 0, [rgba('#000000', 0), rgba('#000000', 0.5), rgba('#000000', 0.7)]);
  ctx.fill(path);
  ctx.restore();
  ctx.fillStyle = linear(ctx, 0, 0, 1, 0, [rgba('#000000', 0.2), rgba('#000000', 0.85), '#000000', '#000000']);
  ctx.fill(path);
  // The tip white-hot: white mist glowing off it, and the shard turning white toward it.
  ctx.save();
  ctx.filter = `blur(${px * 0.02}px)`;
  ctx.fillStyle = radial(ctx, 0.9, 0.25, 0.13, [rgba('#ffffff', 0.75), rgba('#ffffff', 0.25), rgba('#ffffff', 0)]);
  ctx.fillRect(0.7, 0.08, 0.3, 0.34);
  ctx.restore();
  ctx.save();
  ctx.clip(path);
  ctx.fillStyle = linear(ctx, 0.62, 0, 0.97, 0, [rgba('#ffffff', 0), rgba('#ffffff', 0.5), '#ffffff']);
  ctx.fillRect(0.6, 0, 0.4, 0.5);
  ctx.restore();
  const edge = linear(ctx, 0, 0, 1, 0, [rgba('#ffffff', 0), rgba('#ffffff', 0.15), rgba('#ffffff', 0.6), '#ffffff']);
  glow(ctx, rgba('#ffffff', 0.5), px * 0.015, () => {
    ctx.strokeStyle = edge;
    ctx.lineWidth = rim;
    ctx.stroke(path);
  });
  // A faint spine of light running back from the tip.
  ctx.strokeStyle = linear(ctx, 0.4, 0, 0.95, 0, [rgba('#ffffff', 0), rgba('#ffffff', 0.35)]);
  ctx.lineWidth = rim * 0.6;
  ctx.beginPath();
  ctx.moveTo(0.4, 0.245); ctx.lineTo(0.93, 0.25);
  ctx.stroke();
}

// The form the Wraith turns the player into (src/aspects/wraith.js), 2:1, pointing along +x;
// white-rimmed so it can be tinted.
function wraithForm(W = 256) {
  const { c, ctx, px } = surface(W, W / 2, W);
  paintWraith(ctx, px);
  return c;
}

// The shard knifing up and to the right out of a pale eclipse glow, black wisps torn
// off behind it.
function wraithIcon(S = 256) {
  const { c, ctx, px } = surface(S);
  const rand = seededRandom(606);
  space(ctx, rand, {
    core: '#120f1c', edge: '#020205', stars: 30,
    nebulae: [[0.5, 0.5, 0.48, '#6b5fa8', 0.3], [0.25, 0.75, 0.3, '#3b3366', 0.2]],
  });
  ctx.fillStyle = radial(ctx, 0.5, 0.5, 0.42, [rgba('#e4defc', 0.7), rgba('#8f84c8', 0.25), rgba('#8f84c8', 0)]);
  ctx.fillRect(0, 0, 1, 1);
  ctx.save();
  ctx.translate(0.5, 0.5);
  ctx.rotate(-40 * DEG);
  // Wisps shed behind, blurred into smoke.
  ctx.save();
  ctx.filter = `blur(${px * 0.02}px)`;
  for (let i = 0; i < 6; i++) {
    const x = lerp(-0.5, -0.15, rand()), y = lerp(-0.12, 0.12, rand()), r = lerp(0.05, 0.1, rand());
    ctx.fillStyle = radial(ctx, x, y, r, [rgba('#000000', 0.75), rgba('#000000', 0)]);
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  ctx.restore();
  ctx.scale(1.15, 1.15);
  ctx.translate(-0.5, -0.25);
  paintWraith(ctx, px, 0.012);
  ctx.restore();
  const [tx, ty] = [0.5 + Math.cos(-40 * DEG) * 0.55, 0.5 + Math.sin(-40 * DEG) * 0.55];
  sparkle(ctx, tx, ty, 0.07, '#ffffff', 1, 0.3);
  return c;
}

// ---------------------------------------------------------------- astral blades

// The Astral blade's box: its silhouette spans `length` of the sprite's width (the rest is
// glow), and the sprite is `height` times as tall as it is wide.
export const ASTRAL_BLADE = { length: 0.8, height: 0.36 };

// A plain sword's silhouette pointing along +x, centred on (0.5, 0.18) of a 1 × 0.36 box and
// 0.8 long: a round pommel, a grip, a crossguard with flared ends, and a straight blade
// narrowing a little before it tapers to the point. Every point goes through `m`, which can
// place it (say, in perspective); curves' control points too, close enough for gentle warps.
function astralPath(m = (x, y) => [x, y]) {
  const p = new Path2D(), y = 0.18;
  const poly = (pts) => { pts.forEach(([x, y], i) => (i ? p.lineTo(...m(x, y)) : p.moveTo(...m(x, y)))); p.closePath(); };
  poly(Array.from({ length: 24 }, (_, i) => [0.13 + Math.cos((i / 24) * TAU) * 0.033, y + Math.sin((i / 24) * TAU) * 0.033]));
  poly([[0.14, y - 0.022], [0.28, y - 0.022], [0.28, y + 0.022], [0.14, y + 0.022]]);
  const q = (cx, cy, x, y) => p.quadraticCurveTo(...m(cx, cy), ...m(x, y));
  p.moveTo(...m(0.27, y - 0.098));
  q(0.277, y - 0.12, 0.304, y - 0.116);
  q(0.312, y - 0.075, 0.315, y - 0.048);
  p.lineTo(...m(0.74, y - 0.042));
  q(0.84, y - 0.033, 0.9, y);
  q(0.84, y + 0.033, 0.74, y + 0.042);
  p.lineTo(...m(0.315, y + 0.048));
  q(0.312, y + 0.075, 0.304, y + 0.116);
  q(0.277, y + 0.12, 0.27, y + 0.098);
  p.closePath();
  return p;
}

// The blade's light: blue, and crimson while the player is Exalted, just as bright.
const ASTRAL_BLUE = { glow: '#4fb0ff', under: '#6cbcff', body: '#8ccdff', core: ['#e6f4ff', '#f4faff'] };
const ASTRAL_EXALTED = { glow: '#ff1438', under: '#ff3a54', body: '#ff5c72', core: ['#ffd8de', '#fff2f4'] };

// Paints the blade (in its 1 × 0.36 box, placed by `m` as in astralPath) as nothing but bright
// light in palette `c`: a soft halo, a solid body and a paler line of light down its middle,
// from the pommel to near the point.
function paintAstral(ctx, px, m = (x, y) => [x, y], c = ASTRAL_BLUE) {
  const path = astralPath(m);
  glow(ctx, rgba(c.glow, 1), px * 0.05, () => { ctx.fillStyle = c.under; ctx.fill(path); ctx.fill(path); });
  ctx.fillStyle = c.body;
  ctx.fill(path);
  const core = new Path2D();
  [[0.11, 0.158], [0.86, 0.168], [0.86, 0.192], [0.11, 0.202]].forEach(([x, y], i) => (i ? core.lineTo(...m(x, y)) : core.moveTo(...m(x, y))));
  core.closePath();
  ctx.save();
  ctx.clip(path);
  ctx.filter = `blur(${px * 0.01}px)`;
  ctx.fillStyle = linear(ctx, ...m(0.1, 0.18), ...m(0.9, 0.18), [rgba(c.core[0], 0.8), rgba(c.core[1], 1), rgba(c.core[1], 1), rgba(c.core[1], 0.2)]);
  ctx.fill(core);
  ctx.restore();
}

// The blade Astral Blades draws (src/aspects/astral.js), pointing along +x, in `palette`.
function astralBlade(palette = ASTRAL_BLUE, W = 256) {
  const { c, ctx, px } = surface(W, Math.round(W * ASTRAL_BLADE.height), W);
  paintAstral(ctx, px, undefined, palette);
  return c;
}

// One blade up close, rising toward the top right at the end of its flight: its trail comes
// in thin out of the distance at the top, curls left and down the left side, dips under the
// bottom of the box and climbs into its pommel, widening and brightening as it nears.
function astralIcon(S = 256) {
  const { c, ctx, px } = surface(S);
  space(ctx, seededRandom(707), {
    core: '#07142e', edge: '#020309', stars: 22,
    nebulae: [[0.55, 0.45, 0.46, '#2f8bff', 0.4], [0.2, 0.75, 0.3, '#6d9bff', 0.12]],
  });
  ctx.fillStyle = radial(ctx, 0.6, 0.46, 0.42, [rgba('#9fd0ff', 0.3), rgba('#3d9bff', 0.1), rgba('#3d9bff', 0)]);
  ctx.fillRect(0, 0, 1, 1);
  // The flight, two cubic curves joined smoothly: A out of the distance and down the left
  // side, then P under the bottom and up into the pommel, heading the way the blade points.
  const A = [[0.44, 0.15], [0.16, 0.1], [0.01, 0.38], [0.05, 0.74]];
  const P = [[0.05, 0.74], [0.08, 1.02], [0.2, 1.1], [0.36, 0.86]];
  const bez = (Q, t) => {
    const u = 1 - t, a = u * u * u, b = 3 * u * u * t, d = 3 * u * t * t, e = t * t * t;
    return [a * Q[0][0] + b * Q[1][0] + d * Q[2][0] + e * Q[3][0], a * Q[0][1] + b * Q[1][1] + d * Q[2][1] + e * Q[3][1]];
  };
  const at = (t) => (t < 0.5 ? bez(A, t * 2) : bez(P, t * 2 - 1));
  const n = 160, pts = Array.from({ length: n + 1 }, (_, i) => at(i / n));
  // The trail's outline, `w` wide at the pommel and easing down to a thread far off.
  const ribbon = (w) => {
    const left = [], right = [];
    pts.forEach(([x, y], i) => {
      const [ax, ay] = pts[Math.max(0, i - 1)], [bx, by] = pts[Math.min(n, i + 1)], l = Math.hypot(bx - ax, by - ay) || 1;
      const h = lerp(0.003, w, smoothStep01(i / n) ** 0.8) / 2, nx = -(by - ay) / l, ny = (bx - ax) / l;
      left.push([x + nx * h, y + ny * h]);
      right.push([x - nx * h, y - ny * h]);
    });
    const p = new Path2D();
    [...left, ...right.reverse()].forEach((q, i) => (i ? p.lineTo(...q) : p.moveTo(...q)));
    p.closePath();
    return p;
  };
  // Brightest at the pommel and fading with distance back along it (the curve only ever gets
  // farther from the pommel the further back it goes).
  const fadeOut = (color, a) => radial(ctx, P[3][0], P[3][1], 0.74, [rgba(color, a), rgba(color, a * 0.7), rgba(color, 0)]);
  ctx.save();
  ctx.filter = `blur(${px * 0.03}px)`;
  ctx.fillStyle = fadeOut('#3d9bff', 0.75);
  ctx.fill(ribbon(0.16));
  ctx.restore();
  ctx.fillStyle = fadeOut('#5aa8ff', 1);
  ctx.fill(ribbon(0.075));
  ctx.save();
  ctx.filter = `blur(${px * 0.004}px)`;
  ctx.fillStyle = fadeOut('#eef7ff', 0.95);
  ctx.fill(ribbon(0.026));
  ctx.restore();
  // The blade, its pommel at the trail's head, THICK times its usual width and tipped toward
  // the viewer by TILT so its far end comes nearer: it foreshortens, and swells toward the
  // point in perspective (camera EYE away from the pommel).
  const TILT = 55 * DEG, EYE = 1.3, THICK = 1.35, k = 0.74 / ASTRAL_BLADE.length;
  const angle = Math.atan2(P[3][1] - P[2][1], P[3][0] - P[2][0]), dx = Math.cos(angle), dy = Math.sin(angle);
  const place = (thick) => (x, y) => {
    const along = (x - 0.1) * k, across = (y - 0.18) * k * thick, f = EYE / (EYE - along * Math.sin(TILT));
    const u = along * Math.cos(TILT) * f, v = across * f;
    return [P[3][0] + dx * u - dy * v, P[3][1] + dy * u + dx * v];
  };
  const m = place(THICK);
  // A wide bloom of light behind it, then the blade, then a crisp pale rim around it.
  ctx.save();
  ctx.filter = `blur(${px * 0.05}px)`;
  ctx.fillStyle = rgba('#3d9bff', 0.55);
  ctx.fill(astralPath(place(THICK * 2.2)));
  ctx.restore();
  paintAstral(ctx, px, m);
  const path = astralPath(m);
  ctx.save();
  ctx.clip(path);
  ctx.strokeStyle = linear(ctx, ...m(0.1, 0.18), ...m(0.9, 0.18), [rgba('#d8ecff', 0.35), rgba('#eef7ff', 0.8), rgba('#ffffff', 0.95)]);
  ctx.lineWidth = 0.012;
  ctx.stroke(path);
  ctx.restore();
  sparkle(ctx, ...m(0.92, 0.18), 0.045, '#eef7ff', 0.95, 0.3);
  return c;
}

// ---------------------------------------------------------------- needle

// A grey needle darting up toward the top right out of a faint grey trail, a glint at its tip.
function needleIcon(S = 256) {
  const { c, ctx, px } = surface(S);
  space(ctx, seededRandom(1213), {
    core: '#15171d', edge: '#030304', stars: 26,
    nebulae: [[0.55, 0.45, 0.45, '#9aa2b4', 0.22], [0.25, 0.75, 0.3, '#d8dce6', 0.08]],
  });
  ctx.save();
  ctx.translate(0.5, 0.5);
  ctx.rotate(-45 * DEG);
  // The trail: a thin taper fading back from the needle's tail.
  ctx.fillStyle = linear(ctx, -0.5, 0, -0.12, 0, [rgba('#c8ccd6', 0), rgba('#c8ccd6', 0.5)]);
  ctx.beginPath();
  ctx.moveTo(-0.12, -0.012); ctx.lineTo(-0.5, 0); ctx.lineTo(-0.12, 0.012);
  ctx.fill();
  const spike = new Path2D();
  spike.moveTo(0.36, 0); spike.lineTo(-0.06, 0.035); spike.lineTo(-0.16, 0); spike.lineTo(-0.06, -0.035); spike.closePath();
  glow(ctx, rgba('#d8dce6', 0.8), px * 0.05, () => { ctx.fillStyle = '#b8bcc6'; ctx.fill(spike); });
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0.36, 0); ctx.lineTo(-0.06, -0.035); ctx.lineTo(-0.06, -0.004);
  ctx.fill();
  ctx.restore();
  sparkle(ctx, 0.5 + Math.SQRT1_2 * 0.36, 0.5 - Math.SQRT1_2 * 0.36, 0.06, '#ffffff', 0.9, 0.3);
  return c;
}

// ---------------------------------------------------------------- momentum

// A critical strike into empty air: a narrow comic impact burst, a jagged wedge of light kicked
// up and back from the point struck (bottom left), white-hot there through gold to orange out
// at its spikes, laid on as soft light that fades layer into layer, with thin streaks of light
// shooting through it and sparks flung along with it.
function momentumIcon(S = 256) {
  const { c, ctx, px } = surface(S);
  const rand = seededRandom(1307);
  space(ctx, rand, {
    core: '#1d0d06', edge: '#050201', stars: 16,
    nebulae: [[0.5, 0.5, 0.5, '#ff6a1e', 0.18]],
  });
  const T = [0.24, 0.76], back = -45 * DEG; // the point struck, and the way the burst kicks back
  const at = (a, d) => [T[0] + Math.cos(a) * d, T[1] + Math.sin(a) * d];

  // A fan of brushy spikes of uneven length, each a little hooked, opening from the point.
  const burst = (scale, spread, seed) => {
    const r = seededRandom(seed), n = 4, p = new Path2D(), step = (2 * spread) / n;
    p.moveTo(...T);
    for (let i = 0; i <= n; i++) {
      const k = i / n, a = back + lerp(-spread, spread, k) + (r() - 0.5) * step * 0.3;
      const reach = scale * (0.66 + 0.26 * Math.sin(Math.PI * k) ** 0.7 + r() * 0.12);
      const valley = scale * lerp(0.42, 0.55, r()), hook = (r() - 0.5) * step * 0.5;
      if (i > 0) p.quadraticCurveTo(...at(a - step * 0.6, valley * 1.15), ...at(a - step * 0.5, valley));
      p.quadraticCurveTo(...at(a - step * 0.12 + hook * 0.4, reach * 0.62), ...at(a + hook * 0.3, reach));
    }
    p.quadraticCurveTo(...at(back + spread + step * 0.5, scale * 0.3), ...T);
    p.closePath();
    return p;
  };
  const outer = burst(0.9, 32 * DEG, 11), mid = burst(0.64, 27 * DEG, 23), inner = burst(0.38, 22 * DEG, 37);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const [path, blur, stops] of [
    [outer, 0.07, [['#ff6a14', 0.55], ['#ff4a08', 0.35], ['#ff4a08', 0]]],
    [outer, 0.008, [['#ffb060', 0.75], ['#ff7a2e', 0.6], ['#d8420e', 0.45], ['#8a2006', 0.08]]],
    [mid, 0.02, [['#fff0c0', 0.7], ['#ffc060', 0.5], ['#ff9a30', 0.12]]],
    [inner, 0.01, [['#ffffff', 0.95], ['#fff2c8', 0.55], ['#ffd080', 0]]],
  ]) {
    ctx.filter = `blur(${px * blur}px)`;
    ctx.fillStyle = radial(ctx, ...T, 0.85, stops.map(([col, a]) => rgba(col, a)));
    ctx.fill(path);
  }
  // Thin streaks of light shooting out through the burst and past its spikes.
  ctx.filter = `blur(${px * 0.003}px)`;
  for (let i = 0; i < 4; i++) {
    const a = back + lerp(-24, 24, (i + rand() * 0.8) / 4) * DEG, r0 = lerp(0.06, 0.16, rand()), r1 = lerp(0.6, 0.95, rand());
    const w = lerp(0.005, 0.011, rand()), [ax, ay] = at(a, r0), [bx, by] = at(a, r1);
    const nx = -Math.sin(a) * w, ny = Math.cos(a) * w;
    ctx.fillStyle = linear(ctx, ax, ay, bx, by, [rgba('#ffffff', 0.8), rgba('#ffe0a0', 0.45), rgba('#ff8a3c', 0)]);
    ctx.beginPath();
    ctx.moveTo(ax + nx, ay + ny); ctx.lineTo(bx, by); ctx.lineTo(ax - nx, ay - ny);
    ctx.closePath(); ctx.fill();
  }
  ctx.filter = 'none';
  // White-hot where it struck.
  ctx.fillStyle = radial(ctx, ...T, 0.09, [rgba('#ffffff', 0.95), rgba('#ffe0a0', 0.25), rgba('#ff7a2e', 0)]);
  ctx.fillRect(0, 0, 1, 1);
  // Sparks flung out with the burst.
  for (let i = 0; i < 22; i++) {
    const a = back + lerp(-40, 40, rand()) * DEG, r = lerp(0.12, 0.85, rand());
    ctx.fillStyle = rgba(rand() < 0.5 ? '#ffe0a0' : '#ff8a2a', lerp(0.45, 0.95, rand()));
    ctx.beginPath(); ctx.arc(...at(a, r), lerp(0.003, 0.009, rand() ** 2), 0, TAU); ctx.fill();
  }
  ctx.restore();
  return c;
}

// ---------------------------------------------------------------- afterimage

// The player's body left standing solid (bottom left) in a pale glow, while the real one slips
// away up to the right, faint and see-through, its tail trailing back toward the copy along
// thin streaks of light.
function afterimageIcon(S = 256) {
  const { c, ctx, px } = surface(S);
  const rand = seededRandom(1409);
  space(ctx, rand, {
    core: '#0c1426', edge: '#020308', stars: 24,
    nebulae: [[0.38, 0.62, 0.42, '#7d9eff', 0.22], [0.75, 0.28, 0.3, '#4a5f9a', 0.14]],
  });
  const copy = [0.37, 0.63], away = [0.73, 0.29];
  const body = (x, y, r, alpha) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = '#000000';
    ctx.fill();
    glow(ctx, rgba('#ffffff', 0.85), px * 0.035, () => {
      ctx.lineWidth = r * 0.2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    });
    ctx.restore();
  };

  // Streaks of light from the copy toward the one slipping away, fading as they go.
  const a = Math.atan2(away[1] - copy[1], away[0] - copy[0]), nx = -Math.sin(a), ny = Math.cos(a);
  for (let i = 0; i < 4; i++) {
    const off = lerp(-0.12, 0.12, (i + 0.5) / 4) + (rand() - 0.5) * 0.03, w = lerp(0.006, 0.012, rand());
    const ax = copy[0] + nx * off + Math.cos(a) * 0.2, ay = copy[1] + ny * off + Math.sin(a) * 0.2;
    const bx = away[0] + nx * off * 0.6 - Math.cos(a) * lerp(0.12, 0.2, rand()), by = away[1] + ny * off * 0.6 - Math.sin(a) * lerp(0.12, 0.2, rand());
    ctx.strokeStyle = linear(ctx, ax, ay, bx, by, [rgba('#cfdcff', 0), rgba('#cfdcff', 0.75), rgba('#cfdcff', 0)]);
    ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  }

  // The real one: faint, its tail trailing back toward the copy.
  const along = (k) => [lerp(away[0], copy[0], k), lerp(away[1], copy[1], k)];
  body(...along(0.3), 0.06, 0.22);
  body(...along(0.17), 0.085, 0.3);
  body(...away, 0.13, 0.45);

  // The copy, solid in a pale glow.
  ctx.fillStyle = radial(ctx, ...copy, 0.36, [rgba('#b8ccff', 0.45), rgba('#7d9eff', 0.15), rgba('#7d9eff', 0)]);
  ctx.fillRect(0, 0, 1, 1);
  body(...copy, 0.19, 1);
  sparkle(ctx, copy[0] - 0.17, copy[1] - 0.15, 0.05, '#ffffff', 0.9, 0.2);
  return c;
}

// ---------------------------------------------------------------- feral

// A black cat with its back up, a way off: side on, arched high over stiff legs, haunches
// bunched, its tail standing up thick with fur, and its head turned to look straight out of
// the box with two red eyes. Outlined in glowing dark red, as the player's hackles glow at
// the height of it.
function feralIcon(S = 256) {
  const { c, ctx, px } = surface(S);
  const rand = seededRandom(2231);
  space(ctx, rand, {
    core: '#1a0405', edge: '#040101', stars: 8,
    nebulae: [[0.5, 0.5, 0.4, '#a8101c', 0.22]],
  });
  // The cat is drawn about (0.45, 0.47) and set down small in the middle of the box.
  const place = (g) => { g.translate(0.5, 0.5); g.scale(0.64, 0.64); g.translate(-0.45, -0.47); };

  // The silhouette alone, in black.
  const mask = surface(S), m = mask.ctx;
  place(m);
  m.fillStyle = '#000000';
  m.strokeStyle = '#000000';
  // Body: from the back of the neck over the arched back, round the rump to the haunch, along
  // the belly tucked up under the arch, and up the chest to the chin.
  m.beginPath();
  m.moveTo(0.655, 0.4);
  m.bezierCurveTo(0.6, 0.17, 0.33, 0.15, 0.255, 0.4);
  m.quadraticCurveTo(0.225, 0.48, 0.235, 0.56);
  m.quadraticCurveTo(0.24, 0.64, 0.27, 0.65);
  m.lineTo(0.33, 0.64);
  m.bezierCurveTo(0.4, 0.55, 0.54, 0.55, 0.6, 0.62);
  m.lineTo(0.68, 0.6);
  m.quadraticCurveTo(0.69, 0.56, 0.695, 0.54);
  m.quadraticCurveTo(0.712, 0.52, 0.7, 0.49);
  m.closePath(); m.fill();
  // Legs, each pair sharing its top and parting in a narrow V to two paws on the ground: a
  // leg tapers from (x0, y0) down to a rounded paw at x1.
  const leg = (x0, y0, w0, x1, w1) => {
    const mid = lerp(y0, 0.84, 0.45);
    m.beginPath();
    m.moveTo(x0 - w0 / 2, y0);
    m.quadraticCurveTo(x1 - w1 / 2, mid, x1 - w1 / 2, 0.826);
    m.quadraticCurveTo(x1 - w1 / 2, 0.842, x1, 0.842);
    m.quadraticCurveTo(x1 + w1 / 2, 0.842, x1 + w1 / 2, 0.826);
    m.quadraticCurveTo(x1 + w1 / 2, mid, x0 + w0 / 2, y0);
    m.closePath(); m.fill();
  };
  leg(0.265, 0.58, 0.072, 0.257, 0.045);
  leg(0.312, 0.6, 0.066, 0.337, 0.043);
  leg(0.622, 0.58, 0.062, 0.602, 0.041);
  leg(0.664, 0.56, 0.066, 0.677, 0.045);
  // The tail, rooted inside the rump and standing up fluffed out, fullest partway up and
  // narrowing to a rounded tip as it hooks over.
  const tail = (t) => {
    const u = 1 - t, p = [[0.27, 0.44], [0.15, 0.4], [0.12, 0.22], [0.2, 0.14]];
    return [0, 1].map((k) => u * u * u * p[0][k] + 3 * u * u * t * p[1][k] + 3 * u * t * t * p[2][k] + t * t * t * p[3][k]);
  };
  const N = 40, sides = [[], []];
  let tip = 0;
  for (let i = 0; i <= N; i++) {
    const t = i / N, [x, y] = tail(t), [ax, ay] = tail(Math.max(0, t - 0.01)), [bx, by] = tail(Math.min(1, t + 0.01));
    const l = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / l, ny = (bx - ax) / l;
    const w = (0.032 + 0.012 * Math.sin(Math.PI * Math.min(1, t * 1.1))) * (t > 0.7 ? lerp(1, 0.55, (t - 0.7) / 0.3) : 1);
    sides[0].push([x + nx * w, y + ny * w]);
    sides[1].push([x - nx * w, y - ny * w]);
    tip = w;
  }
  m.beginPath();
  sides[0].forEach((p, i) => (i ? m.lineTo(...p) : m.moveTo(...p)));
  sides[1].reverse().forEach((p) => m.lineTo(...p));
  m.closePath(); m.fill();
  m.beginPath(); m.arc(...tail(1), tip, 0, TAU); m.fill();
  // The head, face on: broad cheeks and two ears, their tips a little rounded.
  m.beginPath(); m.ellipse(0.715, 0.452, 0.082, 0.07, 0, 0, TAU); m.fill();
  m.lineWidth = 0.012;
  for (const ear of [[[0.643, 0.43], [0.647, 0.33], [0.697, 0.39]], [[0.733, 0.39], [0.783, 0.33], [0.787, 0.43]]]) {
    m.beginPath(); ear.forEach((p, i) => (i ? m.lineTo(...p) : m.moveTo(...p))); m.closePath(); m.fill(); m.stroke();
  }

  // Outlined in glowing dark red: the silhouette in red, drawn out a little all round under it.
  const { c: red, ctx: g } = surface(S);
  g.drawImage(mask.c, 0, 0, 1, 1);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#c0141f';
  g.fillRect(0, 0, 1, 1);
  const ring = (r, n) => { for (let i = 0; i < n; i++) ctx.drawImage(red, Math.cos((i / n) * TAU) * r, Math.sin((i / n) * TAU) * r, 1, 1); };
  ctx.save();
  ctx.filter = `blur(${px * 0.016}px)`;
  ctx.globalAlpha = 0.4;
  ring(0.008, 12);
  ctx.filter = 'none';
  ctx.globalAlpha = 0.85;
  ring(0.006, 24);
  ctx.globalAlpha = 1;
  ctx.drawImage(mask.c, 0, 0, 1, 1);
  ctx.restore();

  // Its eyes, on the viewer.
  ctx.save();
  place(ctx);
  for (const x of [0.69, 0.74]) {
    glow(ctx, rgba('#e0202c', 1), px * 0.016, () => {
      ctx.fillStyle = '#ff5a4a';
      ctx.beginPath(); ctx.ellipse(x, 0.449, 0.015, 0.0105, 0, 0, TAU); ctx.fill();
    });
    ctx.fillStyle = '#000000';
    ctx.beginPath(); ctx.ellipse(x, 0.449, 0.0035, 0.0095, 0, 0, TAU); ctx.fill();
  }
  ctx.restore();
  return c;
}

// ---------------------------------------------------------------- gravebloom

// A lotus petal seen from above, from its base at the origin out to its pointed tip at (L, 0),
// `W` at its widest.
function lotusPetal(L, W) {
  const p = new Path2D();
  p.moveTo(0, 0);
  p.bezierCurveTo(L * 0.25, W * 1.2, L * 0.72, W * 1.05, L, 0);
  p.bezierCurveTo(L * 0.72, -W * 1.05, L * 0.25, -W * 1.2, 0, 0);
  return p;
}

// The lotus's rings of petals, outermost first, in units of the flower's width: `count` petals
// L long and W at their widest, turned `offset` degrees, pale at the base and coloured toward the
// tip. The first two are its outer petals, pink to the tips; the rest its inner ones, nearly white.
export const LOTUS_RINGS = [
  { count: 8, L: 0.43, W: 0.12, offset: 0, base: '#ffe2ef', tip: '#ff6fae' },
  { count: 8, L: 0.37, W: 0.115, offset: 22.5, base: '#fff0f6', tip: '#ff8cc0' },
  { count: 6, L: 0.27, W: 0.095, offset: 10, base: '#ffffff', tip: '#ffbcd8' },
  { count: 5, L: 0.18, W: 0.075, offset: 40, base: '#ffffff', tip: '#ffdcea' },
];
// A lone petal's sprite (lotus_petal_<ring>) points along +x: its base `base` of the sprite's
// width in from the left edge, its tip `length` of the width on from there.
export const LOTUS_PETAL = { base: 0.06, length: 0.88 };
// The seed pod's sprite (lotus_core) spans this much of the flower's width.
export const LOTUS_CORE = 0.2;

// A petal from its base at the origin out along +x, as ring R draws it: soft pink glow, a fine
// light edge and a faint vein down its middle. `px`: pixels to one of the flower's width.
function paintPetal(ctx, px, { L, W, base, tip }) {
  const petal = lotusPetal(L, W);
  glow(ctx, rgba('#d0306e', 0.45), px * 0.02, () => {
    ctx.fillStyle = linear(ctx, 0, 0, L, 0, [base, base, tip]);
    ctx.fill(petal);
  });
  ctx.strokeStyle = rgba('#fff4f9', 0.55);
  ctx.lineWidth = 0.005;
  ctx.stroke(petal);
  ctx.strokeStyle = rgba('#ffffff', 0.3);
  ctx.lineWidth = 0.004;
  ctx.beginPath(); ctx.moveTo(L * 0.18, 0); ctx.lineTo(L * 0.82, 0); ctx.stroke();
}

// Ring R's petals round (0.5, 0.5).
function lotusRing(ctx, px, R) {
  for (let i = 0; i < R.count; i++) {
    ctx.save();
    ctx.translate(0.5, 0.5);
    ctx.rotate(R.offset * DEG + (i / R.count) * TAU);
    paintPetal(ctx, px, R);
    ctx.restore();
  }
}

// The pale green seed pod in the middle of the flower (0.5, 0.5), ringed with stamens.
function paintCore(ctx, px) {
  glow(ctx, rgba('#c8f5b0', 0.8), px * 0.03, () => {
    ctx.fillStyle = radial(ctx, 0.5, 0.5, 0.06, ['#f2fbe0', '#cdeeb4', '#94d29a']);
    ctx.beginPath(); ctx.arc(0.5, 0.5, 0.055, 0, TAU); ctx.fill();
  });
  ctx.fillStyle = '#6fae7a';
  for (let i = 0; i < 6; i++) {
    const [x, y] = i ? polar(0.5, 0.5, i * 72 + 15, 0.03) : [0.5, 0.5];
    ctx.beginPath(); ctx.arc(x, y, 0.007, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = '#fff3b8';
  for (let i = 0; i < 16; i++) {
    const [x, y] = polar(0.5, 0.5, (i / 16) * 360, 0.072);
    ctx.beginPath(); ctx.arc(x, y, 0.008, 0, TAU); ctx.fill();
  }
}

// The lotus Gravebloom leaves, whole, from above, for its burst and its icon, in two layers: its
// outer rings of petals under a pink haze…
function bloomOuter(S = 256) {
  const { c, ctx, px } = surface(S);
  ctx.fillStyle = radial(ctx, 0.5, 0.5, 0.5, [rgba('#ff8cc0', 0.3), rgba('#ff6aa8', 0.12), rgba('#ff6aa8', 0)]);
  ctx.fillRect(0, 0, 1, 1);
  for (const R of LOTUS_RINGS.slice(0, 2)) lotusRing(ctx, px, R);
  return c;
}

// …and its inner ones round the seed pod.
function bloomInner(S = 256) {
  const { c, ctx, px } = surface(S);
  for (const R of LOTUS_RINGS.slice(2)) lotusRing(ctx, px, R);
  paintCore(ctx, px);
  return c;
}

// One of ring R's petals alone (src/aspects/gravebloom.js opens them one by one as it grows),
// placed as LOTUS_PETAL says, with room round it for its glow.
function lotusPetalSprite(R, Wpx = 128) {
  const unit = (Wpx * LOTUS_PETAL.length) / R.L; // pixels to one of the flower's width
  const { c, ctx, px } = surface(Wpx, Math.ceil((2 * R.W + 0.08) * unit), unit);
  ctx.translate((LOTUS_PETAL.base * R.L) / LOTUS_PETAL.length, c.height / unit / 2);
  paintPetal(ctx, px, R);
  return c;
}

// A misty wisp for a Strand (the lines drawn into a lotus as it blooms), white so it can be
// tinted: soft across, fading in from nothing at its tail (u = 0) to brightest near its head and
// out again at the very tip, like the icon's lines.
function bloomWisp(W = 128, H = 32) {
  const { c, ctx } = surface(W, H, 1);
  const img = ctx.createImageData(W, H);
  for (let j = 0; j < H; j++) {
    const v = (j + 0.5) / H - 0.5, across = Math.exp(-((v / 0.22) ** 2));
    for (let i = 0; i < W; i++) {
      const u = (i + 0.5) / W, along = Math.sin(Math.PI * u ** 1.94) ** 2;
      img.data.set([255, 255, 255, Math.round(255 * along * across)], (j * W + i) * 4);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// The seed pod alone, LOTUS_CORE of the flower's width across.
function lotusCore(S = 64) {
  const { c, ctx, px } = surface(S, S, S / LOTUS_CORE);
  ctx.translate(LOTUS_CORE / 2 - 0.5, LOTUS_CORE / 2 - 0.5);
  paintCore(ctx, px);
  return c;
}

// The burst's wave, white so it can be tinted: an arc of light BLOOM_WAVE.reach of the width out
// from the middle of its left edge, spanning BLOOM_WAVE.halfDeg either side, over a faint haze
// filling the cone behind it, fading out only at its very ends.
function bloomWave(S = 256) {
  const { c, ctx, px } = surface(S, Math.round(S * BLOOM_WAVE.height), S);
  const R = BLOOM_WAVE.reach, H = BLOOM_WAVE.halfDeg * DEG, mid = BLOOM_WAVE.height / 2;
  ctx.translate(0, mid - 0.5); // drawn about (0, 0.5), as if square
  ctx.save();
  ctx.filter = `blur(${px * 0.02}px)`;
  ctx.fillStyle = radial(ctx, 0, 0.5, R + 0.04, [rgba('#ffffff', 0), rgba('#ffffff', 0.03), rgba('#ffffff', 0.12), rgba('#ffffff', 0.3), rgba('#ffffff', 0)]);
  ctx.beginPath(); ctx.moveTo(0, 0.5); ctx.arc(0, 0.5, R + 0.04, -H, H); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = rgba('#ffffff', 0.8);
  ctx.lineWidth = 0.07;
  ctx.beginPath(); ctx.arc(0, 0.5, R, -H, H); ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.filter = `blur(${px * 0.004}px)`;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 0.022;
  ctx.beginPath(); ctx.arc(0, 0.5, R, -H, H); ctx.stroke();
  ctx.restore();
  // Faded toward both ends of the arc.
  const g = ctx.createConicGradient(-H, 0, 0.5), span = (2 * H) / TAU;
  [[0, 0], [span * 0.12, 1], [span * 0.88, 1], [span, 0], [1, 0]].forEach(([at, a]) => g.addColorStop(at, rgba('#ffffff', a)));
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0.5 - mid, 1, BLOOM_WAVE.height);
  return c;
}

// One petal, white so it can be tinted, pointing along +x (the petals a burst throws).
function bloomPetal(W = 64) {
  const { c, ctx, px } = surface(W, W / 2, W);
  const p = new Path2D();
  p.moveTo(0.08, 0.25);
  p.bezierCurveTo(0.3, 0.42, 0.72, 0.38, 0.92, 0.25);
  p.bezierCurveTo(0.72, 0.12, 0.3, 0.08, 0.08, 0.25);
  glow(ctx, rgba('#ffffff', 0.6), px * 0.04, () => {
    ctx.fillStyle = linear(ctx, 0.08, 0, 0.92, 0, [rgba('#ffffff', 0.75), rgba('#ffffff', 1)]);
    ctx.fill(p);
  });
  return c;
}

// A lotus from above, as the game draws it, in the middle of the box: its outer petals flushed pink,
// its inner ones nearly white round the pale green seed pod, all glowing out of the dark, a
// few loose petals drifting off it and glints of light.
function gravebloomIcon(S = 256) {
  const { c, ctx, px } = surface(S);
  const rand = seededRandom(2417);
  space(ctx, rand, {
    core: '#1e0815', edge: '#050104', stars: 18,
    nebulae: [[0.5, 0.5, 0.46, '#ff5fa2', 0.26], [0.72, 0.74, 0.22, '#7fd6a0', 0.08]],
  });
  ctx.fillStyle = radial(ctx, 0.5, 0.5, 0.45, [rgba('#ffc0dc', 0.35), rgba('#ff6aa8', 0.12), rgba('#ff6aa8', 0)]);
  ctx.fillRect(0, 0, 1, 1);
  // Faint misty wisps wandering out from behind the flower and off out of the box, evenly spread
  // round it: each sets off its own way (a slice of the circle) and turns this way and that at
  // random (two wavering turns laid over each other), free to stray up to FREE radians off its
  // way and steered back by PULL beyond that, so it crosses its neighbours now and then. Pink
  // but for two lime ones, swelling in gently from the flower and easing away again along
  // their length: a wide haze, a softer band and a fine bright thread, each laid down sharp,
  // then blurred.
  const PINK = ['#ff6aa8', '#ff9cc8', '#ffe0ee'], LIME = ['#9fe060', '#c4f580', '#eaffc8'];
  const n = 8, STEP = 0.008, FREE = 35 * DEG, PULL = 14, trail = surface(S);
  const fade = (u) => Math.sin(Math.PI * u ** 0.63) ** 2; // brightest a third of the way along
  for (let i = 0; i < n; i++) {
    const t = ((i + (rand() - 0.5) * 0.3) / n) * TAU;
    let x = 0.5 + Math.cos(t) * 0.1, y = 0.5 + Math.sin(t) * 0.1, heading = t + lerp(-0.7, 0.7, rand());
    const waves = [0, 1].map(() => ({ amp: lerp(4, 9, rand()) * (rand() < 0.5 ? -1 : 1), freq: lerp(2, 6, rand()), phase: rand() * TAU }));
    const pts = [[x, y]];
    for (let s = 0; s < 3 && x > -0.12 && x < 1.12 && y > -0.12 && y < 1.12; s += STEP) {
      const off = Math.atan2(Math.sin(t - heading), Math.cos(t - heading));
      heading += (waves.reduce((turn, w) => turn + w.amp * Math.sin(w.freq * s + w.phase), 0) + Math.sign(off) * Math.max(0, Math.abs(off) - FREE) * PULL) * STEP;
      x += Math.cos(heading) * STEP;
      y += Math.sin(heading) * STEP;
      pts.push([x, y]);
    }
    const [haze, band, thread] = i === 2 || i === 6 ? LIME : PINK, k = lerp(0.6, 1, rand());
    for (const [width, blur, color, alpha] of [[0.09, 0.05, haze, 0.13], [0.03, 0.02, band, 0.16], [0.006, 0.004, thread, 0.22]]) {
      const g = trail.ctx;
      g.clearRect(0, 0, 1, 1);
      g.lineWidth = width;
      g.lineCap = 'butt';
      for (let j = 1; j < pts.length; j++) {
        g.strokeStyle = rgba(color, alpha * k * fade(j / (pts.length - 1)));
        g.beginPath(); g.moveTo(...pts[j - 1]); g.lineTo(...pts[j]); g.stroke();
      }
      ctx.save();
      ctx.filter = `blur(${px * blur}px)`;
      ctx.drawImage(trail.c, 0, 0, 1, 1);
      ctx.restore();
    }
  }
  // The flower, turned a little so a petal points up, under a pink glow.
  const outer = bloomOuter(S), inner = bloomInner(S), k = 0.64;
  ctx.save();
  ctx.translate(0.5, 0.5);
  ctx.rotate(-90 * DEG + 11.25 * DEG);
  ctx.scale(k, k);
  glow(ctx, rgba('#ff6aa8', 0.9), px * 0.06, () => ctx.drawImage(outer, -0.5, -0.5, 1, 1));
  ctx.rotate(-20 * DEG);
  glow(ctx, rgba('#ffd6e8', 0.7), px * 0.03, () => ctx.drawImage(inner, -0.5, -0.5, 1, 1));
  ctx.restore();
  // Loose petals drifting off it, and glints.
  for (const [x, y, r, s, a] of [[0.84, 0.17, 35, 0.06, 0.8], [0.15, 0.82, -150, 0.05, 0.6], [0.88, 0.8, 120, 0.04, 0.5]]) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(r * DEG);
    ctx.globalAlpha = a;
    const p = new Path2D();
    p.moveTo(-s, 0); p.quadraticCurveTo(0, s * 0.55, s, 0); p.quadraticCurveTo(0, -s * 0.55, -s, 0);
    glow(ctx, rgba('#ff8cc0', 0.8), px * 0.02, () => { ctx.fillStyle = linear(ctx, -s, 0, s, 0, ['#ffffff', '#ff9cc6']); ctx.fill(p); });
    ctx.restore();
  }
  sparkle(ctx, 0.5, 0.5, 0.07, '#ffffff', 0.85, 0.2);
  sparkle(ctx, 0.2, 0.2, 0.035, '#ffd6e8', 0.7, 0.5);
  sparkle(ctx, 0.8, 0.62, 0.025, '#c8f5d8', 0.7, 0.1);
  return c;
}

// ---------------------------------------------------------------- warding

// The amulet in freefall: the ward's crystal shield (as props drop it) tumbling down at a
// slant, turned on every axis so its face shows foreshortened over a lit edge, both ends of
// its chain streaming up after it in loose wavering curves, one out of the top right and one
// out of the right halfway down, faint rings of ward light round it and streaks of light
// trailing up.
function wardingIcon(S = 256) {
  const { c, ctx, px } = surface(S);
  const rand = seededRandom(2503);
  space(ctx, rand, {
    core: '#0d1126', edge: '#020309', stars: 20,
    nebulae: [[0.4, 0.62, 0.42, '#8d9ff0', 0.24], [0.78, 0.2, 0.28, '#c8d4ff', 0.07]],
  });
  const col = '#c8d4ff';

  // The pendant's plane, turned about x, then y, then z, seen straight on: its two in-plane
  // axes (u, v) and its normal (n) on screen, at `size` units to the shield's height.
  const [rx, ry, rz] = [24 * DEG, -50 * DEG, 22 * DEG], size = 0.44, cx = 0.4, cy = 0.63;
  const turn = ([x, y, z]) => {
    [y, z] = [y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)];
    [x, z] = [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
    return [x * Math.cos(rz) - y * Math.sin(rz), x * Math.sin(rz) + y * Math.cos(rz)];
  };
  const u = turn([1, 0, 0]), v = turn([0, 1, 0]), n = turn([0, 0, 1]);
  const onScreen = (x, y) => [cx + (u[0] * x + v[0] * y) * size, cy + (u[1] * x + v[1] * y) * size];
  const inPlane = (g, depth = 0) => {
    g.translate(-n[0] * depth, -n[1] * depth);
    g.transform(u[0] * size, u[1] * size, v[0] * size, v[1] * size, cx, cy);
  };

  // The ward's shield (wardGlyph), centred on its middle, a unit tall.
  const shield = new Path2D();
  shield.moveTo(0, -0.5);
  shield.quadraticCurveTo(0.22, -0.39, 0.42, -0.39);
  shield.quadraticCurveTo(0.45, 0.17, 0, 0.51);
  shield.quadraticCurveTo(-0.45, 0.17, -0.42, -0.39);
  shield.quadraticCurveTo(-0.22, -0.39, 0, -0.5);
  shield.closePath();

  // Rings of ward light about it, in its plane.
  [[0.72, 0.32], [0.9, 0.16]].forEach(([r, a]) => {
    ctx.save();
    inPlane(ctx);
    glow(ctx, rgba(col, a), px * 0.04, () => {
      ctx.strokeStyle = rgba('#dde4ff', a);
      ctx.lineWidth = 0.022;
      ctx.beginPath();
      ctx.arc(0, 0.02, r, 0, TAU);
      ctx.stroke();
    });
    ctx.restore();
  });

  // Streaks of light trailing up off it, the way it has fallen.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = 0.006;
  for (let i = 0; i < 7; i++) {
    const x = cx + (rand() - 0.5) * 0.36, y = cy + (rand() - 0.5) * 0.3, len = 0.12 + rand() * 0.16, a = -58 * DEG + (rand() - 0.5) * 0.15;
    ctx.strokeStyle = linear(ctx, x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, [rgba(col, 0.35), rgba(col, 0)]);
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  ctx.restore();

  // The chain, both ends streaming up from the bail in loose curves, wavering a little along
  // the way: links along them, every other one seen edge on.
  const bail = onScreen(0, -0.56);
  const strand = (ends, phase, freq, amp) => {
    const bez = (t, i) => { const w = 1 - t; return w * w * w * ends[0][i] + 3 * w * w * t * ends[1][i] + 3 * w * t * t * ends[2][i] + t * t * t * ends[3][i]; };
    const path = [];
    for (let i = 0; i <= 200; i++) {
      const t = i / 200, d = 0.002;
      const x = bez(t, 0), y = bez(t, 1), tx = bez(Math.min(1, t + d), 0) - bez(Math.max(0, t - d), 0), ty = bez(Math.min(1, t + d), 1) - bez(Math.max(0, t - d), 1);
      const l = Math.hypot(tx, ty) || 1, wave = Math.sin(t * freq * TAU + phase) * amp * Math.sin(Math.PI * t);
      path.push([x - (ty / l) * wave, y + (tx / l) * wave]);
    }
    const step = 0.034;
    let along = 0, k = 0;
    glow(ctx, rgba(col, 0.6), px * 0.025, () => {
      for (let i = 1; i < path.length; i++) {
        const [x0, y0] = path[i - 1], [x1, y1] = path[i];
        along += Math.hypot(x1 - x0, y1 - y0);
        if (along < step) continue;
        along -= step;
        const edge = k++ % 2, t = i / path.length;
        ctx.save();
        ctx.translate(x1, y1);
        ctx.rotate(Math.atan2(y1 - y0, x1 - x0) + Math.sin(t * 9 + phase) * 0.25);
        ctx.strokeStyle = edge ? '#9aa2b8' : '#dfe4f2';
        ctx.lineWidth = edge ? 0.012 : 0.01;
        ctx.beginPath();
        ctx.ellipse(0, 0, 0.022, edge ? 0.003 : 0.01 + 0.004 * Math.abs(Math.sin(t * 7 + phase)), 0, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
    });
  };
  strand([bail, [bail[0] - 0.14, bail[1] - 0.2], [0.94, 0.34], [1.08, -0.06]], rand() * TAU, 1.6 + rand() * 0.6, 0.05);
  // Its other end, streaming up and over to off the right, halfway down.
  strand([bail, [bail[0] + 0.1, bail[1] - 0.16], [0.84, 0.34], [1.08, 0.54]], rand() * TAU, 1.4 + rand() * 0.6, 0.045);
  // The bail, a ring through the shield's tip.
  ctx.save();
  inPlane(ctx);
  ctx.strokeStyle = '#dfe4f2';
  ctx.lineWidth = 0.035;
  ctx.beginPath();
  ctx.ellipse(0, -0.55, 0.05, 0.07, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();

  // Its edge, the crystal's thickness seen past the tilted face, lit along one side.
  for (let i = 10; i >= 1; i--) {
    ctx.save();
    inPlane(ctx, 0.0045 * i);
    ctx.fillStyle = i > 1 ? rgba('#3a4690', 0.95) : rgba('#8d9ff0', 1);
    ctx.fill(shield);
    ctx.restore();
  }
  // Its face: the crystal glowing from its heart, a cross of light through it, its bright rim.
  ctx.save();
  inPlane(ctx);
  glow(ctx, rgba(col, 0.9), px * 0.06, () => {
    ctx.fillStyle = radial(ctx, 0, -0.02, 0.6, ['#eef1ff', rgba(col, 0.85), '#6f82dc', '#2a3470'], -0.1, -0.14);
    ctx.fill(shield);
  });
  ctx.save();
  ctx.clip(shield);
  ctx.fillStyle = linear(ctx, -0.4, -0.5, 0.1, 0.1, [rgba('#ffffff', 0.35), rgba('#ffffff', 0)]);
  ctx.beginPath();
  ctx.moveTo(-0.5, -0.5); ctx.lineTo(0.05, -0.5); ctx.lineTo(-0.5, 0.15);
  ctx.fill(); // a sheen across its upper corner
  ctx.strokeStyle = rgba('#ffffff', 0.35);
  ctx.lineWidth = 0.03;
  ctx.beginPath();
  ctx.moveTo(0, -0.48); ctx.lineTo(0, 0.48);
  ctx.moveTo(-0.42, -0.2); ctx.lineTo(0.42, -0.2);
  ctx.stroke();
  ctx.restore();
  glow(ctx, rgba(col, 0.95), px * 0.05, () => {
    ctx.strokeStyle = linear(ctx, -0.4, -0.5, 0.4, 0.5, ['#ffffff', col, '#8d9ff0']);
    ctx.lineWidth = 0.07;
    ctx.stroke(shield);
  });
  ctx.restore();

  // The star at its heart, and glints of light.
  const [hx, hy] = onScreen(0, -0.04);
  sparkle(ctx, hx, hy, 0.085, '#ffffff', 1, 0.15);
  sparkle(ctx, ...onScreen(0.36, -0.36), 0.045, '#ffffff', 0.7, 0.4);
  sparkle(ctx, 0.78, 0.36, 0.035, '#dde4ff', 0.6, 0.6);
  return c;
}

// ---------------------------------------------------------------- bloodthirst

// A beast's jaws, open: two rows of fangs set in dark gums, long curved canines among them,
// stained with blood welling up from the gums and dripping off the tips, turned on every axis
// so the mouth faces the top left of the box, under a red glow.
function bloodthirstIcon(S = 256) {
  const { c, ctx, px } = surface(S);
  const rand = seededRandom(2671);
  space(ctx, rand, {
    core: '#1c0306', edge: '#040001', stars: 12,
    nebulae: [[0.46, 0.5, 0.44, '#e0162a', 0.26], [0.22, 0.2, 0.26, '#ff5a5a', 0.08]],
  });
  ctx.fillStyle = radial(ctx, 0.46, 0.48, 0.36, [rgba('#ff6a6a', 0.22), rgba('#e0162a', 0.1), rgba('#e0162a', 0)]);
  ctx.fillRect(0, 0, 1, 1);

  // The jaws in their own space: x right, y down, z out of the box, the mouth opening toward +z.
  // Turned about x (its front tipped up), then y (to the left), then z, seen straight on.
  const [rx, ry, rz] = [22 * DEG, -25 * DEG, 10 * DEG], size = 0.92, cx = 0.53, cy = 0.53;
  const turn = ([x, y, z]) => {
    [y, z] = [y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)];
    [x, z] = [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
    return [x * Math.cos(rz) - y * Math.sin(rz), x * Math.sin(rz) + y * Math.cos(rz), z];
  };
  const screen = (p) => { const [x, y, z] = turn(p); return [cx + x * size, cy + y * size, z]; };
  const add = (a, b, k = 1) => a.map((v, i) => v + b[i] * k);
  const path = (pts) => { ctx.beginPath(); pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); };

  // Each jaw is an arch, a little longer than it is wide, like a hound's, its front at `a` = 0.
  const RX = 0.32, RZ = 0.34, Z0 = -0.08;
  const arch = (a, y) => [Math.sin(a) * RX, y, Math.cos(a) * RZ + Z0];
  const along = (a) => { const t = [Math.cos(a) * RX, 0, -Math.sin(a) * RZ], l = Math.hypot(t[0], t[2]); return t.map((v) => v / l); };
  const out = (a) => { const n = [Math.sin(a) / RX, 0, Math.cos(a) / RZ], l = Math.hypot(n[0], n[2]); return n.map((v) => v / l); };
  const facing = (n) => turn(n)[2]; // toward the viewer: 1, away: -1
  // The jaws hinge at the back: each comes in from its `y` at the front to HINGE of that at the
  // back, its teeth and gum standing square to it, so they open at an angle.
  const HINGE = 0.4, FRONT = RZ + Z0, BACK = Math.cos(104 * DEG) * RZ + Z0;
  const jawY = (J, a) => J.y * lerp(1, HINGE, (FRONT - arch(a, 0)[2]) / (FRONT - BACK));
  const square = (J) => { const s = (J.y * (1 - HINGE)) / (FRONT - BACK), l = Math.hypot(1, s); return [0, J.dir / l, (-J.dir * s) / l]; };

  // Teeth, either side of the front: [angle°, width, length, curl]. The upper canines are the
  // longest, just behind the lower ones so they'd cross if it bit down.
  const JAWS = [
    { y: -0.17, dir: 1, teeth: [[6, 0.06, 0.09, 0.2], [18, 0.065, 0.1, 0.2], [32, 0.085, 0.27, 0.3], [49, 0.06, 0.1, 0.25], [63, 0.07, 0.12, 0.25], [79, 0.075, 0.09, 0.2], [95, 0.075, 0.07, 0.15]] },
    { y: 0.17, dir: -1, teeth: [[6, 0.055, 0.08, 0.2], [16, 0.06, 0.09, 0.2], [26, 0.08, 0.21, 0.3], [44, 0.055, 0.09, 0.25], [58, 0.065, 0.11, 0.25], [74, 0.07, 0.09, 0.2], [90, 0.07, 0.065, 0.15]] },
  ];
  const parts = []; // the teeth, { z, draw }, drawn back to front over the gums

  // The gums: a ridge along each arch above (or below) its teeth, in strips, solid for SOLID
  // out from them, then reaching on an uneven way (two slow waves laid over each other) as it
  // thins out into mist, and toward the back of the jaw: painted solid on one layer, faded by a mask of the
  // same strips (blurred, so no seams show) and set down softly over a wider haze of itself.
  const meat = surface(S), mask = surface(S), strips = [];
  const N = 48, SOLID = 0.045, GUM = 0.15, END = 102;
  for (const J of JAWS) {
    const ph = [rand() * TAU, rand() * TAU, rand() * TAU];
    const reach = (a) => SOLID + GUM * (0.6 + 0.3 * Math.sin(a * 3.1 + ph[0]) + 0.2 * Math.sin(a * 7.7 + ph[1]));
    const thin = (a) => clamp01((END - Math.abs(a / DEG)) / 35) * (0.9 + 0.1 * Math.sin(a * 11.3 + ph[2]));
    const up = square(J), lip = (a, h, bulge) => add(add(arch(a, jawY(J, a)), up, -h), out(a), bulge);
    for (let i = 0; i < N; i++) {
      const a0 = lerp(-END, END, i / N) * DEG, a1 = lerp(-END, END, (i + 1) / N) * DEG, am = (a0 + a1) / 2;
      const quad = [lip(a0, -0.015, 0), lip(a1, -0.015, 0), lip(a1, reach(a1), 0.035), lip(a0, reach(a0), 0.035)].map(screen);
      strips.push({ quad, z: quad.reduce((t, p) => t + p[2], 0) / 4, lit: (facing(out(am)) + 1) / 2, alpha: thin(am), solid: (SOLID + 0.015) / (reach(am) + 0.015) });
    }
  }
  strips.sort((p, q) => p.z - q.z);
  const trace = (g, quad) => { g.beginPath(); quad.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
  for (const { quad, lit, alpha, solid } of strips) {
    const [ax, ay] = [(quad[0][0] + quad[1][0]) / 2, (quad[0][1] + quad[1][1]) / 2], [bx, by] = [(quad[2][0] + quad[3][0]) / 2, (quad[2][1] + quad[3][1]) / 2];
    const m = meat.ctx;
    trace(m, quad);
    m.fillStyle = m.strokeStyle = linear(m, ax, ay, bx, by, [lerpHex('#6a0a16', '#c81c34', lit), lerpHex('#4a0610', '#9a1426', lit), lerpHex('#2a0308', '#7a0e1e', lit)]);
    m.lineWidth = 0.004;
    m.fill();
    m.stroke();
    const k = mask.ctx;
    trace(k, quad);
    const fade = k.createLinearGradient(ax, ay, bx, by);
    [[0, 1], [solid, 1], [lerp(solid, 1, 0.35), 0.45], [1, 0]].forEach(([at, v]) => fade.addColorStop(at, rgba('#ffffff', v * alpha)));
    k.fillStyle = fade;
    k.fill();
  }
  meat.ctx.save();
  meat.ctx.globalCompositeOperation = 'destination-in';
  meat.ctx.filter = `blur(${px * 0.008}px)`;
  meat.ctx.drawImage(mask.c, 0, 0, 1, 1);
  meat.ctx.restore();
  for (const [blur, alpha] of [[0.04, 0.5], [0.004, 1]]) {
    ctx.save();
    ctx.filter = `blur(${px * blur}px)`;
    ctx.globalAlpha = alpha;
    ctx.drawImage(meat.c, 0, 0, 1, 1);
    ctx.restore();
  }

  for (const J of JAWS) {
    // The teeth: each a fang standing out of the gum and curling in toward the middle of the
    // mouth as it goes, with a little thickness behind it, ivory going white toward its tip over
    // blood welling up from the gum, its tip dipped in blood.
    for (const [deg, w, L, curl] of J.teeth) {
      for (const side of [-1, 1]) {
        const a = side * deg * DEG, base = arch(a, jawY(J, a)), t = along(a), n = out(a), up = square(J);
        const at = (u, h, depth = 0) => {
          const k = h / L;
          return screen(add(add(add(base, t, u), up, h), n, -curl * L * k * k - depth));
        };
        const outline = (depth) => {
          const pts = [];
          for (let i = 0; i <= 10; i++) { const k = i / 10; pts.push(at((-w / 2) * (1 - k) ** 1.15, L * k ** 0.85, depth)); }
          for (let i = 9; i >= 0; i--) { const k = i / 10; pts.push(at((w / 2) * (1 - k) ** 1.15, L * k ** 0.85, depth)); }
          return pts;
        };
        const lit = (facing(n) + 1) / 2, front = outline(0), [bx, by, bz] = at(0, 0), [tx, ty] = at(0, L);
        const backs = [0.03, 0.02, 0.01].map((d) => outline(d * (w / 0.08)));
        const fang = L > 0.15;
        parts.push({
          z: bz + 0.03,
          draw: () => {
            for (const pts of backs) { path(pts); ctx.fillStyle = lerpHex('#3a2a1c', '#8a7458', lit); ctx.fill(); }
            path(front);
            glow(ctx, rgba('#ff2030', 0.5), px * 0.02, () => {
              ctx.fillStyle = linear(ctx, bx, by, tx, ty, [lerpHex('#8a6a4a', '#d9c49c', lit), lerpHex('#c8b48e', '#f6eedc', lit), lerpHex('#e0d6c0', '#fffaf0', lit)]);
              ctx.fill();
            });
            ctx.save();
            ctx.clip();
            ctx.fillStyle = linear(ctx, bx, by, tx, ty, [rgba('#7a0610', 0.95), rgba('#a00a18', 0.55), rgba('#c0101e', 0), rgba('#c0101e', 0)]);
            ctx.fill();
            const dip = fang ? 0.55 : 0.4;
            ctx.fillStyle = linear(ctx, tx, ty, lerp(tx, bx, dip), lerp(ty, by, dip), [rgba('#8a0612', 1), rgba('#c0101e', 0.8), rgba('#d0142a', 0)]);
            ctx.fill();
            // A streak of shine down its face.
            ctx.strokeStyle = rgba('#ffffff', 0.45 * lit);
            ctx.lineWidth = w * size * 0.14;
            ctx.beginPath();
            for (let i = 1; i <= 7; i++) { const [x, y] = at(-w * 0.18 * (1 - i / 9), L * (i / 9), -0.002); if (i === 1) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
            ctx.stroke();
            ctx.restore();
            // Off an upper fang's tip hangs a drop of blood.
            if (fang && J.dir > 0) {
              const r = 0.018 + rand() * 0.006, dy = 0.03 + rand() * 0.02;
              glow(ctx, rgba('#ff2030', 0.8), px * 0.015, () => {
                ctx.fillStyle = radial(ctx, tx, ty + dy, r * 1.6, ['#ff6a6a', '#c0101e', '#5a0008'], tx - r * 0.3, ty + dy - r * 0.3);
                ctx.beginPath();
                ctx.moveTo(tx, ty);
                ctx.quadraticCurveTo(tx + r, ty + dy - r * 0.6, tx + r, ty + dy);
                ctx.arc(tx, ty + dy, r, 0, Math.PI);
                ctx.quadraticCurveTo(tx - r, ty + dy - r * 0.6, tx, ty);
                ctx.fill();
              });
            }
          },
        });
      }
    }
  }
  parts.sort((p, q) => p.z - q.z);
  for (const p of parts) p.draw();

  sparkle(ctx, 0.2, 0.18, 0.04, '#ffd0d0', 0.7, 0.3);
  sparkle(ctx, 0.84, 0.8, 0.028, '#ffc0c0', 0.6, 0.1);
  return c;
}

// The colour `t` of the way from hex `a` to hex `b`.
function lerpHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16), k = clamp01(t);
  const ch = (s) => Math.round(lerp((pa >> s) & 255, (pb >> s) & 255, k));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

// ---------------------------------------------------------------- antlers

// The Antlers aspect's antlers full grown, drawn as on the player (antlerParts), seen from
// above with the brow at the bottom: the beams leaving their burrs ahead, sweeping out to the
// sides and curving ahead again, forking on both sides all along, in bone in a dark outline,
// under a warm glow.
function antlersIcon(S = 256) {
  const { c, ctx, px } = surface(S);
  const rand = seededRandom(4127);
  space(ctx, rand, {
    core: '#17100a', edge: '#030201', stars: 18,
    nebulae: [[0.5, 0.45, 0.45, '#c07a2a', 0.22], [0.5, 0.3, 0.3, '#f0d690', 0.08]],
  });
  const { shape, fx: F } = ASPECTS.find((a) => a.id === 'antlers');
  const right = antlerParts(shape, 1), parts = [...right, ...mirrored(right)];
  const css = (n) => '#' + n.toString(16).padStart(6, '0');

  // Forward is up: laid on the box centred, filling `fill` of it.
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const part of parts) for (const { x, y, w } of part) {
    x0 = Math.min(x0, x - w); x1 = Math.max(x1, x + w); y0 = Math.min(y0, y - w); y1 = Math.max(y1, y + w);
  }
  const fill = 0.95, k = fill / Math.max(x1 - x0, y1 - y0), mx = (x0 + x1) / 2;
  const at = ({ x, y }) => [0.5 + y * k, 0.5 - (x - mx) * k];

  // One silhouette, as on the player: the outline of every part, drawn out to a point past each
  // tip, then every part filled in over it, the stroke eating into the fill; black at the
  // root, as they come out of the body.
  const art = surface(S);
  const g = art.ctx, O = F.outline, R = F.root, min = 0.006 / k; // no thinner than reads at the HUD's size
  const outer = Math.max(O.outer, min), inner = Math.max(O.inner, min * 2);
  const rooted = (pt) => smoothStep01(clamp01((Math.hypot(pt.x, pt.y) - R.from) / (R.to - R.from)));
  const shade = (color) => (pt) => css(lerpColor(R.color, color, rooted(pt)));
  const strip = (part, widthOf, colorOf, tip = 0) => {
    let pts = part;
    if (tip > 0) {
      const p = part[part.length - 2], q = part[part.length - 1], l = Math.hypot(q.x - p.x, q.y - p.y) || 1;
      pts = [...part, { ...q, x: q.x + ((q.x - p.x) / l) * tip, y: q.y + ((q.y - p.y) / l) * tip, end: true }];
    }
    const n = pts.length, sides = pts.map((pt, i) => {
      const [x, y] = at(pt), [ax, ay] = at(pts[Math.max(0, i - 1)]), [bx, by] = at(pts[Math.min(n - 1, i + 1)]);
      const l = Math.hypot(bx - ax, by - ay) || 1, w = pt.end ? 0 : widthOf(pt) * k;
      return [x - ((by - ay) / l) * w, y + ((bx - ax) / l) * w, x + ((by - ay) / l) * w, y - ((bx - ax) / l) * w];
    });
    for (let i = 0; i < n - 1; i++) {
      const [ax, ay, bx, by] = sides[i], [cx, cy, dx, dy] = sides[i + 1];
      g.fillStyle = g.strokeStyle = colorOf(pts[i]);
      g.lineWidth = 1 / px;
      g.beginPath();
      g.moveTo(ax, ay); g.lineTo(cx, cy); g.lineTo(dx, dy); g.lineTo(bx, by);
      g.closePath();
      g.fill();
      g.stroke();
    }
  };
  parts.forEach((part) => strip(part, (pt) => pt.w + outer, shade(O.color), outer * O.point));
  parts.forEach((part) => strip(part, (pt) => Math.max(0, pt.w - Math.min(inner, pt.w * O.keep)), shade(F.color)));

  // A warm light pooled about them, then the antlers under their glow.
  ctx.fillStyle = radial(ctx, 0.5, 0.45, 0.42, [rgba('#e9a850', 0.18), rgba('#e9a850', 0)]);
  ctx.fillRect(0, 0, 1, 1);
  glow(ctx, rgba('#e9a850', 0.4), px * 0.06, () => ctx.drawImage(art.c, 0, 0, 1, 1));
  // A glint on each beam's tip.
  const tip = right[0][right[0].length - 1];
  for (const side of [1, -1]) sparkle(ctx, ...at({ x: tip.x, y: tip.y * side }), 0.05, '#fff2c8', 0.85, 0.2);
  return c;
}

// ---------------------------------------------------------------- oracle discs

// The Oracle disc's sprites: the disc's radius as a fraction of half the texture's width (and
// for its glow, the radius its light rings out at).
export const ORACLE_DISC = { fill: 0.92, glow: 0.25 };
// A thin ring, its hole `hole` of its radius; the teal covers half of it from `band` out.
// `blur`: the band smeared round the turn in play, teal or, while Exalted, crimson.
const ORACLE = { teal: '#22d3c0', bright: '#46f0dc', deep: '#0e8c80', hole: 0.7, band: 0.79, blur: '#9aeee4', exalted: '#ff7488' };

// The disc in play, seen from above and spinning so fast it blurs: a thin ring, white on its
// inside and, outside that, the teal round half of it smeared all the way round into one pale
// teal (`blur`), bright edges, and two smears of light chasing round it so the spin shows.
function oracleDisc(blur = ORACLE.blur, S = 128) {
  const { c, ctx } = surface(S);
  const r = 0.5 * ORACLE_DISC.fill, h = r * ORACLE.hole, b = r * ORACLE.band;
  ctx.translate(0.5, 0.5);
  const ring = (outer, inner) => {
    ctx.beginPath();
    ctx.arc(0, 0, outer, 0, TAU);
    ctx.arc(0, 0, inner, TAU, 0, true);
  };
  ring(r, h);
  ctx.fillStyle = '#ffffff';
  ctx.fill('evenodd');
  ring(r, b);
  ctx.fillStyle = blur;
  ctx.fill('evenodd');
  // Two smears of light, each bright at its leading edge and trailing off round the turn.
  const smear = ctx.createConicGradient(0, 0, 0);
  for (const [at, a] of [[0, 0.7], [0.4, 0], [0.46, 0], [0.5, 0.7], [0.9, 0], [0.96, 0], [1, 0.7]]) smear.addColorStop(at, rgba('#ffffff', a));
  ring(r, h);
  ctx.fillStyle = smear;
  ctx.fill('evenodd');
  ctx.lineWidth = 0.01;
  ctx.strokeStyle = '#ffffff';
  for (const k of [r - 0.005, h + 0.005]) {
    ctx.beginPath();
    ctx.arc(0, 0, k, 0, TAU);
    ctx.stroke();
  }
  return c;
}

// The light the spinning disc gives off: a soft ring of it at ORACLE_DISC.glow of the width,
// falling away inside and out, a faint haze across the hole.
function oracleGlow(S = 128) {
  const { c, ctx } = surface(S);
  const g = ctx.createRadialGradient(0.5, 0.5, 0, 0.5, 0.5, 0.5);
  [[0, 0.12], [0.3, 0.18], [ORACLE_DISC.glow * 2 - 0.1, 0.6], [ORACLE_DISC.glow * 2, 1], [ORACLE_DISC.glow * 2 + 0.12, 0.35], [1, 0]]
    .forEach(([at, a]) => g.addColorStop(at, rgba('#ffffff', a)));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1, 1);
  return c;
}

// Two Oracle discs flying at the viewer out of the far left, the far one small and high, the near
// one big and low on the right, each trailing teal light from its whole width that narrows back
// toward where they came from. Each stands nearly on edge, turned side-on: a thin ring of white
// metal, teal round the outside of half of it, the teal smeared a little behind it as it spins.
function oracleIcon(S = 256) {
  const { c, ctx, px } = surface(S);
  space(ctx, seededRandom(5101), {
    core: '#041a1c', edge: '#010506', stars: 20,
    nebulae: [[0.6, 0.58, 0.45, '#1fc8b8', 0.24], [0.2, 0.42, 0.3, '#8ff5ea', 0.08]],
  });
  const V = [-0.05, 0.42], SQUASH = 0.35, TILT = 14 * DEG, THICK = 0.04;
  const discs = [
    { x: 0.36, y: 0.32, r: 0.12, spin: 190 * DEG },
    { x: 0.7, y: 0.6, r: 0.31, spin: 10 * DEG },
  ];
  ctx.fillStyle = radial(ctx, 0.66, 0.6, 0.4, [rgba('#8ff5ea', 0.2), rgba(ORACLE.teal, 0.08), rgba(ORACLE.teal, 0)]);
  ctx.fillRect(0, 0, 1, 1);

  // A trail from the disc's whole width narrowing to a thread at V, brightest at the disc and
  // fading back along it, `w` times that width. Its sides leave the ring where it reaches out
  // furthest either side of the line back to V, so they graze it.
  const trail = ({ x, y, r }, w) => {
    const dx = V[0] - x, dy = V[1] - y, l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l, nx = -uy, ny = ux;
    const a = [Math.cos(TILT), Math.sin(TILT)], b = [-Math.sin(TILT), Math.cos(TILT)], ra = r * SQUASH;
    const th = Math.atan2(r * (nx * b[0] + ny * b[1]), ra * (nx * a[0] + ny * a[1]));
    const ex = (ra * Math.cos(th) * a[0] + r * Math.sin(th) * b[0]) * w, ey = (ra * Math.cos(th) * a[1] + r * Math.sin(th) * b[1]) * w;
    const n = 48, left = [], right = [], thread = 0.002;
    for (let i = 0; i <= n; i++) {
      const t = i / n, k = (1 - t) ** 2.4, cx = x + ux * l * t, cy = y + uy * l * t;
      left.push([cx + ex * k + nx * thread, cy + ey * k + ny * thread]);
      right.push([cx - ex * k - nx * thread, cy - ey * k - ny * thread]);
    }
    const p = new Path2D();
    [...left, ...right.reverse()].forEach((q, i) => (i ? p.lineTo(...q) : p.moveTo(...q)));
    p.closePath();
    return { p, fade: (color, alpha) => linear(ctx, x, y, x + ux * l * 0.85, y + uy * l * 0.85, [rgba(color, alpha), rgba(color, alpha * 0.45), rgba(color, 0)]) };
  };

  // The ring between radii `outer` and `inner`, from `from` round to `to`.
  const arcBand = (outer, inner, from = 0, to = TAU) => {
    const p = new Path2D();
    p.arc(0, 0, outer, from, to);
    p.arc(0, 0, inner, to, from, true);
    p.closePath();
    return p;
  };
  // The teal: half the ring, from ORACLE.band out to the rim, starting `spin` round.
  const band = (spin) => arcBand(1, ORACLE.band, spin, spin + Math.PI);
  const face = (ctx, spin) => {
    const ring = arcBand(1, ORACLE.hole);
    ctx.fillStyle = radial(ctx, 0, 0, 1.3, ['#ffffff', '#f2f8f8', '#cfdfdf'], -0.35, -0.4);
    ctx.fill(ring);
    // Smeared copies of the teal behind its leading edge, fainter the further back.
    for (let i = 4; i >= 1; i--) {
      ctx.globalAlpha = 0.14 * (5 - i) / 4;
      ctx.fillStyle = ORACLE.teal;
      ctx.fill(band(spin - i * 9 * DEG));
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = linear(ctx, -1, -1, 1, 1, [ORACLE.bright, ORACLE.teal, '#17b3a4', ORACLE.bright]);
    ctx.fill(band(spin));
    // Both edges catching the light.
    ctx.lineWidth = 0.03;
    ctx.strokeStyle = '#ffffff';
    for (const k of [1, ORACLE.hole]) {
      ctx.beginPath();
      ctx.arc(0, 0, k, 0, TAU);
      ctx.stroke();
    }
  };
  // The disc at `d`, turned side-on: its thin edge first, just behind, then its face; painted on its
  // own so the glow goes round it whole.
  const disc = (d) => {
    const { c: out, ctx: g } = surface(S);
    const place = (dx) => {
      g.translate(d.x + dx, d.y);
      g.rotate(TILT);
      g.scale(d.r * SQUASH, d.r);
    };
    g.save();
    place(-d.r * THICK);
    g.fillStyle = ORACLE.deep;
    g.fill(arcBand(1, ORACLE.hole));
    g.restore();
    g.save();
    place(0);
    face(g, d.spin);
    g.restore();
    return out;
  };

  for (const d of discs) {
    const t = trail(d, 1), wide = trail(d, 1.25), core = trail(d, 0.35);
    // The trail streams off the ring itself: none of it shows through the hole.
    const open = new Path2D();
    open.rect(0, 0, 1, 1);
    open.ellipse(d.x, d.y, d.r * SQUASH * ORACLE.hole, d.r * ORACLE.hole, TILT, 0, TAU);
    ctx.save();
    ctx.clip(open, 'evenodd');
    ctx.save();
    ctx.filter = `blur(${px * 0.025}px)`;
    ctx.fillStyle = wide.fade(ORACLE.teal, 0.35);
    ctx.fill(wide.p);
    ctx.restore();
    ctx.fillStyle = t.fade(ORACLE.teal, 0.7);
    ctx.fill(t.p);
    ctx.save();
    ctx.filter = `blur(${px * 0.006}px)`;
    ctx.fillStyle = core.fade('#e8fffb', 0.7);
    ctx.fill(core.p);
    ctx.restore();
    ctx.restore();
    const art = disc(d);
    glow(ctx, rgba('#46f0dc', 0.7), px * d.r * 0.4, () => ctx.drawImage(art, 0, 0, 1, 1));
  }
  const near = discs[1];
  const [gx, gy] = [near.r * SQUASH * 0.7, -near.r * 0.7]; // on its rim, up and out
  sparkle(ctx, near.x + gx * Math.cos(TILT) - gy * Math.sin(TILT), near.y + gx * Math.sin(TILT) + gy * Math.cos(TILT), 0.06, '#ffffff', 0.9, 0.3);
  return c;
}

// ---------------------------------------------------------------- black rose

// A black rose, painted: seen from the side and a little above, leaning to the right, hanging in
// the air on a short stem that fades out below a pair of small thorns. Each petal is a curved
// sheet round the flower's axis (ROSE.layers: a tight spiral at the heart, cupped petals round
// it, the outer ones opening and rolling back to points), projected and shaded by how it faces a
// soft light from the front left: near black, its lit side only a few shades up, darkest down at
// its base, with faint veins, its lip rolled over a shadow, and a soft shadow cast on whatever is
// behind it. Fine grain over all of it, like paint on paper, and a faint white light behind.
const ROSE = {
  hip: [0.5, 0.6], lean: 12 * DEG, view: 0.3, // view: how far it's seen from above (sin of the angle)
  light: [-0.55, 0.83], // the light's direction across and toward the viewer
  dark: 3, lit: 66, // grey levels (0-255) of a petal facing away from the light and full on
  // Per ring of petals, inside out: how many, their height, radius at base and top, half-width
  // (radians) at base and top, how far the lip flares out, how round the top is, how far its
  // middle rises to a point, and where the first one turns to.
  layers: [
    { n: 3, h: 0.225, rb: 0.006, rt: 0.028, wb: 0.7, wt: 1.5, flare: 0.006, round: 0.25, point: 0, at: 0.4 },
    { n: 4, h: 0.215, rb: 0.012, rt: 0.06, wb: 0.55, wt: 1.05, flare: 0.014, round: 0.36, point: 0.006, at: 1.3 },
    { n: 5, h: 0.195, rb: 0.02, rt: 0.098, wb: 0.48, wt: 0.88, flare: 0.03, round: 0.42, point: 0.016, at: 0.2 },
    { n: 5, h: 0.16, rb: 0.026, rt: 0.135, wb: 0.42, wt: 0.82, flare: 0.055, round: 0.46, point: 0.03, at: 0.85 },
    { n: 4, h: 0.11, rb: 0.03, rt: 0.15, wb: 0.42, wt: 0.85, flare: 0.07, round: 0.5, point: 0.034, at: 0.1 },
  ],
};

function blackRoseIcon(S = 256) {
  const { c, ctx, px } = surface(S);
  const rand = seededRandom(6607), jit = (k) => (rand() * 2 - 1) * k;
  space(ctx, seededRandom(6607), { core: '#0b0b0d', edge: '#020203', stars: 16 });
  ctx.fillStyle = radial(ctx, 0.5, 0.44, 0.42, [rgba('#ffffff', 0.06), rgba('#ffffff', 0.02), rgba('#ffffff', 0)]);
  ctx.fillRect(0, 0, 1, 1);
  const blur = (k) => `blur(${px * k}px)`;
  const grey = (v, a = 1) => `rgba(${v},${v},${Math.round(v * 1.06)},${a})`; // the faintest cool cast
  const [hx, hy] = ROSE.hip;

  // The stem: curving down from the hip and fading out, round (dark at its sides, a soft lit
  // line down its left), and its thorns, small hooks pointing up along it, a side each.
  const st = [ROSE.hip, [0.488, 0.68], [0.462, 0.76], [0.455, 0.9]];
  const stemAt = (t) => {
    const u = 1 - t, k = [u ** 3, 3 * u * u * t, 3 * u * t * t, t ** 3], d = [-3 * u * u, 3 * u * u - 6 * u * t, 6 * u * t - 3 * t * t, 3 * t * t];
    const sum = (w, i) => w.reduce((a, wj, j) => a + wj * st[j][i], 0), tx = sum(d, 0), ty = sum(d, 1), l = Math.hypot(tx, ty);
    return { x: sum(k, 0), y: sum(k, 1), tx: tx / l, ty: ty / l };
  };
  const stem = new Path2D();
  stem.moveTo(...st[0]);
  stem.bezierCurveTo(...st[1], ...st[2], ...st[3]);
  const fading = (v, a) => linear(ctx, ...st[0], ...st[3], [grey(v, a), grey(v, a), grey(v, a * 0.4), grey(v, 0)]);
  for (const [w, v, a, dx, b] of [[0.015, 14, 1, 0, 0], [0.009, 22, 0.9, -0.002, 0.004], [0.003, 44, 0.5, -0.004, 0.003]]) {
    ctx.save();
    ctx.filter = b ? blur(b) : 'none';
    ctx.translate(dx, 0);
    ctx.lineWidth = w;
    ctx.strokeStyle = fading(v, a);
    ctx.stroke(stem);
    ctx.restore();
  }
  for (const [t, side] of [[0.32, 1], [0.55, -1]]) {
    const { x, y, tx, ty } = stemAt(t), nx = -ty * side, ny = tx * side, r = 0.0065;
    const bx = x + nx * r, by = y + ny * r;
    const thorn = new Path2D();
    thorn.moveTo(bx + tx * 0.009, by + ty * 0.009);
    thorn.quadraticCurveTo(bx + nx * 0.01, by + ny * 0.01, bx + nx * 0.019 - tx * 0.012, by + ny * 0.019 - ty * 0.012);
    thorn.quadraticCurveTo(bx + nx * 0.005 - tx * 0.003, by + ny * 0.005 - ty * 0.003, bx - tx * 0.009, by - ty * 0.009);
    thorn.closePath();
    ctx.fillStyle = linear(ctx, bx, by, bx + nx * 0.02, by + ny * 0.02, [grey(16), grey(28)]);
    ctx.fill(thorn);
  }

  // The bloom, painted on its own about its hip, then leant over onto the stem.
  const { c: bloom, ctx: g } = surface(S);
  g.translate(hx, hy);
  g.rotate(ROSE.lean);
  const V = ROSE.view, VC = Math.sqrt(1 - V * V), [LX, LZ] = ROSE.light;
  const proj = (th, y, r) => [r * Math.sin(th), -y * VC + r * Math.cos(th) * V];
  // How lit the face we see is at azimuth th: the outside of the sheet where it turns toward
  // the viewer, its inside where it turns away.
  const litAt = (th) => {
    const s = Math.cos(th) >= 0 ? 1 : -1;
    return clamp01((Math.sin(th) * s * LX + Math.cos(th) * s * LZ) * 0.5 + 0.5);
  };
  const tone = (th, k = 0) => Math.round(lerp(ROSE.dark, ROSE.lit, clamp01(litAt(th) ** 1.6 + k)));

  // The sepals first, behind it all: thin dark tongues curling down off the hip.
  for (const a of [-2.3, -0.9, 0.5, 1.9, 3.2]) {
    const s = Math.sin(a), f = Math.cos(a), len = 0.085 + jit(0.015);
    const base = proj(a, 0.004, 0.02), tip = [base[0] + s * len * 0.9, base[1] + len * (0.55 + 0.3 * Math.abs(f))];
    const mid = [base[0] + s * len * 0.8, base[1] + len * 0.1];
    const p = new Path2D();
    p.moveTo(base[0] - 0.008, base[1]);
    p.quadraticCurveTo(mid[0] - 0.004, mid[1] - 0.006, ...tip);
    p.quadraticCurveTo(mid[0] + 0.006, mid[1] + 0.008, base[0] + 0.008, base[1]);
    g.fillStyle = linear(g, ...base, ...tip, [grey(f > 0 ? 18 : 10), grey(f > 0 ? 12 : 7)]);
    g.fill(p);
  }

  // Every petal, the farthest first.
  const petals = [];
  ROSE.layers.forEach((L, li) => {
    for (let i = 0; i < L.n; i++) {
      const phi = L.at + (i / L.n) * TAU + jit(0.25);
      petals.push({ L, li, phi, h: L.h * (1 + jit(0.07)), wt: L.wt * (1 + jit(0.08)), wave: rand() * TAU, tilt: jit(0.25) });
    }
  });
  petals.sort((a, b) => Math.cos(a.phi) * a.L.rt - Math.cos(b.phi) * b.L.rt);

  const N = 28;
  for (const P of petals) {
    const { L, phi, h, wt } = P;
    const half = (v) => lerp(L.wb, wt, v ** 0.6);
    const top = (u) => h * (1 - L.round * u * u) + L.point * Math.max(0, 1 - Math.abs(u) * 1.7) ** 2 + Math.sin(u * 6 + P.wave) * 0.005 + P.tilt * u * 0.02;
    const at = (u, v) => {
      const th = phi + u * half(v), y = v * top(u), r = lerp(L.rb, L.rt, v ** 0.5) + L.flare * v ** 4;
      return { th, xy: proj(th, y, r) };
    };
    const left = [], lip = [], right = [];
    for (let i = 0; i <= N; i++) {
      left.push(at(-1, i / N).xy);
      lip.push(at(-1 + (2 * i) / N, 1).xy);
      right.push(at(1, 1 - i / N).xy);
    }
    const body = new Path2D();
    [...left, ...lip, ...right].forEach((q, i) => (i ? body.lineTo(...q) : body.moveTo(...q)));
    body.closePath();
    const line = (pts) => { const p = new Path2D(); pts.forEach((q, i) => (i ? p.lineTo(...q) : p.moveTo(...q))); return p; };

    // The soft shadow it casts on what's behind it.
    g.save();
    g.filter = blur(0.02);
    g.translate(0.006, 0.013);
    g.fillStyle = 'rgba(0,0,0,0.9)';
    g.fill(body);
    g.restore();

    // Its body: shaded across by how it turns to the light, darker down toward its base.
    const xs = [-1, -0.5, 0, 0.5, 1].map((u) => at(u, 0.75));
    const across = g.createLinearGradient(xs[0].xy[0], 0, xs[4].xy[0], 0);
    const span = xs[4].xy[0] - xs[0].xy[0];
    if (Math.abs(span) > 1e-4) {
      for (const s of xs) across.addColorStop(clamp01((s.xy[0] - xs[0].xy[0]) / span), grey(tone(s.th)));
      g.fillStyle = across;
    } else g.fillStyle = grey(tone(phi));
    g.fill(body);
    g.save();
    g.clip(body);
    const b0 = at(0, 0).xy, b1 = at(0, 1).xy;
    g.fillStyle = linear(g, ...b0, ...b1, ['rgba(0,0,0,0.95)', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.1)', 'rgba(0,0,0,0)']);
    g.fill(body);
    // Faint veins fanning up from its base, a hair darker.
    g.lineWidth = 0.0016;
    g.strokeStyle = 'rgba(0,0,0,0.28)';
    for (const u of [-0.7, -0.35, 0, 0.35, 0.7]) g.stroke(line(Array.from({ length: 12 }, (_, i) => at(u * (0.4 + 0.6 * (i / 11)), 0.1 + 0.8 * (i / 11)).xy)));
    // The lip rolled over: a band along its top a few shades lighter, catching the light, over
    // a soft shadow in the curl under it.
    const lipPath = line(lip);
    g.save();
    g.filter = blur(0.01);
    g.translate(0, 0.012);
    g.lineWidth = 0.02;
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.stroke(lipPath);
    g.restore();
    g.save();
    g.filter = blur(0.004);
    g.lineWidth = 0.008;
    g.strokeStyle = grey(tone(phi, 0.15), 0.35);
    g.stroke(lipPath);
    g.restore();
    g.restore();
    // And the very edge, just catching the light where it faces it.
    if (litAt(phi) > 0.45) {
      g.lineWidth = 0.002;
      g.strokeStyle = grey(tone(phi, 0.3), 0.3);
      g.stroke(lipPath);
    }
  }

  // Grain over the flower alone, like paint on paper.
  const { c: grain, ctx: n } = surface(S, S, 1);
  const noise = n.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const v = 128 + (rand() - 0.5) * 120;
    noise.data.set([v, v, v, 255], i * 4);
  }
  n.putImageData(noise, 0, 0);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.globalAlpha = 0.04;
  g.drawImage(grain, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';

  // A faint white light round the flower from behind it, then the flower.
  glow(ctx, rgba('#ffffff', 0.08), px * 0.05, () => ctx.drawImage(bloom, 0, 0, 1, 1));
  return c;
}

// ---------------------------------------------------------------- thunder

// Thunder leaping all over the box from a flare in the middle: thick jagged bolts, white-hot
// in bands of purple under a wide glow, forking and sprouting, lighting every point they strike.
function thunderIcon(S = 256) {
  const { c, ctx, px } = surface(S);
  const rand = seededRandom(919);
  space(ctx, rand, {
    core: '#12062a', edge: '#030108', stars: 20,
    nebulae: [[0.5, 0.5, 0.48, '#8a2cff', 0.38], [0.25, 0.75, 0.3, '#c46bff', 0.14]],
  });
  ctx.fillStyle = radial(ctx, 0.38, 0.7, 0.4, [rgba('#d9a8ff', 0.35), rgba('#8a2cff', 0.12), rgba('#8a2cff', 0)]);
  ctx.fillRect(0, 0, 1, 1);
  // Midpoint displacement, as in src/aspects/thunder.js.
  const jag = (a, b, step, rough) => {
    const pts = [a];
    const split = (p, q) => {
      const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy);
      if (l <= step) { pts.push(q); return; }
      const off = (rand() - 0.5) * rough * l, m = [(p[0] + q[0]) / 2 - (dy / l) * off, (p[1] + q[1]) / 2 + (dx / l) * off];
      split(p, m);
      split(m, q);
    };
    split(a, b);
    return pts;
  };
  // A clap caught mid-leap: out of the middle to struck points all over the box, forks off
  // the bolts to more of them, and a few running on off the edges. `w` scales a bolt's width.
  const bolts = [];
  const bolt = (a, b, w) => {
    const pts = jag(a, b, 0.04, 0.55);
    bolts.push({ pts, w });
    // Thin sprouts off some of its points.
    pts.forEach(([x, y], i) => {
      if (i === 0 || i >= pts.length - 2 || rand() > 0.35) return;
      const [nx, ny] = pts[i + 1], dir = Math.atan2(ny - y, nx - x) + (rand() < 0.5 ? -1 : 1) * lerp(25, 70, rand()) * DEG;
      const len = lerp(0.05, 0.14, rand());
      bolts.push({ pts: jag([x, y], [x + Math.cos(dir) * len, y + Math.sin(dir) * len], 0.02, 0.6), w: w * 0.35 });
    });
    return pts;
  };
  const on = (pts, t) => pts[Math.round(t * (pts.length - 1))];
  const O = [0.5, 0.47], B = [0.15, 0.17], C = [0.84, 0.21], D = [0.17, 0.8], E = [0.8, 0.83], G = [0.9, 0.52];
  const ob = bolt(O, B, 1), oe = bolt(O, E, 1), oc = bolt(O, C, 0.85);
  bolt(on(oe, 0.45), D, 0.75);
  bolt(on(oc, 0.55), G, 0.65);
  bolt(on(ob, 0.5), [0.02, 0.5], 0.55);
  bolt(B, [0.36, -0.03], 0.5);
  bolt(D, [0.45, 1.03], 0.55);
  bolt(G, [1.03, 0.68], 0.45);
  bolt(C, [1.03, 0.06], 0.45);
  const line = (pts, width, style) => {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
    ctx.lineWidth = width;
    ctx.strokeStyle = style;
    ctx.stroke();
  };
  const all = (width, style) => { for (const b of bolts) line(b.pts, width * b.w, style); };
  ctx.save();
  ctx.filter = `blur(${px * 0.03}px)`;
  all(0.16, rgba('#8a2cff', 0.8));
  ctx.restore();
  glow(ctx, rgba('#b45cff', 1), px * 0.035, () => all(0.07, '#a94dff'));
  all(0.07, '#a94dff');
  ctx.save();
  ctx.filter = `blur(${px * 0.003}px)`;
  all(0.026, '#ffffff');
  ctx.restore();
  // Every point struck lights up, the one it came out of most.
  for (const [[x, y], r, star] of [[O, 0.2, 0.1], [B, 0.1, 0.045], [C, 0.1, 0.045], [D, 0.1, 0.045], [E, 0.1, 0.045], [G, 0.08, 0.035]]) {
    ctx.fillStyle = radial(ctx, x, y, r, [rgba('#ffffff', 0.9), rgba('#c98cff', 0.45), rgba('#8a2cff', 0)]);
    ctx.fillRect(0, 0, 1, 1);
    sparkle(ctx, x, y, star, '#ffffff', 1, rand());
  }
  return c;
}

// ---------------------------------------------------------------- phoenix

// A flame feather along the quadratic from `a` through `c` to `b`: swelling fast off the
// quill and tapering to a point, its edges licked into flame tongues that grow toward the
// tip. `half`: its widest half-width. Returns its outline.
function flamePlume(a, c, b, half, rand, { licks = 4, ragged = 0.45, n = 64 } = {}) {
  const at = (u) => {
    const v = 1 - u;
    return [v * v * a[0] + 2 * v * u * c[0] + u * u * b[0], v * v * a[1] + 2 * v * u * c[1] + u * u * b[1]];
  };
  const edge = (sgn) => {
    const phase = rand() * TAU, out = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n, [x, y] = at(u), [x1, y1] = at(Math.max(0, u - 0.002)), [x2, y2] = at(Math.min(1, u + 0.002));
      const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) || 1;
      const body = Math.sin((Math.PI / 2) * Math.min(1, u / 0.25)) * (1 - u ** 2.4) ** 0.75;
      // Tongues: sharp crests swept toward the tip, deeper further out.
      const crest = (0.5 + 0.5 * Math.sin(u * licks * TAU + phase)) ** 3;
      const w = half * body * (1 - ragged * u * 0.5 + ragged * u * crest);
      out.push([x - (dy / l) * w * sgn, y + (dx / l) * w * sgn]);
    }
    return out;
  };
  const p = new Path2D();
  p.moveTo(...a);
  for (const q of [...edge(1), ...edge(-1).reverse()]) p.lineTo(...q);
  p.closePath();
  return p;
}

// A phoenix made of nothing but light: a tiny bright body under huge wings flung open upward,
// a fan of flame feathers each, and a short tail streaming down, with no features at all,
// just fire. Every plume is laid on as light, so they blaze where they overlap and fade to a
// glow toward their tips, over a wide soft halo.
function phoenixIcon(S = 256) {
  const { c, ctx, px } = surface(S);
  const rand = seededRandom(1213);
  space(ctx, rand, { core: '#1e0703', edge: '#050100', stars: 14, nebulae: [[0.5, 0.45, 0.5, '#ff5a10', 0.22]] });
  const dir = (deg, r) => [Math.cos(deg * DEG) * r, Math.sin(deg * DEG) * r];
  const add = (p, [dx, dy]) => [p[0] + dx, p[1] + dy];
  const shapes = []; // { path, a, b, k: brightness, spine: [a, ctl, b] for a bright line down its middle }
  const plume = (a, ctl, b, half, k = 1, opts = {}, spine = false) => shapes.push({ path: flamePlume(a, ctl, b, half, rand, opts), a, b, k, spine: spine && [a, ctl, b] });
  // The wings: long feathers fanning from straight up out to the side, raised high and reaching
  // the corners, the middle ones longest and each bowing outward; shorter ones over their roots.
  for (const m of [1, -1]) {
    const root0 = [0.5 + m * 0.018, 0.45], fan = (deg) => (m > 0 ? deg : -180 - deg);
    const n = 11;
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1), deg = lerp(-82, -8, k), len = 0.3 + 0.18 * Math.sin(Math.PI * k ** 0.8);
      const root = add(root0, dir(fan(-36), 0.005 + 0.05 * k));
      plume(root, add(root, dir(fan(deg), len * 0.55)), add(root, dir(fan(deg + 14), len)), len * 0.085, 1, {}, true);
    }
    for (let i = 0; i < 7; i++) {
      const k = i / 6, deg = lerp(-86, -26, k), len = 0.12 + 0.06 * Math.sin(Math.PI * k);
      const root = add(root0, dir(fan(-36), 0.004 + 0.03 * k));
      plume(root, add(root, dir(fan(deg), len * 0.55)), add(root, dir(fan(deg + 10), len)), len * 0.13, 0.7, { ragged: 0.3 });
    }
  }
  // A short tail streaming down and curling out.
  const T = [0.5, 0.52];
  for (const [b, ctl, half] of [[[0.5, 0.86], [0.5, 0.72], 0.028], [[0.4, 0.82], [0.48, 0.7], 0.022], [[0.6, 0.82], [0.52, 0.7], 0.022], [[0.31, 0.74], [0.45, 0.68], 0.016], [[0.69, 0.74], [0.55, 0.68], 0.016]]) {
    plume(T, ctl, b, half, 0.9, { licks: 3 });
  }
  // A tiny body and head, and a wisp of flame off the head.
  const body = new Path2D();
  body.ellipse(0.5, 0.455, 0.018, 0.06, 0, 0, TAU);
  body.ellipse(0.5, 0.385, 0.017, 0.017, 0, 0, TAU);
  shapes.push({ path: body, a: [0.5, 0.37], b: [0.5, 0.52], k: 1.6 });
  for (const [b, ctl] of [[[0.47, 0.3], [0.49, 0.34]], [[0.5, 0.29], [0.5, 0.33]], [[0.53, 0.3], [0.51, 0.34]]]) plume([0.5, 0.38], ctl, b, 0.01, 1.2, { licks: 2, ragged: 0.2 });

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // A wide orange halo, a tighter gold one, then the light itself.
  for (const [blur, color] of [[0.05, rgba('#ff4a08', 0.22)], [0.015, rgba('#ff9a28', 0.22)]]) {
    ctx.filter = `blur(${px * blur}px)`;
    ctx.fillStyle = color;
    for (const s of shapes) ctx.fill(s.path);
  }
  ctx.filter = `blur(${px * 0.003}px)`;
  for (const s of shapes) {
    ctx.fillStyle = linear(ctx, s.a[0], s.a[1], s.b[0], s.b[1],
      [rgba('#fff2d0', Math.min(1, 0.3 * s.k)), rgba('#ffd070', 0.32 * s.k), rgba('#ff9a30', 0.26 * s.k), rgba('#ff6a14', 0.04)]);
    ctx.fill(s.path);
  }
  // A thread of white light down every long feather, so the wings fan out like rays.
  for (const { spine } of shapes) {
    if (!spine) continue;
    const [a, ctl, b] = spine;
    ctx.beginPath();
    ctx.moveTo(...a);
    ctx.quadraticCurveTo(...ctl, ...b);
    ctx.strokeStyle = linear(ctx, a[0], a[1], b[0], b[1], [rgba('#ffffff', 0.15), rgba('#fff4d8', 0.45), rgba('#ffd080', 0)]);
    ctx.lineWidth = 0.006;
    ctx.stroke();
  }
  ctx.filter = 'none';
  // The heart of it, white-hot.
  ctx.fillStyle = radial(ctx, 0.5, 0.44, 0.13, [rgba('#ffffff', 0.55), rgba('#ffd080', 0.2), rgba('#ff7a20', 0)]);
  ctx.fillRect(0, 0, 1, 1);
  // Embers drifting up off it.
  for (let i = 0; i < 24; i++) {
    const x = lerp(0.1, 0.9, rand()), y = lerp(0.06, 0.92, rand());
    ctx.fillStyle = rgba(rand() < 0.5 ? '#ffd060' : '#ff7a20', lerp(0.35, 0.9, rand()));
    ctx.beginPath();
    ctx.arc(x, y, lerp(0.003, 0.008, rand() ** 2), 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  return c;
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
// regular hexagon for Prestige and an eight-point star brilliant for Mythic (`notch` pulls
// every other point in). Bevel facets lit from the top left around a bright table, a white
// rim, a sheen and a glint. No backdrop.
const GEM_CUTS = {
  gift: { color: '#5999ff', sides: 4, rx: 0.3, ry: 0.42, table: 0.45 },
  prestige: { color: '#9459f2', sides: 6, rx: 0.42, ry: 0.42, table: 0.5 },
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
