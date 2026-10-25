// Where an enemy or prop can be struck: its round body, unless its type gives its own
// outline (`hurtbox`: a convex polygon of [x, y] points in its frame, +x forward), which
// turns with it, or it gives one in the world (`hurtOutline()`: [{ x, y }], a Weaver's
// thread). Everything the player strikes with tests these.
import { circleVsBox, segmentPointDistSq } from '../engine/physics.js';

// The hurtbox in the world: { type: 'circle', x, y, r } or { type: 'poly', points: [{ x, y }] }.
export function hurtShape(t) {
  if (t.hurtOutline) return { type: 'poly', points: t.hurtOutline() };
  const b = t.body, outline = t.type?.hurtbox;
  if (!outline) return { type: 'circle', x: b.pos.x, y: b.pos.y, r: b.radius };
  const c = Math.cos(b.rotation), s = Math.sin(b.rotation);
  return { type: 'poly', points: outline.map(([x, y]) => ({ x: b.pos.x + c * x - s * y, y: b.pos.y + s * x + c * y })) };
}

// How far (x, y) is outside the hurtbox (negative inside).
export function hurtDistance(t, x, y) {
  const h = hurtShape(t);
  if (h.type === 'circle') return Math.hypot(x - h.x, y - h.y) - h.r;
  const d = Math.sqrt(edgeDistSq(h.points, x, y));
  return pointInPoly(h.points, x, y) ? -d : d;
}

// Whether a circle at (x, y), radius `r`, touches the hurtbox.
export function hurtByCircle(t, x, y, r) { return hurtDistance(t, x, y) <= r; }

// Whether the capsule from (ax, ay) to (bx, by), radius `r`, touches the hurtbox.
export function hurtBySegment(t, ax, ay, bx, by, r) {
  const h = hurtShape(t);
  if (h.type === 'circle') return segmentPointDistSq(ax, ay, bx, by, h.x, h.y) <= (h.r + r) ** 2;
  if (pointInPoly(h.points, ax, ay)) return true;
  return forEdges(h.points, (p, q) => segmentsDistSq(ax, ay, bx, by, p.x, p.y, q.x, q.y) <= r * r);
}

// Whether a box ({ x, y, hw, hh, angle }, as circleVsBox takes) touches the hurtbox.
export function hurtByBox(t, box) {
  const h = hurtShape(t);
  if (h.type === 'circle') return circleVsBox(h.x, h.y, h.r, box);
  const c = Math.cos(box.angle), s = Math.sin(box.angle);
  const corner = (u, v) => ({ x: box.x + c * u - s * v, y: box.y + s * u + c * v });
  return polysTouch(h.points, [corner(-box.hw, -box.hh), corner(box.hw, -box.hh), corner(box.hw, box.hh), corner(-box.hw, box.hh)]);
}

// Whether a polygon ([{ x, y }], any shape) touches the hurtbox.
export function hurtByPoly(t, poly) {
  const h = hurtShape(t);
  return h.type === 'circle' ? circleTouchesPoly(poly, h.x, h.y, h.r) : polysTouch(h.points, poly);
}

// The point on the hurtbox's edge nearest `p` (where a blow from there lands).
export function closestOnHurtbox(t, p) {
  const h = hurtShape(t);
  if (h.type === 'circle') {
    const dx = p.x - h.x, dy = p.y - h.y, l = Math.hypot(dx, dy);
    if (l < 1e-6) return { x: h.x + h.r * Math.cos(t.body.rotation), y: h.y + h.r * Math.sin(t.body.rotation) };
    return { x: h.x + (dx / l) * h.r, y: h.y + (dy / l) * h.r };
  }
  let best = null, bestD = Infinity;
  forEdges(h.points, (a, b) => {
    const q = nearestOnSegment(a, b, p), d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
    if (d < bestD) { bestD = d; best = q; }
  });
  return best;
}

// Whether a circle touches a polygon (a list of points).
export function circleTouchesPoly(poly, x, y, r) {
  return pointInPoly(poly, x, y) || edgeDistSq(poly, x, y) <= r * r;
}

// Geometry ------------------------------------------------------------------
// Calls fn(a, b) for each edge of `poly`; true as soon as it returns true.
function forEdges(poly, fn) {
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if (fn(poly[j], poly[i])) return true;
  return false;
}

function pointInPoly(poly, x, y) {
  let inside = false;
  forEdges(poly, (a, b) => {
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  });
  return inside;
}

function edgeDistSq(poly, x, y) {
  let d = Infinity;
  forEdges(poly, (a, b) => { d = Math.min(d, segmentPointDistSq(a.x, a.y, b.x, b.y, x, y)); });
  return d;
}

function polysTouch(a, b) {
  return pointInPoly(a, b[0].x, b[0].y) || pointInPoly(b, a[0].x, a[0].y)
    || forEdges(a, (p, q) => forEdges(b, (u, v) => segmentsCross(p, q, u, v)));
}

const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

function segmentsCross(p, q, u, v) {
  const d1 = cross(u, v, p), d2 = cross(u, v, q), d3 = cross(p, q, u), d4 = cross(p, q, v);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

// Squared distance between segments (ax, ay)–(bx, by) and (cx, cy)–(dx, dy).
function segmentsDistSq(ax, ay, bx, by, cx, cy, dx, dy) {
  if (segmentsCross({ x: ax, y: ay }, { x: bx, y: by }, { x: cx, y: cy }, { x: dx, y: dy })) return 0;
  return Math.min(
    segmentPointDistSq(cx, cy, dx, dy, ax, ay), segmentPointDistSq(cx, cy, dx, dy, bx, by),
    segmentPointDistSq(ax, ay, bx, by, cx, cy), segmentPointDistSq(ax, ay, bx, by, dx, dy),
  );
}

function nearestOnSegment(a, b, p) {
  const abx = b.x - a.x, aby = b.y - a.y, l2 = abx * abx + aby * aby;
  const k = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / l2)) : 0;
  return { x: a.x + abx * k, y: a.y + aby * k };
}
