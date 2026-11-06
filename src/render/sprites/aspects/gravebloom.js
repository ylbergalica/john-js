// The Gravebloom aspect's sprites and icon.
import { seededRandom, lerp, TAU } from '../../../engine/math.js';
import { DEG, surface, rgba, polar, glow, linear, radial, sparkle, space } from '../paint.js';

// The Gravebloom wave sprite's arc: its radius, as a fraction of the width, out from the middle
// of its left edge, how far it spans either side, and the sprite's height as a fraction of its
// width (room for the arc's ends).
export const BLOOM_WAVE = { reach: 0.8, halfDeg: 50, height: 1.36 };

// ---------------------------------------------------------------- gravebloom

// A lotus petal seen from above, from its base at the origin out to its pointed tip at (L, 0),
// `W` at its widest.
function lotusPetal(L, W) {
  const p = new Path2D();
  p.moveTo(0, 0);
  p.bezierCurveTo(L * 0.25, W * 1.2, L * 0.72, W * 1.05, L, 0);
  p.bezierCurveTo(L * 0.72, -W * 1.05, L * 0.25, -W * 1.2, 0, 0);
  return p;
}

// The lotus's rings of petals, outermost first, in units of the flower's width: `count` petals
// L long and W at their widest, turned `offset` degrees, pale at the base and coloured toward the
// tip. The first two are its outer petals, pink to the tips; the rest its inner ones, nearly white.
export const LOTUS_RINGS = [
  { count: 8, L: 0.43, W: 0.12, offset: 0, base: '#ffe2ef', tip: '#ff6fae' },
  { count: 8, L: 0.37, W: 0.115, offset: 22.5, base: '#fff0f6', tip: '#ff8cc0' },
  { count: 6, L: 0.27, W: 0.095, offset: 10, base: '#ffffff', tip: '#ffbcd8' },
  { count: 5, L: 0.18, W: 0.075, offset: 40, base: '#ffffff', tip: '#ffdcea' },
];

// A lone petal's sprite (lotus_petal_<ring>) points along +x: its base `base` of the sprite's
// width in from the left edge, its tip `length` of the width on from there.
export const LOTUS_PETAL = { base: 0.06, length: 0.88 };

// The seed pod's sprite (lotus_core) spans this much of the flower's width.
export const LOTUS_CORE = 0.2;

// A petal from its base at the origin out along +x, as ring R draws it: soft pink glow, a fine
// light edge and a faint vein down its middle. `px`: pixels to one of the flower's width.
function paintPetal(ctx, px, { L, W, base, tip }) {
  const petal = lotusPetal(L, W);
  glow(ctx, rgba('#d0306e', 0.45), px * 0.02, () => {
    ctx.fillStyle = linear(ctx, 0, 0, L, 0, [base, base, tip]);
    ctx.fill(petal);
  });
  ctx.strokeStyle = rgba('#fff4f9', 0.55);
  ctx.lineWidth = 0.005;
  ctx.stroke(petal);
  ctx.strokeStyle = rgba('#ffffff', 0.3);
  ctx.lineWidth = 0.004;
  ctx.beginPath(); ctx.moveTo(L * 0.18, 0); ctx.lineTo(L * 0.82, 0); ctx.stroke();
}

// Ring R's petals round (0.5, 0.5).
function lotusRing(ctx, px, R) {
  for (let i = 0; i < R.count; i++) {
    ctx.save();
    ctx.translate(0.5, 0.5);
    ctx.rotate(R.offset * DEG + (i / R.count) * TAU);
    paintPetal(ctx, px, R);
    ctx.restore();
  }
}

