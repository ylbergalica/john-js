// The Nebula aspect's icon.
import { seededRandom } from '../../../engine/math.js';
import { surface, rgba, glow, linear, radial, sparkle, space } from '../paint.js';

// Its cloud's lobes of colour, round the wheel.
const LOBES = ['#ff3b6b', '#ffb21f', '#46f06a', '#1fd8ff', '#6a4dff', '#ff3fd0'];

// A soft-edged blob of `color` at (x, y), radius r.
function puff(ctx, x, y, r, color, a) {
  ctx.fillStyle = radial(ctx, x, y, r, [rgba(color, a), rgba(color, a * 0.4), rgba(color, 0)]);
  ctx.fillRect(0, 0, 1, 1);
}

// A cloud of six big soft lobes of colour round the wheel, like petals, a smaller wisp trailing
// off each, and a white star at its heart with a long lens-flare cross through it.
export function nebulaIcon(S = 256) {
  const { c, ctx, px } = surface(S);
  const rand = seededRandom(44);
  space(ctx, rand, { core: '#0b0914', edge: '#020103', stars: 16 });
  ctx.save();
  ctx.filter = `blur(${px * 0.02}px)`;
  LOBES.forEach((col, i) => {
    const a = (i / LOBES.length) * Math.PI * 2 - 0.4;
    puff(ctx, 0.5 + Math.cos(a) * 0.2, 0.5 + Math.sin(a) * 0.2, 0.2, col, 0.5);
    puff(ctx, 0.5 + Math.cos(a + 0.25) * 0.3, 0.5 + Math.sin(a + 0.25) * 0.3, 0.1, col, 0.3);
  });
  ctx.restore();
  // The flare: a long thin streak across the star and a shorter one down through it.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.filter = `blur(${px * 0.006}px)`;
  for (const [dx, dy, l] of [[1, 0, 0.42], [0, 1, 0.32]]) {
    ctx.strokeStyle = linear(ctx, 0.5 - dx * l, 0.5 - dy * l, 0.5 + dx * l, 0.5 + dy * l, [rgba('#ffffff', 0), rgba('#ffffff', 0.9), rgba('#ffffff', 0)]);
    ctx.lineWidth = 0.012;
    ctx.beginPath(); ctx.moveTo(0.5 - dx * l, 0.5 - dy * l); ctx.lineTo(0.5 + dx * l, 0.5 + dy * l); ctx.stroke();
  }
  ctx.restore();
  // The star: a white four-point flare in a white halo.
  const r = 0.13;
  ctx.fillStyle = radial(ctx, 0.5, 0.5, r * 2.6, [rgba('#ffffff', 0.5), rgba('#ffffff', 0.3), rgba('#ffffff', 0)]);
  ctx.fillRect(0, 0, 1, 1);
  glow(ctx, rgba('#ffffff', 1), px * 0.05, () => sparkle(ctx, 0.5, 0.5, r, '#ffffff', 1, 0));
  return c;
}
