// Drawing helpers every sprite uses: canvases, colours, gradients, glows, sparkles and starry backdrops.
import { lerp, clamp01, TAU } from '../../engine/math.js';

export const DEG = Math.PI / 180;

// Sprites drawn with a halo are this many times their visible body size.
export const ORB_PAD = 2;

// ---------------------------------------------------------------- helpers

export function surface(w, h = w, unit = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.setTransform(unit, 0, 0, unit, 0, 0);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  return { c, ctx, px: unit };
}

export function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

export const polar = (cx, cy, deg, r) => [cx + Math.cos(deg * DEG) * r, cy + Math.sin(deg * DEG) * r];

export const easeOut = (t) => 1 - (1 - t) ** 3;

// Runs `draw` with a soft halo of `color` (`blur` in pixels) behind whatever it paints.
export function glow(ctx, color, blur, draw) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  draw();
  ctx.restore();
}

export function linear(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
  return g;
}

export function radial(ctx, x, y, r, stops, x0 = x, y0 = y) {
  const g = ctx.createRadialGradient(x0, y0, 0, x, y, r);
  stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
  return g;
}

// Four-point star with a faint round halo.
export function sparkle(ctx, x, y, r, color = '#ffffff', alpha = 1, rot = 0) {
  if (alpha <= 0 || r <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha *= clamp01(alpha);
  ctx.fillStyle = radial(ctx, 0, 0, r * 0.75, [rgba(color, 0.5), rgba(color, 0)]);
  ctx.fillRect(-r, -r, 2 * r, 2 * r);
  const k = r * 0.14;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.quadraticCurveTo(k, k, 0, r);
  ctx.quadraticCurveTo(-k, k, -r, 0);
  ctx.quadraticCurveTo(-k, -k, 0, -r);
  ctx.quadraticCurveTo(k, -k, r, 0);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

// Icon backdrop: deep radial gradient, coloured nebula clouds, scattered stars.
export function space(ctx, rand, { core, edge, nebulae = [], stars = 40 }) {
  ctx.fillStyle = radial(ctx, 0.5, 0.5, 0.75, [core, edge]);
  ctx.fillRect(0, 0, 1, 1);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const [x, y, r, color, a] of nebulae) {
    ctx.fillStyle = radial(ctx, x, y, r, [rgba(color, a), rgba(color, a * 0.35), rgba(color, 0)]);
    ctx.fillRect(0, 0, 1, 1);
  }
  ctx.restore();
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < stars; i++) {
    ctx.globalAlpha = lerp(0.2, 0.85, rand());
    ctx.beginPath();
    ctx.arc(rand(), rand(), lerp(0.0025, 0.007, rand() ** 3), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 3; i++) sparkle(ctx, lerp(0.08, 0.92, rand()), lerp(0.08, 0.92, rand()), lerp(0.02, 0.035, rand()), '#ffffff', 0.75);
}

export function hexPath(w, h, flatTop) {
  const p = new Path2D();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + (flatTop ? 0 : Math.PI / 6);
    const x = w / 2 + (Math.cos(a) * w) / 2 * (flatTop ? 1 : 1 / Math.cos(Math.PI / 6));
    const y = h / 2 + (Math.sin(a) * h) / 2 * (flatTop ? 1 / Math.sin(Math.PI / 3) : 1);
    if (i === 0) p.moveTo(x, y); else p.lineTo(x, y);
  }
  p.closePath();
  return p;
}

export function circlePath(r) {
  const p = new Path2D();
  p.arc(0.5, 0.5, r, 0, TAU);
  return p;
}
