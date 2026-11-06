// The Weaver's sprites.
import { seededRandom, lerp, TAU } from '../../../engine/math.js';
import { WEAVER_LEGS } from '../../../data/effects.js';
import { surface, rgba, glow, radial } from '../paint.js';
import { VOIDS, outline, voidFill } from './common.js';

// The Weaver's body, seen from above: a spider's abdomen behind and head ahead, each an
// ellipse [centre x, half length, half width], joined where they meet, all but black inside
// a dim silver edge so it still reads on the dark floor. Two little `fangs` curl in at its
// front, each [root x, root y, tip x, tip y] (the right's; the left mirrored). On its
// abdomen a pale hourglass (`mark`: the two triangles' far ends and widths, meeting at
// `mark.at`), and on its head a cluster of glowing `eyes`, each [x, y, radius] (both sides).
// Its legs are drawn by its rig (WEAVER_LEGS, src/enemies/weaverRig.js).
const WEAVER = {
  abdomen: [0.43, 0.155, 0.13], head: [0.655, 0.125, 0.105], line: 0.045,
  fangs: [[0.76, 0.47, 0.805, 0.478]], fangLine: 0.026,
  mark: { at: 0.425, back: [0.345, 0.04], front: [0.49, 0.03], color: '#c8bdf0' },
  eyes: [[0.738, 0.474, 0.016], [0.716, 0.45, 0.011], [0.694, 0.461, 0.008], [0.703, 0.489, 0.0065]],
  eyeColor: '#f2ecff', eyeGlow: '#b6a6ff',
};

const WEAVER_PALETTE = { stroke: ['#aaa4c4', '#827ca2', '#57516f'], glow: rgba('#7c72b8', 0.55) };

// The Weaver's knee for a leg from `hip` to `foot` (WEAVER_LEGS: `femur` then `tibia`
// long), in its frame (its centre at the origin): of the two places it could bend, the one
// further out from its body, so every leg bows outward. A foot out of reach pulls the leg
// straight; one too close folds it as far as it goes.
export function weaverKnee(hip, foot, L = WEAVER_LEGS) {
  const dx = foot.x - hip.x, dy = foot.y - hip.y, len = Math.hypot(dx, dy) || 1e-6;
  const d = Math.min(L.femur + L.tibia - 1e-3, Math.max(Math.abs(L.femur - L.tibia) + 1e-3, len));
  const a = (L.femur ** 2 - L.tibia ** 2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L.femur ** 2 - a * a));
  const ux = dx / len, uy = dy / len, px = hip.x + ux * a, py = hip.y + uy * a;
  const k1 = { x: px - uy * h, y: py + ux * h }, k2 = { x: px + uy * h, y: py - ux * h };
  return k1.x ** 2 + k1.y ** 2 >= k2.x ** 2 + k2.y ** 2 ? k1 : k2;
}

// Its legs at rest in its frame, right ones first then left, front first: [{ hip, foot, side, i }].
export function weaverLegsRest(L = WEAVER_LEGS) {
  return [1, -1].flatMap((side) => L.legs.map(([hx, hy, fx, fy], i) => ({ hip: { x: hx, y: hy * side }, foot: { x: fx, y: fy * side }, side, i })));
}

// Its abdomen and head as one outline: the head's front, then the abdomen round the back,
// each without the part inside the other, so the waist between them pinches in.
function weaverPath() {
  const [ax, arx, ary] = WEAVER.abdomen, [hx, hrx, hry] = WEAVER.head, N = 120;
  const inside = (x, y, cx, rx, ry) => ((x - cx) / rx) ** 2 + ((y - 0.5) / ry) ** 2 < 1;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const t = -Math.PI + (TAU * i) / N, x = hx + Math.cos(t) * hrx, y = 0.5 + Math.sin(t) * hry;
    if (!inside(x, y, ax, arx, ary)) pts.push([x, y]);
  }
  for (let i = 0; i <= N; i++) {
    const t = (TAU * i) / N, x = ax + Math.cos(t) * arx, y = 0.5 + Math.sin(t) * ary;
    if (!inside(x, y, hx, hrx, hry)) pts.push([x, y]);
  }
  const p = new Path2D();
  pts.forEach((pt, i) => (i ? p.lineTo(...pt) : p.moveTo(...pt)));
  p.closePath();
  return p;
}

