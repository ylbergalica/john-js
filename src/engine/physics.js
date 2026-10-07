// Circle-body physics against each other and a tile grid: impulses, linear damping,
// positional contact resolution. Solid-solid pairs use sweep-and-prune on x.

export class Body {
  constructor({ x = 0, y = 0, radius = 0.5, mass = 1, damping = 0, solid = true, collideWalls = solid } = {}) {
    this.pos = { x, y };
    this.prev = { x, y };
    this.vel = { x: 0, y: 0 };
    this.rotation = 0; // radians
    this.prevRotation = 0;
    this.radius = radius;
    this.mass = mass;
    this.damping = damping;
    this.solid = solid; // false = sensor: integrates but never collides
    this.collideWalls = collideWalls;
    this.enabled = true;
  }

  addImpulse(ix, iy) {
    this.vel.x += ix / this.mass;
    this.vel.y += iy / this.mass;
  }

  stop() { this.vel.x = 0; this.vel.y = 0; }

  // Move without interpolating through the gap on the next rendered frame.
  teleport(x, y) {
    this.pos.x = this.prev.x = x;
    this.pos.y = this.prev.y = y;
  }

  lerpPos(alpha) {
    return { x: this.prev.x + (this.pos.x - this.prev.x) * alpha, y: this.prev.y + (this.pos.y - this.prev.y) * alpha };
  }

  lerpRotation(alpha) {
    let d = (this.rotation - this.prevRotation) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    else if (d < -Math.PI) d += Math.PI * 2;
    return this.prevRotation + d * alpha;
  }
}

const SOLVER_ITERATIONS = 3;
const byMinX = (b) => b.pos.x - b.radius;

export class Physics {
  // grid: { width, height, isFloor(x, y) } or null for an open world.
  constructor(grid = null) {
    this.grid = grid;
    this.bodies = [];
    this.solids = []; // kept sorted by min x between steps
  }

  add(body) {
    this.bodies.push(body);
    if (body.solid) this.solids.push(body);
    return body;
  }

  remove(body) {
    swapRemove(this.bodies, body);
    if (body.solid) {
      const i = this.solids.indexOf(body);
      if (i >= 0) this.solids.splice(i, 1); // preserve sort order
    }
  }

  // Out-of-bounds counts as wall so nothing can leave the map.
  isWall(cx, cy) {
    const g = this.grid;
    return !!g && !g.isFloor(cx, cy);
  }

  step(dt) {
    for (const b of this.bodies) {
      b.prev.x = b.pos.x; b.prev.y = b.pos.y;
      b.prevRotation = b.rotation;
      if (!b.enabled) continue;
      const damp = 1 / (1 + dt * b.damping);
      b.vel.x *= damp; b.vel.y *= damp;
      b.pos.x += b.vel.x * dt;
      b.pos.y += b.vel.y * dt;
    }

    const s = this.solids;
    for (let iter = 0; iter < SOLVER_ITERATIONS; iter++) {
      insertionSort(s, byMinX);
      for (let i = 0; i < s.length; i++) {
        const a = s[i];
        if (!a.enabled) continue;
        const maxX = a.pos.x + a.radius;
        for (let j = i + 1; j < s.length; j++) {
          const b = s[j];
          if (byMinX(b) > maxX) break;
          if (b.enabled) this.resolvePair(a, b);
        }
      }
      for (const b of s) if (b.enabled && b.collideWalls) this.resolveWalls(b);
    }
  }

