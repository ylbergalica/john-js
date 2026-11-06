// The Oracle aspect's sprites and icon.
import { seededRandom, TAU } from '../../../engine/math.js';
import { DEG, surface, rgba, glow, linear, radial, sparkle, space } from '../paint.js';

// ---------------------------------------------------------------- oracle discs

// The Oracle disc's sprites: the disc's radius as a fraction of half the texture's width (and
// for its glow, the radius its light rings out at).
export const ORACLE_DISC = { fill: 0.92, glow: 0.25 };

// A thin ring, its hole `hole` of its radius; the teal covers half of it from `band` out.
// `blur`: the band smeared round the turn in play, teal or, while Exalted, crimson.
export const ORACLE = { teal: '#22d3c0', bright: '#46f0dc', deep: '#0e8c80', hole: 0.7, band: 0.79, blur: '#9aeee4', exalted: '#ff7488' };

// The disc in play, seen from above and spinning so fast it blurs: a thin ring, white on its
// inside and, outside that, the teal round half of it smeared all the way round into one pale
// teal (`blur`), bright edges, and two smears of light chasing round it so the spin shows.
export function oracleDisc(blur = ORACLE.blur, S = 128) {
  const { c, ctx } = surface(S);
  const r = 0.5 * ORACLE_DISC.fill, h = r * ORACLE.hole, b = r * ORACLE.band;
  ctx.translate(0.5, 0.5);
  const ring = (outer, inner) => {
    ctx.beginPath();
    ctx.arc(0, 0, outer, 0, TAU);
    ctx.arc(0, 0, inner, TAU, 0, true);
  };
  ring(r, h);
  ctx.fillStyle = '#ffffff';
  ctx.fill('evenodd');
  ring(r, b);
  ctx.fillStyle = blur;
  ctx.fill('evenodd');
  // Two smears of light, each bright at its leading edge and trailing off round the turn.
  const smear = ctx.createConicGradient(0, 0, 0);
  for (const [at, a] of [[0, 0.7], [0.4, 0], [0.46, 0], [0.5, 0.7], [0.9, 0], [0.96, 0], [1, 0.7]]) smear.addColorStop(at, rgba('#ffffff', a));
  ring(r, h);
  ctx.fillStyle = smear;
  ctx.fill('evenodd');
  ctx.lineWidth = 0.01;
  ctx.strokeStyle = '#ffffff';
  for (const k of [r - 0.005, h + 0.005]) {
    ctx.beginPath();
    ctx.arc(0, 0, k, 0, TAU);
    ctx.stroke();
  }
  return c;
}

// The light the spinning disc gives off: a soft ring of it at ORACLE_DISC.glow of the width,
// falling away inside and out, a faint haze across the hole.
export function oracleGlow(S = 128) {
  const { c, ctx } = surface(S);
  const g = ctx.createRadialGradient(0.5, 0.5, 0, 0.5, 0.5, 0.5);
  [[0, 0.12], [0.3, 0.18], [ORACLE_DISC.glow * 2 - 0.1, 0.6], [ORACLE_DISC.glow * 2, 1], [ORACLE_DISC.glow * 2 + 0.12, 0.35], [1, 0]]
    .forEach(([at, a]) => g.addColorStop(at, rgba('#ffffff', a)));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1, 1);
  return c;
}

