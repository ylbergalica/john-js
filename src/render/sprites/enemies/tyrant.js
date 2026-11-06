// The Tyrant's sprites.
import { TYRANT } from '../../../data/effects.js';
import { surface, rgba, glow, linear } from '../paint.js';
import { outline } from './common.js';

// The Tyrant's hull: a coffin-shaped wedge with two great horns swept back off its shoulders,
// in hazard yellow. `hull`: the upper half of its outline, [ahead, out] from its middle,
// from the flat of its nose round to its tail. Two slit `eyes` slant in towards its nose, and
// hazard `chevrons` run down its back, [tip ahead, back, out], dimmed to `chevronAlpha`. Its
// barrels are sprites of their own, `TYRANT_ART`, so its rig can fan them.
const TYRANT_BODY = {
  line: 0.04, eyeLine: 0.026, chevronLine: 0.024, chevronAlpha: 0.6,
  hull: [[0.2, 0.09], [0.13, 0.22], [0.04, 0.24], [-0.17, 0.37], [-0.1, 0.2], [-0.24, 0.12], [-0.19, 0]],
  eyes: [[0.14, 0.03], [0.05, 0.135]],
  chevrons: [[-0.02, -0.075, 0.1], [-0.09, -0.145, 0.085]],
};

const TYRANT_PALETTE = { stroke: ['#fff8b8', '#ffd400', '#c88a00'], glow: rgba('#ffc800', 0.7) };

// One barrel, along +x in a sprite `w` by `h` (world units, `unit` px each): its tube from
// `root`, tapering from half-width `gauge[0]` to `[1]` by `brake` along it, then a heavier
// muzzle brake of half-width `brakeGauge` to its `length`, TYRANT.reach - TYRANT.mount.
export const TYRANT_ART = {
  w: 1, h: 0.3, unit: 256, root: 0.06, length: TYRANT.reach - TYRANT.mount, gauge: [0.078, 0.056], brake: 0.6, brakeGauge: [0.094, 0.07], line: 0.026,
};

export function tyrantPath() {
  const { hull } = TYRANT_BODY, p = new Path2D();
  hull.forEach(([x, y], i) => (i ? p.lineTo(0.5 + x, 0.5 + y) : p.moveTo(0.5 + x, 0.5 + y)));
  for (let i = hull.length - 2; i >= 0; i--) p.lineTo(0.5 + hull[i][0], 0.5 - hull[i][1]);
  p.closePath();
  return p;
}

export function tyrantOutline(S = 256) {
  const { line, eyeLine, chevronLine, chevronAlpha, eyes: [e0, e1], chevrons } = TYRANT_BODY;
  return outline(S, TYRANT_PALETTE, (ctx) => {
    ctx.lineJoin = 'miter';
    ctx.lineWidth = line;
    ctx.stroke(tyrantPath());
    ctx.lineWidth = eyeLine;
    ctx.lineCap = 'butt';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0.5 + e0[0], 0.5 + side * e0[1]);
      ctx.lineTo(0.5 + e1[0], 0.5 + side * e1[1]);
      ctx.stroke();
    }
    ctx.globalAlpha = chevronAlpha;
    ctx.lineWidth = chevronLine;
    for (const [tip, back, out] of chevrons) {
      ctx.beginPath();
      ctx.moveTo(0.5 + back, 0.5 - out);
      ctx.lineTo(0.5 + tip, 0.5);
      ctx.lineTo(0.5 + back, 0.5 + out);
      ctx.stroke();
    }
  });
}

export function tyrantBarrel() {
  const { w, h, unit, root, length, gauge: [g0, g1], brake, brakeGauge: [b0, b1], line } = TYRANT_ART;
  const { c, ctx, px } = surface(Math.round(w * unit), Math.round(h * unit), unit), y = h / 2, end = root + length;
  const p = new Path2D();
  p.moveTo(root, y - g0);
  p.lineTo(root + brake, y - g1);
  p.lineTo(root + brake, y - b0);
  p.lineTo(end, y - b1);
  p.lineTo(end, y + b1);
  p.lineTo(root + brake, y + b0);
  p.lineTo(root + brake, y + g1);
  p.lineTo(root, y + g0);
  p.closePath();
  ctx.fillStyle = '#1c1600';
  ctx.fill(p);
  ctx.strokeStyle = linear(ctx, root, 0, end, 0, ['#c88a00', '#ffd400', '#fff8b8']);
  ctx.lineWidth = line;
  ctx.lineJoin = 'miter';
  glow(ctx, TYRANT_PALETTE.glow, px * 0.03, () => ctx.stroke(p));
  return c;
}
