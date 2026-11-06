// The Comet's sprites.
import { seededRandom, lerp, clamp01, smoothStep01 } from '../../../engine/math.js';
import { surface, rgba, glow, linear } from '../paint.js';

// The Comet's head: a teardrop, its nose along +x, its shoulders sweeping back into three
// flames at its tail, white at the nose and burning down through ice blue.
export function cometPath() {
  const p = new Path2D();
  p.moveTo(0.87, 0.5);
  p.bezierCurveTo(0.8, 0.37, 0.66, 0.29, 0.5, 0.29);
  p.quadraticCurveTo(0.34, 0.27, 0.13, 0.2);
  p.quadraticCurveTo(0.29, 0.31, 0.36, 0.41);
  p.quadraticCurveTo(0.2, 0.42, 0.04, 0.5);
  p.quadraticCurveTo(0.2, 0.58, 0.36, 0.59);
  p.quadraticCurveTo(0.29, 0.69, 0.13, 0.8);
  p.quadraticCurveTo(0.34, 0.73, 0.5, 0.71);
  p.bezierCurveTo(0.66, 0.71, 0.8, 0.63, 0.87, 0.5);
  p.closePath();
  return p;
}

export function cometOutline(S = 256) {
  const { c, ctx, px } = surface(S);
  ctx.strokeStyle = linear(ctx, 0.87, 0, 0.04, 0, ['#ffffff', '#d6f8ff', '#6fe8ff', '#2a8cff']);
  glow(ctx, rgba('#6fe8ff', 0.8), px * 0.04, () => {
    ctx.lineWidth = 0.042;
    ctx.stroke(cometPath());
  });
  return c;
}

// One strip's colour by `heat` 0…1: deep blue, ice blue, white-hot.
function cometHeat(heat) {
  const mix = (a, b, k) => a.map((v, i) => lerp(v, b[i], k));
  return heat < 0.5 ? mix([30, 90, 230], [111, 232, 255], heat * 2) : mix([111, 232, 255], [255, 255, 255], (heat - 0.5) * 2);
}

// The Comet's tail along x, its root at the right, streaked lengthways, white down its middle
// and blue out to its edges, fading away toward its end.
export function cometTail(W = 256, H = 64) {
  const { c, ctx } = surface(W, H, W), img = ctx.createImageData(W, H), rand = seededRandom(137);
  const streaks = Array.from({ length: H }, () => rand());
  for (let y = 0; y < H; y++) {
    const across = Math.abs((y + 0.5) / H - 0.5) * 2, streak = 0.8 + 0.4 * streaks[y];
    for (let x = 0; x < W; x++) {
      const u = x / (W - 1), i = (y * W + x) * 4, a = (1 - across) ** 1.4 * u ** 1.1 * streak;
      const [r, g, b] = cometHeat(clamp01((1 - across) * 0.5 + u * 0.75 - 0.15));
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b;
      img.data[i + 3] = 255 * clamp01(a);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// The Comet's wake: u is how hot it burns, v across it. Hot, a white line down a wide ice-blue
// burn; cooling, the burn draws in and darkens to blue; dead, nothing, so it can fade by u alone.
export function cometWake(W = 128, H = 64) {
  const { c, ctx } = surface(W, H, W), img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const across = Math.abs((y + 0.5) / H - 0.5) * 2;
    for (let x = 0; x < W; x++) {
      const h = x / (W - 1), i = (y * W + x) * 4, reach = lerp(0.8, 1, h); // nearly as wide however hot, so how wide it looks is how wide it hurts (Wake.halfWidth)
      const soft = clamp01(1 - across / reach) ** 1, core = smoothStep01(clamp01(1 - across / (reach * 0.55)));
      const a = soft * lerp(0, 0.72, smoothStep01(clamp01(h * 2.2))) + core * h ** 1.2 * 0.85;
      const [r, g, b] = cometHeat(clamp01(core * h * 1.1 + h * 0.45));
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b;
      img.data[i + 3] = 255 * clamp01(a);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
