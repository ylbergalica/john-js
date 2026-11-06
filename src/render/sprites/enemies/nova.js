// The Nova's sprites.
import { seededRandom, lerpColor } from '../../../engine/math.js';
import { NOVA } from '../../../data/effects.js';
import { surface, rgba, glow, radial, circlePath } from '../paint.js';
import { nebula } from './common.js';

// The Nova's body, a plain circle `r` across: its rim lit in every one of NOVA.hues round it
// (paled toward white by `pale`), and inside, `clouds` of every hue mixing over a glow
// fading from warm white to deep violet at the edge, round a white-hot heart `heart` across.
const NOVA_ART = { r: 0.3, line: 0.04, pale: 0.4, clouds: 0.34, heart: 0.15, seed: 89 };

const hexOf = (n) => `#${n.toString(16).padStart(6, '0')}`;

export function novaOutline(S = 256) {
  const { c, ctx, px } = surface(S);
  const hues = NOVA.hues, g = ctx.createConicGradient(0, 0.5, 0.5);
  const pale = (h) => hexOf(lerpColor(h, 0xffffff, NOVA_ART.pale));
  hues.forEach((h, i) => g.addColorStop(i / hues.length, pale(h)));
  g.addColorStop(1, pale(hues[0]));
  ctx.strokeStyle = g;
  ctx.lineWidth = NOVA_ART.line;
  glow(ctx, rgba('#ffffff', 0.6), px * 0.04, () => ctx.stroke(circlePath(NOVA_ART.r)));
  return c;
}

export function novaVoid(S = 256) {
  const { c, ctx } = surface(S);
  const rand = seededRandom(NOVA_ART.seed);
  ctx.fillStyle = radial(ctx, 0.5, 0.5, NOVA_ART.r, ['#fff4dc', '#ff9fb8', '#7a3cc8', '#1c0a3a']);
  ctx.fill(circlePath(NOVA_ART.r));
  ctx.globalCompositeOperation = 'source-atop'; // only over the body
  nebula(ctx, rand, NOVA.hues.map((h) => [hexOf(h), NOVA_ART.clouds]), NOVA.hues.length * 2, [0.22, 0.78, 0.22, 0.78]);
  ctx.fillStyle = radial(ctx, 0.5, 0.5, NOVA_ART.heart, [rgba('#ffffff', 1), rgba('#fff6dc', 0.6), rgba('#ffffff', 0)]);
  ctx.fillRect(0, 0, 1, 1);
  return c;
}
