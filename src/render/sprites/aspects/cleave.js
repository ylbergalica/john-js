// The Cleave aspect's sprites and icon.
import { seededRandom, lerp } from '../../../engine/math.js';
import { DEG, surface, rgba, glow, linear, radial, sparkle, space } from '../paint.js';
import { arcBlade, PARRY_ARC } from '../combat.js';

// Cleave's palette: solid black edged in dark red.
const CLEAVE = { body: '#000000', edge: '#8c0d16', glow: rgba('#6e0610', 0.7) };

// A vesica (the lens where two circles overlap) centred on the origin, its long axis on y:
// half-length L, half-width w. Each edge is an arc of radius R on a circle centred `off`
// across from it. Returns the outline and its left and right edges, both running from -L to L.
function vesica(L, w, n = 48) {
  const R = (L * L / w + w) / 2, off = R - w;
  const edge = (side) => Array.from({ length: n + 1 }, (_, i) => {
    const y = lerp(-L, L, i / n);
    return [side * (Math.sqrt(R * R - y * y) - off), y];
  });
  const left = edge(-1), right = edge(1);
  const path = new Path2D();
  [...right, ...[...left].reverse()].forEach((p, i) => (i ? path.lineTo(...p) : path.moveTo(...p)));
  path.closePath();
  return { path, left, right };
}

// Cleave's look: a black shape outlined in red. The outline is stroked under the fill so
// only its outer half shows.
function paintCleave(ctx, path, { line, edge = CLEAVE.edge, glowColor, blur }) {
  glow(ctx, glowColor, blur, () => {
    ctx.strokeStyle = edge;
    ctx.lineWidth = line;
    ctx.stroke(path);
  });
  ctx.fillStyle = CLEAVE.body;
  ctx.fill(path);
}

// The Cleave aspect's flying slash: the full parry arc, tapered at both ends, with a bolder
// edge than the icon's so it holds up small and moving. Exported so the aspect can shed
// motes from along it.
export const CLEAVE_ARC = { ...PARRY_ARC, width: 0.12, from: 52, to: -52 };

export function cleaveSlash(S = 256) {
  const { c, ctx, px } = surface(S);
  const path = arcBlade({ ...CLEAVE_ARC, profile: (s) => Math.sin(Math.PI * s) ** 0.7 });
  paintCleave(ctx, path, { line: 0.05, edge: '#a8101d', glowColor: rgba('#8c0d16', 0.85), blur: px * 0.045 });
  return c;
}

// A slim black vesica (the lens where two circles overlap) laid on the diagonal, edged in
// dark red over a red haze, with a thin lit sliver along one edge.
export function cleaveIcon(S = 256) {
  const { c, ctx, px } = surface(S);
  space(ctx, seededRandom(303), {
    core: '#1c0307', edge: '#030001', stars: 30,
    nebulae: [[0.5, 0.5, 0.45, '#b3121f', 0.4], [0.7, 0.3, 0.26, '#ff3b2f', 0.12]],
  });
  ctx.fillStyle = radial(ctx, 0.5, 0.5, 0.4, [rgba('#d4202c', 0.45), rgba('#8c0d16', 0.15), rgba('#8c0d16', 0)]);
  ctx.fillRect(0, 0, 1, 1);
  const L = 0.47;
  const { path: lens, left } = vesica(L, 0.075);
  ctx.save();
  ctx.translate(0.5, 0.5);
  ctx.rotate(45 * DEG);
  paintCleave(ctx, lens, { line: 0.03, glowColor: rgba('#e0202e', 0.9), blur: px * 0.08 });
  // A sharp highlight hugging the upper-left edge, fading toward the tips.
  ctx.save();
  ctx.clip(lens);
  ctx.translate(0.012, 0);
  ctx.strokeStyle = linear(ctx, 0, -L, 0, L, [rgba('#ff5a4f', 0), rgba('#ff5a4f', 0.6), rgba('#ff5a4f', 0)]);
  ctx.lineWidth = 0.012;
  ctx.beginPath();
  left.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
  ctx.stroke();
  ctx.restore();
  ctx.restore();
  const [tx, ty] = [0.5 + Math.SQRT1_2 * L, 0.5 - Math.SQRT1_2 * L];
  sparkle(ctx, tx, ty, 0.06, '#ffd0cc', 0.9, 0.3);
  return c;
}
