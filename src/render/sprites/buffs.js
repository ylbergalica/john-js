// Buff glyphs.
import { surface, rgba, glow, linear, radial, sparkle } from './paint.js';

// ---------------------------------------------------------------- buff glyphs

// The buffs' faces (src/player/buffs.js): on their pickups and in the HUD's list, in their
// BUFFS colours on nothing, white-hot at the heart.

// Swift: a star streaking right, three trails of light behind it.
export function swiftGlyph(S = 128) {
  const { c, ctx, px } = surface(S);
  const col = '#7fe8ff';
  glow(ctx, rgba(col, 0.9), px * 0.06, () => {
    for (const [y, x0, x1, w] of [[0.33, 0.14, 0.6, 0.035], [0.5, 0.06, 0.6, 0.05], [0.67, 0.14, 0.6, 0.035]]) {
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y - w);
      ctx.arc(x1, y, w, -Math.PI / 2, Math.PI / 2);
      ctx.closePath();
      ctx.fillStyle = linear(ctx, x0, 0, x1 + w, 0, [rgba(col, 0), rgba(col, 0.75), '#ffffff']);
      ctx.fill();
    }
    sparkle(ctx, 0.68, 0.5, 0.3, col);
  });
  sparkle(ctx, 0.68, 0.5, 0.16, '#ffffff');
  return c;
}

// Ward: a crystal shield, a star at its heart.
export function wardGlyph(S = 128) {
  const { c, ctx, px } = surface(S);
  const col = '#c8d4ff';
  const p = new Path2D();
  p.moveTo(0.5, 0.1);
  p.quadraticCurveTo(0.68, 0.19, 0.84, 0.19);
  p.quadraticCurveTo(0.86, 0.64, 0.5, 0.91);
  p.quadraticCurveTo(0.14, 0.64, 0.16, 0.19);
  p.quadraticCurveTo(0.32, 0.19, 0.5, 0.1);
  p.closePath();
  ctx.fillStyle = radial(ctx, 0.5, 0.45, 0.45, [rgba(col, 0.5), rgba('#6f82dc', 0.35), rgba('#2a3470', 0.5)]);
  ctx.fill(p);
  ctx.strokeStyle = rgba('#ffffff', 0.35);
  ctx.lineWidth = 0.02;
  ctx.beginPath();
  ctx.moveTo(0.5, 0.12); ctx.lineTo(0.5, 0.88);
  ctx.moveTo(0.17, 0.3); ctx.lineTo(0.83, 0.3);
  ctx.stroke();
  glow(ctx, rgba(col, 0.95), px * 0.06, () => {
    ctx.strokeStyle = linear(ctx, 0.2, 0.1, 0.8, 0.9, ['#ffffff', col, '#8d9ff0']);
    ctx.lineWidth = 0.06;
    ctx.stroke(p);
  });
  sparkle(ctx, 0.5, 0.48, 0.17, '#ffffff');
  return c;
}

// Haste: a bolt of lightning, white-hot at its heart.
export function hasteGlyph(S = 128) {
  const { c, ctx, px } = surface(S);
  const col = '#ffe95a';
  const p = new Path2D();
  [[0.6, 0.06], [0.24, 0.54], [0.47, 0.54], [0.36, 0.94], [0.78, 0.4], [0.54, 0.4], [0.7, 0.06]]
    .forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  p.closePath();
  glow(ctx, rgba('#ffd21f', 0.95), px * 0.07, () => {
    ctx.fillStyle = linear(ctx, 0.5, 0.06, 0.5, 0.94, ['#fffbe0', col, '#e0a010']);
    ctx.fill(p);
  });
  ctx.strokeStyle = rgba('#ffffff', 0.85);
  ctx.lineWidth = 0.02;
  ctx.beginPath();
  ctx.moveTo(0.6, 0.14); ctx.lineTo(0.38, 0.5); ctx.lineTo(0.5, 0.5); ctx.lineTo(0.42, 0.8);
  ctx.stroke();
  return c;
}

// Fury: three claw slashes raked across it, white-hot down their middles.
export function furyGlyph(S = 128) {
  const { c, ctx, px } = surface(S);
  const col = '#ff5fc8';
  const slash = (ax, ay, bx, by, bow, w) => {
    const mx = (ax + bx) / 2, my = (ay + by) / 2, len = Math.hypot(bx - ax, by - ay);
    const nx = -(by - ay) / len, ny = (bx - ax) / len, cx = mx + nx * bow, cy = my + ny * bow;
    const p = new Path2D();
    p.moveTo(ax, ay);
    p.quadraticCurveTo(cx + nx * w, cy + ny * w, bx, by);
    p.quadraticCurveTo(cx - nx * w, cy - ny * w, ax, ay);
    return p;
  };
  const claws = [-0.17, 0, 0.17].map((o) => slash(0.74 + o, 0.14 + o, 0.2 + o, 0.68 + o, 0.05, o ? 0.05 : 0.065));
  glow(ctx, rgba(col, 0.95), px * 0.07, () => {
    ctx.fillStyle = linear(ctx, 0.8, 0.1, 0.2, 0.9, ['#ffd6f4', col, '#b0207e']);
    for (const p of claws) ctx.fill(p);
  });
  ctx.fillStyle = rgba('#ffffff', 0.85);
  for (const o of [-0.17, 0, 0.17]) ctx.fill(slash(0.7 + o, 0.2 + o, 0.26 + o, 0.62 + o, 0.045, 0.014));
  return c;
}
