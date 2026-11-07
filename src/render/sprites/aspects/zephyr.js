// The Zephyr aspect's swings and icon.
import { seededRandom, lerp, clamp01 } from '../../../engine/math.js';
import { DEG, surface, rgba, glow, radial, linear, sparkle, space } from '../paint.js';
import { arcBlade, SLASH } from '../combat.js';
import { PLAYER } from '../../../data/player.js';

// A swing: a round crescent sweeping about the player in the usual swings' white over
// periwinkle (SLASH), a piece of a circle round their centre, from `from` to `to` degrees off
// the aim: across the front of them and on round both sides, nearly to their flanks. Its inner
// edge keeps to one circle all the way along, `r` - width / 2 out from their centre, so its ends
// are as close to them as its middle; it swells outward from there, `width` thick at its middle
// (reaching r + width / 2), full along most of its length and thinning near either end into a
// sharp point, so it's all but symmetric. Laid out in world units about the player's centre,
// aiming along +x, in a square `size` across (src/aspects/zephyr.js mounts it on the player,
// mirrors every other one and draws it see-through). Its `frames`: the head sweeps round over
// the first `head` of them and the tail after it over the last `tail`, each easing in and out,
// so most frames go to the arc growing and shrinking and few to it at its longest; it fades
// over the last `fade`. Each frame is a part of the one whole crescent, its moving ends drawn
// in to a point over at most `taper` of the sweep (see paintArc).
const A = PLAYER.attack;
export const ZEPHYR_ARC = {
  size: 2.6, r: A.attackRange + 0.15, width: 0.23, from: -86, to: 86,
  frames: 8, head: 0.55, tail: 0.55, fade: 0.4, taper: 0.18, seed: 31,
};

const easeInOut = (t) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(t));

// The [tail, head] (degrees) and opacity of the arc at `p` (0 … 1) through the swing.
function span(p) {
  const Z = ZEPHYR_ARC, f = clamp01((p - (1 - Z.fade)) / Z.fade);
  return {
    head: lerp(Z.from, Z.to, easeInOut(p / Z.head)),
    tail: lerp(Z.from, Z.to, easeInOut((p - (1 - Z.tail)) / Z.tail)),
    alpha: 1 - 0.55 * f * f,
  };
}

// A band round (cx, cy) from `tail` to `head` (degrees) standing on the circle `r`: at each
// angle along it it's `w` × thick(degrees) thick, and it covers the part from `f0` to `f1` of
// that thickness out from the circle. Every band on the same circle comes to the same sharp
// points, on the circle, wherever `thick` comes to 0.
function band({ cx, cy, r, tail, head }, w, thick, f0 = 0, f1 = 1, n = 128) {
  const outer = [], inner = [];
  for (let i = 0; i <= n; i++) {
    const deg = lerp(tail, head, i / n), t = w * thick(deg), a = deg * DEG, c = Math.cos(a), s = Math.sin(a);
    outer.push([cx + c * (r + t * f1), cy + s * (r + t * f1)]);
    inner.push([cx + c * (r + t * f0), cy + s * (r + t * f0)]);
  }
  const path = new Path2D();
  path.moveTo(...outer[0]);
  for (const p of outer) path.lineTo(...p);
  for (let i = n; i >= 0; i--) path.lineTo(...inner[i]);
  path.closePath();
  return path;
}

// One frame of a swing: the part from `tail` to `head` of the whole crescent (ZEPHYR_ARC from
// `from` to `to`), `width` thick at its middle line `r` (all normalised), its layers as the
// usual swings': a periwinkle haze and glow under a pale body, white toward its outer edge, the
// head tinged periwinkle; and a faint thread just inside its middle. How thick it is at any
// angle is the whole crescent's thickness there (one smooth arch, thickest in the middle, its
// outer edge curving evenly down into a sharp point at each end), drawn in to a point too where
// the part showing ends short of the crescent's own ends, over at most `taper` of the sweep.
// So no frame is ever thicker anywhere than the whole crescent.
function paintArc(ctx, px, { cx, cy, r, width, tail, head }) {
  const Z = ZEPHYR_ARC, base = r - width / 2; // the inner edge's circle
  const L = Math.max(1e-3, Math.min((Z.to - Z.from) * Z.taper, (head - tail) / 2));
  const whole = (deg) => Math.sin(Math.PI * clamp01((deg - Z.from) / (Z.to - Z.from)));
  const cut = (deg) => Math.sin((Math.PI / 2) * clamp01(Math.min(deg - tail, head - deg) / L));
  const even = (k) => (deg) => (whole(deg) * cut(deg)) ** k;
  const arc = (thick, f0, f1) => band({ cx, cy, r: base, tail, head }, width, thick, f0, f1);
  ctx.save();
  ctx.filter = `blur(${px * width * 0.35}px)`;
  ctx.fillStyle = rgba('#8a9cff', 0.35);
  ctx.fill(arc(even(0.9), -0.4, 1.4));
  ctx.restore();
  glow(ctx, SLASH.glow, px * width * 0.4, () => {
    ctx.fillStyle = SLASH.body;
    ctx.fill(arc(even(1), 0, 1));
  });
  // White toward the tail, the usual tip tint toward the head.
  const a0 = tail * DEG, a1 = head * DEG;
  ctx.fillStyle = linear(ctx, cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, ['#ffffff', '#ffffff', SLASH.tipColor]);
  ctx.fill(arc(even(1.15), 0.31, 0.93));
  ctx.fillStyle = '#ffffff';
  ctx.fill(arc(even(1.4), 0.55, 0.85));
  const t0 = lerp(tail, head, 0.3), t1 = lerp(tail, head, 0.7);
  if (t1 - t0 > 3) {
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = SLASH.body;
    const thread = (deg) => (Math.sin(Math.PI * clamp01((deg - t0) / (t1 - t0))) * whole(deg)) ** 1.5;
    ctx.fill(band({ cx, cy, r: base - width * 0.35, tail: t0, head: t1 }, width * 0.16, thread));
    ctx.globalAlpha = 1;
  }
}