// Two Oracle discs flying at the viewer out of the far left, the far one small and high, the near
// one big and low on the right, each trailing teal light from its whole width that narrows back
// toward where they came from. Each stands nearly on edge, turned side-on: a thin ring of white
// metal, teal round the outside of half of it, the teal smeared a little behind it as it spins.
export function oracleIcon(S = 256) {
  const { c, ctx, px } = surface(S);
  space(ctx, seededRandom(5101), {
    core: '#041a1c', edge: '#010506', stars: 20,
    nebulae: [[0.6, 0.58, 0.45, '#1fc8b8', 0.24], [0.2, 0.42, 0.3, '#8ff5ea', 0.08]],
  });
  const V = [-0.05, 0.42], SQUASH = 0.35, TILT = 14 * DEG, THICK = 0.04;
  const discs = [
    { x: 0.36, y: 0.32, r: 0.12, spin: 190 * DEG },
    { x: 0.7, y: 0.6, r: 0.31, spin: 10 * DEG },
  ];
  ctx.fillStyle = radial(ctx, 0.66, 0.6, 0.4, [rgba('#8ff5ea', 0.2), rgba(ORACLE.teal, 0.08), rgba(ORACLE.teal, 0)]);
  ctx.fillRect(0, 0, 1, 1);

  // A trail from the disc's whole width narrowing to a thread at V, brightest at the disc and
  // fading back along it, `w` times that width. Its sides leave the ring where it reaches out
  // furthest either side of the line back to V, so they graze it.
  const trail = ({ x, y, r }, w) => {
    const dx = V[0] - x, dy = V[1] - y, l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l, nx = -uy, ny = ux;
    const a = [Math.cos(TILT), Math.sin(TILT)], b = [-Math.sin(TILT), Math.cos(TILT)], ra = r * SQUASH;
    const th = Math.atan2(r * (nx * b[0] + ny * b[1]), ra * (nx * a[0] + ny * a[1]));
    const ex = (ra * Math.cos(th) * a[0] + r * Math.sin(th) * b[0]) * w, ey = (ra * Math.cos(th) * a[1] + r * Math.sin(th) * b[1]) * w;
    const n = 48, left = [], right = [], thread = 0.002;
    for (let i = 0; i <= n; i++) {
      const t = i / n, k = (1 - t) ** 2.4, cx = x + ux * l * t, cy = y + uy * l * t;
      left.push([cx + ex * k + nx * thread, cy + ey * k + ny * thread]);
      right.push([cx - ex * k - nx * thread, cy - ey * k - ny * thread]);
    }
    const p = new Path2D();
    [...left, ...right.reverse()].forEach((q, i) => (i ? p.lineTo(...q) : p.moveTo(...q)));
    p.closePath();
    return { p, fade: (color, alpha) => linear(ctx, x, y, x + ux * l * 0.85, y + uy * l * 0.85, [rgba(color, alpha), rgba(color, alpha * 0.45), rgba(color, 0)]) };
  };

  // The ring between radii `outer` and `inner`, from `from` round to `to`.
  const arcBand = (outer, inner, from = 0, to = TAU) => {
    const p = new Path2D();
    p.arc(0, 0, outer, from, to);
    p.arc(0, 0, inner, to, from, true);
    p.closePath();
    return p;
  };
  // The teal: half the ring, from ORACLE.band out to the rim, starting `spin` round.
  const band = (spin) => arcBand(1, ORACLE.band, spin, spin + Math.PI);
  const face = (ctx, spin) => {
    const ring = arcBand(1, ORACLE.hole);
    ctx.fillStyle = radial(ctx, 0, 0, 1.3, ['#ffffff', '#f2f8f8', '#cfdfdf'], -0.35, -0.4);
    ctx.fill(ring);
    // Smeared copies of the teal behind its leading edge, fainter the further back.
    for (let i = 4; i >= 1; i--) {
      ctx.globalAlpha = 0.14 * (5 - i) / 4;
      ctx.fillStyle = ORACLE.teal;
      ctx.fill(band(spin - i * 9 * DEG));
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = linear(ctx, -1, -1, 1, 1, [ORACLE.bright, ORACLE.teal, '#17b3a4', ORACLE.bright]);
    ctx.fill(band(spin));
    // Both edges catching the light.
    ctx.lineWidth = 0.03;
    ctx.strokeStyle = '#ffffff';
    for (const k of [1, ORACLE.hole]) {
      ctx.beginPath();
      ctx.arc(0, 0, k, 0, TAU);
      ctx.stroke();
    }
  };
  // The disc at `d`, turned side-on: its thin edge first, just behind, then its face; painted on its
  // own so the glow goes round it whole.
  const disc = (d) => {
    const { c: out, ctx: g } = surface(S);
    const place = (dx) => {
      g.translate(d.x + dx, d.y);
      g.rotate(TILT);
      g.scale(d.r * SQUASH, d.r);
    };
    g.save();
    place(-d.r * THICK);
    g.fillStyle = ORACLE.deep;
    g.fill(arcBand(1, ORACLE.hole));
    g.restore();
    g.save();
    place(0);
    face(g, d.spin);
    g.restore();
    return out;
  };

  for (const d of discs) {
    const t = trail(d, 1), wide = trail(d, 1.25), core = trail(d, 0.35);
    // The trail streams off the ring itself: none of it shows through the hole.
    const open = new Path2D();
    open.rect(0, 0, 1, 1);
    open.ellipse(d.x, d.y, d.r * SQUASH * ORACLE.hole, d.r * ORACLE.hole, TILT, 0, TAU);
    ctx.save();
    ctx.clip(open, 'evenodd');
    ctx.save();
    ctx.filter = `blur(${px * 0.025}px)`;
    ctx.fillStyle = wide.fade(ORACLE.teal, 0.35);
    ctx.fill(wide.p);
    ctx.restore();
    ctx.fillStyle = t.fade(ORACLE.teal, 0.7);
    ctx.fill(t.p);
    ctx.save();
    ctx.filter = `blur(${px * 0.006}px)`;
    ctx.fillStyle = core.fade('#e8fffb', 0.7);
    ctx.fill(core.p);
    ctx.restore();
    ctx.restore();
    const art = disc(d);
    glow(ctx, rgba('#46f0dc', 0.7), px * d.r * 0.4, () => ctx.drawImage(art, 0, 0, 1, 1));
  }
  const near = discs[1];
  const [gx, gy] = [near.r * SQUASH * 0.7, -near.r * 0.7]; // on its rim, up and out
  sparkle(ctx, near.x + gx * Math.cos(TILT) - gy * Math.sin(TILT), near.y + gx * Math.sin(TILT) + gy * Math.cos(TILT), 0.06, '#ffffff', 0.9, 0.3);
  return c;
}
