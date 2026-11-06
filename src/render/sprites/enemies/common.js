// Shared by the enemy sprites: void colours, outlines and nebula fills.
import { seededRandom, lerp, TAU } from '../../../engine/math.js';
import { surface, rgba, glow, linear, radial } from '../paint.js';

export const VOIDS = {
  goblin: { core: '#10302a', edge: '#03070c', clouds: [['#2f9c6c', 0.22], ['#3b55d4', 0.14]], seed: 31 },
  striker: { core: '#33200f', edge: '#06050c', clouds: [['#d07a26', 0.2], ['#7b44d6', 0.14]], seed: 37 },
  mauler: { core: '#2b1709', edge: '#070403', clouds: [['#a8501c', 0.24], ['#6b2a10', 0.2]], seed: 43 },
  shade: { core: '#1d1e22', edge: '#050506', clouds: [['#5a5f6a', 0.2], ['#33363e', 0.22]], seed: 47 },
  seer: { core: '#0b1645', edge: '#03040f', clouds: [['#2d4fd8', 0.24], ['#16288a', 0.22]], seed: 53 },
  lemur: { core: '#17361d', edge: '#040a05', clouds: [['#3f8a3a', 0.18], ['#6b4320', 0.26]], seed: 59 },
  boxer: { core: '#2e0a0e', edge: '#070304', clouds: [['#b02030', 0.2], ['#5e0e1a', 0.24]], seed: 61 },
  gunner: { core: '#0b2a3a', edge: '#03080c', clouds: [['#3fb4e8', 0.22], ['#1c5c8a', 0.2]], seed: 67 },
  corsair: { core: '#33270a', edge: '#090602', clouds: [['#c8961e', 0.22], ['#7a5a12', 0.24]], seed: 71 },
  weaver: { core: '#16151d', edge: '#030304', clouds: [['#5e587e', 0.2], ['#2c2a3c', 0.24]], seed: 79 },
  bulwark: { core: '#1c212a', edge: '#050608', clouds: [['#5f6d82', 0.22], ['#2e3746', 0.26]], seed: 83 },
  comet: { core: '#123a5c', edge: '#030a14', clouds: [['#6fe8ff', 0.3], ['#2a6cc8', 0.3]], seed: 131 },
  revenant: { core: '#08201b', edge: '#010504', clouds: [['#4fc8a4', 0.16], ['#124a40', 0.3]], seed: 131 },
  moray: { core: '#2e0a22', edge: '#080208', clouds: [['#ff4fa8', 0.2], ['#6b1a56', 0.28]], seed: 127 },
  tyrant: { core: '#2c2300', edge: '#060500', clouds: [['#e0b400', 0.26], ['#6b4e00', 0.3]], seed: 113 },
  razor: { core: '#868d9a', edge: '#23262d', clouds: [['#f4f7ff', 0.34], ['#aeb8cc', 0.26]], seed: 107 },
  collapsar: { core: '#06040a', edge: '#010102', clouds: [['#3a1a5e', 0.14], ['#4a1a0a', 0.1]], seed: 131 },
  binary: { core: '#16264a', edge: '#03060e', clouds: [['#7ab4ff', 0.26], ['#e8f4ff', 0.12], ['#3a5cff', 0.2]], seed: 101 },
  binaryTwin: { core: '#3a2408', edge: '#0a0602', clouds: [['#ffbc48', 0.26], ['#fff2d0', 0.12], ['#e0661c', 0.2]], seed: 103 },
  jet: { core: '#3a1508', edge: '#080302', clouds: [['#e8702a', 0.22], ['#b0261c', 0.22]], seed: 97 },
  blight: { core: '#12300c', edge: '#030802', clouds: [['#6cc832', 0.26], ['#c8d82a', 0.12], ['#2a9a5a', 0.18]], seed: 73 },
};

export function outline(S, palette, draw) {
  const { c, ctx, px } = surface(S);
  ctx.strokeStyle = linear(ctx, 0.2, 0.15, 0.8, 0.85, palette.stroke);
  glow(ctx, palette.glow, px * 0.035, () => draw(ctx));
  return c;
}

// The enemy's body: a dark nebula (the twinkling star field is laid over it at runtime).
// `rule`: the fill rule, 'evenodd' for a body with holes through it.
export function voidFill(path, { core, edge, clouds, seed }, rule = 'nonzero', S = 256) {
  const { c, ctx } = surface(S);
  const rand = seededRandom(seed);
  ctx.fillStyle = radial(ctx, 0.5, 0.5, 0.42, [core, edge], 0.4, 0.38);
  ctx.fill(path, rule);
  ctx.globalCompositeOperation = 'source-atop';
  nebula(ctx, rand, clouds);
  return c;
}

// `count` soft, squashed clouds of the given [colour, alpha]s, scattered over the box
// x0…x1, y0…y1 (drawn over whatever the context's compositing allows).
export function nebula(ctx, rand, clouds, count = 5, [x0, x1, y0, y1] = [0.25, 0.75, 0.25, 0.75]) {
  for (let i = 0; i < count; i++) {
    const [color, a] = clouds[i % clouds.length];
    const x = lerp(x0, x1, rand()), y = lerp(y0, y1, rand()), r = lerp(0.12, 0.26, rand());
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rand() * TAU); ctx.scale(1, lerp(0.35, 0.7, rand()));
    ctx.fillStyle = radial(ctx, 0, 0, r, [rgba(color, a), rgba(color, 0)]);
    ctx.fillRect(-r, -r, 2 * r, 2 * r);
    ctx.restore();
  }
}