export function zephyrSwingFrames(S = 320) {
  const Z = ZEPHYR_ARC;
  return Array.from({ length: Z.frames }, (_, i) => {
    const { c, ctx, px } = surface(S);
    const { tail, head, alpha } = span(lerp(0.1, 0.93, i / (Z.frames - 1))); // from already under way to all but gone
    if (head - tail < 1) return c;
    paintArc(ctx, px, { cx: 0.5, cy: 0.5, r: Z.r / Z.size, width: Z.width / Z.size, tail, head });
    // Faded as a whole: paintArc sets its own alphas outright, so fade the finished canvas.
    if (alpha < 1) {
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = `rgba(0,0,0,${alpha})`;
      ctx.fillRect(0, 0, 1, 1);
    }
    return c;
  });
}

// Where the head of a swing is `t` (0 … 1) through its art, in degrees off the aim, and
// whether it's still sweeping (for the motes it sheds).
export function zephyrHead(t) {
  const { head } = span(clamp01(t));
  return { deg: head, sweeping: t < ZEPHYR_ARC.head };
}

// ---------------------------------------------------------------- icon

// One great crescent of a swing, white and see-through, sweeping almost all the way round:
// out of a hair at the bottom left (`from`, degrees), up over the left and the top, swelling
// to its thickest at the top right (`peak`), and on round the right and the bottom, thinning
// back to a hair just short of where it began (`to`). Faint echoes ride inside and outside it,
// a glint flares on its crest, and a few motes are shed off it, all over deep blue space.
const ICON_ARC = { r: 0.34, width: 0.15, from: 128, peak: 318, to: 476 };

export function zephyrIcon(S = 256) {
  const { c, ctx, px } = surface(S);
  const rand = seededRandom(733);
  space(ctx, rand, {
    core: '#0d1233', edge: '#02030a', stars: 28,
    nebulae: [[0.5, 0.5, 0.46, '#4a5cff', 0.28], [0.72, 0.28, 0.26, '#b4c2ff', 0.16]],
  });
  const R = ICON_ARC, cx = 0.5, cy = 0.5;
  const crest = [cx + Math.cos(R.peak * DEG) * R.r, cy + Math.sin(R.peak * DEG) * R.r];
  ctx.fillStyle = radial(ctx, ...crest, 0.42, [rgba('#dfe5ff', 0.3), rgba('#8a9cff', 0.12), rgba('#8a9cff', 0)]);
  ctx.fillRect(0, 0, 1, 1);

  // Its width along it (s = 0 at `from`, 1 at `to`): nothing at either end, fullest at the
  // peak, swelling quicker toward it than it thins after.
  const at = (R.peak - R.from) / (R.to - R.from);
  const profile = (s) => (s < at ? Math.sin((Math.PI / 2) * (s / at)) ** 2.4 : Math.cos((Math.PI / 2) * ((s - at) / (1 - at))) ** 1.6);
  const arc = (dr, w, p = profile, from = R.from, to = R.to) => arcBlade({ cx, cy, r: R.r + dr, from, to, width: w, profile: p }, 120);

  // Painted on its own layer, then laid down see-through.
  const L = surface(S), g = L.ctx;
  g.save();
  g.filter = `blur(${px * R.width * 0.3}px)`;
  g.fillStyle = rgba('#8a9cff', 0.45);
  g.fill(arc(0, R.width * 1.9));
  g.restore();
  glow(g, SLASH.glow, px * R.width * 0.35, () => {
    g.fillStyle = SLASH.body;
    g.fill(arc(0, R.width));
  });
  g.fillStyle = linear(g, 0.1, 0.9, ...crest, [SLASH.tipColor, '#ffffff', '#ffffff']);
  g.fill(arc(R.width * 0.12, R.width * 0.62));
  g.fillStyle = '#ffffff';
  g.fill(arc(R.width * 0.22, R.width * 0.28, (s) => profile(s) ** 1.8));
  // Echoes: a thin one outside over its crest, a fainter one inside, a wisp further in.
  const thin = (s) => Math.sin(Math.PI * s) ** 0.8;
  g.globalAlpha = 0.55;
  g.fillStyle = SLASH.body;
  g.fill(arc(R.width * 0.78, R.width * 0.12, thin, 230, 400));
  g.globalAlpha = 0.32;
  g.fill(arc(-R.width * 0.78, R.width * 0.1, thin, 250, 420));
  g.globalAlpha = 0.18;
  g.fill(arc(-R.width * 1.25, R.width * 0.07, thin, 280, 380));
  g.globalAlpha = 1;
  ctx.globalAlpha = 0.72;
  ctx.drawImage(L.c, 0, 0, 1, 1);
  ctx.globalAlpha = 1;

  // Motes shed off its outer edge, blown on the way it sweeps; the glint on its crest.
  for (let i = 0; i < 9; i++) {
    const deg = lerp(250, 430, rand()), a = deg * DEG, d = R.r + R.width * lerp(0.45, 0.95, rand());
    sparkle(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d, lerp(0.012, 0.03, rand()), '#ffffff', lerp(0.4, 0.85, rand()), rand());
  }
  const out = R.r + R.width * 0.25;
  sparkle(ctx, cx + Math.cos(R.peak * DEG) * out, cy + Math.sin(R.peak * DEG) * out, 0.075, '#ffffff', 1, 0.15);
  return c;
}
