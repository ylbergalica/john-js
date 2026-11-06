// The Rift aspect's sprites and icon.
import { seededRandom, lerp } from '../../../engine/math.js';
import { surface, rgba, easeOut, glow, linear, sparkle, space } from '../paint.js';

// ---------------------------------------------------------------- rift

// Rift blades in units of the texture width (128 px), relative to the texture
// centre: the upper blade, mirrored for the lower one. Round-topped with a straight
// front edge and three scalloped bites along the back. Pure white; the aspect sheds
// motes off them while they're out (src/aspects/rift.js).
function riftBladePath() {
  const p = new Path2D();
  p.moveTo(-0.18, -0.18);
  p.lineTo(0.17, -0.18);
  p.quadraticCurveTo(0.27, -0.2, 0.27, -0.36);
  p.lineTo(0.27, -1.3);
  p.bezierCurveTo(0.27, -1.72, 0.0, -1.9, -0.32, -1.84);
  p.quadraticCurveTo(-0.06, -1.62, -0.31, -1.34);
  p.quadraticCurveTo(-0.06, -1.1, -0.30, -0.84);
  p.quadraticCurveTo(-0.07, -0.6, -0.26, -0.33);
  p.closePath();
  return p;
}

const RIFT_PIVOT = [-0.15, -0.3];

export function riftFrames(mode, W = 128, H = 640) {
  const path = riftBladePath();
  const count = mode === 'open' ? 10 : 8;
  const frames = [];
  for (let i = 0; i < count; i++) {
    // `k` is how unfolded the blades are: 0 = folded forward and tiny, 1 = fully out.
    const u = (i + 1) / count;
    const k = mode === 'open' ? easeOut(u) : 1 - (i + 1) / (count + 1);
    const scale = mode === 'open' ? Math.min(1.06, lerp(0.16, 1, k) + 0.12 * Math.sin(Math.PI * u) * (u > 0.5 ? 1 : 0)) : lerp(0.16, 1, k);
    const fold = (1 - k) * 2; // folded, the blades point forward toward the centre line
    const burst = mode === 'open' ? Math.max(0, Math.sin(Math.PI * (u - 0.45) / 0.55)) * (u > 0.45 ? 1 : 0) : 0;
    const { c, ctx, px } = surface(W, H, W);
    ctx.globalAlpha = mode === 'close' ? lerp(0.55, 1, k) : 1;
    for (const sign of [-1, 1]) {
      ctx.save();
      ctx.translate(0.5, 2.5);
      ctx.scale(1, -sign); // sign -1 draws the upper blade, +1 the lower (mirrored)
      ctx.translate(...RIFT_PIVOT);
      ctx.rotate(fold);
      ctx.scale(scale, scale);
      ctx.translate(-RIFT_PIVOT[0], -RIFT_PIVOT[1]);
      glow(ctx, rgba('#ffffff', 0.75), px * lerp(0.1, 0.16, burst), () => {
        ctx.fillStyle = '#ffffff';
        ctx.fill(path);
      });
      ctx.restore();
    }
    frames.push(c);
  }
  return frames;
}

// A sweeping white claw: one broad blade with a thinner crescent hooked beneath it.
export function riftIcon(S = 256) {
  const { c, ctx, px } = surface(S);
  space(ctx, seededRandom(404), {
    core: '#170c30', edge: '#030208',
    nebulae: [[0.4, 0.55, 0.45, '#9b5cff', 0.35], [0.75, 0.3, 0.25, '#5d73ff', 0.15]],
  });
  const main = new Path2D();
  main.moveTo(0.1, 0.86);
  main.bezierCurveTo(0.12, 0.42, 0.5, 0.12, 0.9, 0.1);
  main.bezierCurveTo(0.6, 0.32, 0.44, 0.58, 0.36, 0.84);
  main.quadraticCurveTo(0.22, 0.95, 0.1, 0.86);
  const hook = new Path2D();
  hook.moveTo(0.4, 0.94);
  hook.bezierCurveTo(0.72, 0.92, 0.92, 0.66, 0.9, 0.3);
  hook.bezierCurveTo(0.82, 0.58, 0.66, 0.74, 0.46, 0.8);
  hook.quadraticCurveTo(0.38, 0.86, 0.4, 0.94);
  glow(ctx, rgba('#b57cff', 0.95), px * 0.07, () => {
    ctx.fillStyle = '#ece2ff';
    ctx.fill(main);
    ctx.fill(hook);
  });
  ctx.fillStyle = linear(ctx, 0.15, 0.85, 0.85, 0.15, ['#ffffff', '#ffffff', '#d4c4ff']);
  ctx.fill(main);
  ctx.fill(hook);
  sparkle(ctx, 0.9, 0.1, 0.07, '#ffffff', 1, 0.3);
  sparkle(ctx, 0.9, 0.3, 0.05, '#ffffff', 0.9, 0.1);
  return c;
}
