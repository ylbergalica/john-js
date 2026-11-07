// The Moonsilk aspect's icon.
import { seededRandom, lerp, TAU } from '../../../engine/math.js';
import { surface, rgba, radial, sparkle } from '../paint.js';

// A smooth line through `pts` ([x, y]), `per` samples between each two (Catmull-Rom).
function smooth(pts, per = 24) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let s = 0; s < per; s++) {
      const t = s / per, t2 = t * t, t3 = t2 * t;
      const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// Each point's unit normal along a line.
function normals(line) {
  return line.map((_, i) => {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return [-dy / l, dx / l];
  });
}

// A rope of silk along `line`, `width(u)` thick (u: 0 → 1 along it), the hand's slight tremor
// in its edges: a soft white body, a bright core down one side where the light catches it, and
// its strands twisting round it, drawn as slanted strokes across it.
function rope(ctx, line, width, { alpha = 1, rand, twist = 0.022 } = {}) {
  const n = normals(line), last = line.length - 1;
  const w = line.map((_, i) => width(i / last) * (1 + (rand() - 0.5) * 0.08));
  const body = new Path2D();
  line.forEach(([x, y], i) => (i ? body.lineTo(x + n[i][0] * w[i], y + n[i][1] * w[i]) : body.moveTo(x + n[i][0] * w[i], y + n[i][1] * w[i])));
  for (let i = last; i >= 0; i--) body.lineTo(line[i][0] - n[i][0] * w[i], line[i][1] - n[i][1] * w[i]);
  body.closePath();
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#e9edf5';
  ctx.fill(body);
  ctx.clip(body);
  // Shade on the far side, light on the near.
  ctx.lineCap = 'round';
  for (const [side, color, k] of [[-0.55, rgba('#8e98ad', 0.55), 0.7], [0.4, rgba('#ffffff', 0.95), 0.45]]) {
    ctx.beginPath();
    line.forEach(([x, y], i) => (i ? ctx.lineTo(x + n[i][0] * w[i] * side, y + n[i][1] * w[i] * side) : ctx.moveTo(x + n[i][0] * w[i] * side, y + n[i][1] * w[i] * side)));
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(...w) * k;
    ctx.stroke();
  }
  // The twist: a stroke across it every so often, slanting along it.
  let run = 0;
  ctx.strokeStyle = rgba('#7c869c', 0.5);
  for (let i = 1; i <= last; i++) {
    run += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
    const gap = twist * lerp(0.6, 1.4, w[i] / Math.max(...w));
    if (run < gap) continue;
    run = 0;
    const [x, y] = line[i], [nx, ny] = n[i], tx = ny, ty = -nx, s = w[i];
    ctx.lineWidth = s * 0.2;
    ctx.beginPath();
    ctx.moveTo(x + nx * s * 1.1 - tx * s * 0.9, y + ny * s * 1.1 - ty * s * 0.9);
    ctx.quadraticCurveTo(x + tx * s * 0.2, y + ty * s * 0.2, x - nx * s * 1.1 + tx * s * 0.9, y - ny * s * 1.1 + ty * s * 0.9);
    ctx.stroke();
  }
  ctx.restore();
}

// A slender four-point star `r` across, its rays pinched to `waist` of that, turned `rot`.
function star(ctx, x, y, r, waist, rot, alpha = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha = alpha;
  const k = r * waist;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.bezierCurveTo(k * 2, k * 0.6, k * 0.6, k * 2, 0, r);
  ctx.bezierCurveTo(-k * 0.6, k * 2, -k * 2, k * 0.6, -r, 0);
  ctx.bezierCurveTo(-k * 2, -k * 0.6, -k * 0.6, -k * 2, 0, -r);
  ctx.bezierCurveTo(k * 0.6, -k * 2, k * 2, -k * 0.6, r, 0);
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 12;
  ctx.fill();
  ctx.restore();
}

// A silk lasso thrown round a star: the rope sweeps in out of the bottom-left corner, thick and
// near, and runs up to its knot, its loop tipped back in the air round the star (passing behind
// it and in front), a loose end curling off the knot, faint arcs where the loop's still turning.
export function moonsilkIcon(S = 256) {
  const { c, ctx, px } = surface(S);
  const rand = seededRandom(9091);
  // A quiet night: dark, lit a little round the star, and fine dust of stars, none to compete with it.
  ctx.fillStyle = radial(ctx, 0.6, 0.36, 0.85, ['#151927', '#0a0c14', '#030409']);
  ctx.fillRect(0, 0, 1, 1);
  ctx.fillStyle = radial(ctx, 0.6, 0.36, 0.5, [rgba('#c8d0e6', 0.12), rgba('#c8d0e6', 0)]);
  ctx.fillRect(0, 0, 1, 1);
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 40; i++) {
    ctx.globalAlpha = lerp(0.15, 0.7, rand() ** 2);
    ctx.beginPath();
    ctx.arc(rand(), rand(), lerp(0.002, 0.0055, rand() ** 3), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // The loop: an ellipse tipped back, a little uneven, as a rope thrown by hand would be.
  const C = [0.6, 0.37], RX = 0.27, RY = 0.12, TILT = -0.3, K0 = 2.35;
  const wob = [rand() * TAU, rand() * TAU];
  const loopAt = (a) => {
    const r = 1 + 0.05 * Math.sin(2 * a + wob[0]) + 0.03 * Math.sin(3 * a + wob[1]);
    const x = Math.cos(a) * RX * r, y = Math.sin(a) * RY * r;
    return [C[0] + x * Math.cos(TILT) - y * Math.sin(TILT), C[1] + x * Math.sin(TILT) + y * Math.cos(TILT)];
  };
  const knot = loopAt(K0);
  // Its near half (sin > 0, the lower side) thicker than its far half.
  const loopWidth = (a) => 0.0075 + 0.0075 * Math.max(0, Math.sin(a));
  const arc = (from, to, n = 90) => Array.from({ length: n + 1 }, (_, i) => from + ((to - from) * i) / n);
  const far = arc(Math.PI - 0.05, TAU + 0.05); // the upper side, away from us
  const loopLine = (as) => as.map(loopAt);

  // Arcs where it's still turning, trailing behind the far side.
  ctx.save();
  ctx.lineCap = 'round';
  for (const [k, a] of [[1.12, 0.22], [1.24, 0.1]]) {
    ctx.beginPath();
    arc(3.5, 5.3, 40).forEach((t, i) => {
      const x = Math.cos(t) * RX * k, y = Math.sin(t) * RY * k;
      const p = [C[0] + x * Math.cos(TILT) - y * Math.sin(TILT), C[1] + x * Math.sin(TILT) + y * Math.cos(TILT)];
      if (i) ctx.lineTo(...p); else ctx.moveTo(...p);
    });
    ctx.strokeStyle = rgba('#dfe5f2', a);
    ctx.lineWidth = 0.006;
    ctx.stroke();
  }
  ctx.restore();

  const glowOn = (blur, draw) => {
    ctx.save();
    ctx.shadowColor = rgba('#ffffff', 0.55);
    ctx.shadowBlur = px * blur;
    draw();
    ctx.restore();
  };

  // The loop's far side, behind the star.
  glowOn(0.02, () => rope(ctx, loopLine(far), (u) => loopWidth(far[Math.round(u * (far.length - 1))]), { alpha: 0.8, rand }));

  // The star, caught.
  const [sx, sy] = [C[0] + 0.01, C[1] - 0.005];
  ctx.fillStyle = radial(ctx, sx, sy, 0.24, [rgba('#ffffff', 0.5), rgba('#e8ecf7', 0.14), rgba('#e8ecf7', 0)]);
  ctx.fillRect(0, 0, 1, 1);
  star(ctx, sx, sy, 0.13, 0.05, 0.1);
  star(ctx, sx, sy, 0.06, 0.035, 0.1 + Math.PI / 4, 0.8);
  ctx.fillStyle = radial(ctx, sx, sy, 0.035, ['#ffffff', rgba('#ffffff', 0)]);
  ctx.fillRect(0, 0, 1, 1);

  // The loop's near side, in front of it, running round into the knot.
  const nearA = arc(TAU, TAU + K0, 60), nearB = arc(K0, Math.PI, 30);
  // The rope, up out of the corner to the knot.
  const main = smooth([[-0.06, 1.06], [0.06, 0.93], [0.17, 0.8], [0.22, 0.66], [knot[0] - 0.08, knot[1] + 0.09], knot], 30);
  // The loose end curling off the knot.
  const tail = smooth([knot, [knot[0] + 0.035, knot[1] + 0.04], [knot[0] + 0.025, knot[1] + 0.09], [knot[0] - 0.005, knot[1] + 0.11]], 16);
  glowOn(0.025, () => {
    for (const near of [nearA, nearB]) rope(ctx, loopLine(near), (u) => loopWidth(near[Math.round(u * (near.length - 1))]), { rand });
    rope(ctx, tail, (u) => 0.011 * (1 - u * 0.75), { rand });
    rope(ctx, main, (u) => lerp(0.028, 0.012, u ** 0.8), { rand, twist: 0.028 });
  });
  // The knot: a wrap of rope bulging where the loop runs through.
  ctx.save();
  ctx.translate(knot[0], knot[1]);
  ctx.rotate(-0.9);
  ctx.fillStyle = '#eef1f7';
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.021, 0.015, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = rgba('#7c869c', 0.8);
  ctx.lineWidth = 0.004;
  for (const k of [-0.008, 0.002, 0.012]) {
    ctx.beginPath();
    ctx.moveTo(k - 0.004, -0.013);
    ctx.quadraticCurveTo(k + 0.004, 0, k - 0.002, 0.013);
    ctx.stroke();
  }
  ctx.restore();

  // A few motes of light shaken off the loop as it turns.
  for (const a of [3.9, 4.4, 4.9, 0.6]) {
    const [x, y] = loopAt(a);
    sparkle(ctx, x + (rand() - 0.5) * 0.03, y - 0.02 - rand() * 0.03, lerp(0.012, 0.022, rand()), '#ffffff', 0.85, rand());
  }
  return c;
}
