// The Collapsar's sprites.
import { seededRandom, lerp, lerpColor, clamp01, TAU } from '../../../engine/math.js';
import { COLLAPSAR } from '../../../data/effects.js';
import { surface, rgba, glow, radial, circlePath } from '../paint.js';

// The Collapsar: a near-black sphere, only a hair of light at its rim where its gravity bends
// its disc's glow round it. Its disc is sprites of its own, `COLLAPSAR_ART.size` across in
// world units, so its rig can spin them (COLLAPSAR.disc says how wide): a hot band close in,
// wisps out to a violet rim, and the strands it comes apart into, stunned.
export const COLLAPSAR_BODY = { r: 0.31, line: 0.02 };

export const COLLAPSAR_ART = { size: 3.4, px: 448 };

const COLLAPSAR_FIRE = [[0, '#fff2d0'], [0.22, '#ffc060'], [0.5, '#ff7a30'], [0.74, '#e0306e'], [1, '#7a3cff']];

const collapsarR = (tiles) => tiles / COLLAPSAR_ART.size;

// Its colour at `u` of the way from its inner edge to its rim.
function collapsarFire(u, alpha) {
  let i = 0;
  while (i < COLLAPSAR_FIRE.length - 2 && u > COLLAPSAR_FIRE[i + 1][0]) i++;
  const [u0, c0] = COLLAPSAR_FIRE[i], [u1, c1] = COLLAPSAR_FIRE[i + 1];
  const hex = lerpColor(parseInt(c0.slice(1), 16), parseInt(c1.slice(1), 16), clamp01((u - u0) / (u1 - u0)));
  return rgba(`#${hex.toString(16).padStart(6, '0')}`, alpha);
}

export function collapsarOutline(S = 256) {
  const { c, ctx, px } = surface(S), { r, line } = COLLAPSAR_BODY;
  ctx.strokeStyle = '#ffd9a8';
  ctx.lineWidth = line;
  glow(ctx, rgba('#ff8a3c', 0.9), px * 0.05, () => ctx.stroke(circlePath(r)));
  return c;
}

// `count` arcs round the middle, `from` to `to` (tiles), thin and fading along their lengths,
// bunched toward the inside, leaning out as they go so the whole thing reads as a whirl.
function collapsarArcs(ctx, rand, count, from, to, [alpha0, alpha1], [width0, width1], [len0, len1]) {
  const span = COLLAPSAR.disc.outer - COLLAPSAR.disc.inner, drift = collapsarR(0.1), steps = 8;
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const tiles = lerp(from, to, rand() ** 1.3), r0 = collapsarR(tiles), a0 = rand() * TAU, len = lerp(len0, len1, rand());
    const u = clamp01((tiles - COLLAPSAR.disc.inner) / span), a = lerp(alpha0, alpha1, rand());
    const at = (t) => [0.5 + Math.cos(a0 + len * t) * (r0 + drift * t), 0.5 + Math.sin(a0 + len * t) * (r0 + drift * t)];
    ctx.lineWidth = lerp(width0, width1, rand());
    for (let k = 0; k < steps; k++) {
      ctx.strokeStyle = collapsarFire(u, a * Math.sin((Math.PI * (k + 0.5)) / steps));
      ctx.beginPath();
      ctx.moveTo(...at(k / steps));
      ctx.lineTo(...at((k + 1) / steps));
      ctx.stroke();
    }
  }
}

// A ring between radii (tiles).
function collapsarRing(from, to) {
  const ring = new Path2D();
  ring.arc(0.5, 0.5, collapsarR(to), 0, TAU);
  ring.arc(0.5, 0.5, collapsarR(from), 0, TAU, true);
  return ring;
}

// One side burns brighter than the other, as the near side of a disc turning fast does: that's
// what shows it spinning, and what spins faster as it gathers itself.
function collapsarBeaming(ctx, dark) {
  const g = ctx.createConicGradient(0, 0.5, 0.5);
  g.addColorStop(0, rgba('#000000', 0));
  g.addColorStop(0.5, rgba('#000000', dark));
  g.addColorStop(1, rgba('#000000', 0));
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1, 1);
  ctx.restore();
}

