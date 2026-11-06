// The Warding aspect's sprites and icon.
import { seededRandom, TAU } from '../../../engine/math.js';
import { DEG, surface, rgba, glow, linear, radial, sparkle, space } from '../paint.js';

// ---------------------------------------------------------------- warding

// The amulet in freefall: the ward's crystal shield (as props drop it) tumbling down at a
// slant, turned on every axis so its face shows foreshortened over a lit edge, both ends of
// its chain streaming up after it in loose wavering curves, one out of the top right and one
// out of the right halfway down, faint rings of ward light round it and streaks of light
// trailing up.
export function wardingIcon(S = 256) {
  const { c, ctx, px } = surface(S);
  const rand = seededRandom(2503);
  space(ctx, rand, {
    core: '#0d1126', edge: '#020309', stars: 20,
    nebulae: [[0.4, 0.62, 0.42, '#8d9ff0', 0.24], [0.78, 0.2, 0.28, '#c8d4ff', 0.07]],
  });
  const col = '#c8d4ff';

  // The pendant's plane, turned about x, then y, then z, seen straight on: its two in-plane
  // axes (u, v) and its normal (n) on screen, at `size` units to the shield's height.
  const [rx, ry, rz] = [24 * DEG, -50 * DEG, 22 * DEG], size = 0.44, cx = 0.4, cy = 0.63;
  const turn = ([x, y, z]) => {
    [y, z] = [y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)];
    [x, z] = [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
    return [x * Math.cos(rz) - y * Math.sin(rz), x * Math.sin(rz) + y * Math.cos(rz)];
  };
  const u = turn([1, 0, 0]), v = turn([0, 1, 0]), n = turn([0, 0, 1]);
  const onScreen = (x, y) => [cx + (u[0] * x + v[0] * y) * size, cy + (u[1] * x + v[1] * y) * size];
  const inPlane = (g, depth = 0) => {
    g.translate(-n[0] * depth, -n[1] * depth);
    g.transform(u[0] * size, u[1] * size, v[0] * size, v[1] * size, cx, cy);
  };

  // The ward's shield (wardGlyph), centred on its middle, a unit tall.
  const shield = new Path2D();
  shield.moveTo(0, -0.5);
  shield.quadraticCurveTo(0.22, -0.39, 0.42, -0.39);
  shield.quadraticCurveTo(0.45, 0.17, 0, 0.51);
  shield.quadraticCurveTo(-0.45, 0.17, -0.42, -0.39);
  shield.quadraticCurveTo(-0.22, -0.39, 0, -0.5);
  shield.closePath();

  // Rings of ward light about it, in its plane.
  [[0.72, 0.32], [0.9, 0.16]].forEach(([r, a]) => {
    ctx.save();
    inPlane(ctx);
    glow(ctx, rgba(col, a), px * 0.04, () => {
      ctx.strokeStyle = rgba('#dde4ff', a);
      ctx.lineWidth = 0.022;
      ctx.beginPath();
      ctx.arc(0, 0.02, r, 0, TAU);
      ctx.stroke();
    });
    ctx.restore();
  });

  // Streaks of light trailing up off it, the way it has fallen.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = 0.006;
  for (let i = 0; i < 7; i++) {
    const x = cx + (rand() - 0.5) * 0.36, y = cy + (rand() - 0.5) * 0.3, len = 0.12 + rand() * 0.16, a = -58 * DEG + (rand() - 0.5) * 0.15;
    ctx.strokeStyle = linear(ctx, x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, [rgba(col, 0.35), rgba(col, 0)]);
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  ctx.restore();

  // The chain, both ends streaming up from the bail in loose curves, wavering a little along
  // the way: links along them, every other one seen edge on.
  const bail = onScreen(0, -0.56);
  const strand = (ends, phase, freq, amp) => {
    const bez = (t, i) => { const w = 1 - t; return w * w * w * ends[0][i] + 3 * w * w * t * ends[1][i] + 3 * w * t * t * ends[2][i] + t * t * t * ends[3][i]; };
    const path = [];
    for (let i = 0; i <= 200; i++) {
      const t = i / 200, d = 0.002;
      const x = bez(t, 0), y = bez(t, 1), tx = bez(Math.min(1, t + d), 0) - bez(Math.max(0, t - d), 0), ty = bez(Math.min(1, t + d), 1) - bez(Math.max(0, t - d), 1);
      const l = Math.hypot(tx, ty) || 1, wave = Math.sin(t * freq * TAU + phase) * amp * Math.sin(Math.PI * t);
      path.push([x - (ty / l) * wave, y + (tx / l) * wave]);
    }
    const step = 0.034;
    let along = 0, k = 0;
    glow(ctx, rgba(col, 0.6), px * 0.025, () => {
      for (let i = 1; i < path.length; i++) {
        const [x0, y0] = path[i - 1], [x1, y1] = path[i];
        along += Math.hypot(x1 - x0, y1 - y0);
        if (along < step) continue;
        along -= step;
        const edge = k++ % 2, t = i / path.length;
        ctx.save();
        ctx.translate(x1, y1);
        ctx.rotate(Math.atan2(y1 - y0, x1 - x0) + Math.sin(t * 9 + phase) * 0.25);
        ctx.strokeStyle = edge ? '#9aa2b8' : '#dfe4f2';
        ctx.lineWidth = edge ? 0.012 : 0.01;
        ctx.beginPath();
        ctx.ellipse(0, 0, 0.022, edge ? 0.003 : 0.01 + 0.004 * Math.abs(Math.sin(t * 7 + phase)), 0, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
    });
  };
  strand([bail, [bail[0] - 0.14, bail[1] - 0.2], [0.94, 0.34], [1.08, -0.06]], rand() * TAU, 1.6 + rand() * 0.6, 0.05);
  // Its other end, streaming up and over to off the right, halfway down.
  strand([bail, [bail[0] + 0.1, bail[1] - 0.16], [0.84, 0.34], [1.08, 0.54]], rand() * TAU, 1.4 + rand() * 0.6, 0.045);
  // The bail, a ring through the shield's tip.
  ctx.save();
  inPlane(ctx);
  ctx.strokeStyle = '#dfe4f2';
  ctx.lineWidth = 0.035;
  ctx.beginPath();
  ctx.ellipse(0, -0.55, 0.05, 0.07, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();

  // Its edge, the crystal's thickness seen past the tilted face, lit along one side.
  for (let i = 10; i >= 1; i--) {
    ctx.save();
    inPlane(ctx, 0.0045 * i);
    ctx.fillStyle = i > 1 ? rgba('#3a4690', 0.95) : rgba('#8d9ff0', 1);
    ctx.fill(shield);
    ctx.restore();
  }
  // Its face: the crystal glowing from its heart, a cross of light through it, its bright rim.
  ctx.save();
  inPlane(ctx);
  glow(ctx, rgba(col, 0.9), px * 0.06, () => {
    ctx.fillStyle = radial(ctx, 0, -0.02, 0.6, ['#eef1ff', rgba(col, 0.85), '#6f82dc', '#2a3470'], -0.1, -0.14);
    ctx.fill(shield);
  });
  ctx.save();
  ctx.clip(shield);
  ctx.fillStyle = linear(ctx, -0.4, -0.5, 0.1, 0.1, [rgba('#ffffff', 0.35), rgba('#ffffff', 0)]);
  ctx.beginPath();
  ctx.moveTo(-0.5, -0.5); ctx.lineTo(0.05, -0.5); ctx.lineTo(-0.5, 0.15);
  ctx.fill(); // a sheen across its upper corner
  ctx.strokeStyle = rgba('#ffffff', 0.35);
  ctx.lineWidth = 0.03;
  ctx.beginPath();
  ctx.moveTo(0, -0.48); ctx.lineTo(0, 0.48);
  ctx.moveTo(-0.42, -0.2); ctx.lineTo(0.42, -0.2);
  ctx.stroke();
  ctx.restore();
  glow(ctx, rgba(col, 0.95), px * 0.05, () => {
    ctx.strokeStyle = linear(ctx, -0.4, -0.5, 0.4, 0.5, ['#ffffff', col, '#8d9ff0']);
    ctx.lineWidth = 0.07;
    ctx.stroke(shield);
  });
  ctx.restore();

  // The star at its heart, and glints of light.
  const [hx, hy] = onScreen(0, -0.04);
  sparkle(ctx, hx, hy, 0.085, '#ffffff', 1, 0.15);
  sparkle(ctx, ...onScreen(0.36, -0.36), 0.045, '#ffffff', 0.7, 0.4);
  sparkle(ctx, 0.78, 0.36, 0.035, '#dde4ff', 0.6, 0.6);
  return c;
}
