// The Blight's sprites.
import { TAU } from '../../../engine/math.js';
import { BLIGHT } from '../../../data/effects.js';
import { ENEMY_TYPES } from '../../../data/enemies.js';
import { DEG, surface, rgba, glow, linear, radial, sparkle } from '../paint.js';
import { VOIDS, outline, voidFill } from './common.js';

// The Alembic's body: a decagon `corner` out to its corners, one at each valve, a band of
// plates round its edge in to a decagon `band` out (seamed between each pair of valves),
// round a heart of toxic nebula. Only its edge is lit, with a `glow` (of the texture's
// width). World units, in its frame. Its valves, canisters, core, gear ring and conduits
// are drawn over it by its rig (BLIGHT, src/enemies/blightRig.js).
const BLIGHT_BODY = { corner: 1, band: 0.8, line: 0.016, seam: 0.007, glow: 0.016 };

const BLIGHT_PALETTE = { stroke: ['#e4ffb8', '#8fd04a', '#3f7a1c'], glow: rgba('#6cc832', 0.7) };

// Each of its parts is its own sprite, drawn round a part `size` 1 spanning `body` of the
// texture's width (a canister reaching `pod` × that along its length; the rest room for a
// glow), looking along +x, its edge lit (`line`) like the body's outline. A canister
// launched glows harder (`looseGlow`).
export const PART_ART = { body: 0.26, line: 0.03, pod: 1.7, looseGlow: 0.06 };

// A canister's flask, in × its size along +x: a round bulb of radius 1 centred at `bulb`, a
// neck `neck` (half its width) running forward from it, and a metal stopper from
// `stopper[0]` to `[1]` (its far end, PART_ART.pod).
export const POD_FLASK = { bulb: -0.7, neck: 0.38, stopper: [1.15, 1.7] };

const PART_METAL = ['#2a3a24', '#162012', '#090d07'];

// The Alembic's parts at rest in its frame (+x forward, world units; BLIGHT): its valves
// round its rim first, the first straight ahead, then its canisters, then its core:
// [{ x, y, size, rot, kind, rim }], `rot` the way it faces (straight out from its centre).
let blightPartList = null;

export function blightParts() {
  if (blightPartList) return blightPartList;
  const { valves: V, pods: P, core } = BLIGHT;
  const at = (r, a, size, kind) => ({ x: Math.cos(a) * r, y: Math.sin(a) * r, size, rot: a, kind, rim: kind === 'valve' });
  blightPartList = [
    ...Array.from({ length: V.count }, (_, i) => at(V.r, (TAU * i) / V.count, V.size, 'valve')),
    ...Array.from({ length: P.count }, (_, i) => at(P.r, P.angle * DEG + (TAU * i) / P.count, P.size, 'pod')),
    { x: 0, y: 0, size: core.size, rot: 0, kind: 'core', rim: false },
  ];
  return blightPartList;
}

// Where valve `h`'s toxin forms, pushed `push` out along the way it faces, in its frame.
export function blightMuzzle(h, push = 0) {
  const d = h.size * BLIGHT.iris.muzzle + push;
  return { x: h.x + Math.cos(h.rot) * d, y: h.y + Math.sin(h.rot) * d };
}

/// In texture units (its visual.size across): `r` out to its corners (BLIGHT_BODY), one at
// each valve.
function blightPath(r = BLIGHT_BODY.corner) {
  const size = ENEMY_TYPES.blight.visual.size, n = BLIGHT.valves.count, p = new Path2D();
  for (let i = 0; i < n; i++) {
    const a = (TAU * i) / n, x = 0.5 + (Math.cos(a) * r) / size, y = 0.5 + (Math.sin(a) * r) / size;
    if (i) p.lineTo(x, y); else p.moveTo(x, y);
  }
  p.closePath();
  return p;
}