export function collapsarDisc(S = COLLAPSAR_ART.px) {
  const { c, ctx, px } = surface(S), { inner, band } = COLLAPSAR.disc, rand = seededRandom(137);
  const g = ctx.createRadialGradient(0.5, 0.5, collapsarR(inner), 0.5, 0.5, collapsarR(band));
  g.addColorStop(0, rgba('#fff2d0', 0.95));
  g.addColorStop(0.25, rgba('#ffb050', 0.75));
  g.addColorStop(0.65, rgba('#ff6a2c', 0.34));
  g.addColorStop(1, rgba('#d0306e', 0));
  glow(ctx, rgba('#ff8a3c', 0.6), px * 0.02, () => {
    ctx.fillStyle = g;
    ctx.fill(collapsarRing(inner, band));
  });
  collapsarArcs(ctx, rand, 150, inner, band, [0.25, 0.8], [0.0015, 0.005], [0.5, 1.9]);
  collapsarBeaming(ctx, 0.62);
  return c;
}

export function collapsarWisps(S = COLLAPSAR_ART.px) {
  const { c, ctx, px } = surface(S), { inner, band, outer } = COLLAPSAR.disc, rand = seededRandom(139);
  const from = lerp(inner, band, 0.6);
  const g = ctx.createRadialGradient(0.5, 0.5, collapsarR(from), 0.5, 0.5, collapsarR(outer));
  g.addColorStop(0, rgba('#ff5a40', 0));
  g.addColorStop(0.3, rgba('#e0306e', 0.2));
  g.addColorStop(0.72, rgba('#7a3cff', 0.26));
  g.addColorStop(1, rgba('#7a3cff', 0));
  glow(ctx, rgba('#7a3cff', 0.5), px * 0.02, () => {
    ctx.fillStyle = g;
    ctx.fill(collapsarRing(from, outer));
  });
  collapsarArcs(ctx, rand, 110, from, outer, [0.2, 0.7], [0.002, 0.006], [0.6, 2.2]);
  collapsarBeaming(ctx, 0.5);
  return c;
}

// Its disc coming apart: long strands peeling off and trailing away, cooling to violet.
export function collapsarStrands(S = COLLAPSAR_ART.px) {
  const { c, ctx, px } = surface(S), { inner, outer } = COLLAPSAR.disc, rand = seededRandom(149), N = 9, steps = 22;
  ctx.lineCap = 'round';
  glow(ctx, rgba('#a050ff', 0.7), px * 0.014, () => {
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * TAU + rand() * 0.4, turn = lerp(1.1, 2, rand()), width = lerp(0.003, 0.008, rand());
      const at = (t) => {
        const r = collapsarR(lerp(inner, outer * 1.02, t ** 0.8));
        return [0.5 + Math.cos(a0 + turn * t) * r, 0.5 + Math.sin(a0 + turn * t) * r];
      };
      for (let k = 0; k < steps; k++) {
        const f = k / steps;
        ctx.lineWidth = width * (1 - f * 0.6);
        ctx.strokeStyle = collapsarFire(0.25 + 0.75 * f, 0.95 * (1 - f) ** 0.7);
        ctx.beginPath();
        ctx.moveTo(...at(f));
        ctx.lineTo(...at((k + 1) / steps));
        ctx.stroke();
      }
    }
  });
  return c;
}

// A gravity well on the floor: a pit of black in a thin violet rim, arms of faint fire winding in.
export function collapsarWell(S = 256) {
  const { c, ctx, px } = surface(S), r = 0.32, arms = 5, steps = 20;
  ctx.lineCap = 'round';
  for (let i = 0; i < arms; i++) {
    const a0 = (i / arms) * TAU;
    const at = (t) => [0.5 + Math.cos(a0 + t * 2.4) * lerp(0.48, r, t), 0.5 + Math.sin(a0 + t * 2.4) * lerp(0.48, r, t)];
    for (let k = 0; k < steps; k++) {
      const f = k / steps;
      ctx.lineWidth = lerp(0.006, 0.018, f);
      ctx.strokeStyle = f < 0.5 ? rgba('#7a3cff', f * 1.2) : rgba('#ff8a50', f * 0.9);
      ctx.beginPath();
      ctx.moveTo(...at(f));
      ctx.lineTo(...at((k + 1) / steps));
      ctx.stroke();
    }
  }
  ctx.fillStyle = radial(ctx, 0.5, 0.5, r, ['#020104', '#040208', '#0a0414']);
  ctx.fill(circlePath(r));
  ctx.strokeStyle = '#c090ff';
  ctx.lineWidth = 0.012;
  glow(ctx, rgba('#8a3cff', 0.95), px * 0.05, () => ctx.stroke(circlePath(r)));
  return c;
}
