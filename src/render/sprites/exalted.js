// Exalted fire: the mist, flames, ribbons and feathers the exalted state burns with.
import { seededRandom, lerp, TAU } from '../../engine/math.js';
import { surface, rgba, glow, linear, radial } from './paint.js';

// ---------------------------------------------------------------- exalted fire
// White so the Exalted effects can tint them.

// Soft cloud puff: a round haze with a few lumpy lobes, fading to nothing at the edge.
export function mist(S = 128) {
  const { c, ctx } = surface(S);
  const rand = seededRandom(7);
  ctx.fillStyle = radial(ctx, 0.5, 0.5, 0.5, [rgba('#ffffff', 0.45), rgba('#ffffff', 0.16), rgba('#ffffff', 0)]);
  ctx.fillRect(0, 0, 1, 1);
  for (let i = 0; i < 7; i++) {
    const a = rand() * TAU, d = lerp(0.05, 0.18, rand()), r = lerp(0.12, 0.22, rand());
    ctx.fillStyle = radial(ctx, 0.5 + Math.cos(a) * d, 0.5 + Math.sin(a) * d, r, [rgba('#ffffff', 0.2), rgba('#ffffff', 0)]);
    ctx.fillRect(0, 0, 1, 1);
  }
  return c;
}

// Wispy flame tongue 1 texture-width long, pointing along +x: a soft base thinning into a
// long faint tip, blurred so overlapping tongues merge.
export function flame(W = 128, H = 64) {
  const { c, ctx, px } = surface(W, H, W);
  const y = H / W / 2, r = 0.1;
  ctx.fillStyle = radial(ctx, 0.3, y, 0.26, [rgba('#ffffff', 0.25), rgba('#ffffff', 0)]);
  ctx.fillRect(0, 0, 1, 2 * y);
  ctx.beginPath();
  ctx.moveTo(0.96, y);
  ctx.quadraticCurveTo(0.5, y - r * 1.1, 0.28, y - r);
  ctx.arc(0.28, y, r, -Math.PI / 2, Math.PI / 2, true);
  ctx.quadraticCurveTo(0.5, y + r * 1.1, 0.96, y);
  ctx.fillStyle = linear(ctx, 0.18, 0, 0.96, 0, [rgba('#ffffff', 0.7), rgba('#ffffff', 0.3), rgba('#ffffff', 0)]);
  ctx.filter = `blur(${px * 0.025}px)`;
  glow(ctx, rgba('#ffffff', 0.5), px * 0.08, () => ctx.fill());
  return c;
}

// Ribbon strip mapped along a mesh: u runs tail (transparent) → head (solid), v across a
// soft bright core.
export function ribbon(W = 128, H = 16) {
  const { c, ctx } = surface(W, H, W);
  const h = H / W;
  ctx.fillStyle = linear(ctx, 0, 0, 1, 0, [rgba('#ffffff', 0), rgba('#ffffff', 0.25), rgba('#ffffff', 1)]);
  ctx.fillRect(0, 0, 1, h);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = linear(ctx, 0, 0, 0, h, [rgba('#ffffff', 0), rgba('#ffffff', 0.45), rgba('#ffffff', 1), rgba('#ffffff', 0.45), rgba('#ffffff', 0)]);
  ctx.fillRect(0, 0, 1, h);
  return c;
}

// Tattered feathers for the Exalted wings, pointing along +x from the quill at the left: a
// dark vane under a bright shaft and rim, its edges ragged and split between the barbs.
// Grey so the tint lands dark, the rim and shaft at its full colour. `feathers` stacks
// FEATHER_ROWS different ones, a row each, mapped along the wing's meshes; `feather` is a
// single loose one, shed as the wings dissolve.
export const FEATHER_ROWS = 4;

