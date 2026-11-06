// UI icons: stars, the coin and the gems.
import { lerp, TAU } from '../../engine/math.js';
import { DEG, surface, rgba, glow, linear, radial, sparkle } from './paint.js';

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
export function roughStar(arms, pinch, rand) {
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
export function coinIcon(S = 128) {
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
export const GEM_CUTS = {
  gift: { color: '#5999ff', sides: 4, rx: 0.3, ry: 0.42, table: 0.45 },
  prestige: { color: '#9459f2', sides: 6, rx: 0.42, ry: 0.42, table: 0.5 },
  mythic: { color: '#ffae1f', sides: 16, rx: 0.43, ry: 0.43, table: 0.42, notch: 0.68 },
};

export function gemIcon({ color, sides, rx, ry, table, notch = 1 }, S = 192) {
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
