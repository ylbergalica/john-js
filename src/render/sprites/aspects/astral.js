// The Astral aspect's sprites and icon.
import { seededRandom, lerp, smoothStep01, TAU } from '../../../engine/math.js';
import { DEG, surface, rgba, glow, linear, radial, sparkle, space } from '../paint.js';

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

export const ASTRAL_EXALTED = { glow: '#ff1438', under: '#ff3a54', body: '#ff5c72', core: ['#ffd8de', '#fff2f4'] };

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
export function astralBlade(palette = ASTRAL_BLUE, W = 256) {
  const { c, ctx, px } = surface(W, Math.round(W * ASTRAL_BLADE.height), W);
  paintAstral(ctx, px, undefined, palette);
  return c;
}

// One blade up close, rising toward the top right at the end of its flight: its trail comes
// in thin out of the distance at the top, curls left and down the left side, dips under the
// bottom of the box and climbs into its pommel, widening and brightening as it nears.
export function astralIcon(S = 256) {
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
