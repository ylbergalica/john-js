// The exit trail's route (EXIT_TRAIL, src/game/exitTrail.js): A* across the floor grid,
// kept toward the middle of rooms and corridors, then drawn as a smooth curve through
// every few cells of it that winds gently side to side wherever the walls leave room.
import { clamp, randRange, smoothStep01, TAU } from '../engine/math.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const WALL_MARGIN = 0.3; // the smoothed curve keeps at least this far into floor cells

// → world points `cfg.spacing` apart from near `from` to near `to`, each { x, y, s } with
// s its distance along, or null when there's no way through.
export function trailPath(grid, from, to, cfg) {
  const clear = clearance(grid, cfg.clearance);
  const start = nearestFloor(grid, from), goal = nearestFloor(grid, to);
  if (!start || !goal) return null;
  const cells = aStar(grid, clear, start, goal, cfg);
  if (!cells || cells.length < 2) return null;
  const base = resample(smoothRoute(grid, cells, cfg.smoothStep), cfg.spacing / 2);
  const wound = resample(wind(grid, clear, base, cfg), cfg.spacing);
  const length = wound[wound.length - 1].s;
  return wound.filter((p) => p.s >= cfg.gap && p.s <= length - cfg.gap);
}

// Per cell, how many cells (8-way) to the nearest wall, up to `max`: walls 0, floor
// touching a wall 1, and so on.
function clearance(grid, max) {
  const { width: W, height: H } = grid, n = W * H;
  const d = new Uint8Array(n).fill(max);
  const queue = new Int32Array(n);
  let head = 0, tail = 0;
  for (let i = 0; i < n; i++) if (grid.cells[i] !== 1) { d[i] = 0; queue[tail++] = i; }
  while (head < tail) {
    const cur = queue[head++], cx = cur % W, cy = (cur - cx) / W, nd = d[cur] + 1;
    if (nd >= max) continue;
    for (const [dx, dy] of DIRS) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = x + y * W;
      if (d[i] <= nd) continue;
      d[i] = nd;
      queue[tail++] = i;
    }
  }
  return d;
}

function nearestFloor(grid, pos) {
  const cx = Math.floor(pos.x), cy = Math.floor(pos.y);
  for (let r = 0; r <= 4; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === r && grid.isFloor(cx + dx, cy + dy)) return { x: cx + dx, y: cy + dy };
      }
    }
  }
  return null;
}

// 8-way, no corner cutting; steps cost more the closer they run to a wall. → cell centres.
function aStar(grid, clear, start, goal, { wallBias, clearance: max }) {
  const W = grid.width, n = W * grid.height;
  const g = new Float32Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const s = start.x + start.y * W, t = goal.x + goal.y * W;
  const h = (i) => {
    const x = i % W, dx = Math.abs(x - goal.x), dy = Math.abs((i - x) / W - goal.y);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  const open = new Heap();
  g[s] = 0;
  open.push(s, h(s));
  while (open.size) {
    const cur = open.pop();
    if (cur === t) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % W, cy = (cur - cx) / W;
    for (const [dx, dy] of DIRS) {
      const x = cx + dx, y = cy + dy;
      if (!grid.isFloor(x, y)) continue;
      if (dx && dy && !(grid.isFloor(cx + dx, cy) && grid.isFloor(cx, cy + dy))) continue;
      const i = x + y * W;
      if (closed[i]) continue;
      const ng = g[cur] + (dx && dy ? Math.SQRT2 : 1) * (1 + (wallBias * (max - clear[i])) / max);
      if (ng < g[i]) { g[i] = ng; came[i] = cur; open.push(i, ng + h(i)); }
    }
  }
  if (g[t] === Infinity) return null;
  const path = [];
  for (let i = t; i !== -1; i = came[i]) path.push({ x: (i % W) + 0.5, y: Math.floor(i / W) + 0.5 });
  return path.reverse();
}

// A Catmull-Rom curve through every `step`-th cell (and the last), sampled densely. Falls
// back to closer control points wherever a looser curve would clip a wall.
function smoothRoute(grid, cells, step) {
  for (let k = step; k >= 1; k--) {
    const ctrl = cells.filter((_, i) => i % k === 0);
    if (ctrl[ctrl.length - 1] !== cells[cells.length - 1]) ctrl.push(cells[cells.length - 1]);
    const curve = catmullRom(ctrl);
    if (curve.every((p) => onFloor(grid, p.x, p.y, WALL_MARGIN))) return curve;
  }
  return cells;
}

function catmullRom(pts) {
  const out = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const n = Math.max(2, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) / 0.2));
    for (let j = 1; j <= n; j++) {
      const t = j / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  return out;
}