// Its edge, and faintly the inner edge of its band of plates and the seams between them.
export function blightOutline(S = 320) {
  const B = BLIGHT_BODY, size = ENEMY_TYPES.blight.visual.size, n = BLIGHT.valves.count;
  return outline(S, BLIGHT_PALETTE, (ctx) => {
    ctx.shadowBlur = S * B.glow; // tighter than most: it's far bigger than most
    ctx.lineWidth = B.line;
    ctx.stroke(blightPath());
    ctx.shadowBlur = 0; // the band's inner edge and seams unlit
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = B.seam;
    ctx.stroke(blightPath(B.band));
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = (TAU * (i + 0.5)) / n, c = Math.cos(a) / size, s = Math.sin(a) / size, out = B.corner * Math.cos(Math.PI / n);
      ctx.moveTo(0.5 + c * B.band * Math.cos(Math.PI / n), 0.5 + s * B.band * Math.cos(Math.PI / n));
      ctx.lineTo(0.5 + c * out, 0.5 + s * out);
    }
    ctx.stroke();
  });
}

// Its heart of toxic nebula, darkened under its band of plates, a rivet at each end of a
// seam.
export function blightVoid(S = 512) {
  const B = BLIGHT_BODY, size = ENEMY_TYPES.blight.visual.size, n = BLIGHT.valves.count;
  const c = voidFill(blightPath(), VOIDS.blight, 'nonzero', S), ctx = c.getContext('2d'); // still drawing only over the body
  const band = new Path2D();
  band.addPath(blightPath());
  band.addPath(blightPath(B.band));
  ctx.fillStyle = radial(ctx, 0.5, 0.5, B.corner / size, [rgba('#070b06', 0.9), rgba('#0a1009', 0.92), rgba('#141c11', 0.95)]);
  ctx.fill(band, 'evenodd');
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = rgba('#a8dc6a', 0.35);
  for (let i = 0; i < n; i++) {
    const a = (TAU * (i + 0.5)) / n, k = Math.cos(Math.PI / n);
    for (const r of [B.band * k + 0.04, B.corner * k - 0.05]) {
      ctx.beginPath();
      ctx.arc(0.5 + (Math.cos(a) * r) / size, 0.5 + (Math.sin(a) * r) / size, 0.02 / size, 0, TAU);
      ctx.fill();
    }
  }
  return c;
}

// Its edge lit like the body's outline.
function partEdge(ctx, px, path, glowSize = 0.035) {
  glow(ctx, BLIGHT_PALETTE.glow, px * glowSize, () => {
    ctx.strokeStyle = linear(ctx, 0.2, 0.15, 0.8, 0.85, BLIGHT_PALETTE.stroke);
    ctx.lineWidth = PART_ART.line;
    ctx.stroke(path);
  });
}

// A valve's housing: a round port of dark metal, bolted, round the recess its iris closes
// over (drawn by its rig, opening and shutting).
function blightValve(S = 128) {
  const { c, ctx, px } = surface(S), B = PART_ART.body, R = BLIGHT.iris.recess;
  const port = new Path2D();
  port.arc(0.5, 0.5, B, 0, TAU);
  ctx.fillStyle = radial(ctx, 0.5, 0.5, B, PART_METAL, 0.42, 0.42);
  ctx.fill(port);
  ctx.beginPath();
  ctx.arc(0.5, 0.5, B * R, 0, TAU);
  ctx.fillStyle = '#030502';
  ctx.fill();
  ctx.strokeStyle = rgba('#a8dc6a', 0.45);
  ctx.lineWidth = 0.012;
  ctx.stroke();
  ctx.fillStyle = rgba('#c8f08a', 0.55);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2, r = B * (1 + R) / 2;
    ctx.beginPath();
    ctx.arc(0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r, 0.016, 0, TAU);
    ctx.fill();
  }
  partEdge(ctx, px, port);
  return c;
}

