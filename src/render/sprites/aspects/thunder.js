// The Thunder aspect's sprites and icon.
import { seededRandom, lerp } from '../../../engine/math.js';
import { DEG, surface, rgba, glow, radial, sparkle, space } from '../paint.js';

// ---------------------------------------------------------------- thunder

// Thunder leaping all over the box from a flare in the middle: thick jagged bolts, white-hot
// in bands of purple under a wide glow, forking and sprouting, lighting every point they strike.
export function thunderIcon(S = 256) {
  const { c, ctx, px } = surface(S);
  const rand = seededRandom(919);
  space(ctx, rand, {
    core: '#12062a', edge: '#030108', stars: 20,
    nebulae: [[0.5, 0.5, 0.48, '#8a2cff', 0.38], [0.25, 0.75, 0.3, '#c46bff', 0.14]],
  });
  ctx.fillStyle = radial(ctx, 0.38, 0.7, 0.4, [rgba('#d9a8ff', 0.35), rgba('#8a2cff', 0.12), rgba('#8a2cff', 0)]);
  ctx.fillRect(0, 0, 1, 1);
  // Midpoint displacement, as in src/aspects/thunder.js.
  const jag = (a, b, step, rough) => {
    const pts = [a];
    const split = (p, q) => {
      const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy);
      if (l <= step) { pts.push(q); return; }
      const off = (rand() - 0.5) * rough * l, m = [(p[0] + q[0]) / 2 - (dy / l) * off, (p[1] + q[1]) / 2 + (dx / l) * off];
      split(p, m);
      split(m, q);
    };
    split(a, b);
    return pts;
  };
  // A clap caught mid-leap: out of the middle to struck points all over the box, forks off
  // the bolts to more of them, and a few running on off the edges. `w` scales a bolt's width.
  const bolts = [];
  const bolt = (a, b, w) => {
    const pts = jag(a, b, 0.04, 0.55);
    bolts.push({ pts, w });
    // Thin sprouts off some of its points.
    pts.forEach(([x, y], i) => {
      if (i === 0 || i >= pts.length - 2 || rand() > 0.35) return;
      const [nx, ny] = pts[i + 1], dir = Math.atan2(ny - y, nx - x) + (rand() < 0.5 ? -1 : 1) * lerp(25, 70, rand()) * DEG;
      const len = lerp(0.05, 0.14, rand());
      bolts.push({ pts: jag([x, y], [x + Math.cos(dir) * len, y + Math.sin(dir) * len], 0.02, 0.6), w: w * 0.35 });
    });
    return pts;
  };
  const on = (pts, t) => pts[Math.round(t * (pts.length - 1))];
  const O = [0.5, 0.47], B = [0.15, 0.17], C = [0.84, 0.21], D = [0.17, 0.8], E = [0.8, 0.83], G = [0.9, 0.52];
  const ob = bolt(O, B, 1), oe = bolt(O, E, 1), oc = bolt(O, C, 0.85);
  bolt(on(oe, 0.45), D, 0.75);
  bolt(on(oc, 0.55), G, 0.65);
  bolt(on(ob, 0.5), [0.02, 0.5], 0.55);
  bolt(B, [0.36, -0.03], 0.5);
  bolt(D, [0.45, 1.03], 0.55);
  bolt(G, [1.03, 0.68], 0.45);
  bolt(C, [1.03, 0.06], 0.45);
  const line = (pts, width, style) => {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
    ctx.lineWidth = width;
    ctx.strokeStyle = style;
    ctx.stroke();
  };
  const all = (width, style) => { for (const b of bolts) line(b.pts, width * b.w, style); };
  ctx.save();
  ctx.filter = `blur(${px * 0.03}px)`;
  all(0.16, rgba('#8a2cff', 0.8));
  ctx.restore();
  glow(ctx, rgba('#b45cff', 1), px * 0.035, () => all(0.07, '#a94dff'));
  all(0.07, '#a94dff');
  ctx.save();
  ctx.filter = `blur(${px * 0.003}px)`;
  all(0.026, '#ffffff');
  ctx.restore();
  // Every point struck lights up, the one it came out of most.
  for (const [[x, y], r, star] of [[O, 0.2, 0.1], [B, 0.1, 0.045], [C, 0.1, 0.045], [D, 0.1, 0.045], [E, 0.1, 0.045], [G, 0.08, 0.035]]) {
    ctx.fillStyle = radial(ctx, x, y, r, [rgba('#ffffff', 0.9), rgba('#c98cff', 0.45), rgba('#8a2cff', 0)]);
    ctx.fillRect(0, 0, 1, 1);
    sparkle(ctx, x, y, star, '#ffffff', 1, rand());
  }
  return c;
}
