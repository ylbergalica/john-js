// The Moray's sprites.
import { surface, rgba, glow } from '../paint.js';
import { outline } from './common.js';

// One of the Binary's stars: a small sun, a disc ringed by `rays` points, long and short in
// turn (`long`, `short` out from its middle, the notches between them `inner`), its rim
// lit from a white-hot middle out to its colour (`rims`: the first star's, then its twin's).
// The Moray's head: a blunt wedge, broadest at its jaws, narrowing to its neck, in orchid
// (`top`: its upper edge as bezier curves from the tip of its snout, [ahead, out] from its
// middle), with a slit `eye` in sulphur each side and the line of its `jaw` running back. Its
// fangs are sprites of their own, `MORAY_ART.fang`, so its rig can spread them: one fang, along
// +x from `root`, curling toward +y.
const MORAY_HEAD = {
  line: 0.032, jawLine: 0.018, eyeLine: 0.03,
  top: [[0.3, 0.075, 0.2, 0.135, 0.07, 0.165], [-0.06, 0.19, -0.18, 0.16, -0.27, 0.1]],
  eye: [[0.15, 0.058], [0.05, 0.105]],
  jaw: [[0.24, 0.05], [0.04, 0.135], [-0.13, 0.13]],
};

const MORAY_PALETTE = { stroke: ['#ffd9ee', '#ff4fa8', '#a8145f'], glow: rgba('#ff2f96', 0.7) };

export const MORAY_ART = { fang: { w: 0.62, h: 0.26, unit: 256, root: 0.04, length: 0.52, gauge: 0.052, line: 0.018 } };

export function morayPath() {
  const { top } = MORAY_HEAD, p = new Path2D(), X = (a) => 0.5 + a;
  p.moveTo(X(0.31), 0.5);
  for (const [a, b, c, d, e, f] of top) p.bezierCurveTo(X(a), 0.5 - b, X(c), 0.5 - d, X(e), 0.5 - f);
  p.lineTo(X(-0.27), 0.5 + 0.1);
  for (let i = top.length - 1; i >= 0; i--) {
    const [a, b, c, d] = top[i], [e, f] = i > 0 ? top[i - 1].slice(4) : [0.31, 0];
    p.bezierCurveTo(X(c), 0.5 + d, X(a), 0.5 + b, X(e), 0.5 + f);
  }
  p.closePath();
  return p;
}

export function morayOutline(S = 256) {
  const { line, jawLine, eyeLine, eye: [e0, e1], jaw: [j0, j1, j2] } = MORAY_HEAD;
  return outline(S, MORAY_PALETTE, (ctx) => {
    ctx.lineJoin = 'round';
    ctx.lineWidth = line;
    ctx.stroke(morayPath());
    for (const side of [-1, 1]) {
      ctx.lineWidth = jawLine;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0.5 + j0[0], 0.5 + side * j0[1]);
      ctx.quadraticCurveTo(0.5 + j1[0], 0.5 + side * j1[1], 0.5 + j2[0], 0.5 + side * j2[1]);
      ctx.stroke();
      const stroke = ctx.strokeStyle;
      ctx.strokeStyle = '#ffe45c';
      ctx.lineWidth = eyeLine;
      ctx.beginPath();
      ctx.moveTo(0.5 + e0[0], 0.5 + side * e0[1]);
      ctx.lineTo(0.5 + e1[0], 0.5 + side * e1[1]);
      ctx.stroke();
      ctx.strokeStyle = stroke;
    }
  });
}

export function morayFang() {
  const { w, h, unit, root, length, gauge, line } = MORAY_ART.fang;
  const { c, ctx, px } = surface(Math.round(w * unit), Math.round(h * unit), unit), y = h * 0.34, tip = root + length;
  const p = new Path2D();
  p.moveTo(root, y - gauge);
  p.quadraticCurveTo(root + length * 0.65, y - gauge, tip, y + h * 0.42);
  p.quadraticCurveTo(root + length * 0.45, y + gauge, root, y + gauge);
  p.closePath();
  ctx.fillStyle = '#fff0f7';
  ctx.fill(p);
  ctx.strokeStyle = '#ff4fa8';
  ctx.lineWidth = line;
  glow(ctx, MORAY_PALETTE.glow, px * 0.03, () => ctx.stroke(p));
  return c;
}
