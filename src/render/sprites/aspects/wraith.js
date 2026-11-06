// The Wraith aspect's sprites and icon.
import { seededRandom, lerp } from '../../../engine/math.js';
import { DEG, surface, rgba, glow, linear, radial, sparkle, space } from '../paint.js';

// ---------------------------------------------------------------- wraith

// The Wraith's mist shard in a 1 × 0.5 box, pointing along +x: a needle tip sweeping back
// into a body that tears into ragged tendrils, the longest trailing from the middle.
function wraithPath() {
  const p = new Path2D();
  p.moveTo(0.98, 0.25);
  p.quadraticCurveTo(0.8, 0.17, 0.62, 0.15);
  p.lineTo(0.4, 0.05);
  p.quadraticCurveTo(0.47, 0.11, 0.47, 0.15);
  p.lineTo(0.22, 0.08);
  p.quadraticCurveTo(0.29, 0.14, 0.3, 0.18);
  p.lineTo(0.07, 0.15);
  p.quadraticCurveTo(0.15, 0.2, 0.2, 0.22);
  p.lineTo(0, 0.26);
  p.lineTo(0.2, 0.29);
  p.quadraticCurveTo(0.14, 0.33, 0.05, 0.37);
  p.lineTo(0.3, 0.32);
  p.quadraticCurveTo(0.3, 0.36, 0.2, 0.43);
  p.lineTo(0.47, 0.35);
  p.quadraticCurveTo(0.48, 0.39, 0.4, 0.45);
  p.lineTo(0.63, 0.35);
  p.quadraticCurveTo(0.8, 0.33, 0.98, 0.25);
  p.closePath();
  return p;
}

// Paints the shard (in its 1 × 0.5 box): a black haze behind, a body black at the head and
// thinning to smoke along the tendrils, a white-hot tip, and a white rim, bright at the tip
// and gone by the tail.
function paintWraith(ctx, px, rim = 0.012) {
  const path = wraithPath();
  ctx.save();
  ctx.filter = `blur(${px * 0.025}px)`;
  ctx.fillStyle = linear(ctx, 0, 0, 1, 0, [rgba('#000000', 0), rgba('#000000', 0.5), rgba('#000000', 0.7)]);
  ctx.fill(path);
  ctx.restore();
  ctx.fillStyle = linear(ctx, 0, 0, 1, 0, [rgba('#000000', 0.2), rgba('#000000', 0.85), '#000000', '#000000']);
  ctx.fill(path);
  // The tip white-hot: white mist glowing off it, and the shard turning white toward it.
  ctx.save();
  ctx.filter = `blur(${px * 0.02}px)`;
  ctx.fillStyle = radial(ctx, 0.9, 0.25, 0.13, [rgba('#ffffff', 0.75), rgba('#ffffff', 0.25), rgba('#ffffff', 0)]);
  ctx.fillRect(0.7, 0.08, 0.3, 0.34);
  ctx.restore();
  ctx.save();
  ctx.clip(path);
  ctx.fillStyle = linear(ctx, 0.62, 0, 0.97, 0, [rgba('#ffffff', 0), rgba('#ffffff', 0.5), '#ffffff']);
  ctx.fillRect(0.6, 0, 0.4, 0.5);
  ctx.restore();
  const edge = linear(ctx, 0, 0, 1, 0, [rgba('#ffffff', 0), rgba('#ffffff', 0.15), rgba('#ffffff', 0.6), '#ffffff']);
  glow(ctx, rgba('#ffffff', 0.5), px * 0.015, () => {
    ctx.strokeStyle = edge;
    ctx.lineWidth = rim;
    ctx.stroke(path);
  });
  // A faint spine of light running back from the tip.
  ctx.strokeStyle = linear(ctx, 0.4, 0, 0.95, 0, [rgba('#ffffff', 0), rgba('#ffffff', 0.35)]);
  ctx.lineWidth = rim * 0.6;
  ctx.beginPath();
  ctx.moveTo(0.4, 0.245); ctx.lineTo(0.93, 0.25);
  ctx.stroke();
}

// The form the Wraith turns the player into (src/aspects/wraith.js), 2:1, pointing along +x;
// white-rimmed so it can be tinted.
export function wraithForm(W = 256) {
  const { c, ctx, px } = surface(W, W / 2, W);
  paintWraith(ctx, px);
  return c;
}

// The shard knifing up and to the right out of a pale eclipse glow, black wisps torn
// off behind it.
export function wraithIcon(S = 256) {
  const { c, ctx, px } = surface(S);
  const rand = seededRandom(606);
  space(ctx, rand, {
    core: '#120f1c', edge: '#020205', stars: 30,
    nebulae: [[0.5, 0.5, 0.48, '#6b5fa8', 0.3], [0.25, 0.75, 0.3, '#3b3366', 0.2]],
  });
  ctx.fillStyle = radial(ctx, 0.5, 0.5, 0.42, [rgba('#e4defc', 0.7), rgba('#8f84c8', 0.25), rgba('#8f84c8', 0)]);
  ctx.fillRect(0, 0, 1, 1);
  ctx.save();
  ctx.translate(0.5, 0.5);
  ctx.rotate(-40 * DEG);
  // Wisps shed behind, blurred into smoke.
  ctx.save();
  ctx.filter = `blur(${px * 0.02}px)`;
  for (let i = 0; i < 6; i++) {
    const x = lerp(-0.5, -0.15, rand()), y = lerp(-0.12, 0.12, rand()), r = lerp(0.05, 0.1, rand());
    ctx.fillStyle = radial(ctx, x, y, r, [rgba('#000000', 0.75), rgba('#000000', 0)]);
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  ctx.restore();
  ctx.scale(1.15, 1.15);
  ctx.translate(-0.5, -0.25);
  paintWraith(ctx, px, 0.012);
  ctx.restore();
  const [tx, ty] = [0.5 + Math.cos(-40 * DEG) * 0.55, 0.5 + Math.sin(-40 * DEG) * 0.55];
  sparkle(ctx, tx, ty, 0.07, '#ffffff', 1, 0.3);
  return c;
}
