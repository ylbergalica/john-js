// The Nebula aspect's icon.
import { seededRandom, lerp, TAU } from '../../../engine/math.js';
import { surface, rgba, glow, linear, radial, sparkle } from '../paint.js';

// Its cloud's lobes of colour, round the wheel.
const LOBES = ['#ff3b6b', '#ffb21f', '#46f06a', '#1fd8ff', '#6a4dff', '#ff3fd0'];

// A soft-edged blob of `color` at (x, y), radius r.
function puff(ctx, x, y, r, color, a) {
  ctx.fillStyle = radial(ctx, x, y, r, [rgba(color, a), rgba(color, a * 0.4), rgba(color, 0)]);
  ctx.fillRect(0, 0, 1, 1);
}

// Roughly normal, -1..1 mostly.
const gauss = (rand) => (rand() + rand() + rand() - 1.5) / 1.5;

// A streamer of puffs from (x, y) setting off at `angle` and curling as it goes, fattest midway,
// each puff knocked a little off the line so it billows rather than runs straight.
function wisp(ctx, rand, { x, y, angle, len, width, color, a, count = 14, curl = 0.6 }) {
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    angle += lerp(-curl, curl, rand()) * 4 / count;
    x += Math.cos(angle) * len / count;
    y += Math.sin(angle) * len / count;
    const r = width * Math.sqrt(Math.sin(Math.PI * lerp(0.08, 0.92, t))) * lerp(0.6, 1.3, rand());
    const off = gauss(rand) * r * 0.6;
    puff(ctx, x - Math.sin(angle) * off, y + Math.cos(angle) * off, r, color, a * lerp(0.5, 1, rand()));
  }
}

// A distant nebula at (x, y): a glowing heart, billows of its colours spilling out of it
// every way, a dark lane of dust across it, and the star that lights it.
function farNebula(ctx, rand, px, { x, y, size, colors, lane, star }) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.filter = `blur(${px * Math.max(size * 0.15, 0.016)}px)`;
  puff(ctx, x, y, size * 0.9, colors[0], 0.3);
  for (let i = 0; i < 10; i++) {
    const ang = rand() * TAU, d = size * lerp(0, 0.35, rand());
    wisp(ctx, rand, {
      x: x + Math.cos(ang) * d, y: y + Math.sin(ang) * d, angle: ang + lerp(-1, 1, rand()),
      len: size * lerp(0.5, 1.2, rand()), width: size * lerp(0.28, 0.4, rand()),
      color: colors[i % colors.length], a: lerp(0.09, 0.17, rand()), count: 18, curl: 1.4,
    });
  }
  ctx.restore();
  ctx.save();
  ctx.filter = `blur(${px * size * 0.06}px)`;
  wisp(ctx, rand, { x: x - Math.cos(lane) * size, y: y - Math.sin(lane) * size, angle: lane, len: size * 2, width: size * 0.16, color: '#020108', a: 0.6, count: 20, curl: 0.8 });
  ctx.restore();
  dot(ctx, x + size * 0.1, y - size * 0.05, 0.006, star, 0.95);
}

