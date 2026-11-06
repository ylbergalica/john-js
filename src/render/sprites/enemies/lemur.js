// The Lemur's sprites.
import { lerp, TAU } from '../../../engine/math.js';
import { LEMUR_TAIL } from '../../../data/effects.js';
import { surface, rgba, glow, linear, radial } from '../paint.js';
import { VOIDS, outline, voidFill } from './common.js';

// The Lemur's body: a plain circle, dark green with brown `patches` on it, each [x, y,
// radius, turn, squash] (squashed across to `squash` of its radius).
const LEMUR = { r: 0.31, line: 0.045, patch: '#6e4522', patches: [[0.37, 0.37, 0.13, 0.5, 0.65], [0.6, 0.65, 0.1, -0.4, 0.75], [0.67, 0.37, 0.065, 0.2, 0.9]] };

const LEMUR_PALETTE = { stroke: ['#d6f0a8', '#7cbc4c', '#7a5228'], glow: rgba('#66c03c', 0.6) };

// The spade at the end of the Lemur's tail, a separate sprite so the tail can swing it: its
// point `len` along +x from the stem, where the stalk joins. World units: the sprite is `w`
// × `h`, the stem's end `rootX` in from the left and halfway down, `unit` px per unit.
// `muzzle`: how far along it (× len) the crescents form and are flung from.
export const SPADE_ART = { w: 0.78, h: 0.62, rootX: 0.08, unit: 216, len: 0.56, line: 0.05, muzzle: 0.45 };

function lemurPath() {
  const p = new Path2D();
  p.arc(0.5, 0.5, LEMUR.r, 0, TAU);
  return p;
}

export function lemurOutline(S = 256) {
  return outline(S, LEMUR_PALETTE, (ctx) => {
    ctx.lineWidth = LEMUR.line;
    ctx.stroke(lemurPath());
  });
}

// Its dark nebula with soft-edged brown patches laid over it.
export function lemurVoid() {
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
export function lemurSpade(rim = false) {
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
