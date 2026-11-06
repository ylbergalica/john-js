// The Momentum aspect's sprites and icon.
import { seededRandom, lerp, TAU } from '../../../engine/math.js';
import { DEG, surface, rgba, linear, radial, space } from '../paint.js';

// ---------------------------------------------------------------- momentum

// A critical strike into empty air: a narrow comic impact burst, a jagged wedge of light kicked
// up and back from the point struck (bottom left), white-hot there through gold to orange out
// at its spikes, laid on as soft light that fades layer into layer, with thin streaks of light
// shooting through it and sparks flung along with it.
export function momentumIcon(S = 256) {
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
