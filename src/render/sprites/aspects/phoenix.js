// The Phoenix aspect's sprites and icon.
import { seededRandom, lerp, TAU } from '../../../engine/math.js';
import { DEG, surface, rgba, linear, radial, space } from '../paint.js';

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
export function phoenixIcon(S = 256) {
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
