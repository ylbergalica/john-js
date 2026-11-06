// The Bulwark's sprites.
import { TAU } from '../../../engine/math.js';
import { ENEMY_TYPES } from '../../../data/enemies.js';
import { DEG, surface, rgba, glow, linear, radial, sparkle } from '../paint.js';
import { VOIDS, outline, voidFill } from './common.js';

// The Bulwark's body, squat: broad and shallow, its `body` traced [x, y, corner radius] from
// the middle of its front round one side to a cleft in its back, mirrored for the other.
// Its front flares out into a great pauldron over each shoulder, which steps in to a narrower
// waist behind and rounds into a back split by the cleft into two plates. A crest down its
// middle, a brow across its front, a seam inside each pauldron, and `rivets` [x, y] (on
// each side) on its pauldrons and back plates. World units, in its frame.
const BULWARK = {
  body: [[0.34, 0, 0], [0.34, -0.32, 0.08], [0.25, -0.56, 0.1], [-0.1, -0.56, 0.1], [-0.13, -0.42, 0.02],
    [-0.3, -0.42, 0.1], [-0.42, -0.26, 0.12], [-0.42, -0.07, 0.03], [-0.38, 0, 0.02]],
  front: 0.34, back: -0.38, half: 0.56, line: 0.03,
  rivets: [[0.15, -0.5], [-0.01, -0.5], [-0.32, -0.3], [-0.36, -0.15]],
};

const BULWARK_PALETTE = { stroke: ['#e4eaf2', '#94a2b5', '#4e5a6b'], glow: rgba('#8193ab', 0.55) };

// The Bulwark's shield, a separate sprite so it can be posed and flung: seen from above, a
// curved plate, the centre of its curve at the sprite's origin, the plate `r` out from it
// along +x, `thick` deep, spanning `spanDeg`, a domed boss `boss` across in the middle of its
// face with a star glinting in it, and `rivets` along it at those angles (degrees). World
// units: the sprite is `w` × `h`, the origin at its left edge, halfway down, `unit` px per unit.
export const SHIELD_ART = { r: 0.58, thick: 0.18, spanDeg: 140, boss: 0.1, rivets: [-52, -27, 27, 52], w: 0.8, h: 1.5, unit: 216 };

// The Bulwark's body in its sprite's units (1 = its visual size), drawn round the middle.
const bulwarkUnit = () => 1 / ENEMY_TYPES.bulwark.visual.size;

// A point in its frame, in its sprite's units.
const bulwarkAt = (x, y) => [0.5 + x * bulwarkUnit(), 0.5 + y * bulwarkUnit()];

// Its traced side, then the other side mirrored back to the front, each corner rounded.
function bulwarkPath() {
  const side = BULWARK.body, k = bulwarkUnit();
  const pts = [...side, ...side.slice(1, -1).reverse().map(([x, y, r]) => [x, -y, r])];
  const p = new Path2D(), [x0, y0] = bulwarkAt(...pts[0]);
  p.moveTo(x0, y0);
  pts.forEach((_, i) => {
    const [x, y, r] = pts[(i + 1) % pts.length], next = pts[(i + 2) % pts.length];
    p.arcTo(...bulwarkAt(x, y), ...bulwarkAt(next[0], next[1]), r * k);
  });
  p.closePath();
  return p;
}

// Its armour, with a crest down the middle, a brow across the front and a seam inside each
// pauldron, curving round where it steps in to the waist.
export function bulwarkOutline(S = 256) {
  const { back, front, half, line } = BULWARK, at = bulwarkAt;
  return outline(S, BULWARK_PALETTE, (ctx) => {
    ctx.lineWidth = line;
    ctx.lineJoin = 'round';
    ctx.stroke(bulwarkPath());
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = line * 0.55;
    ctx.beginPath();
    ctx.moveTo(...at(back + 0.05, 0)); ctx.lineTo(...at(front - 0.16, 0)); // the crest
    ctx.moveTo(...at(front - 0.1, -half * 0.5)); ctx.quadraticCurveTo(...at(front - 0.02, 0), ...at(front - 0.1, half * 0.5)); // the brow
    for (const s of [-1, 1]) { ctx.moveTo(...at(0.27, s * 0.43)); ctx.quadraticCurveTo(...at(0.08, s * 0.41), ...at(-0.09, s * 0.44)); } // the pauldrons
    ctx.stroke();
  });
}

// Its slate nebula, with rivets on its pauldrons and back plates catching the light.
export function bulwarkVoid() {
  const c = voidFill(bulwarkPath(), VOIDS.bulwark), ctx = c.getContext('2d');
  for (const [x, y] of BULWARK.rivets) for (const s of [-1, 1]) sparkle(ctx, ...bulwarkAt(x, s * y), 0.016, '#c8d4e6', 0.8);
  return c;
}

// The shield: a curved plate seen from above, lit along its outer face, a ridge along it,
// rivets, and a domed boss with a star in it.
export function bulwarkShield() {
  const { r, thick, spanDeg, boss, rivets, w, h, unit } = SHIELD_ART, half = (spanDeg / 2) * DEG;
  const { c, ctx, px } = surface(Math.round(w * unit), Math.round(h * unit), unit);
  ctx.translate(0, h / 2);
  const ri = r - thick / 2, ro = r + thick / 2;
  const plate = new Path2D();
  plate.arc(0, 0, ro, -half, half);
  plate.arc(0, 0, ri, half, -half, true);
  plate.closePath();
  const fill = ctx.createRadialGradient(0, 0, ri, 0, 0, ro);
  [[0, VOIDS.bulwark.edge], [0.45, VOIDS.bulwark.core], [1, '#3e495a']].forEach(([at, color]) => fill.addColorStop(at, color));
  ctx.fillStyle = fill;
  ctx.fill(plate);
  const stroke = linear(ctx, 0, -ro, ro, ro, BULWARK_PALETTE.stroke);
  glow(ctx, BULWARK_PALETTE.glow, px * 0.035, () => {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = BULWARK.line * 1.2;
    ctx.stroke(plate);
  });
  ctx.strokeStyle = rgba('#b4c2d6', 0.35);
  ctx.lineWidth = 0.012;
  ctx.beginPath();
  ctx.arc(0, 0, r - 0.01, -half + 0.06, half - 0.06);
  ctx.stroke();
  for (const deg of rivets) sparkle(ctx, Math.cos(deg * DEG) * r, Math.sin(deg * DEG) * r, 0.02, '#c8d4e6', 0.85);
  // The boss, domed out of the middle of its face.
  const bx = r + 0.01;
  ctx.fillStyle = radial(ctx, bx, 0, boss, ['#5c6a80', '#232a35', '#0c0f14'], bx - boss * 0.3, -boss * 0.3);
  ctx.beginPath();
  ctx.arc(bx, 0, boss, 0, TAU);
  ctx.fill();
  glow(ctx, BULWARK_PALETTE.glow, px * 0.03, () => {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = BULWARK.line;
    ctx.stroke();
  });
  sparkle(ctx, bx, 0, boss * 0.9, '#e8f0ff', 0.9);
  return c;
}
