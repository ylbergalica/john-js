// The Antlers aspect's sprites and icon.
import { seededRandom, lerpColor, clamp01, smoothStep01 } from '../../../engine/math.js';
import { ASPECTS } from '../../../data/aspects.js';
import { antlerParts, mirrored } from '../../antlerShape.js';
import { surface, rgba, glow, radial, sparkle, space } from '../paint.js';

// ---------------------------------------------------------------- antlers

// The Antlers aspect's antlers full grown, drawn as on the player (antlerParts), seen from
// above with the brow at the bottom: the beams leaving their burrs ahead, sweeping out to the
// sides and curving ahead again, forking on both sides all along, in bone in a dark outline,
// under a warm glow.
export function antlersIcon(S = 256) {
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