  resolvePair(a, b) {
    const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y;
    const r = a.radius + b.radius;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) return;
    const d = Math.sqrt(d2);
    const nx = d < 1e-6 ? 1 : dx / d, ny = d < 1e-6 ? 0 : dy / d;
    const overlap = r - d;
    let ia = 1 / a.mass, ib = 1 / b.mass;
    // A body pinned against a wall can't yield: treat it as immovable for this contact.
    const aBlocked = a.collideWalls && this.circleHitsWall(a.pos.x - nx * overlap, a.pos.y - ny * overlap, a.radius * 0.98);
    const bBlocked = b.collideWalls && this.circleHitsWall(b.pos.x + nx * overlap, b.pos.y + ny * overlap, b.radius * 0.98);
    if (aBlocked && !bBlocked) ia = 0;
    else if (bBlocked && !aBlocked) ib = 0;
    const sum = ia + ib;
    a.pos.x -= nx * overlap * (ia / sum); a.pos.y -= ny * overlap * (ia / sum);
    b.pos.x += nx * overlap * (ib / sum); b.pos.y += ny * overlap * (ib / sum);
    const rel = (b.vel.x - a.vel.x) * nx + (b.vel.y - a.vel.y) * ny;
    if (rel < 0) {
      const j = -rel / sum;
      a.vel.x -= nx * j * ia; a.vel.y -= ny * j * ia;
      b.vel.x += nx * j * ib; b.vel.y += ny * j * ib;
    }
  }

  resolveWalls(b) {
    const r = b.radius;
    const minX = Math.floor(b.pos.x - r), maxX = Math.floor(b.pos.x + r);
    const minY = Math.floor(b.pos.y - r), maxY = Math.floor(b.pos.y + r);
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        if (!this.isWall(cx, cy)) continue;
        const px = Math.max(cx, Math.min(b.pos.x, cx + 1));
        const py = Math.max(cy, Math.min(b.pos.y, cy + 1));
        const dx = b.pos.x - px, dy = b.pos.y - py;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        let nx, ny, push;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          nx = dx / d; ny = dy / d; push = r - d;
        } else {
          // Centre inside the tile: push out along the shallowest axis.
          const left = b.pos.x - cx, right = cx + 1 - b.pos.x;
          const top = b.pos.y - cy, bottom = cy + 1 - b.pos.y;
          const m = Math.min(left, right, top, bottom);
          if (m === left) { nx = -1; ny = 0; } else if (m === right) { nx = 1; ny = 0; }
          else if (m === top) { nx = 0; ny = -1; } else { nx = 0; ny = 1; }
          push = m + r;
        }
        b.pos.x += nx * push; b.pos.y += ny * push;
        const vn = b.vel.x * nx + b.vel.y * ny;
        if (vn < 0) { b.vel.x -= nx * vn; b.vel.y -= ny * vn; }
      }
    }
  }

  circleHitsWall(x, y, r) {
    const minX = Math.floor(x - r), maxX = Math.floor(x + r);
    const minY = Math.floor(y - r), maxY = Math.floor(y + r);
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        if (!this.isWall(cx, cy)) continue;
        const px = Math.max(cx, Math.min(x, cx + 1));
        const py = Math.max(cy, Math.min(y, cy + 1));
        if ((x - px) ** 2 + (y - py) ** 2 < r * r) return true;
      }
    }
    return false;
  }

  // Sweeps a circle of radius r from (sx, sy) along unit (dx, dy) for `distance`.
  circleCastHitsWall(sx, sy, dx, dy, distance, r) {
    const step = Math.min(0.25, r);
    for (let t = 0; t < distance; t += step) {
      if (this.circleHitsWall(sx + dx * t, sy + dy * t, r)) return true;
    }
    return this.circleHitsWall(sx + dx * distance, sy + dy * distance, r);
  }

  // Distance from (sx, sy) along unit (dx, dy) to the first wall tile, up to `max`.
  rayLength(sx, sy, dx, dy, max, step = 0.05) {
    for (let t = 0; t < max; t += step) if (this.isWall(Math.floor(sx + dx * t), Math.floor(sy + dy * t))) return t;
    return max;
  }

  // Is a circle at (x, y) free of walls and of solid bodies other than `ignore`?
  isCircleFree(x, y, r, ignore = null) {
    if (this.circleHitsWall(x, y, r)) return false;
    for (const b of this.solids) {
      if (b === ignore || !b.enabled) continue;
      if ((b.pos.x - x) ** 2 + (b.pos.y - y) ** 2 < (b.radius + r) ** 2) return false;
    }
    return true;
  }
}

function insertionSort(arr, key) {
  for (let i = 1; i < arr.length; i++) {
    const item = arr[i];
    const k = key(item);
    let j = i - 1;
    while (j >= 0 && key(arr[j]) > k) { arr[j + 1] = arr[j]; j--; }
    arr[j + 1] = item;
  }
}

export function swapRemove(arr, item) {
  const i = arr.indexOf(item);
  if (i < 0) return false;
  arr[i] = arr[arr.length - 1];
  arr.pop();
  return true;
}

// ── Overlap tests ───────────────────────────────────────────────────
// Oriented box: { x, y, hw, hh, angle } (half extents along the box's local axes).
export function circleVsBox(cx, cy, cr, box) {
  const c = Math.cos(box.angle), s = Math.sin(box.angle);
  const ox = cx - box.x, oy = cy - box.y;
  const lx = ox * c + oy * s;
  const ly = -ox * s + oy * c;
  const qx = Math.max(-box.hw, Math.min(lx, box.hw));
  const qy = Math.max(-box.hh, Math.min(ly, box.hh));
  return (lx - qx) ** 2 + (ly - qy) ** 2 <= cr * cr;
}

export function circleVsCircle(ax, ay, ar, bx, by, br) {
  return (ax - bx) ** 2 + (ay - by) ** 2 <= (ar + br) ** 2;
}

export function segmentPointDistSq(ax, ay, bx, by, px, py) {
  const abx = bx - ax, aby = by - ay;
  const l2 = abx * abx + aby * aby;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / l2)) : 0;
  return (px - ax - abx * t) ** 2 + (py - ay - aby * t) ** 2;
}

// Capsule: { ax, ay, bx, by, r }
export function circleVsCapsule(cx, cy, cr, cap) {
  return segmentPointDistSq(cap.ax, cap.ay, cap.bx, cap.by, cx, cy) <= (cr + cap.r) ** 2;
}

// Remembers which objects a sensor already touches so "enter" fires once per contact.
export class ContactSet {
  constructor() {
    this.inside = new Set();
    this.next = new Set();
  }
  // Calls onEnter for each object in `current` that wasn't touching last time.
  update(current, onEnter) {
    this.next.clear();
    for (const o of current) {
      this.next.add(o);
      if (!this.inside.has(o)) onEnter(o);
    }
    [this.inside, this.next] = [this.next, this.inside];
  }
  clear() { this.inside.clear(); }
}
