// The Antlers aspect's antler (ASPECTS antlers.shape), grown to any stage: drawn on the player
// (src/aspects/antlers.js) and, full grown, on its icon (src/render/sprites.js).
import { clamp01, lerp, smoothStep01, TAU } from '../engine/math.js';

const DEG = Math.PI / 180;

// The right antler at growth `g` (0: a nub, 1: full grown), in its own frame (+x forward, +y
// out to the right, world units): its beam and every branch off it, each a run of points
// { x, y, h, w, bone, d }: `h` its heading there (radians), `w` its half-width, `bone` how far
// toward the tips' colour (0…1) and `d` how far out from the brow along it (world units). Each
// run also carries its `depth` (0 the beam, 1 a tine off it, 2 a fork off that).
export function antlerParts(S, g) {
  const grown = clamp01(g / S.beamBy), reach = lerp(S.nub, 1, grown) * S.length;
  // Young, it curls ahead from its root to its tip (`nubCurve`, degrees), giving way to the full
  // grown sweep over the first nubFor of the beam's growth.
  const young = 1 - smoothStep01(clamp01(grown / S.nubFor)), thick = lerp(S.width[0], S.width[1], g);
  // Still growing, its tip curls ahead (to `curl.to` degrees over the last curl.length of it).
  const C = S.curl, curl = (s) => smoothStep01(clamp01((s - reach + C.length) / C.length)) * (1 - grown);
  const heading = (s) => {
    const h = lerp(curveAt(S.curve, s / S.length), lerp(S.nubCurve[0], S.nubCurve[1], s / reach), young);
    return lerp(h, C.to, curl(s)) * DEG;
  };
  const step = S.length / (S.points - 1);
  let x = S.base[0], y = S.base[1], s = 0;
  const halfWidth = (s) => thick * lerp(1, S.taper, s / S.length) * pointed(S, reach - s);
  const beam = Object.assign([{ x, y, h: heading(0), w: halfWidth(0), bone: 0, d: 0 }], { depth: 0, full: S.length });
  while (s < reach) {
    const next = Math.min(reach, s + step), h = heading((s + next) / 2);
    x += Math.cos(h) * (next - s);
    y += Math.sin(h) * (next - s);
    s = next;
    beam.push({ x, y, h: heading(s), w: halfWidth(s), bone: s / S.length, d: s });
  }
  const parts = [beam];
  branches(S, S.tines, g, beam, 0, S.beamBy, 1, parts);
  return parts;
}

// The branches `specs` off `parent`, which grows over [pStart, pStart + pDur] of the way to
// full growth, and their forks in turn. Each starts as its parent reaches it.
function branches(S, specs, g, parent, pStart, pDur, depth, parts) {
  for (const t of specs ?? []) {
    const start = pStart + t.at * pDur, dur = Math.min(S.tineTime * S.forkTime ** (depth - 1), 1 - start);
    const k = clamp01((g - start) / dur);
    const from = k > 0 && pointAlong(parent, parent[0].d + t.at * parent.full);
    if (!from) continue;
    const len = t.length * k, n = Math.max(4, Math.ceil(t.length / S.spacing)) + 1, base = from.w * t.width;
    const part = Object.assign([], { depth, full: t.length });
    // Bending by `bend` along it, and swaying one way then the other (`sway` degrees, to the
    // side it left on unless it says), so it curves like the beam.
    const sway = t.sway ?? S.sway * Math.sign(t.angle);
    const heading = (u) => from.h + (t.angle + t.bend * u + sway * Math.sin(TAU * u)) * DEG;
    let x = from.x, y = from.y;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      part.push({ x, y, h: heading(u), w: base * lerp(1, S.taper, u) * pointed(S, len * (1 - u)), bone: lerp(from.bone, 1, u), d: from.d + u * len });
      const step = heading(u + 0.5 / (n - 1));
      x += (Math.cos(step) * len) / (n - 1);
      y += (Math.sin(step) * len) / (n - 1);
    }
    parts.push(part);
    branches(S, t.tines, g, part, start, dur, depth + 1, parts);
  }
}

// A smooth run through `curve`'s [at, value] points (Catmull-Rom), at `t` (0…1).
function curveAt(curve, t) {
  let i = 1;
  while (i < curve.length - 1 && curve[i][0] < t) i++;
  const [t0, v0] = curve[i - 1], [t1, v1] = curve[i], k = clamp01((t - t0) / (t1 - t0 || 1));
  const slope = (j) => {
    const a = curve[Math.max(0, j - 1)], b = curve[Math.min(curve.length - 1, j + 1)];
    return ((b[1] - a[1]) / (b[0] - a[0] || 1)) * (t1 - t0);
  };
  const m0 = slope(i - 1), m1 = slope(i), k2 = k * k, k3 = k2 * k;
  return (2 * k3 - 3 * k2 + 1) * v0 + (k3 - 2 * k2 + k) * m0 + (-2 * k3 + 3 * k2) * v1 + (k3 - k2) * m1;
}

// Coming to a sharp point over the last tipLength of a branch, `left` from its tip.
function pointed(S, left) { return Math.min(1, left / S.tipLength) ** S.point; }

// The point `d` along a run of points (by their `d`), or null if it doesn't reach that far.
function pointAlong(pts, d) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (b.d < d) continue;
    const k = clamp01((d - a.d) / (b.d - a.d || 1));
    return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), h: lerp(a.h, b.h, k), w: lerp(a.w, b.w, k), bone: lerp(a.bone, b.bone, k), d };
  }
  return null;
}

// The left antler, mirroring the right.
export function mirrored(parts) {
  return parts.map((part) => Object.assign(part.map((pt) => ({ ...pt, y: -pt.y, h: -pt.h })), { depth: part.depth, full: part.full }));
}
