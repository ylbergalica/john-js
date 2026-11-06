// The Feral aspect's sprites and icon.
import { seededRandom, lerp, TAU } from '../../../engine/math.js';
import { surface, rgba, glow, space } from '../paint.js';

// ---------------------------------------------------------------- feral

// A black cat with its back up, a way off: side on, arched high over stiff legs, haunches
// bunched, its tail standing up thick with fur, and its head turned to look straight out of
// the box with two red eyes. Outlined in glowing dark red, as the player's hackles glow at
// the height of it.
export function feralIcon(S = 256) {
  const { c, ctx, px } = surface(S);
  const rand = seededRandom(2231);
  space(ctx, rand, {
    core: '#1a0405', edge: '#040101', stars: 8,
    nebulae: [[0.5, 0.5, 0.4, '#a8101c', 0.22]],
  });
  // The cat is drawn about (0.45, 0.47) and set down small in the middle of the box.
  const place = (g) => { g.translate(0.5, 0.5); g.scale(0.64, 0.64); g.translate(-0.45, -0.47); };

  // The silhouette alone, in black.
  const mask = surface(S), m = mask.ctx;
  place(m);
  m.fillStyle = '#000000';
  m.strokeStyle = '#000000';
  // Body: from the back of the neck over the arched back, round the rump to the haunch, along
  // the belly tucked up under the arch, and up the chest to the chin.
  m.beginPath();
  m.moveTo(0.655, 0.4);
  m.bezierCurveTo(0.6, 0.17, 0.33, 0.15, 0.255, 0.4);
  m.quadraticCurveTo(0.225, 0.48, 0.235, 0.56);
  m.quadraticCurveTo(0.24, 0.64, 0.27, 0.65);
  m.lineTo(0.33, 0.64);
  m.bezierCurveTo(0.4, 0.55, 0.54, 0.55, 0.6, 0.62);
  m.lineTo(0.68, 0.6);
  m.quadraticCurveTo(0.69, 0.56, 0.695, 0.54);
  m.quadraticCurveTo(0.712, 0.52, 0.7, 0.49);
  m.closePath(); m.fill();
  // Legs, each pair sharing its top and parting in a narrow V to two paws on the ground: a
  // leg tapers from (x0, y0) down to a rounded paw at x1.
  const leg = (x0, y0, w0, x1, w1) => {
    const mid = lerp(y0, 0.84, 0.45);
    m.beginPath();
    m.moveTo(x0 - w0 / 2, y0);
    m.quadraticCurveTo(x1 - w1 / 2, mid, x1 - w1 / 2, 0.826);
    m.quadraticCurveTo(x1 - w1 / 2, 0.842, x1, 0.842);
    m.quadraticCurveTo(x1 + w1 / 2, 0.842, x1 + w1 / 2, 0.826);
    m.quadraticCurveTo(x1 + w1 / 2, mid, x0 + w0 / 2, y0);
    m.closePath(); m.fill();
  };
  leg(0.265, 0.58, 0.072, 0.257, 0.045);
  leg(0.312, 0.6, 0.066, 0.337, 0.043);
  leg(0.622, 0.58, 0.062, 0.602, 0.041);
  leg(0.664, 0.56, 0.066, 0.677, 0.045);
  // The tail, rooted inside the rump and standing up fluffed out, fullest partway up and
  // narrowing to a rounded tip as it hooks over.
  const tail = (t) => {
    const u = 1 - t, p = [[0.27, 0.44], [0.15, 0.4], [0.12, 0.22], [0.2, 0.14]];
    return [0, 1].map((k) => u * u * u * p[0][k] + 3 * u * u * t * p[1][k] + 3 * u * t * t * p[2][k] + t * t * t * p[3][k]);
  };
  const N = 40, sides = [[], []];
  let tip = 0;
  for (let i = 0; i <= N; i++) {
    const t = i / N, [x, y] = tail(t), [ax, ay] = tail(Math.max(0, t - 0.01)), [bx, by] = tail(Math.min(1, t + 0.01));
    const l = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / l, ny = (bx - ax) / l;
    const w = (0.032 + 0.012 * Math.sin(Math.PI * Math.min(1, t * 1.1))) * (t > 0.7 ? lerp(1, 0.55, (t - 0.7) / 0.3) : 1);
    sides[0].push([x + nx * w, y + ny * w]);
    sides[1].push([x - nx * w, y - ny * w]);
    tip = w;
  }
  m.beginPath();
  sides[0].forEach((p, i) => (i ? m.lineTo(...p) : m.moveTo(...p)));
  sides[1].reverse().forEach((p) => m.lineTo(...p));
  m.closePath(); m.fill();
  m.beginPath(); m.arc(...tail(1), tip, 0, TAU); m.fill();
  // The head, face on: broad cheeks and two ears, their tips a little rounded.
  m.beginPath(); m.ellipse(0.715, 0.452, 0.082, 0.07, 0, 0, TAU); m.fill();
  m.lineWidth = 0.012;
  for (const ear of [[[0.643, 0.43], [0.647, 0.33], [0.697, 0.39]], [[0.733, 0.39], [0.783, 0.33], [0.787, 0.43]]]) {
    m.beginPath(); ear.forEach((p, i) => (i ? m.lineTo(...p) : m.moveTo(...p))); m.closePath(); m.fill(); m.stroke();
  }

  // Outlined in glowing dark red: the silhouette in red, drawn out a little all round under it.
  const { c: red, ctx: g } = surface(S);
  g.drawImage(mask.c, 0, 0, 1, 1);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#c0141f';
  g.fillRect(0, 0, 1, 1);
  const ring = (r, n) => { for (let i = 0; i < n; i++) ctx.drawImage(red, Math.cos((i / n) * TAU) * r, Math.sin((i / n) * TAU) * r, 1, 1); };
  ctx.save();
  ctx.filter = `blur(${px * 0.016}px)`;
  ctx.globalAlpha = 0.4;
  ring(0.008, 12);
  ctx.filter = 'none';
  ctx.globalAlpha = 0.85;
  ring(0.006, 24);
  ctx.globalAlpha = 1;
  ctx.drawImage(mask.c, 0, 0, 1, 1);
  ctx.restore();

  // Its eyes, on the viewer.
  ctx.save();
  place(ctx);
  for (const x of [0.69, 0.74]) {
    glow(ctx, rgba('#e0202c', 1), px * 0.016, () => {
      ctx.fillStyle = '#ff5a4a';
      ctx.beginPath(); ctx.ellipse(x, 0.449, 0.015, 0.0105, 0, 0, TAU); ctx.fill();
    });
    ctx.fillStyle = '#000000';
    ctx.beginPath(); ctx.ellipse(x, 0.449, 0.0035, 0.0095, 0, 0, TAU); ctx.fill();
  }
  ctx.restore();
  return c;
}
