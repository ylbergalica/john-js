// The Jet's sprites.
import { surface, rgba, glow, linear } from '../paint.js';

// The Jet, kin to the Seraph and a little bigger than the player: an arrowhead whose straight
// leading edges run back from its nose to clipped wingtips, its trailing edges sweeping
// forward into twin engine pods, a notch between them. The hull runs from the nose round its
// right half to the notch, mirrored; the engines' nozzles are at JET_ENGINES (its rig
// lights them).
const JET_HULL = [[0.87, 0.5], [0.2, 0.16], [0.15, 0.195], [0.29, 0.345], [0.13, 0.375], [0.13, 0.445], [0.21, 0.5]];

export const JET_ENGINES = [[0.13, 0.41], [0.13, 0.59]];

export function jetPath() {
  const bottom = JET_HULL.slice(1, -1).reverse().map(([x, y]) => [x, 1 - y]);
  const p = new Path2D();
  [...JET_HULL, ...bottom].forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  p.closePath();
  return p;
}

// Its rim, orange from the nose and reddening toward the engines.
export function jetOutline(S = 256) {
  const { c, ctx, px } = surface(S);
  ctx.strokeStyle = linear(ctx, 0.87, 0, 0.12, 0, ['#ffe6c4', '#ffa040', '#f2602a', '#d0202e']);
  glow(ctx, rgba('#ff6a24', 0.75), px * 0.035, () => {
    ctx.lineWidth = 0.04;
    ctx.stroke(jetPath());
  });
  return c;
}