// A canister of toxin lying along +x: an alchemist's flask (POD_FLASK), its round bulb back
// and its neck forward, stoppered in metal, full of glowing poison with bubbles and a star
// glinting in it, a gleam round the bulb. `loose`: launched, glowing harder.
function blightPod(loose = false, S = 128) {
  const { c, ctx, px } = surface(S), B = PART_ART.body, F = POD_FLASK;
  const at = (x, y) => [0.5 + x * B, 0.5 + y * B];
  const flask = (inset) => { // the bulb and neck as one outline, `inset` in from the glass
    const r = 1 - inset, n = F.neck - inset, meet = F.bulb + Math.sqrt(r * r - n * n), a = Math.asin(n / r), p = new Path2D();
    p.moveTo(...at(F.stopper[0], -n));
    p.lineTo(...at(meet, -n));
    p.arc(...at(F.bulb, 0), r * B, -a, a, true);
    p.lineTo(...at(F.stopper[0], n));
    p.closePath();
    return p;
  };
  const glass = flask(0), toxin = flask(0.2);
  ctx.fillStyle = '#081206';
  ctx.fill(glass);
  ctx.fillStyle = radial(ctx, ...at(F.bulb, 0), B, ['#a8f060', '#6cc832', '#2a5a14'], ...at(F.bulb - 0.25, -0.25));
  ctx.fill(toxin);
  ctx.save();
  ctx.clip(toxin);
  ctx.fillStyle = rgba('#e0ffa8', 0.55);
  for (const [x, y, r] of [[-0.95, 0.35, 0.1], [-0.35, -0.42, 0.08], [0.25, 0.1, 0.07], [0.7, -0.05, 0.05]]) {
    ctx.beginPath();
    ctx.arc(...at(x, y), r * B, 0, TAU);
    ctx.fill();
  }
  sparkle(ctx, ...at(F.bulb + 0.05, 0.08), B * 0.6, '#ffffff', 0.95, 0.3);
  ctx.restore();
  ctx.strokeStyle = rgba('#ffffff', 0.4);
  ctx.lineWidth = 0.012;
  ctx.beginPath();
  ctx.arc(...at(F.bulb, 0), B * 0.72, 200 * DEG, 255 * DEG);
  ctx.stroke();
  const [s0, s1] = F.stopper, sw = F.neck * 1.35, stopper = new Path2D();
  stopper.roundRect(...at(s0, -sw), (s1 - s0) * B, 2 * sw * B, sw * 0.4 * B);
  ctx.fillStyle = linear(ctx, ...at(0, -sw), ...at(0, sw), PART_METAL);
  ctx.fill(stopper);
  ctx.strokeStyle = rgba('#a8dc6a', 0.5);
  ctx.lineWidth = 0.01;
  ctx.beginPath();
  ctx.moveTo(...at((s0 + s1) / 2, -sw)); ctx.lineTo(...at((s0 + s1) / 2, sw));
  ctx.stroke();
  const glow = loose ? PART_ART.looseGlow : 0.035;
  partEdge(ctx, px, glass, glow);
  partEdge(ctx, px, stopper, glow);
  return c;
}

// Its core's glass sphere, dark (the star of poison in it is drawn by its rig), a gleam
// across its top.
function blightCore(S = 128) {
  const { c, ctx, px } = surface(S), B = PART_ART.body;
  const sphere = new Path2D();
  sphere.arc(0.5, 0.5, B, 0, TAU);
  ctx.fillStyle = radial(ctx, 0.5, 0.5, B, ['#16380e', '#081a06', '#020502']);
  ctx.fill(sphere);
  ctx.strokeStyle = rgba('#ffffff', 0.4);
  ctx.lineWidth = 0.018;
  ctx.beginPath();
  ctx.arc(0.5, 0.5, B * 0.74, 200 * DEG, 250 * DEG);
  ctx.stroke();
  partEdge(ctx, px, sphere);
  return c;
}

// Every part's textures: its valves' housings, its canisters (and launched), and its core.
export function blightPartSprites() {
  return Object.fromEntries(blightParts().flatMap((h, i) => {
    if (h.kind === 'valve') return [[`blight_part_${i}`, blightValve()]];
    if (h.kind === 'pod') return [[`blight_part_${i}`, blightPod()], [`blight_part_${i}_loose`, blightPod(true)]];
    return [[`blight_part_${i}`, blightCore()]];
  }));
}
