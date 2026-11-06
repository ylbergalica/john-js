// The Mauler's sprites.
import { TAU } from '../../../engine/math.js';
import { surface, rgba, glow, linear, radial, sparkle } from '../paint.js';
import { VOIDS, outline } from './common.js';

// The Mauler's body: a square with heavily rounded corners ([x, y, size, corner radius]).
const MAULER = { body: [0.14, 0.14, 0.72, 0.27], line: 0.045 };

const MAULER_PALETTE = { stroke: ['#f2b97e', '#c8682a', '#7e3810'], glow: rgba('#b8581c', 0.65) };

// The star-maul, a separate sprite so it can be swung: drawn along +x from its grip, in
// world units (`w` × `h`, the grip `grip` in from the left, `unit` px per unit). The haft
// ends in a crosswise head `head` (centre along the haft, depth, width) holding a star;
// `tip` is the head's far edge.
export const MAUL_ART = { w: 1.12, h: 0.8, grip: 0.07, unit: 216, head: [0.78, 0.34, 0.66], tip: 0.95 };

export function maulerPath() {
  const [x, y, s, r] = MAULER.body;
  const p = new Path2D();
  p.roundRect(x, y, s, s, r);
  return p;
}

// The rounded-square body with a faint brow across the front.
export function maulerOutline(S = 256) {
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

// The star-maul: a haft with a knob at the grip end and a void-filled head with a fallen
// star glinting in it.
export function starMaul() {
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