// A tiny star: a dot, the brighter ones with a little halo.
function dot(ctx, x, y, r, color, a) {
  if (r > 0.004) {
    ctx.fillStyle = radial(ctx, x, y, r * 4, [rgba(color, a * 0.35), rgba(color, 0)]);
    ctx.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
  }
  ctx.fillStyle = rgba(color, a);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

const STAR_TINTS = ['#ffffff', '#ffffff', '#cfe0ff', '#a9c4ff', '#ffe6c4', '#ffd0e8'];

// Deep space in layers, furthest first: a wash of faint colour; a band of stardust slanting
// across, a dense haze of tiny stars; distant nebulae of their own, with dark dust lanes
// through them; then a scatter of nearer, brighter stars.
function deepSpace(ctx, rand, px) {
  ctx.fillStyle = radial(ctx, 0.5, 0.5, 0.75, ['#110b24', '#07051a', '#020108']);
  ctx.fillRect(0, 0, 1, 1);

  // Furthest: broad faint washes of colour.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.filter = `blur(${px * 0.05}px)`;
  for (const [x, y, r, col, a] of [[0.15, 0.3, 0.45, '#1b2f8a', 0.35], [0.85, 0.7, 0.5, '#4a1468', 0.35], [0.7, 0.1, 0.35, '#0f4a6e', 0.25], [0.25, 0.9, 0.35, '#3d0f4f', 0.25]]) {
    puff(ctx, x, y, r, col, a);
  }
  ctx.restore();

  // The stardust band, slanting down to the right through the middle.
  const bandA = 0.42, cx = 0.5, cy = 0.5, ux = Math.cos(bandA), uy = Math.sin(bandA);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.filter = `blur(${px * 0.03}px)`;
  for (let i = 0; i < 9; i++) {
    const s = lerp(-0.75, 0.75, i / 8) + gauss(rand) * 0.04, n = gauss(rand) * 0.03;
    ctx.save();
    ctx.translate(cx + ux * s - uy * n, cy + uy * s + ux * n);
    ctx.rotate(bandA);
    ctx.scale(1, 0.32);
    puff(ctx, 0, 0, lerp(0.16, 0.24, rand()), i % 3 ? '#8a7ad8' : '#d39ad8', 0.14);
    ctx.restore();
  }
  ctx.restore();
  for (let i = 0; i < 420; i++) {
    const s = lerp(-0.8, 0.8, rand()), n = gauss(rand) * lerp(0.05, 0.12, rand());
    const x = cx + ux * s - uy * n, y = cy + uy * s + ux * n;
    dot(ctx, x, y, lerp(0.0012, 0.003, rand() ** 2), STAR_TINTS[(rand() * STAR_TINTS.length) | 0], lerp(0.15, 0.6, rand()));
  }
  // Faint dust over the rest of the sky.
  for (let i = 0; i < 160; i++) dot(ctx, rand(), rand(), lerp(0.0012, 0.0028, rand() ** 2), STAR_TINTS[(rand() * STAR_TINTS.length) | 0], lerp(0.1, 0.45, rand()));

  // Between them, faint filaments of gas drifting across the whole sky.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.filter = `blur(${px * 0.018}px)`;
  for (const color of ['#3a4fd0', '#7a3ad0', '#2a8aa8', '#a03a8a', '#3a4fd0', '#5a3ad0']) {
    wisp(ctx, rand, { x: rand(), y: rand(), angle: rand() * TAU, len: lerp(0.3, 0.5, rand()), width: lerp(0.03, 0.05, rand()), color, a: 0.1, count: 20, curl: 1.5 });
  }
  ctx.restore();

  // Distant nebulae of their own: a big blue-green one up to the left, a red-gold one down to
  // the right, and a small violet one far off in the top right.
  farNebula(ctx, rand, px, { x: 0.13, y: 0.16, size: 0.15, colors: ['#2a7cff', '#3fe0d0', '#8a4dff'], lane: 0.6, star: '#d6ecff' });
  farNebula(ctx, rand, px, { x: 0.86, y: 0.84, size: 0.15, colors: ['#ff3f5e', '#ff9a3c', '#ff4fc8'], lane: 3.7, star: '#ffe2d0' });
  farNebula(ctx, rand, px, { x: 0.86, y: 0.12, size: 0.07, colors: ['#7a5cff', '#c04dff'], lane: 2.2, star: '#e6dcff' });

  // Nearest: a few bright stars, some flaring.
  for (let i = 0; i < 18; i++) {
    const x = rand(), y = rand();
    dot(ctx, x, y, lerp(0.0025, 0.0055, rand() ** 2), STAR_TINTS[(rand() * STAR_TINTS.length) | 0], lerp(0.6, 1, rand()));
  }
  for (const [x, y, r, col] of [[0.27, 0.08, 0.026, '#ffffff'], [0.92, 0.32, 0.022, '#cfe0ff'], [0.06, 0.62, 0.02, '#ffe6c4'], [0.6, 0.94, 0.024, '#ffffff']]) {
    sparkle(ctx, x, y, r, col, 0.85);
  }
}

// A cloud of six big soft lobes of colour round the wheel, like petals, a smaller wisp trailing
// off each, and a white star at its heart with a long lens-flare cross through it, over deep space.
export function nebulaIcon(S = 256) {
  const { c, ctx, px } = surface(S);
  const rand = seededRandom(44);
  deepSpace(ctx, rand, px);
  ctx.save();
  ctx.filter = `blur(${px * 0.02}px)`;
  LOBES.forEach((col, i) => {
    const a = (i / LOBES.length) * Math.PI * 2 - 0.4;
    puff(ctx, 0.5 + Math.cos(a) * 0.2, 0.5 + Math.sin(a) * 0.2, 0.2, col, 0.5);
    puff(ctx, 0.5 + Math.cos(a + 0.25) * 0.3, 0.5 + Math.sin(a + 0.25) * 0.3, 0.1, col, 0.3);
  });
  ctx.restore();
  // The flare: a long thin streak across the star and a shorter one down through it.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.filter = `blur(${px * 0.006}px)`;
  for (const [dx, dy, l] of [[1, 0, 0.42], [0, 1, 0.32]]) {
    ctx.strokeStyle = linear(ctx, 0.5 - dx * l, 0.5 - dy * l, 0.5 + dx * l, 0.5 + dy * l, [rgba('#ffffff', 0), rgba('#ffffff', 0.9), rgba('#ffffff', 0)]);
    ctx.lineWidth = 0.012;
    ctx.beginPath(); ctx.moveTo(0.5 - dx * l, 0.5 - dy * l); ctx.lineTo(0.5 + dx * l, 0.5 + dy * l); ctx.stroke();
  }
  ctx.restore();
  // The star: a white four-point flare in a white halo.
  const r = 0.13;
  ctx.fillStyle = radial(ctx, 0.5, 0.5, r * 2.6, [rgba('#ffffff', 0.5), rgba('#ffffff', 0.3), rgba('#ffffff', 0)]);
  ctx.fillRect(0, 0, 1, 1);
  glow(ctx, rgba('#ffffff', 1), px * 0.05, () => sparkle(ctx, 0.5, 0.5, r, '#ffffff', 1, 0));
  return c;
}
