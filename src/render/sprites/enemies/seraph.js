// The Seraph's sprites.
import { surface, rgba, glow, linear, radial, sparkle } from '../paint.js';
import { outline } from './common.js';

// The Seraph's hull, nose to the right: [x, y] for the top half, mirrored below.
// Nose, wingtip, trailing edge, engine nozzle (outer, inner), tail notch.
const SERAPH_HULL = [[0.9, 0.5], [0.15, 0.18], [0.27, 0.3], [0.17, 0.35], [0.2, 0.43], [0.33, 0.5]];

const SERAPH_ENGINES = [[0.17, 0.39], [0.17, 0.61]];

// A delta-winged star-fighter with twin engines in a notched tail.
function seraphPath() {
  const bottom = SERAPH_HULL.slice(1, -1).reverse().map(([x, y]) => [x, 1 - y]);
  const p = new Path2D();
  [...SERAPH_HULL, ...bottom].forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  p.closePath();
  return p;
}

// Hull outline with faint panel seams, a crystal canopy and star-glint engines.
export function seraphOutline(S = 256) {
  const palette = { stroke: ['#f4eeff', '#b9a4ff', '#6b58f0'], glow: rgba('#9a84ff', 0.75) };
  return outline(S, palette, (ctx) => {
    ctx.lineWidth = 0.04;
    ctx.stroke(seraphPath());
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 0.018;
    ctx.beginPath();
    ctx.moveTo(0.56, 0.5); ctx.lineTo(0.38, 0.5); // spine, behind the canopy
    for (const [x, y] of SERAPH_ENGINES) { ctx.moveTo(0.66, 0.5); ctx.lineTo(x + 0.08, y); } // seams out to the engines
    ctx.stroke();
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(0.76, 0.5); ctx.lineTo(0.64, 0.465); ctx.lineTo(0.57, 0.5); ctx.lineTo(0.64, 0.535);
    ctx.closePath();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
    ctx.globalAlpha = 1;
    for (const [x, y] of SERAPH_ENGINES) sparkle(ctx, x, y, 0.06, '#d9ceff', 0.95);
  });
}

// Its body: violet armour rather than a nebula, lit from ahead. Its fuselage (between the
// outline's seams out to the engines) a lighter plate with a raised spine; each wing
// plated, a glowing stripe down its leading edge, a chevron on it, a flap along its
// trailing edge and a running light at its tip; air intakes beside the canopy, which
// glows; and its engines' housings, hot inside.
export function seraphBody(S = 256) {
  const { c, ctx, px } = surface(S);
  const both = (draw) => { // the top half, and mirrored below
    for (const flip of [false, true]) {
      ctx.save();
      if (flip) { ctx.translate(0, 1); ctx.scale(1, -1); }
      draw();
      ctx.restore();
    }
  };
  const poly = (pts) => {
    const p = new Path2D();
    pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
    p.closePath();
    return p;
  };
  const line = (pts, color, alpha, width) => {
    ctx.strokeStyle = rgba(color, alpha);
    ctx.lineWidth = width;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  };
  const seam = (pts) => { line(pts, '#05030f', 0.7, 0.011); line(pts, '#c8b8ff', 0.3, 0.004); }; // a groove, its far lip catching the light
  ctx.clip(seraphPath());
  ctx.fillStyle = radial(ctx, 0.56, 0.5, 0.5, ['#3c2c86', '#21175a', '#0d0928'], 0.66, 0.46);
  ctx.fillRect(0, 0, 1, 1);
  both(() => {
    // Each wing in two plates, the outer darker; its flap along the trailing edge, darker still.
    ctx.fillStyle = rgba('#0a0620', 0.4);
    ctx.fill(poly([[0.47, 0.44], [0.33, 0.275], [0.15, 0.18], [0.27, 0.3], [0.25, 0.39]]));
    seam([[0.48, 0.445], [0.33, 0.275]]);
    ctx.fillStyle = rgba('#05030f', 0.55);
    ctx.fill(poly([[0.15, 0.18], [0.27, 0.3], [0.31, 0.285], [0.2, 0.19]]));
    seam([[0.2, 0.19], [0.31, 0.285]]);
    // The stripe of light down its leading edge.
    glow(ctx, rgba('#9a84ff', 0.9), px * 0.03, () => line([[0.7, 0.465], [0.24, 0.27]], '#d9ceff', 0.9, 0.009));
    // A chevron pointing ahead on its inner plate.
    glow(ctx, rgba('#9a84ff', 0.8), px * 0.02, () => {
      ctx.fillStyle = rgba('#b9a4ff', 0.75);
      ctx.fill(poly([[0.47, 0.395], [0.4, 0.36], [0.375, 0.365], [0.43, 0.395], [0.375, 0.425], [0.4, 0.43]]));
    });
  });
  // The fuselage, a lighter plate between the seams out to the engines, a raised spine down it.
  ctx.fillStyle = linear(ctx, 0.66, 0.5, 0.25, 0.5, ['#5440b0', '#2c2070']);
  ctx.fill(poly([[0.7, 0.5], [0.25, 0.37], [0.25, 0.63]]));
  ctx.fillStyle = linear(ctx, 0, 0.482, 0, 0.518, ['#9a88f0', '#4a38a0', '#1e1550']);
  ctx.fill(poly([[0.58, 0.5], [0.5, 0.482], [0.34, 0.486], [0.34, 0.514], [0.5, 0.518]]));
  both(() => {
    // Air intakes either side of the canopy, lit along their lips.
    ctx.fillStyle = '#04030c';
    ctx.fill(poly([[0.64, 0.452], [0.52, 0.425], [0.5, 0.442], [0.6, 0.466]]));
    line([[0.64, 0.452], [0.52, 0.425]], '#d9ceff', 0.7, 0.006);
    // The engine's housing, rimmed, hot inside, and the running light at the wingtip.
    const [x, y] = SERAPH_ENGINES[0];
    ctx.fillStyle = linear(ctx, 0, y - 0.045, 0, y + 0.045, ['#6a56c8', '#2a1e6a', '#120c30']);
    ctx.beginPath();
    ctx.roundRect(x - 0.02, y - 0.045, 0.18, 0.09, 0.04);
    ctx.fill();
    seam([[x + 0.12, y - 0.045], [x + 0.12, y + 0.045]]);
    ctx.fillStyle = radial(ctx, x, y, 0.09, [rgba('#ffffff', 0.95), rgba('#a88cff', 0.75), rgba('#3fa8ff', 0)]);
    ctx.fillRect(x - 0.09, y - 0.09, 0.18, 0.18);
    ctx.fillStyle = radial(ctx, 0.19, 0.205, 0.035, [rgba('#e6f6ff', 1), rgba('#3fa8ff', 0)]);
    ctx.fillRect(0.15, 0.17, 0.08, 0.08);
  });
  // The canopy's glow, under the outline's crystal.
  ctx.fillStyle = radial(ctx, 0.66, 0.5, 0.12, [rgba('#e8e0ff', 0.8), rgba('#8a63ff', 0.35), rgba('#8a63ff', 0)]);
  ctx.fillRect(0.5, 0.38, 0.3, 0.24);
  return c;
}
