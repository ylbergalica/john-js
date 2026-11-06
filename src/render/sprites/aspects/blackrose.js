// The Blackrose aspect's sprites and icon.
import { seededRandom, lerp, clamp01, TAU } from '../../../engine/math.js';
import { DEG, surface, rgba, glow, linear, radial, space } from '../paint.js';

// ---------------------------------------------------------------- black rose

// A black rose, painted: seen from the side and a little above, leaning to the right, hanging in
// the air on a short stem that fades out below a pair of small thorns. Each petal is a curved
// sheet round the flower's axis (ROSE.layers: a tight spiral at the heart, cupped petals round
// it, the outer ones opening and rolling back to points), projected and shaded by how it faces a
// soft light from the front left: near black, its lit side only a few shades up, darkest down at
// its base, with faint veins, its lip rolled over a shadow, and a soft shadow cast on whatever is
// behind it. Fine grain over all of it, like paint on paper, and a faint white light behind.
const ROSE = {
  hip: [0.5, 0.6], lean: 12 * DEG, view: 0.3, // view: how far it's seen from above (sin of the angle)
  light: [-0.55, 0.83], // the light's direction across and toward the viewer
  dark: 3, lit: 66, // grey levels (0-255) of a petal facing away from the light and full on
  // Per ring of petals, inside out: how many, their height, radius at base and top, half-width
  // (radians) at base and top, how far the lip flares out, how round the top is, how far its
  // middle rises to a point, and where the first one turns to.
  layers: [
    { n: 3, h: 0.225, rb: 0.006, rt: 0.028, wb: 0.7, wt: 1.5, flare: 0.006, round: 0.25, point: 0, at: 0.4 },
    { n: 4, h: 0.215, rb: 0.012, rt: 0.06, wb: 0.55, wt: 1.05, flare: 0.014, round: 0.36, point: 0.006, at: 1.3 },
    { n: 5, h: 0.195, rb: 0.02, rt: 0.098, wb: 0.48, wt: 0.88, flare: 0.03, round: 0.42, point: 0.016, at: 0.2 },
    { n: 5, h: 0.16, rb: 0.026, rt: 0.135, wb: 0.42, wt: 0.82, flare: 0.055, round: 0.46, point: 0.03, at: 0.85 },
    { n: 4, h: 0.11, rb: 0.03, rt: 0.15, wb: 0.42, wt: 0.85, flare: 0.07, round: 0.5, point: 0.034, at: 0.1 },
  ],
};

