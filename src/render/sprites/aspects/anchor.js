// The Anchor aspect's sprites and icon.
import { seededRandom } from '../../../engine/math.js';
import { DEG, surface, rgba, glow, linear, radial, sparkle, space } from '../paint.js';
import { crystal } from '../player.js';

// The Anchor's thrown crystal: the one on its icon, in its blues but standing upright.
export function anchorObject(S = 256) {
  const { c, ctx } = surface(S);
  ctx.fillStyle = radial(ctx, 0.5, 0.5, 0.48, [rgba('#cfe0ff', 0.6), rgba('#6d8fff', 0.2), rgba('#6d8fff', 0)]);
  ctx.fillRect(0, 0, 1, 1);
  crystal(ctx, {
    x: 0.5, y: 0.5, hw: 0.25, hh: 0.36,
    facets: ['#5d84ff', '#2848f2', '#1b33c2', '#3d63ff'],
    rim: '#0a1030', rimWidth: 0.028, cross: '#e8efff', crossWidth: 0.028,
  });
  sparkle(ctx, 0.42, 0.37, 0.09, '#ffffff', 1, 0.3);
  return c;
}

// ---------------------------------------------------------------- aspect icons

export function anchorIcon(S = 256) {
  const { c, ctx, px } = surface(S);
  space(ctx, seededRandom(101), {
    core: '#0b1236', edge: '#020309',
    nebulae: [[0.5, 0.5, 0.48, '#4f7dff', 0.45], [0.3, 0.7, 0.3, '#7a4dff', 0.18]],
  });
  ctx.fillStyle = radial(ctx, 0.5, 0.5, 0.42, [rgba('#cfe0ff', 0.55), rgba('#6d8fff', 0.18), rgba('#6d8fff', 0)]);
  ctx.fillRect(0, 0, 1, 1);
  // A cut gem: a bright table set off-centre toward the light, ringed by eight bevel
  // facets shaded from the top-left, a light-catching upper rim and faint rays behind.
  ctx.save();
  ctx.translate(0.5, 0.5);
  ctx.rotate(35 * DEG);
  const hw = 0.2, hh = 0.3;
  ctx.save();
  ctx.filter = `blur(${px * 0.005}px)`;
  for (const [len, w, a] of [[0.47, 0.016, 0], [0.47, 0.016, 180], [0.33, 0.012, 90], [0.33, 0.012, 270]]) {
    ctx.save();
    ctx.rotate((a - 90) * DEG);
    ctx.fillStyle = linear(ctx, 0, 0, len, 0, [rgba('#ffffff', 0.9), rgba('#b9cbff', 0.6), rgba('#6d8fff', 0)]);
    ctx.beginPath();
    ctx.moveTo(0, -w); ctx.lineTo(len, 0); ctx.lineTo(0, w); ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  const O = [[0, -hh], [hw, 0], [0, hh], [-hw, 0]]; // top, right, bottom, left
  const C = [-hw * 0.12, -hh * 0.1];
  const I = O.map(([x, y]) => [C[0] + x * 0.42, C[1] + y * 0.42]);
  const outline = new Path2D();
  O.forEach((p, i) => (i ? outline.lineTo(...p) : outline.moveTo(...p)));
  outline.closePath();
  glow(ctx, rgba('#6d8fff', 0.95), px * 0.07, () => { ctx.fillStyle = '#2848f2'; ctx.fill(outline); });
  // Bevels, edge by edge (top→right, right→bottom, bottom→left, left→top): [outer, inner] shades.
  const bevels = [['#7d9dff', '#5d84ff'], ['#1b33c2', '#2442d8'], ['#2848f2', '#3157f5'], ['#a9c0ff', '#86a3ff']];
  const tri = (a, b, d, color) => {
    ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...d); ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 0.003; ctx.stroke(); // closes hairline seams
  };
  O.forEach((o, i) => {
    const j = (i + 1) % 4;
    tri(o, O[j], I[j], bevels[i][0]);
    tri(o, I[j], I[i], bevels[i][1]);
  });
  const table = new Path2D();
  I.forEach((p, i) => (i ? table.lineTo(...p) : table.moveTo(...p)));
  table.closePath();
  ctx.fillStyle = linear(ctx, I[3][0], I[0][1], I[1][0], I[2][1], ['#dbe5ff', '#7f9cff', '#3d63ff']);
  ctx.fill(table);
  // Facet edges, the table's rim, then the outline: dark, with the upper edges lit.
  ctx.strokeStyle = rgba('#e8efff', 0.45);
  ctx.lineWidth = 0.006;
  ctx.beginPath();
  O.forEach((o, i) => { ctx.moveTo(...o); ctx.lineTo(...I[i]); ctx.moveTo(...o); ctx.lineTo(...I[(i + 3) % 4]); });
  ctx.stroke();
  ctx.strokeStyle = rgba('#ffffff', 0.85);
  ctx.lineWidth = 0.008;
  ctx.stroke(table);
  ctx.strokeStyle = '#0a1030';
  ctx.lineWidth = 0.02;
  ctx.stroke(outline);
  ctx.strokeStyle = rgba('#ffffff', 0.9);
  ctx.lineWidth = 0.007;
  ctx.beginPath();
  ctx.moveTo(...O[3]); ctx.lineTo(...O[0]); ctx.lineTo(...O[1]);
  ctx.stroke();
  // A soft gloss across the table.
  ctx.save();
  ctx.clip(table);
  ctx.fillStyle = radial(ctx, I[3][0] * 0.6 + C[0] * 0.4, I[0][1] * 0.6 + C[1] * 0.4, 0.06, [rgba('#ffffff', 0.75), rgba('#ffffff', 0)]);
  ctx.fillRect(-hw, -hh, 2 * hw, 2 * hh);
  ctx.restore();
  ctx.restore();
  sparkle(ctx, 0.41, 0.36, 0.075, '#ffffff', 1, 0.3);
  sparkle(ctx, 0.63, 0.66, 0.035, '#dfe8ff', 0.85, -0.2);
  sparkle(ctx, 0.66, 0.31, 0.025, '#dfe8ff', 0.7);
  return c;
}
