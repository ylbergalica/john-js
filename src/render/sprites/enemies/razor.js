// The Razor's sprites.
import { seededRandom, lerp, TAU } from '../../../engine/math.js';
import { RAZOR } from '../../../data/effects.js';
import { surface, rgba, polar, glow, radial } from '../paint.js';
import { outline } from './common.js';

// The Razor: a plain circle with a V on its front, its point ahead, in the outline's colour
// (`vee`: its point and its arms' ends, along +x from the centre and across). Its disc and
// blades are sprites of their own, `RAZOR_ART.size` across in world units, so its rig can
// spin them (RAZOR.disc says how wide).
const RAZOR_BODY = { r: 0.31, line: 0.05, vee: { tip: 0.22, back: 0.05, across: 0.17, line: 0.05 } };

const RAZOR_PALETTE = { stroke: ['#ffffff', '#eef2fa', '#b4becf'], glow: rgba('#dfe8ff', 0.7) };

export const RAZOR_ART = { size: 2, px: 384 };

// RAZOR.disc's radii in a unit square `RAZOR_ART.size` across.
const razorRing = () => ({ inner: RAZOR.disc.inner / RAZOR_ART.size, outer: RAZOR.disc.outer / RAZOR_ART.size });

export function razorPath() {
  const p = new Path2D();
  p.arc(0.5, 0.5, RAZOR_BODY.r, 0, TAU);
  return p;
}

export function razorOutline(S = 256) {
  const { line, vee } = RAZOR_BODY;
  return outline(S, RAZOR_PALETTE, (ctx) => {
    ctx.lineWidth = line;
    ctx.stroke(razorPath());
    ctx.lineWidth = vee.line;
    ctx.lineJoin = 'miter';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0.5 + vee.back, 0.5 - vee.across);
    ctx.lineTo(0.5 + vee.tip, 0.5);
    ctx.lineTo(0.5 + vee.back, 0.5 + vee.across);
    ctx.stroke();
  });
}

// The blades at full speed: a thick pale disc, brighter out to its rim, streaked round with
// fine arcs of motion blur that show it turning.
export function razorDisc(S = RAZOR_ART.px) {
  const { c, ctx, px } = surface(S), { inner, outer } = razorRing(), rand = seededRandom(109);
  const ring = new Path2D();
  ring.arc(0.5, 0.5, outer, 0, TAU);
  ring.arc(0.5, 0.5, inner, 0, TAU, true);
  glow(ctx, rgba('#dfe8ff', 0.75), px * 0.03, () => {
    const g = ctx.createRadialGradient(0.5, 0.5, inner, 0.5, 0.5, outer);
    g.addColorStop(0, 'rgba(226, 232, 244, 0.22)');
    g.addColorStop(0.3, 'rgba(232, 238, 248, 0.5)');
    g.addColorStop(0.8, 'rgba(242, 246, 255, 0.72)');
    g.addColorStop(1, 'rgba(255, 255, 255, 0.95)');
    ctx.fillStyle = g;
    ctx.fill(ring);
  });
  ctx.save();
  ctx.clip(ring);
  ctx.lineCap = 'round';
  for (let i = 0; i < 90; i++) {
    const r = lerp(inner, outer, rand()), a = rand() * TAU, len = lerp(0.3, 1.5, rand()), bright = rand() < 0.6;
    ctx.strokeStyle = bright ? rgba('#ffffff', lerp(0.2, 0.7, rand())) : rgba('#5c6578', lerp(0.15, 0.45, rand()));
    ctx.lineWidth = lerp(0.0015, 0.006, rand());
    ctx.beginPath();
    ctx.arc(0.5, 0.5, r, a, a + len);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 0.006;
  ctx.beginPath();
  ctx.arc(0.5, 0.5, outer - 0.003, 0, TAU);
  ctx.stroke();
  return c;
}

// The blades themselves, seen once they slow: steel crescents swept round the way they turn.
export function razorBlades(S = RAZOR_ART.px) {
  const { c, ctx, px } = surface(S), { inner, outer } = razorRing(), { blades, sweep } = RAZOR.disc;
  const at = (deg, r) => polar(0.5, 0.5, deg, r), mid = (inner + outer) / 2;
  glow(ctx, rgba('#dfe8ff', 0.6), px * 0.02, () => {
    for (let i = 0; i < blades; i++) {
      const a = (i * 360) / blades;
      const p = new Path2D();
      p.moveTo(...at(a, inner));
      p.quadraticCurveTo(...at(a + sweep * 0.3, mid + (outer - mid) * 0.5), ...at(a + sweep, outer)); // its cutting edge, out to the tip
      p.quadraticCurveTo(...at(a + sweep * 0.55, inner + (outer - inner) * 0.28), ...at(a + sweep * 0.42, inner));
      p.closePath();
      ctx.fillStyle = radial(ctx, 0.5, 0.5, outer, ['#7e8798', '#f4f7ff']);
      ctx.fill(p);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.005;
      ctx.stroke(p);
    }
  });
  return c;
}
