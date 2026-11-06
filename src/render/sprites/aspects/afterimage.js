// The Afterimage aspect's sprites and icon.
import { seededRandom, lerp, TAU } from '../../../engine/math.js';
import { surface, rgba, glow, linear, radial, sparkle, space } from '../paint.js';

// ---------------------------------------------------------------- afterimage

// The player's body left standing solid (bottom left) in a pale glow, while the real one slips
// away up to the right, faint and see-through, its tail trailing back toward the copy along
// thin streaks of light.
export function afterimageIcon(S = 256) {
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
