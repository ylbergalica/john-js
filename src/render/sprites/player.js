// The player's tail and dash ghost, and the pickups and portals: crystals, orbs, cores, hexes.
import { TAU } from '../../engine/math.js';
import { ORB_PAD, surface, rgba, glow, linear, radial, sparkle, hexPath } from './paint.js';

// The hex frame sprite's outline width, as a fraction of its width.
export const HEX_FRAME_INSET = 0.8;

// The comet's head as a fraction of its length.
export const COMET_HEAD = 0.9;

// ---------------------------------------------------------------- player & pickups

// Tail followers: white ring around a black core, like the body.
export function tail(S = 128) {
  const { c, ctx, px } = surface(S);
  ctx.beginPath();
  ctx.arc(0.5, 0.5, 0.45, 0, TAU);
  ctx.fillStyle = '#000000';
  ctx.fill();
  glow(ctx, rgba('#ffffff', 0.85), px * 0.04, () => {
    ctx.lineWidth = 0.06;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  });
  return c;
}

// Dash afterimage: the body's ring alone, glowing over a faint inner haze, white for tinting.
export function dashGhost(S = 128) {
  const { c, ctx, px } = surface(S);
  ctx.beginPath();
  ctx.arc(0.5, 0.5, 0.45, 0, TAU);
  ctx.fillStyle = radial(ctx, 0.5, 0.5, 0.45, [rgba('#ffffff', 0), rgba('#ffffff', 0.06), rgba('#ffffff', 0.22)]);
  ctx.fill();
  glow(ctx, rgba('#ffffff', 0.9), px * 0.05, () => {
    ctx.lineWidth = 0.06;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  });
  return c;
}

// Octahedron crystal: four shaded facets, a light cross through the centre, dark rim.
export function crystal(ctx, { x, y, hw, hh, rot = 0, facets, rim, rimWidth, cross, crossWidth }) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const T = [0, -hh], R = [hw, 0], B = [0, hh], L = [-hw, 0], C = [-hw * 0.14, -hh * 0.12];
  const diamond = new Path2D();
  diamond.moveTo(...T); diamond.lineTo(...R); diamond.lineTo(...B); diamond.lineTo(...L); diamond.closePath();
  ctx.fillStyle = facets[1];
  ctx.fill(diamond);
  [[T, L], [T, R], [B, L], [B, R]].forEach(([a, b], i) => {
    ctx.beginPath();
    ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...C); ctx.closePath();
    ctx.fillStyle = facets[i];
    ctx.fill();
  });
  ctx.strokeStyle = cross;
  ctx.lineWidth = crossWidth;
  ctx.beginPath();
  for (const v of [T, R, B, L]) { ctx.moveTo(...C); ctx.lineTo(...v); }
  ctx.stroke();
  ctx.strokeStyle = rim;
  ctx.lineWidth = rimWidth;
  ctx.stroke(diamond);
  ctx.restore();
}

// Glowing orb, white so it can be tinted. The body is 1/ORB_PAD of the texture; the
// rest is halo.
export function orb(S = 128) {
  const { c, ctx } = surface(S);
  const r = 0.5 / ORB_PAD;
  ctx.fillStyle = radial(ctx, 0.5, 0.5, 0.5, [rgba('#ffffff', 0.55), rgba('#ffffff', 0.18), rgba('#ffffff', 0)]);
  ctx.fillRect(0, 0, 1, 1);
  ctx.beginPath();
  ctx.arc(0.5, 0.5, r, 0, TAU);
  ctx.fillStyle = radial(ctx, 0.5, 0.5, r, ['#ffffff', '#f2f2f2', '#c8c8c8'], 0.44, 0.42);
  ctx.fill();
  sparkle(ctx, 0.45, 0.44, r * 0.6, '#ffffff', 0.9);
  return c;
}

// The Lemur's crescent, white so it can be tinted, sized like the orb (its outer edge
// 1/ORB_PAD of the texture, the rest halo): a disc with an offset disc cut out of it, its
// horns opening toward +x, a glint in the thick of its back.
export function crescent(S = 128) {
  const { c, ctx } = surface(S);
  const r = 0.5 / ORB_PAD;
  ctx.fillStyle = radial(ctx, 0.5, 0.5, 0.5, [rgba('#ffffff', 0.45), rgba('#ffffff', 0.12), rgba('#ffffff', 0)]);
  ctx.fillRect(0, 0, 1, 1);
  const k = surface(S);
  k.ctx.beginPath();
  k.ctx.arc(0.5, 0.5, r, 0, TAU);
  k.ctx.fillStyle = radial(k.ctx, 0.5, 0.5, r, ['#ffffff', '#f2f2f2', '#c8c8c8'], 0.4, 0.5);
  k.ctx.fill();
  k.ctx.globalCompositeOperation = 'destination-out';
  k.ctx.beginPath();
  k.ctx.arc(0.5 + r * 0.42, 0.5, r * 0.86, 0, TAU);
  k.ctx.fill();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(k.c, 0, 0);
  ctx.setTransform(S, 0, 0, S, 0, 0);
  sparkle(ctx, 0.5 - r * 0.72, 0.5, r * 0.45, '#ffffff', 0.9);
  return c;
}

// Projectile trail: a soft tapering streak, 1 texture-width long, its head at COMET_HEAD
// and fading to nothing toward the left.
export function comet(W = 256, H = 64) {
  const { c, ctx, px } = surface(W, H, W);
  const mid = H / W / 2, r = mid * 0.8;
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.quadraticCurveTo(COMET_HEAD * 0.55, mid - r, COMET_HEAD, mid - r);
  ctx.arc(COMET_HEAD, mid, r, -Math.PI / 2, Math.PI / 2);
  ctx.quadraticCurveTo(COMET_HEAD * 0.55, mid + r, 0, mid);
  ctx.fillStyle = linear(ctx, 0, 0, COMET_HEAD + r, 0, [rgba('#ffffff', 0), rgba('#ffffff', 0.35), rgba('#ffffff', 1)]);
  glow(ctx, rgba('#ffffff', 0.6), px * 0.012, () => ctx.fill());
  return c;
}