// Points every `spacing` along the polyline, each with s (distance along) and its unit
// tangent (tx, ty).
function resample(pts, spacing) {
  const out = [];
  let s = 0, next = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue;
    const tx = (b.x - a.x) / len, ty = (b.y - a.y) / len;
    while (next <= s + len) {
      const u = next - s;
      out.push({ x: a.x + tx * u, y: a.y + ty * u, s: next, tx, ty });
      next += spacing;
    }
    s += len;
  }
  return out;
}

// Sways the route side to side: two sine waves of random length and phase, as wide as the
// walls allow (narrowing smoothly ahead of tight spots) and settling to nothing at the ends.
function wind(grid, clear, pts, { meander: M, spacing }) {
  const W = grid.width, L = pts[pts.length - 1].s;
  const room = pts.map((p) => clamp(clear[Math.floor(p.x) + Math.floor(p.y) * W] - 0.5 - M.margin, 0, M.amp));
  // Erode then average over a few units, so the sway never outgrows the room it's in and
  // eases in and out of narrow passages.
  const reach = Math.max(1, Math.round(3 / (spacing / 2)));
  const eroded = room.map((_, i) => Math.min(...room.slice(Math.max(0, i - reach), i + reach + 1)));
  const amp = eroded.map((_, i) => {
    const win = eroded.slice(Math.max(0, i - reach), i + reach + 1);
    return win.reduce((a, b) => a + b, 0) / win.length;
  });
  const w1 = randRange(...M.wavelength), w2 = randRange(...M.wavelength) * 0.55;
  const p1 = Math.random() * TAU, p2 = Math.random() * TAU;
  return pts.map((p, i) => {
    const ends = smoothStep01(p.s / 4) * smoothStep01((L - p.s) / 4);
    const o = amp[i] * ends * (0.7 * Math.sin((p.s / w1) * TAU + p1) + 0.3 * Math.sin((p.s / w2) * TAU + p2));
    const x = p.x - p.ty * o, y = p.y + p.tx * o;
    return onFloor(grid, x, y, WALL_MARGIN) ? { x, y } : { x: p.x, y: p.y };
  });
}

function onFloor(grid, x, y, m) {
  return grid.isFloor(Math.floor(x - m), Math.floor(y - m)) && grid.isFloor(Math.floor(x + m), Math.floor(y - m))
    && grid.isFloor(Math.floor(x - m), Math.floor(y + m)) && grid.isFloor(Math.floor(x + m), Math.floor(y + m));
}

// Binary min-heap of ids by priority.
class Heap {
  constructor() { this.ids = []; this.keys = []; }
  get size() { return this.ids.length; }

  push(id, key) {
    const { ids, keys } = this;
    let i = ids.length;
    ids.push(id); keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      ids[i] = ids[p]; keys[i] = keys[p];
      i = p;
    }
    ids[i] = id; keys[i] = key;
  }

  pop() {
    const { ids, keys } = this, top = ids[0], id = ids.pop(), key = keys.pop();
    if (ids.length) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= ids.length) break;
        if (c + 1 < ids.length && keys[c + 1] < keys[c]) c++;
        if (keys[c] >= key) break;
        ids[i] = ids[c]; keys[i] = keys[c];
        i = c;
      }
      ids[i] = id; keys[i] = key;
    }
    return top;
  }
}
