// The Corsair's sprites.
import { lerp, smoothStep01, TAU } from '../../../engine/math.js';
import { surface, rgba, glow, linear, radial, sparkle } from '../paint.js';
import { VOIDS, outline, voidFill } from './common.js';

// The Corsair's body: a plain circle, dark yellow with pale yellow `patches` on it, each [x,
// y, radius, turn, squash] (squashed across to `squash` of its radius). Its cape is cloth,
// simulated and drawn by its rig (CAPES, src/enemies/cape.js).
const CORSAIR = { r: 0.31, line: 0.045, patch: '#f6e6a4', patches: [[0.36, 0.6, 0.12, -0.5, 0.6], [0.6, 0.36, 0.09, 0.6, 0.7], [0.66, 0.62, 0.06, 0.1, 0.9]] };

const CORSAIR_PALETTE = { stroke: ['#fff2bc', '#e8b830', '#9a6c10'], glow: rgba('#e0a820', 0.65) };

// The Corsair's scimitar, a separate sprite so it can be swung: a curved blade `len` along
// +x from the guard, its spine bowing `curve` toward +y by the tip (the right hand's; the
// left is mirrored), so its cutting edge, the convex one, faces -y. Slim at the guard, its
// back (+y) runs `back` from the spine until `bumpAt` of the way along, where it steps
// sharply out to `bump`, leaving a crisp corner: the scimitar's bump. From there the back
// tapers steadily down to the point, which curls back with the spine, while the edge
// swells out into a belly `belly` thick (`bellyAt` of the way along) and rounds off into
// it. Behind the guard, a yellow `handle` and a pommel. World units: the sprite is `w` × `h`
// with the guard `rootX` in from the left and `rootY` down from the top, `unit` px per
// unit. `cue`: where along it (× len) the parry cue flashes.
export const SCIMITAR_ART = {
  w: 1.24, h: 0.62, rootX: 0.26, rootY: 0.17, unit: 216, len: 0.88, curve: 0.34, handle: 0.16, cue: 0.72,
  back: 0.034, bumpAt: 0.46, bump: 0.14, belly: 0.075, bellyAt: 0.66,
};

// A point on the scimitar's spine `along` from the guard, in the sprite's frame (guard at 0).
export function scimitarAt(along) {
  const t = along / SCIMITAR_ART.len;
  return { x: along, y: SCIMITAR_ART.curve * t * t };
}

function corsairPath() {
  const p = new Path2D();
  p.arc(0.5, 0.5, CORSAIR.r, 0, TAU);
  return p;
}

export function corsairOutline(S = 256) {
  return outline(S, CORSAIR_PALETTE, (ctx) => {
    ctx.lineWidth = CORSAIR.line;
    ctx.stroke(corsairPath());
  });
}

// Its dark golden nebula with soft-edged pale patches laid over it.
export function corsairVoid() {
  const c = voidFill(corsairPath(), VOIDS.corsair), ctx = c.getContext('2d'); // still drawing only over the body
  for (const [x, y, r, turn, squash] of CORSAIR.patches) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(turn); ctx.scale(1, squash);
    ctx.fillStyle = radial(ctx, 0, 0, r, [rgba(CORSAIR.patch, 0.55), rgba(CORSAIR.patch, 0.42), rgba(CORSAIR.patch, 0)]);
    ctx.fillRect(-r, -r, 2 * r, 2 * r);
    ctx.restore();
  }
  return c;
}

