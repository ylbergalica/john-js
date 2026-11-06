// The Shade's sprites.
import { lerp, clamp01, smoothStep01 } from '../../../engine/math.js';
import { DEG, surface, rgba, polar, glow } from '../paint.js';
import { VOIDS, outline } from './common.js';

// The Shade's body: rounded at the front, its back drawn out into three points, the
// tallest straight back, split by two sharp notches, mirrored. `back` lists the right half
// from the side round to the middle of the back as [angle°, height past the rim] (180° is
// straight back; below 0 cuts into the circle), joined by straight edges.
const SHADE = { r: 0.31, line: 0.045, back: [[116, 0], [143, 0.08], [159, -0.045], [180, 0.11]] };

const SHADE_PALETTE = { stroke: ['#878c96', '#878c96'], glow: rgba('#7c8392', 0.5) };

// The Shade's arms, a separate sprite so they can be swung: a crescent blade, thick in the
// middle and pointed at the tip, whose spine runs `len` along an arc of radius `bend`,
// starting from its root heading +x and curving toward -y (the right arm; the left is
// mirrored). Its inner edge is smooth, its outer edge barbed once `barb` of the way along.
// World units: the sprite is `w` × `h` with the root `rootX` in from the left and `rootY`
// down from the top, `unit` px per unit; `width` is half its thickness at the widest.
// `cue`: where along it (× len) the parry cue flashes.
export const BLADE_ART = { w: 0.86, h: 0.82, rootX: 0.08, rootY: 0.71, unit: 216, len: 1, bend: 0.68, width: 0.055, barb: 0.48, cue: 0.75 };

// A point on the blade's spine `along` from the root, in the sprite's frame (root at 0).
export function bladeAt(along) {
  const R = BLADE_ART.bend, a = along / R;
  return { x: R * Math.sin(a), y: -R * (1 - Math.cos(a)) };
}

export function shadePath() {
  const { r, back } = SHADE;
  const right = back.map(([a, h]) => [a, r + h]);
  const left = right.slice(0, -1).reverse().map(([a, rad]) => [360 - a, rad]);
  const p = new Path2D();
  p.arc(0.5, 0.5, r, -back[0][0] * DEG, back[0][0] * DEG);
  for (const [a, rad] of [...right.slice(1), ...left]) p.lineTo(...polar(0.5, 0.5, a, rad));
  p.closePath();
  return p;
}

export function shadeOutline(S = 256) {
  return outline(S, SHADE_PALETTE, (ctx) => {
    ctx.lineWidth = SHADE.line;
    ctx.lineJoin = 'miter'; // keeps the points and notches sharp
    ctx.stroke(shadePath());
  });
}

// One arm: a crescent blade, widest a little before the middle, its outer edge stepping
// out to a single barb that points toward the tip.
export function shadeBlade() {
  const { w, h, rootX, rootY, unit, len, bend, width, barb } = BLADE_ART;
  const { c, ctx, px } = surface(Math.round(w * unit), Math.round(h * unit), unit);
  ctx.translate(rootX, rootY);
  // Half its thickness `t` of the way along: slim at the root, full by 0.4, then tapering.
  const half = (t) => (t < 0.4 ? lerp(0.35, 1, smoothStep01(t / 0.4)) : (1 - (t - 0.4) / 0.6) ** 0.85) * width;
  // `off` > 0: outward, away from the curve's centre.
  const edge = (t, off) => {
    const a = (t * len) / bend, { x, y } = bladeAt(t * len);
    return [x + Math.sin(a) * off, y + Math.cos(a) * off];
  };
  const N = 28, outer = [], inner = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, rise = clamp01((t - (barb - 0.16)) / 0.16);
    inner.push(edge(t, -half(t)));
    if (t > barb && t - 1 / N <= barb) outer.push(edge(barb, half(barb) + width * 1.1), edge(barb + 0.01, half(barb + 0.01))); // the barb
    else outer.push(edge(t, half(t) + (t < barb ? rise * rise * width * 1.1 : 0)));
  }
  const path = new Path2D();
  path.moveTo(...inner[0]);
  for (const pt of inner.slice(1)) path.lineTo(...pt);
  for (const pt of outer.reverse()) path.lineTo(...pt);
  path.quadraticCurveTo(-width * 0.9, 0, ...inner[0]);
  ctx.fillStyle = VOIDS.shade.core;
  ctx.fill(path);
  glow(ctx, SHADE_PALETTE.glow, px * 0.03, () => {
    ctx.strokeStyle = SHADE_PALETTE.stroke[0];
    ctx.lineWidth = SHADE.line * 0.75;
    ctx.stroke(path);
  });
  return c;
}