// The pale green seed pod in the middle of the flower (0.5, 0.5), ringed with stamens.
function paintCore(ctx, px) {
  glow(ctx, rgba('#c8f5b0', 0.8), px * 0.03, () => {
    ctx.fillStyle = radial(ctx, 0.5, 0.5, 0.06, ['#f2fbe0', '#cdeeb4', '#94d29a']);
    ctx.beginPath(); ctx.arc(0.5, 0.5, 0.055, 0, TAU); ctx.fill();
  });
  ctx.fillStyle = '#6fae7a';
  for (let i = 0; i < 6; i++) {
    const [x, y] = i ? polar(0.5, 0.5, i * 72 + 15, 0.03) : [0.5, 0.5];
    ctx.beginPath(); ctx.arc(x, y, 0.007, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = '#fff3b8';
  for (let i = 0; i < 16; i++) {
    const [x, y] = polar(0.5, 0.5, (i / 16) * 360, 0.072);
    ctx.beginPath(); ctx.arc(x, y, 0.008, 0, TAU); ctx.fill();
  }
}

// The lotus Gravebloom leaves, whole, from above, for its burst and its icon, in two layers: its
// outer rings of petals under a pink haze…
export function bloomOuter(S = 256) {
  const { c, ctx, px } = surface(S);
  ctx.fillStyle = radial(ctx, 0.5, 0.5, 0.5, [rgba('#ff8cc0', 0.3), rgba('#ff6aa8', 0.12), rgba('#ff6aa8', 0)]);
  ctx.fillRect(0, 0, 1, 1);
  for (const R of LOTUS_RINGS.slice(0, 2)) lotusRing(ctx, px, R);
  return c;
}

// …and its inner ones round the seed pod.
export function bloomInner(S = 256) {
  const { c, ctx, px } = surface(S);
  for (const R of LOTUS_RINGS.slice(2)) lotusRing(ctx, px, R);
  paintCore(ctx, px);
  return c;
}

// One of ring R's petals alone (src/aspects/gravebloom.js opens them one by one as it grows),
// placed as LOTUS_PETAL says, with room round it for its glow.
export function lotusPetalSprite(R, Wpx = 128) {
  const unit = (Wpx * LOTUS_PETAL.length) / R.L; // pixels to one of the flower's width
  const { c, ctx, px } = surface(Wpx, Math.ceil((2 * R.W + 0.08) * unit), unit);
  ctx.translate((LOTUS_PETAL.base * R.L) / LOTUS_PETAL.length, c.height / unit / 2);
  paintPetal(ctx, px, R);
  return c;
}

// A misty wisp for a Strand (the lines drawn into a lotus as it blooms), white so it can be
// tinted: soft across, fading in from nothing at its tail (u = 0) to brightest near its head and
// out again at the very tip, like the icon's lines.
export function bloomWisp(W = 128, H = 32) {
  const { c, ctx } = surface(W, H, 1);
  const img = ctx.createImageData(W, H);
  for (let j = 0; j < H; j++) {
    const v = (j + 0.5) / H - 0.5, across = Math.exp(-((v / 0.22) ** 2));
    for (let i = 0; i < W; i++) {
      const u = (i + 0.5) / W, along = Math.sin(Math.PI * u ** 1.94) ** 2;
      img.data.set([255, 255, 255, Math.round(255 * along * across)], (j * W + i) * 4);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// The seed pod alone, LOTUS_CORE of the flower's width across.
export function lotusCore(S = 64) {
  const { c, ctx, px } = surface(S, S, S / LOTUS_CORE);
  ctx.translate(LOTUS_CORE / 2 - 0.5, LOTUS_CORE / 2 - 0.5);
  paintCore(ctx, px);
  return c;
}

// The burst's wave, white so it can be tinted: an arc of light BLOOM_WAVE.reach of the width out
// from the middle of its left edge, spanning BLOOM_WAVE.halfDeg either side, over a faint haze
// filling the cone behind it, fading out only at its very ends.
export function bloomWave(S = 256) {
  const { c, ctx, px } = surface(S, Math.round(S * BLOOM_WAVE.height), S);
  const R = BLOOM_WAVE.reach, H = BLOOM_WAVE.halfDeg * DEG, mid = BLOOM_WAVE.height / 2;
  ctx.translate(0, mid - 0.5); // drawn about (0, 0.5), as if square
  ctx.save();
  ctx.filter = `blur(${px * 0.02}px)`;
  ctx.fillStyle = radial(ctx, 0, 0.5, R + 0.04, [rgba('#ffffff', 0), rgba('#ffffff', 0.03), rgba('#ffffff', 0.12), rgba('#ffffff', 0.3), rgba('#ffffff', 0)]);
  ctx.beginPath(); ctx.moveTo(0, 0.5); ctx.arc(0, 0.5, R + 0.04, -H, H); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = rgba('#ffffff', 0.8);
  ctx.lineWidth = 0.07;
  ctx.beginPath(); ctx.arc(0, 0.5, R, -H, H); ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.filter = `blur(${px * 0.004}px)`;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 0.022;
  ctx.beginPath(); ctx.arc(0, 0.5, R, -H, H); ctx.stroke();
  ctx.restore();
  // Faded toward both ends of the arc.
  const g = ctx.createConicGradient(-H, 0, 0.5), span = (2 * H) / TAU;
  [[0, 0], [span * 0.12, 1], [span * 0.88, 1], [span, 0], [1, 0]].forEach(([at, a]) => g.addColorStop(at, rgba('#ffffff', a)));
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0.5 - mid, 1, BLOOM_WAVE.height);
  return c;
}

// One petal, white so it can be tinted, pointing along +x (the petals a burst throws).
export function bloomPetal(W = 64) {
  const { c, ctx, px } = surface(W, W / 2, W);
  const p = new Path2D();
  p.moveTo(0.08, 0.25);
  p.bezierCurveTo(0.3, 0.42, 0.72, 0.38, 0.92, 0.25);
  p.bezierCurveTo(0.72, 0.12, 0.3, 0.08, 0.08, 0.25);
  glow(ctx, rgba('#ffffff', 0.6), px * 0.04, () => {
    ctx.fillStyle = linear(ctx, 0.08, 0, 0.92, 0, [rgba('#ffffff', 0.75), rgba('#ffffff', 1)]);
    ctx.fill(p);
  });
  return c;
}

// A lotus from above, as the game draws it, in the middle of the box: its outer petals flushed pink,
// its inner ones nearly white round the pale green seed pod, all glowing out of the dark, a
// few loose petals drifting off it and glints of light.
export function gravebloomIcon(S = 256) {
  const { c, ctx, px } = surface(S);
  const rand = seededRandom(2417);
  space(ctx, rand, {
    core: '#1e0815', edge: '#050104', stars: 18,
    nebulae: [[0.5, 0.5, 0.46, '#ff5fa2', 0.26], [0.72, 0.74, 0.22, '#7fd6a0', 0.08]],
  });
  ctx.fillStyle = radial(ctx, 0.5, 0.5, 0.45, [rgba('#ffc0dc', 0.35), rgba('#ff6aa8', 0.12), rgba('#ff6aa8', 0)]);
  ctx.fillRect(0, 0, 1, 1);
  // Faint misty wisps wandering out from behind the flower and off out of the box, evenly spread
  // round it: each sets off its own way (a slice of the circle) and turns this way and that at
  // random (two wavering turns laid over each other), free to stray up to FREE radians off its
  // way and steered back by PULL beyond that, so it crosses its neighbours now and then. Pink
  // but for two lime ones, swelling in gently from the flower and easing away again along
  // their length: a wide haze, a softer band and a fine bright thread, each laid down sharp,
  // then blurred.
  const PINK = ['#ff6aa8', '#ff9cc8', '#ffe0ee'], LIME = ['#9fe060', '#c4f580', '#eaffc8'];
  const n = 8, STEP = 0.008, FREE = 35 * DEG, PULL = 14, trail = surface(S);
  const fade = (u) => Math.sin(Math.PI * u ** 0.63) ** 2; // brightest a third of the way along
  for (let i = 0; i < n; i++) {
    const t = ((i + (rand() - 0.5) * 0.3) / n) * TAU;
    let x = 0.5 + Math.cos(t) * 0.1, y = 0.5 + Math.sin(t) * 0.1, heading = t + lerp(-0.7, 0.7, rand());
    const waves = [0, 1].map(() => ({ amp: lerp(4, 9, rand()) * (rand() < 0.5 ? -1 : 1), freq: lerp(2, 6, rand()), phase: rand() * TAU }));
    const pts = [[x, y]];
    for (let s = 0; s < 3 && x > -0.12 && x < 1.12 && y > -0.12 && y < 1.12; s += STEP) {
      const off = Math.atan2(Math.sin(t - heading), Math.cos(t - heading));
      heading += (waves.reduce((turn, w) => turn + w.amp * Math.sin(w.freq * s + w.phase), 0) + Math.sign(off) * Math.max(0, Math.abs(off) - FREE) * PULL) * STEP;
      x += Math.cos(heading) * STEP;
      y += Math.sin(heading) * STEP;
      pts.push([x, y]);
    }
    const [haze, band, thread] = i === 2 || i === 6 ? LIME : PINK, k = lerp(0.6, 1, rand());
    for (const [width, blur, color, alpha] of [[0.09, 0.05, haze, 0.13], [0.03, 0.02, band, 0.16], [0.006, 0.004, thread, 0.22]]) {
      const g = trail.ctx;
      g.clearRect(0, 0, 1, 1);
      g.lineWidth = width;
      g.lineCap = 'butt';
      for (let j = 1; j < pts.length; j++) {
        g.strokeStyle = rgba(color, alpha * k * fade(j / (pts.length - 1)));
        g.beginPath(); g.moveTo(...pts[j - 1]); g.lineTo(...pts[j]); g.stroke();
      }
      ctx.save();
      ctx.filter = `blur(${px * blur}px)`;
      ctx.drawImage(trail.c, 0, 0, 1, 1);
      ctx.restore();
    }
  }
  // The flower, turned a little so a petal points up, under a pink glow.
  const outer = bloomOuter(S), inner = bloomInner(S), k = 0.64;
  ctx.save();
  ctx.translate(0.5, 0.5);
  ctx.rotate(-90 * DEG + 11.25 * DEG);
  ctx.scale(k, k);
  glow(ctx, rgba('#ff6aa8', 0.9), px * 0.06, () => ctx.drawImage(outer, -0.5, -0.5, 1, 1));
  ctx.rotate(-20 * DEG);
  glow(ctx, rgba('#ffd6e8', 0.7), px * 0.03, () => ctx.drawImage(inner, -0.5, -0.5, 1, 1));
  ctx.restore();
  // Loose petals drifting off it, and glints.
  for (const [x, y, r, s, a] of [[0.84, 0.17, 35, 0.06, 0.8], [0.15, 0.82, -150, 0.05, 0.6], [0.88, 0.8, 120, 0.04, 0.5]]) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(r * DEG);
    ctx.globalAlpha = a;
    const p = new Path2D();
    p.moveTo(-s, 0); p.quadraticCurveTo(0, s * 0.55, s, 0); p.quadraticCurveTo(0, -s * 0.55, -s, 0);
    glow(ctx, rgba('#ff8cc0', 0.8), px * 0.02, () => { ctx.fillStyle = linear(ctx, -s, 0, s, 0, ['#ffffff', '#ff9cc6']); ctx.fill(p); });
    ctx.restore();
  }
  sparkle(ctx, 0.5, 0.5, 0.07, '#ffffff', 0.85, 0.2);
  sparkle(ctx, 0.2, 0.2, 0.035, '#ffd6e8', 0.7, 0.5);
  sparkle(ctx, 0.8, 0.62, 0.025, '#c8f5d8', 0.7, 0.1);
  return c;
}
