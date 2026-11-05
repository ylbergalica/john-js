// The shore: the wall tiles touching the floor, which is as deep as the Moray ever swims, a
// tile's middle lying half a tile behind the outline. Built on demand, one per floor.
const NEAR = 3; // tiles round a spot looked through for a shore tile
const SEARCH = 500; // tiles a route looks through at most
const CANDIDATES = 10; // of the tiles nearest its goal, how many a route tries for a clear view of it

export class Shore {
  constructor(grid) {
    this.grid = grid;
    this.memo = new Map(); // tile → whether it's shore
  }

  key(x, y) { return x + y * 65536; }

  has(x, y) {
    const k = this.key(x, y);
    let v = this.memo.get(k);
    if (v === undefined) this.memo.set(k, (v = this.compute(x, y)));
    return v;
  }

  compute(x, y) {
    const g = this.grid;
    if (!g.inBounds(x, y) || g.isFloor(x, y)) return false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (g.isFloor(x + dx, y + dy)) return true;
    return false;
  }

  // The shore tile nearest (px, py), or null with none near it.
  nearest(px, py) {
    const cx = Math.floor(px), cy = Math.floor(py);
    let best = null, bestD = Infinity;
    for (let y = cy - NEAR; y <= cy + NEAR; y++) {
      for (let x = cx - NEAR; x <= cx + NEAR; x++) {
        if (!this.has(x, y)) continue;
        const d = (x + 0.5 - px) ** 2 + (y + 0.5 - py) ** 2;
        if (d < bestD) { bestD = d; best = { x, y }; }
      }
    }
    return best;
  }

  // Where tile `t` opens onto the floor on the side nearest `toward`: the middle of that edge
  // (or, touching it only at a corner, that corner) and the way out of it, unit { nx, ny }.
  mouth(t, toward) {
    const g = this.grid, cx = t.x + 0.5, cy = t.y + 0.5;
    const tx = toward.x - cx, ty = toward.y - cy, l = Math.hypot(tx, ty) || 1;
    let best = null, bestAim = -Infinity;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!g.isFloor(t.x + dx, t.y + dy)) continue;
      const aim = (dx * tx + dy * ty) / l;
      if (aim > bestAim) { bestAim = aim; best = { x: cx + dx * 0.5, y: cy + dy * 0.5, nx: dx, ny: dy }; }
    }
    if (best) return best;
    for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      if (!g.isFloor(t.x + dx, t.y + dy)) continue;
      const aim = (dx * tx + dy * ty) / l;
      if (aim > bestAim) { bestAim = aim; best = { x: cx + dx * 0.5, y: cy + dy * 0.5, nx: dx * Math.SQRT1_2, ny: dy * Math.SQRT1_2 }; }
    }
    return best ?? { x: cx, y: cy, nx: 1, ny: 0 };
  }

  // Whether `goal` can be seen from where tile `t` opens toward it.
  sees(t, goal, physics) {
    const m = this.mouth(t, goal), x = m.x + m.nx * 0.05, y = m.y + m.ny * 0.05;
    const dx = goal.x - x, dy = goal.y - y, d = Math.hypot(dx, dy);
    return d < 1e-3 || physics.rayLength(x, y, dx / d, dy / d, d) >= d;
  }

  // Tile by tile along the shore from `from` to as near `goal` as it runs, preferring a tile
  // with a clear view of it. Never slips between two wall tiles touching only at a corner, the
  // floor showing either side. → [{ x, y }], the tiles after `from` (empty if it's there).
  route(from, goal, physics) {
    const parent = new Map([[this.key(from.x, from.y), null]]), open = [from], seen = [from];
    for (let i = 0; i < open.length && seen.length < SEARCH; i++) {
      const t = open[i];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const x = t.x + dx, y = t.y + dy, k = this.key(x, y);
          if (parent.has(k) || !this.has(x, y)) continue;
          if (dx && dy && this.grid.isFloor(t.x + dx, t.y) && this.grid.isFloor(t.x, t.y + dy)) continue;
          parent.set(k, t);
          const next = { x, y };
          open.push(next);
          seen.push(next);
        }
      }
    }
    const away = (t) => (t.x + 0.5 - goal.x) ** 2 + (t.y + 0.5 - goal.y) ** 2;
    seen.sort((a, b) => away(a) - away(b));
    let end = seen[0];
    for (let i = 0; i < Math.min(CANDIDATES, seen.length); i++) {
      if (this.sees(seen[i], goal, physics)) { end = seen[i]; break; }
    }
    const path = [];
    for (let t = end; t && (t.x !== from.x || t.y !== from.y); t = parent.get(this.key(t.x, t.y))) path.unshift(t);
    return path;
  }
}