export function blackRoseIcon(S = 256) {
  const { c, ctx, px } = surface(S);
  const rand = seededRandom(6607), jit = (k) => (rand() * 2 - 1) * k;
  space(ctx, seededRandom(6607), { core: '#0b0b0d', edge: '#020203', stars: 16 });
  ctx.fillStyle = radial(ctx, 0.5, 0.44, 0.42, [rgba('#ffffff', 0.06), rgba('#ffffff', 0.02), rgba('#ffffff', 0)]);
  ctx.fillRect(0, 0, 1, 1);
  const blur = (k) => `blur(${px * k}px)`;
  const grey = (v, a = 1) => `rgba(${v},${v},${Math.round(v * 1.06)},${a})`; // the faintest cool cast
  const [hx, hy] = ROSE.hip;

  // The stem: curving down from the hip and fading out, round (dark at its sides, a soft lit
  // line down its left), and its thorns, small hooks pointing up along it, a side each.
  const st = [ROSE.hip, [0.488, 0.68], [0.462, 0.76], [0.455, 0.9]];
  const stemAt = (t) => {
    const u = 1 - t, k = [u ** 3, 3 * u * u * t, 3 * u * t * t, t ** 3], d = [-3 * u * u, 3 * u * u - 6 * u * t, 6 * u * t - 3 * t * t, 3 * t * t];
    const sum = (w, i) => w.reduce((a, wj, j) => a + wj * st[j][i], 0), tx = sum(d, 0), ty = sum(d, 1), l = Math.hypot(tx, ty);
    return { x: sum(k, 0), y: sum(k, 1), tx: tx / l, ty: ty / l };
  };
  const stem = new Path2D();
  stem.moveTo(...st[0]);
  stem.bezierCurveTo(...st[1], ...st[2], ...st[3]);
  const fading = (v, a) => linear(ctx, ...st[0], ...st[3], [grey(v, a), grey(v, a), grey(v, a * 0.4), grey(v, 0)]);
  for (const [w, v, a, dx, b] of [[0.015, 14, 1, 0, 0], [0.009, 22, 0.9, -0.002, 0.004], [0.003, 44, 0.5, -0.004, 0.003]]) {
    ctx.save();
    ctx.filter = b ? blur(b) : 'none';
    ctx.translate(dx, 0);
    ctx.lineWidth = w;
    ctx.strokeStyle = fading(v, a);
    ctx.stroke(stem);
    ctx.restore();
  }
  for (const [t, side] of [[0.32, 1], [0.55, -1]]) {
    const { x, y, tx, ty } = stemAt(t), nx = -ty * side, ny = tx * side, r = 0.0065;
    const bx = x + nx * r, by = y + ny * r;
    const thorn = new Path2D();
    thorn.moveTo(bx + tx * 0.009, by + ty * 0.009);
    thorn.quadraticCurveTo(bx + nx * 0.01, by + ny * 0.01, bx + nx * 0.019 - tx * 0.012, by + ny * 0.019 - ty * 0.012);
    thorn.quadraticCurveTo(bx + nx * 0.005 - tx * 0.003, by + ny * 0.005 - ty * 0.003, bx - tx * 0.009, by - ty * 0.009);
    thorn.closePath();
    ctx.fillStyle = linear(ctx, bx, by, bx + nx * 0.02, by + ny * 0.02, [grey(16), grey(28)]);
    ctx.fill(thorn);
  }

  // The bloom, painted on its own about its hip, then leant over onto the stem.
  const { c: bloom, ctx: g } = surface(S);
  g.translate(hx, hy);
  g.rotate(ROSE.lean);
  const V = ROSE.view, VC = Math.sqrt(1 - V * V), [LX, LZ] = ROSE.light;
  const proj = (th, y, r) => [r * Math.sin(th), -y * VC + r * Math.cos(th) * V];
  // How lit the face we see is at azimuth th: the outside of the sheet where it turns toward
  // the viewer, its inside where it turns away.
  const litAt = (th) => {
    const s = Math.cos(th) >= 0 ? 1 : -1;
    return clamp01((Math.sin(th) * s * LX + Math.cos(th) * s * LZ) * 0.5 + 0.5);
  };
  const tone = (th, k = 0) => Math.round(lerp(ROSE.dark, ROSE.lit, clamp01(litAt(th) ** 1.6 + k)));

  // The sepals first, behind it all: thin dark tongues curling down off the hip.
  for (const a of [-2.3, -0.9, 0.5, 1.9, 3.2]) {
    const s = Math.sin(a), f = Math.cos(a), len = 0.085 + jit(0.015);
    const base = proj(a, 0.004, 0.02), tip = [base[0] + s * len * 0.9, base[1] + len * (0.55 + 0.3 * Math.abs(f))];
    const mid = [base[0] + s * len * 0.8, base[1] + len * 0.1];
    const p = new Path2D();
    p.moveTo(base[0] - 0.008, base[1]);
    p.quadraticCurveTo(mid[0] - 0.004, mid[1] - 0.006, ...tip);
    p.quadraticCurveTo(mid[0] + 0.006, mid[1] + 0.008, base[0] + 0.008, base[1]);
    g.fillStyle = linear(g, ...base, ...tip, [grey(f > 0 ? 18 : 10), grey(f > 0 ? 12 : 7)]);
    g.fill(p);
  }

  // Every petal, the farthest first.
  const petals = [];
  ROSE.layers.forEach((L, li) => {
    for (let i = 0; i < L.n; i++) {
      const phi = L.at + (i / L.n) * TAU + jit(0.25);
      petals.push({ L, li, phi, h: L.h * (1 + jit(0.07)), wt: L.wt * (1 + jit(0.08)), wave: rand() * TAU, tilt: jit(0.25) });
    }
  });
  petals.sort((a, b) => Math.cos(a.phi) * a.L.rt - Math.cos(b.phi) * b.L.rt);

  const N = 28;
  for (const P of petals) {
    const { L, phi, h, wt } = P;
    const half = (v) => lerp(L.wb, wt, v ** 0.6);
    const top = (u) => h * (1 - L.round * u * u) + L.point * Math.max(0, 1 - Math.abs(u) * 1.7) ** 2 + Math.sin(u * 6 + P.wave) * 0.005 + P.tilt * u * 0.02;
    const at = (u, v) => {
      const th = phi + u * half(v), y = v * top(u), r = lerp(L.rb, L.rt, v ** 0.5) + L.flare * v ** 4;
      return { th, xy: proj(th, y, r) };
    };
    const left = [], lip = [], right = [];
    for (let i = 0; i <= N; i++) {
      left.push(at(-1, i / N).xy);
      lip.push(at(-1 + (2 * i) / N, 1).xy);
      right.push(at(1, 1 - i / N).xy);
    }
    const body = new Path2D();
    [...left, ...lip, ...right].forEach((q, i) => (i ? body.lineTo(...q) : body.moveTo(...q)));
    body.closePath();
    const line = (pts) => { const p = new Path2D(); pts.forEach((q, i) => (i ? p.lineTo(...q) : p.moveTo(...q))); return p; };

    // The soft shadow it casts on what's behind it.
    g.save();
    g.filter = blur(0.02);
    g.translate(0.006, 0.013);
    g.fillStyle = 'rgba(0,0,0,0.9)';
    g.fill(body);
    g.restore();

    // Its body: shaded across by how it turns to the light, darker down toward its base.
    const xs = [-1, -0.5, 0, 0.5, 1].map((u) => at(u, 0.75));
    const across = g.createLinearGradient(xs[0].xy[0], 0, xs[4].xy[0], 0);
    const span = xs[4].xy[0] - xs[0].xy[0];
    if (Math.abs(span) > 1e-4) {
      for (const s of xs) across.addColorStop(clamp01((s.xy[0] - xs[0].xy[0]) / span), grey(tone(s.th)));
      g.fillStyle = across;
    } else g.fillStyle = grey(tone(phi));
    g.fill(body);
    g.save();
    g.clip(body);
    const b0 = at(0, 0).xy, b1 = at(0, 1).xy;
    g.fillStyle = linear(g, ...b0, ...b1, ['rgba(0,0,0,0.95)', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.1)', 'rgba(0,0,0,0)']);
    g.fill(body);
    // Faint veins fanning up from its base, a hair darker.
    g.lineWidth = 0.0016;
    g.strokeStyle = 'rgba(0,0,0,0.28)';
    for (const u of [-0.7, -0.35, 0, 0.35, 0.7]) g.stroke(line(Array.from({ length: 12 }, (_, i) => at(u * (0.4 + 0.6 * (i / 11)), 0.1 + 0.8 * (i / 11)).xy)));
    // The lip rolled over: a band along its top a few shades lighter, catching the light, over
    // a soft shadow in the curl under it.
    const lipPath = line(lip);
    g.save();
    g.filter = blur(0.01);
    g.translate(0, 0.012);
    g.lineWidth = 0.02;
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.stroke(lipPath);
    g.restore();
    g.save();
    g.filter = blur(0.004);
    g.lineWidth = 0.008;
    g.strokeStyle = grey(tone(phi, 0.15), 0.35);
    g.stroke(lipPath);
    g.restore();
    g.restore();
    // And the very edge, just catching the light where it faces it.
    if (litAt(phi) > 0.45) {
      g.lineWidth = 0.002;
      g.strokeStyle = grey(tone(phi, 0.3), 0.3);
      g.stroke(lipPath);
    }
  }

  // Grain over the flower alone, like paint on paper.
  const { c: grain, ctx: n } = surface(S, S, 1);
  const noise = n.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const v = 128 + (rand() - 0.5) * 120;
    noise.data.set([v, v, v, 255], i * 4);
  }
  n.putImageData(noise, 0, 0);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.globalAlpha = 0.04;
  g.drawImage(grain, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';

  // A faint white light round the flower from behind it, then the flower.
  glow(ctx, rgba('#ffffff', 0.08), px * 0.05, () => ctx.drawImage(bloom, 0, 0, 1, 1));
  return c;
}