export function feathers(W = 256, H = 64) {
  const { c, ctx } = surface(W, H * FEATHER_ROWS, W);
  const h = H / W;
  for (let r = 0; r < FEATHER_ROWS; r++) drawFeather(ctx, (r + 0.5) * h, h * 0.42, seededRandom(31 + r * 13));
  return haunted(c);
}

export function feather(W = 128, H = 32) {
  const { c, ctx } = surface(W, H, W);
  drawFeather(ctx, H / W / 2, (H / W) * 0.42, seededRandom(5));
  return haunted(c);
}

// Feathers half dissolved into smoke: blurred into a haze around a faint trace of their
// shape, fading away toward the tip and the quill.
function haunted(src) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const ctx = c.getContext('2d');
  ctx.filter = `blur(${src.width / 90}px)`;
  ctx.drawImage(src, 0, 0);
  ctx.drawImage(src, 0, 0);
  ctx.filter = 'none';
  ctx.globalAlpha = 0.4;
  ctx.drawImage(src, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'destination-in';
  const g = ctx.createLinearGradient(0, 0, c.width, 0);
  [[0, 0.1], [0.22, 0.75], [0.5, 1], [0.82, 0.55], [1, 0]].forEach(([at, a]) => g.addColorStop(at, rgba('#ffffff', a)));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

// One feather along y = `y`, its wider (lower) half `half` across at most.
function drawFeather(ctx, y, half, rand) {
  const Q = 0.14, TIP = 0.98, N = 36; // the bare quill ends at Q
  // Vane half-width along it: swelling fast off the quill, tapering to a point.
  const width = (s) => Math.sin((Math.PI / 2) * Math.min(1, s / 0.22)) * (1 - s ** 3) ** 0.6;
  const edge = (side) => Array.from({ length: N + 1 }, (_, i) => {
    const s = i / N, ragged = i === 0 || i === N ? 1 : lerp(0.75, 1, rand());
    return [lerp(Q, TIP, s), y + side * half * (side < 0 ? 0.6 : 1) * width(s) * ragged];
  });
  const vane = new Path2D(), top = edge(-1), bottom = edge(1).reverse();
  vane.moveTo(Q, y);
  for (const [x, ey] of [...top, ...bottom]) vane.lineTo(x, ey);
  vane.closePath();
  ctx.fillStyle = linear(ctx, Q, 0, TIP, 0, [rgba('#7c7c7c', 0.96), rgba('#666666', 0.96), rgba('#505050', 0.85)]);
  ctx.fill(vane);
  // Barbs raking forward off the shaft.
  ctx.save();
  ctx.clip(vane);
  ctx.strokeStyle = rgba('#ffffff', 0.13);
  ctx.lineWidth = 0.004;
  for (let i = 0; i < 90; i++) {
    const x = lerp(Q, TIP, i / 70), side = i % 2 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + half * 1.1, y + side * half);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = rgba('#ffffff', 0.6);
  ctx.lineWidth = 0.007;
  glow(ctx, rgba('#ffffff', 0.5), 4, () => ctx.stroke(vane));
  // Splits torn into the vane between the barbs, from the edge in toward the shaft.
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 7; i++) {
    const x = lerp(Q + 0.1, TIP - 0.12, rand()), side = rand() < 0.5 ? -1 : 1, deep = lerp(0.3, 0.9, rand());
    ctx.beginPath();
    ctx.moveTo(x, y + side * half * 0.08);
    ctx.lineTo(x + half * 1.2 * deep, y + side * half * 1.2);
    ctx.lineTo(x + half * 1.2 * deep + lerp(0.015, 0.045, rand()), y + side * half * 1.2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  // The shaft, thinning toward the tip.
  ctx.beginPath();
  ctx.moveTo(0.02, y - 0.006);
  ctx.lineTo(TIP - 0.03, y);
  ctx.lineTo(0.02, y + 0.006);
  ctx.closePath();
  ctx.fillStyle = rgba('#ffffff', 0.9);
  glow(ctx, rgba('#ffffff', 0.6), 3, () => ctx.fill());
}