// Chaser core: a faceted kite gem.
export function core(W = 128, H = 160) {
  const { c, ctx } = surface(W, H, W);
  const h = H / W;
  const T = [0.5, 0.02], R = [0.97, h * 0.35], B = [0.5, h - 0.02], L = [0.03, h * 0.35], C = [0.5, h * 0.35];
  [[T, L, '#ffffff'], [T, R, '#e4e8ff'], [L, B, '#c3caf4'], [R, B, '#eef0ff']].forEach(([a, b, color]) => {
    ctx.beginPath();
    ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...C); ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.01;
    ctx.stroke(); // closes hairline seams between facets
  });
  ctx.strokeStyle = rgba('#9aa6e6', 0.6);
  ctx.lineWidth = 0.02;
  ctx.beginPath();
  ctx.moveTo(...L); ctx.lineTo(...R);
  ctx.moveTo(...T); ctx.lineTo(...B);
  ctx.stroke();
  sparkle(ctx, 0.34, h * 0.24, 0.13, '#ffffff', 1, 0.1);
  return c;
}

// Hexagon that fills its texture exactly: a crystal with faint facets and a bright
// rim inside the edge (strokes are clipped so the silhouette never grows).
function hexCrystal(Wpx, Hpx, flatTop, { fill, facet, rim, inner, star }) {
  const { c, ctx } = surface(Wpx, Hpx, Wpx);
  const w = 1, h = Hpx / Wpx;
  const hex = hexPath(w, h, flatTop);
  ctx.fillStyle = typeof fill === 'function' ? fill(ctx, h) : fill;
  ctx.fill(hex);
  ctx.save();
  ctx.clip(hex);
  const s = 0.6;
  const innerHex = new Path2D();
  innerHex.addPath(hexPath(w, h, flatTop), new DOMMatrix().translate(w / 2, h / 2).scale(s).translate(-w / 2, -h / 2));
  ctx.fillStyle = inner;
  ctx.fill(innerHex);
  ctx.strokeStyle = facet;
  ctx.lineWidth = 0.014;
  ctx.stroke(innerHex);
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + (flatTop ? 0 : Math.PI / 6);
    const ox = (Math.cos(a) * w) / 2 * (flatTop ? 1 : 1 / Math.cos(Math.PI / 6));
    const oy = (Math.sin(a) * h) / 2 * (flatTop ? 1 / Math.sin(Math.PI / 3) : 1);
    ctx.moveTo(w / 2 + ox * s, h / 2 + oy * s);
    ctx.lineTo(w / 2 + ox, h / 2 + oy);
  }
  ctx.stroke();
  ctx.strokeStyle = rim;
  ctx.lineWidth = 0.06;
  ctx.stroke(hex);
  ctx.restore();
  sparkle(ctx, 0.5, h / 2, 0.12, star, 0.9);
  return c;
}

// The Warden: a white crystal hexagon.
export function hexFlat() {
  return hexCrystal(256, 222, true, {
    fill: (ctx, h) => linear(ctx, 0, 0, 0, h, ['#ffffff', '#f1f2f8', '#dfe2ee']),
    inner: '#f6f7fc', facet: rgba('#c3c8de', 0.9), rim: '#ffffff', star: '#c5cbe6',
  });
}

// The exit: a hex portal with a bright rim and core (tinted grey in game).
export function hexPointed() {
  return hexCrystal(222, 256, false, {
    fill: (ctx, h) => radial(ctx, 0.5, h / 2, 0.6, ['#e6e6e6', '#bdbdbd', '#a4a4a4']),
    inner: '#d2d2d2', facet: rgba('#ffffff', 0.55), rim: '#ffffff', star: '#ffffff',
  });
}

// The opened exit: the same hex portal, bright and solid, lit from within by a star.
export function exitPortal() {
  const c = hexCrystal(222, 256, false, {
    fill: (ctx, h) => radial(ctx, 0.5, h / 2, 0.62, ['#ffffff', '#dfe6ff', '#8d9ff0']),
    inner: '#e6ebff', facet: rgba('#6f82dc', 0.8), rim: '#ffffff', star: '#ffffff',
  });
  const ctx = c.getContext('2d'), h = 256 / 222;
  ctx.save();
  ctx.clip(hexPath(1, h, false));
  ctx.fillStyle = radial(ctx, 0.5, h / 2, 0.26, [rgba('#ffffff', 0.7), rgba('#ffffff', 0)]);
  ctx.fillRect(0, 0, 1, h);
  ctx.restore();
  sparkle(ctx, 0.5, h / 2, 0.16, '#ffffff');
  return c;
}

// A glowing outline of the exit's hex, white so it can be tinted: the frames turning
// around the opened exit and the ripples it sends out. The outline spans HEX_FRAME_INSET
// of the texture's width.
export function hexFrame(W = 256) {
  const H = Math.round((W * 256) / 222);
  const { c, ctx, px } = surface(W, H, W);
  const h = H / W, s = HEX_FRAME_INSET;
  const p = new Path2D();
  p.addPath(hexPath(1, h, false), new DOMMatrix().translate(0.5, h / 2).scale(s).translate(-0.5, -h / 2));
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 0.02;
  glow(ctx, rgba('#ffffff', 0.9), px * 0.05, () => { ctx.stroke(p); ctx.stroke(p); });
  return c;
}