// Its fangs, curling in at its front, both sides.
function weaverFangs() {
  const p = new Path2D();
  for (const [x0, y0, x1, y1] of WEAVER.fangs) {
    for (const s of [1, -1]) {
      const y = (v) => 0.5 + (v - 0.5) * s;
      p.moveTo(x0, y(y0));
      p.quadraticCurveTo(x1 + 0.012, y(y0 - 0.018), x1, y(y1));
    }
  }
  return p;
}

export function weaverOutline(S = 256) {
  return outline(S, WEAVER_PALETTE, (ctx) => {
    ctx.lineWidth = WEAVER.line;
    ctx.stroke(weaverPath());
    ctx.lineWidth = WEAVER.fangLine;
    ctx.stroke(weaverFangs());
  });
}

// Its near-black nebula, the pale hourglass on its abdomen and its glowing eyes.
export function weaverVoid() {
  const c = voidFill(weaverPath(), VOIDS.weaver), ctx = c.getContext('2d'); // still drawing only over the body
  const { at, back: [bx, bw], front: [fx, fw], color } = WEAVER.mark, S = c.width;
  glow(ctx, rgba(color, 0.8), S * 0.025, () => {
    ctx.fillStyle = rgba(color, 0.5);
    ctx.beginPath();
    ctx.moveTo(bx, 0.5 - bw); ctx.lineTo(at, 0.5); ctx.lineTo(bx, 0.5 + bw); ctx.closePath();
    ctx.moveTo(fx, 0.5 - fw); ctx.lineTo(at + 0.004, 0.5); ctx.lineTo(fx, 0.5 + fw); ctx.closePath();
    ctx.fill();
  });
  for (const [x, y, r] of WEAVER.eyes) {
    for (const yy of [y, 1 - y]) {
      glow(ctx, WEAVER.eyeGlow, S * 0.02, () => {
        ctx.fillStyle = WEAVER.eyeColor;
        ctx.beginPath(); ctx.arc(x, yy, r, 0, TAU); ctx.fill();
      });
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(x + r * 0.25, yy - r * 0.25, r * 0.35, 0, TAU); ctx.fill(); // a glint
    }
  }
  return c;
}

// A drop of dew on a strung thread (Thread): a sharp four-point star, white, its tips DEW_TIP
// out from its middle (the texture is 1 across).
export const DEW_TIP = 0.46;

export function silkDew(S = 64) {
  const { c, ctx } = surface(S);
  const R = DEW_TIP, k = R * 0.18;
  ctx.translate(0.5, 0.5);
  ctx.beginPath();
  [[R, 0], [k, k], [0, R], [-k, k], [-R, 0], [-k, -k], [0, -R], [k, -k]].forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  return c;
}

// An anchor or ball of web (SilkLook): a white knot of strands looped round and round a bright dot.
export function silkKnot(S = 64) {
  const { c, ctx, px } = surface(S);
  const rand = seededRandom(83);
  glow(ctx, rgba('#ffffff', 0.7), px * 0.06, () => {
    ctx.strokeStyle = '#ffffff';
    for (let i = 0; i < 7; i++) {
      ctx.save();
      ctx.translate(0.5, 0.5);
      ctx.rotate(rand() * TAU);
      ctx.globalAlpha = lerp(0.55, 1, rand());
      ctx.lineWidth = lerp(0.02, 0.04, rand());
      ctx.beginPath();
      ctx.ellipse(lerp(-0.04, 0.04, rand()), 0, lerp(0.22, 0.34, rand()), lerp(0.08, 0.16, rand()), 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  });
  ctx.globalAlpha = 1;
  ctx.fillStyle = radial(ctx, 0.5, 0.5, 0.14, ['#ffffff', rgba('#ffffff', 0)]);
  ctx.fillRect(0, 0, 1, 1);
  return c;
}
