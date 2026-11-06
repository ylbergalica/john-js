// The Revenant's sprites.
import { REVENANT } from '../../../data/effects.js';
import { surface, rgba, glow, linear } from '../paint.js';
import { outline } from './common.js';

// The Revenant: gaunt, all shoulders and no flesh, its head a narrow point ahead (`hull`, its
// top half from the point back, in a unit square from its middle, mirrored below), with two
// slit eyes and a rib down its back, in pale verdigris round a dark core. Its needle is a sprite
// of its own, `REVENANT_ART.unit` px a tile, its rig holding it by the guard (`rootX`).
const REVENANT_BODY = {
  hull: [[0.31, 0], [0.18, -0.065], [0.09, -0.09], [0.02, -0.33], [-0.05, -0.2], [-0.1, -0.13], [-0.13, -0.05], [-0.19, 0]], line: 0.036,
  eyes: [[0.2, 0.018], [0.12, 0.052]], eyeLine: 0.02, rib: [0.03, -0.16], ribLine: 0.018, ribAlpha: 0.55,
};

const REVENANT_PALETTE = { stroke: ['#ecfff7', '#aeeed8', '#58b89c'], glow: rgba('#7fe0c0', 0.7) };

export const REVENANT_ART = { w: 2.7, h: 0.36, rootX: 0.3, rootY: 0.18, unit: 170, grip: 0.24, guard: 0.1, gauge: 0.032, len: REVENANT.needle.len };

export function revenantPath() {
  const { hull } = REVENANT_BODY, p = new Path2D();
  hull.forEach(([x, y], i) => (i ? p.lineTo(0.5 + x, 0.5 + y) : p.moveTo(0.5 + x, 0.5 + y)));
  for (let i = hull.length - 2; i > 0; i--) p.lineTo(0.5 + hull[i][0], 0.5 - hull[i][1]);
  p.closePath();
  return p;
}

export function revenantOutline(S = 256) {
  const { line, eyes: [e0, e1], eyeLine, rib, ribLine, ribAlpha } = REVENANT_BODY;
  return outline(S, REVENANT_PALETTE, (ctx) => {
    ctx.lineJoin = 'miter';
    ctx.lineWidth = line;
    ctx.stroke(revenantPath());
    ctx.lineCap = 'butt';
    ctx.lineWidth = eyeLine;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0.5 + e0[0], 0.5 + side * e0[1]);
      ctx.lineTo(0.5 + e1[0], 0.5 + side * e1[1]);
      ctx.stroke();
    }
    ctx.globalAlpha = ribAlpha;
    ctx.lineWidth = ribLine;
    ctx.beginPath();
    ctx.moveTo(0.5 + rib[0], 0.5);
    ctx.lineTo(0.5 + rib[1], 0.5);
    ctx.stroke();
  });
}

// The needle, pointing along +x from its guard: a thin grip, a little crossbar, then steel
// tapering to nothing with a white-hot line down its middle.
export function revenantNeedle() {
  const { w, h, rootX, rootY, unit, grip, guard, gauge, len } = REVENANT_ART;
  const { c, ctx, px } = surface(Math.round(w * unit), Math.round(h * unit), unit);
  ctx.translate(rootX, rootY);
  glow(ctx, rgba('#7fe0c0', 0.7), px * 0.05, () => {
    ctx.strokeStyle = '#6fbfa8';
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(-grip, 0);
    ctx.lineTo(0, 0);
    ctx.stroke();
    ctx.strokeStyle = '#d8fff0';
    ctx.lineWidth = 0.04;
    ctx.beginPath();
    ctx.moveTo(0, -guard);
    ctx.lineTo(0, guard);
    ctx.stroke();
    const blade = new Path2D();
    blade.moveTo(0, -gauge);
    blade.lineTo(len, 0);
    blade.lineTo(0, gauge);
    blade.closePath();
    ctx.fillStyle = linear(ctx, 0, 0, len, 0, ['#8fd8c0', '#d8fff0', '#ffffff']);
    ctx.fill(blade);
  });
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 0.012;
  ctx.beginPath();
  ctx.moveTo(0.02, 0);
  ctx.lineTo(len * 0.96, 0);
  ctx.stroke();
  return c;
}
