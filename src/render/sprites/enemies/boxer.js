// The Boxer's sprites.
import { TAU } from '../../../engine/math.js';
import { DEG, surface, rgba, polar, glow, linear, radial, sparkle } from '../paint.js';
import { outline } from './common.js';

// The Boxer's body: a decagon of circumradius `r` with a flat face ahead, its corners
// rounded by `corner`, with a faint brow `brow` in from the face.
const BOXER = { r: 0.33, line: 0.05, corner: 0.02, brow: 0.07 };

const BOXER_PALETTE = { stroke: ['#ffa8a8', '#d8303e', '#7a1018'], glow: rgba('#c8202e', 0.65) };

// A conjured fist, a separate sprite: a circle `body` of the texture's width in radius (the
// rest is room for its glow).
export const FIST_ART = { body: 0.36, line: 0.07 };

export function boxerPath() {
  const { r, corner } = BOXER, pts = Array.from({ length: 10 }, (_, i) => polar(0.5, 0.5, 18 + 36 * i, r));
  const p = new Path2D(), mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  p.moveTo(...mid(pts[9], pts[0]));
  pts.forEach((pt, i) => p.arcTo(...pt, ...pts[(i + 1) % 10], corner));
  p.closePath();
  return p;
}

// The decagon, with a faint brow across the front.
export function boxerOutline(S = 256) {
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
export function boxerFist(S = 128) {
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
