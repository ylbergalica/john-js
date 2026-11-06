// The Predator aspect's sprites and icon.
import { seededRandom, lerp, TAU } from '../../../engine/math.js';
import { surface, rgba, glow, linear, radial, sparkle, space } from '../paint.js';

// The eye in the dark: one slit-pupilled light-blue eye glaring out, already locked on. The
// upper lid slants down toward the nose, the iris is starry and streaked out from the
// pupil, the slit holds the glint of its prey, and a wet catchlight sits on top. No
// outline or glow: the eye's edge just feathers away into the dark.
export function predatorIcon(S = 256) {
  const { c, ctx, px } = surface(S);
  const rand = seededRandom(505);
  space(ctx, rand, {
    core: '#06121c', edge: '#010204', stars: 30,
    nebulae: [[0.5, 0.5, 0.5, '#2f8fd6', 0.3], [0.8, 0.2, 0.28, '#7ad0ff', 0.12]],
  });
  const ex = 0.52, ey = 0.54; // iris centre
  const eye = new Path2D();
  eye.moveTo(0.04, 0.6);
  eye.bezierCurveTo(0.26, 0.3, 0.64, 0.2, 0.96, 0.34);
  eye.bezierCurveTo(0.84, 0.84, 0.32, 0.94, 0.04, 0.6);
  // Painted on its own layer, then cut to a blurred eye shape so every edge fades out.
  const { c: layer, ctx: l } = surface(S);
  l.fillStyle = radial(l, ex, ey, 0.46, ['#3f8fc4', '#1d5a86', '#0f3352']);
  l.fillRect(0, 0, 1, 1);
  // Iris: near white round the pupil, deepening to blue and melting into the rest of the eye.
  const R = 0.33;
  l.beginPath();
  l.arc(ex, ey, R, 0, TAU);
  l.fillStyle = radial(l, ex, ey, R, ['#f0fbff', '#bfeaff', '#6cccff', '#2a8fd0', rgba('#2a8fd0', 0)]);
  l.fill();
  l.lineWidth = 0.005;
  for (let i = 0; i < 120; i++) {
    const a = rand() * TAU, r0 = lerp(0.04, 0.1, rand()), r1 = lerp(0.18, 0.31, rand());
    l.strokeStyle = rand() < 0.55 ? rgba('#0d3a5a', lerp(0.25, 0.6, rand())) : rgba('#e6f8ff', lerp(0.15, 0.45, rand()));
    l.beginPath();
    l.moveTo(ex + Math.cos(a) * r0, ey + Math.sin(a) * r0);
    l.lineTo(ex + Math.cos(a) * r1, ey + Math.sin(a) * r1);
    l.stroke();
  }
  for (let i = 0; i < 14; i++) {
    const a = rand() * TAU, d = lerp(0.09, 0.27, rand());
    sparkle(l, ex + Math.cos(a) * d, ey + Math.sin(a) * d, lerp(0.009, 0.02, rand()), '#eefaff', lerp(0.4, 0.9, rand()));
  }
  // The slit, glowing at its edge, with the prey's glint caught inside.
  const slit = new Path2D();
  slit.moveTo(ex, 0.2);
  slit.quadraticCurveTo(ex + 0.075, ey, ex, 0.9);
  slit.quadraticCurveTo(ex - 0.075, ey, ex, 0.2);
  glow(l, rgba('#bff0ff', 0.95), px * 0.05, () => { l.fillStyle = '#010306'; l.fill(slit); });
  sparkle(l, ex, ey + 0.05, 0.026, '#ffffff', 0.95);
  // The lid's shadow, heavier toward the nose, and a little rim light along the bottom lid.
  l.fillStyle = linear(l, 0.3, 0.24, 0.38, 0.56, [rgba('#000000', 0.8), rgba('#000000', 0.35), rgba('#000000', 0)]);
  l.fillRect(0, 0, 1, 1);
  l.fillStyle = linear(l, 0, 0.88, 0, 0.7, [rgba('#a8e4ff', 0.35), rgba('#a8e4ff', 0)]);
  l.fillRect(0, 0, 1, 1);
  const { c: mask, ctx: m } = surface(S);
  m.filter = `blur(${px * 0.05}px)`;
  m.fill(eye);
  l.globalCompositeOperation = 'destination-in';
  l.drawImage(mask, 0, 0, 1, 1);
  ctx.drawImage(layer, 0, 0, 1, 1);
  // Catchlight.
  ctx.beginPath();
  ctx.ellipse(0.4, 0.46, 0.034, 0.02, -0.5, 0, TAU);
  ctx.fillStyle = rgba('#ffffff', 0.85); ctx.fill();
  sparkle(ctx, 0.4, 0.46, 0.085, '#ffffff', 1, 0.25);
  return c;
}