// The scimitar: a pale steel blade with a white-hot cutting edge and a groove down its back,
// a gold guard with balled ends, a yellow handle bound in darker bands, and a pommel.
export function scimitar() {
  const { w, h, rootX, rootY, unit, len, handle, back, bumpAt, bump, belly, bellyAt } = SCIMITAR_ART;
  const { c, ctx, px } = surface(Math.round(w * unit), Math.round(h * unit), unit);
  ctx.translate(rootX, rootY);
  // `off` > 0 toward the edge (-y), square to the spine.
  const at = (t, off) => {
    const { x, y } = scimitarAt(t * len), slope = (2 * SCIMITAR_ART.curve * t) / len, l = Math.hypot(1, slope);
    return [x + (slope / l) * off, y - off / l];
  };
  // The edge swells into its belly, then rounds off into the point.
  const edgeW = (t) => (t < bellyAt ? lerp(0.04, belly, smoothStep01(t / bellyAt)) : belly * Math.sqrt(1 - ((t - bellyAt) / (1 - bellyAt)) ** 2));
  // Past the bump, the back tapers steadily down to the point.
  const from = bumpAt + 0.012, backW = (t) => bump * (1 - (t - from) / (1 - from)) ** 1.15;
  const N = 60, edge = [], spine = [];
  for (let i = 0; i <= N; i++) edge.push(at(i / N, edgeW(i / N)));
  for (let i = N; i >= 0 && i / N > from; i--) spine.push(at(i / N, -backW(i / N)));
  spine.push(at(from, -bump)); // the bump's corner
  spine.push(at(bumpAt, -back)); // and the step down at its foot
  for (let i = Math.floor(bumpAt * N); i >= 0; i--) spine.push(at(i / N, -back));
  const blade = new Path2D();
  blade.moveTo(...edge[0]);
  for (const pt of [...edge.slice(1), ...spine]) blade.lineTo(...pt);
  blade.closePath();
  ctx.save();
  ctx.lineJoin = 'miter'; // keeps the bump's corner and the point sharp
  glow(ctx, rgba('#ffe7a0', 0.8), px * 0.05, () => {
    ctx.strokeStyle = '#fff6dc';
    ctx.lineWidth = 0.032;
    ctx.stroke(blade);
  });
  ctx.restore();
  ctx.fillStyle = linear(ctx, 0, -0.06, 0, 0.24, ['#f4f0e2', '#b8b2a2', '#6e6858']);
  ctx.fill(blade);
  ctx.strokeStyle = '#ffffff'; // the cutting edge
  ctx.lineWidth = 0.016;
  ctx.beginPath();
  edge.slice(2).forEach((pt, i) => (i ? ctx.lineTo(...pt) : ctx.moveTo(...pt)));
  ctx.stroke();
  ctx.globalAlpha = 0.6; // the groove
  ctx.strokeStyle = '#5e584a';
  ctx.lineWidth = 0.01;
  ctx.beginPath();
  ctx.moveTo(...at(1 / N, -0.006));
  for (let i = 2; i <= Math.floor(N * bumpAt * 0.9); i++) ctx.lineTo(...at(i / N, -0.006));
  ctx.stroke();
  ctx.globalAlpha = 1;
  const gold = linear(ctx, 0, -0.08, 0, 0.08, ['#fff0a8', '#e8b830', '#8a5c0c']);
  glow(ctx, CORSAIR_PALETTE.glow, px * 0.03, () => {
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.roundRect(-handle, -0.026, handle, 0.052, 0.018); // the handle
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-handle - 0.022, 0, 0.032, 0, TAU); // the pommel
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(-0.03, -0.075, 0.034, 0.15, 0.014); // the guard
    for (const y of [-0.08, 0.08]) { ctx.moveTo(-0.013 + 0.026, y); ctx.arc(-0.013, y, 0.026, 0, TAU); }
    ctx.fill();
  });
  ctx.strokeStyle = rgba('#6a4808', 0.75); // the binding
  ctx.lineWidth = 0.012;
  ctx.beginPath();
  for (let x = -handle + 0.025; x < -0.035; x += 0.028) { ctx.moveTo(x, -0.024); ctx.lineTo(x + 0.012, 0.024); }
  ctx.stroke();
  sparkle(ctx, -handle - 0.022, 0, 0.04, '#fff6d0', 0.8);
  return c;
}
