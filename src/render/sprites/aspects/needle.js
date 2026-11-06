// The Needle aspect's sprites and icon.
import { seededRandom } from '../../../engine/math.js';
import { DEG, surface, rgba, glow, linear, sparkle, space } from '../paint.js';

// ---------------------------------------------------------------- needle

// A grey needle darting up toward the top right out of a faint grey trail, a glint at its tip.
export function needleIcon(S = 256) {
  const { c, ctx, px } = surface(S);
  space(ctx, seededRandom(1213), {
    core: '#15171d', edge: '#030304', stars: 26,
    nebulae: [[0.55, 0.45, 0.45, '#9aa2b4', 0.22], [0.25, 0.75, 0.3, '#d8dce6', 0.08]],
  });
  ctx.save();
  ctx.translate(0.5, 0.5);
  ctx.rotate(-45 * DEG);
  // The trail: a thin taper fading back from the needle's tail.
  ctx.fillStyle = linear(ctx, -0.5, 0, -0.12, 0, [rgba('#c8ccd6', 0), rgba('#c8ccd6', 0.5)]);
  ctx.beginPath();
  ctx.moveTo(-0.12, -0.012); ctx.lineTo(-0.5, 0); ctx.lineTo(-0.12, 0.012);
  ctx.fill();
  const spike = new Path2D();
  spike.moveTo(0.36, 0); spike.lineTo(-0.06, 0.035); spike.lineTo(-0.16, 0); spike.lineTo(-0.06, -0.035); spike.closePath();
  glow(ctx, rgba('#d8dce6', 0.8), px * 0.05, () => { ctx.fillStyle = '#b8bcc6'; ctx.fill(spike); });
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0.36, 0); ctx.lineTo(-0.06, -0.035); ctx.lineTo(-0.06, -0.004);
  ctx.fill();
  ctx.restore();
  sparkle(ctx, 0.5 + Math.SQRT1_2 * 0.36, 0.5 - Math.SQRT1_2 * 0.36, 0.06, '#ffffff', 0.9, 0.3);
  return c;
}
