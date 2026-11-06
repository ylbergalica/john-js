// The Flash aspect's sprites and icon.
import { seededRandom, lerp, TAU } from '../../../engine/math.js';
import { DEG, surface, rgba, glow, linear, radial, sparkle, space } from '../paint.js';
import { roughStar } from '../ui.js';

export function flashIcon(S = 256) {
  const { c, ctx, px } = surface(S);
  space(ctx, seededRandom(202), {
    core: '#1d1606', edge: '#030302',
    nebulae: [[0.5, 0.5, 0.45, '#ffcc00', 0.35], [0.7, 0.3, 0.25, '#ff8a00', 0.12]],
  });
  ctx.fillStyle = radial(ctx, 0.5, 0.5, 0.36, [rgba('#ffe14a', 0.6), rgba('#ffc400', 0.2), rgba('#ffc400', 0)]);
  ctx.fillRect(0, 0, 1, 1);
  // A burst of light rather than a star: two hazy four-arm flares crossed at an odd angle,
  // faint rays scattering between them and a bloom swallowing the middle. Everything is
  // blurred and fades out along its length, so no edge reads crisp.
  const rand = seededRandom(212);
  const fadeOut = (r, a) => radial(ctx, 0, 0, r, [rgba('#ffffff', a), rgba('#ffe680', a), rgba('#ffc42a', 0.85 * a), rgba('#f59a00', 0.5 * a), rgba('#f59a00', 0)]);
  ctx.save();
  ctx.translate(0.5, 0.5); ctx.rotate(-14 * DEG);
  // The duplicate behind, turned 38° and a little shorter.
  ctx.save();
  ctx.rotate(38 * DEG);
  ctx.filter = `blur(${px * 0.016}px)`;
  ctx.fillStyle = fadeOut(0.38, 0.9);
  ctx.fill(roughStar([0.33, 0.38, 0.29, 0.36], 0.07, rand));
  ctx.restore();
  // Faint rays: long thin slivers fading to nothing.
  ctx.save();
  ctx.filter = `blur(${px * 0.008}px)`;
  for (let i = 0; i < 7; i++) {
    const len = lerp(0.24, 0.42, rand()), w = lerp(0.008, 0.016, rand());
    ctx.save();
    ctx.rotate(((i + rand() * 0.6) / 7) * TAU);
    ctx.fillStyle = linear(ctx, 0, 0, len, 0, [rgba('#fff1a6', 0.55), rgba('#ffc42a', 0)]);
    ctx.beginPath();
    ctx.moveTo(0, -w); ctx.lineTo(len, 0); ctx.lineTo(0, w); ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  // The main flare, smeared by a few offset ghosts of itself.
  const arms = [0.4, 0.47, 0.36, 0.45];
  ctx.save();
  ctx.filter = `blur(${px * 0.022}px)`;
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.translate(lerp(-0.02, 0.02, rand()), lerp(-0.02, 0.02, rand()));
    ctx.rotate(lerp(-7, 7, rand()) * DEG);
    ctx.fillStyle = fadeOut(0.45, 0.4);
    ctx.fill(roughStar(arms.map((a) => a * lerp(0.9, 1.08, rand())), 0.09, rand));
    ctx.restore();
  }
  ctx.restore();
  glow(ctx, rgba('#ffcf3a', 0.9), px * 0.08, () => {
    ctx.filter = `blur(${px * 0.012}px)`;
    ctx.fillStyle = fadeOut(0.47, 1);
    ctx.fill(roughStar(arms, 0.06, rand));
  });
  // Bloom: a wide soft haze and a white-hot heart.
  ctx.filter = `blur(${px * 0.01}px)`;
  ctx.fillStyle = radial(ctx, 0, 0, 0.2, [rgba('#fff6cf', 0.45), rgba('#ffd65a', 0.15), rgba('#ffc42a', 0)]);
  ctx.fillRect(-0.25, -0.25, 0.5, 0.5);
  ctx.fillStyle = radial(ctx, 0, 0, 0.09, ['#ffffff', rgba('#ffffff', 0.8), rgba('#ffffff', 0)]);
  ctx.fillRect(-0.1, -0.1, 0.2, 0.2);
  ctx.restore();
  sparkle(ctx, 0.77, 0.28, 0.055, '#fff6cf', 0.8, 0.2);
  sparkle(ctx, 0.25, 0.74, 0.04, '#fff6cf', 0.65, -0.3);
  return c;
}
