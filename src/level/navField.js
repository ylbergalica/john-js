// Flow field toward a single goal (the player), shared by every enemy with the same
// footprint. One Dijkstra pass with Dial's bucket queue (8-way, costs 5/7 ≈ 1:√2, no
// corner cutting) per goal change instead of a full-grid search per enemy.

const ORTHO_COST = 5;
const DIAG_COST = 7;
const BUCKETS = 8; // > max edge cost
const UNREACHED = 0xffffffff;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export class NavField {
  // footprint: square actor size in tiles (1 or 3); a cell is walkable when the whole
  // footprint centred on it is floor.
  constructor(grid, footprint) {
    this.W = grid.width;
    this.H = grid.height;
    const n = this.W * this.H;
    this.walkable = new Uint8Array(n);
    this.dist = new Uint32Array(n).fill(UNREACHED);
    this.buckets = Array.from({ length: BUCKETS }, () => []);
    this.goalCell = -1;
    this.nextRebuildTime = -Infinity;

    const half = Math.trunc(Math.max(1, footprint) / 2);
    for (let y = 0; y < this.H; y++) {
      for (let x = 0; x < this.W; x++) {
        let ok = true;
        for (let oy = -half; oy <= half && ok; oy++)
          for (let ox = -half; ox <= half && ok; ox++) ok = grid.isFloor(x + ox, y + oy);
        this.walkable[x + y * this.W] = ok ? 1 : 0;
      }
    }
  }

  isWalkable(x, y) { return x >= 0 && y >= 0 && x < this.W && y < this.H && this.walkable[x + y * this.W] === 1; }

  // Retargets the field at world position `target`. Rebuilds at most once per
  // `interval` seconds, and only when the goal moved to another cell.
  update(target, time, interval, searchRadius) {
    if (time < this.nextRebuildTime) return;
    const goal = this.nearestWalkable(Math.floor(target.x), Math.floor(target.y), searchRadius);
    const cell = goal ? goal.x + goal.y * this.W : -1;
    if (cell === this.goalCell) return;
    this.goalCell = cell;
    this.nextRebuildTime = time + interval;
    this.rebuild();
  }

  rebuild() {
    const { dist, walkable, buckets, W } = this;
    dist.fill(UNREACHED);
    if (this.goalCell < 0) return;
    for (const b of buckets) b.length = 0;
    dist[this.goalCell] = 0;
    buckets[0].push(this.goalCell);
    let pending = 1;
    for (let d = 0; pending > 0; d++) {
      const bucket = buckets[d % BUCKETS];
      while (bucket.length > 0) {
        const cur = bucket.pop();
        pending--;
        if (dist[cur] !== d) continue; // stale entry
        const cx = cur % W, cy = (cur - cx) / W;
        for (let i = 0; i < 8; i++) {
          const dx = DIRS[i][0], dy = DIRS[i][1];
          if (!this.isWalkable(cx + dx, cy + dy)) continue;
          if (dx !== 0 && dy !== 0 && !(walkable[cur + dx] && walkable[cur + dy * W])) continue;
          const n = cur + dx + dy * W;
          const nd = d + (dx !== 0 && dy !== 0 ? DIAG_COST : ORTHO_COST);
          if (nd < dist[n]) {
            dist[n] = nd;
            buckets[nd % BUCKETS].push(n);
            pending++;
          }
        }
      }
    }
  }

  // Where an actor at world `pos` should head next:
  //   { x, y } cell centre to steer toward, 'goal' when already in the goal cell,
  //   or null when the goal is unreachable from here.
  nextWaypoint(pos) {
    const { dist, walkable, W } = this;
    let cx = Math.floor(pos.x), cy = Math.floor(pos.y);
    if (!this.isWalkable(cx, cy) || dist[cx + cy * W] === UNREACHED) {
      // Hugging a wall: step back onto the nearest reached cell first.
      const near = this.bestAround(cx, cy);
      return near ? { x: near.x + 0.5, y: near.y + 0.5 } : null;
    }
    const cur = cx + cy * W;
    if (dist[cur] === 0) return 'goal';
    let best = null, bestD = dist[cur];
    for (let i = 0; i < 8; i++) {
      const dx = DIRS[i][0], dy = DIRS[i][1];
      if (!this.isWalkable(cx + dx, cy + dy)) continue;
      if (dx !== 0 && dy !== 0 && !(walkable[cur + dx] && walkable[cur + dy * W])) continue;
      const d = dist[cur + dx + dy * W];
      if (d < bestD) { bestD = d; best = { x: cx + dx + 0.5, y: cy + dy + 0.5 }; }
    }
    return best;
  }

  bestAround(cx, cy) {
    let best = null, bestD = UNREACHED;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!this.isWalkable(cx + dx, cy + dy)) continue;
        const d = this.dist[cx + dx + (cy + dy) * this.W];
        if (d < bestD) { bestD = d; best = { x: cx + dx, y: cy + dy }; }
      }
    }
    return best;
  }

  nearestWalkable(cx, cy, radius) {
    if (this.isWalkable(cx, cy)) return { x: cx, y: cy };
    for (let r = 1; r <= radius; r++) {
      let best = null, bestD = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !this.isWalkable(cx + dx, cy + dy)) continue;
          const d = dx * dx + dy * dy;
          if (d < bestD) { bestD = d; best = { x: cx + dx, y: cy + dy }; }
        }
      }
      if (best) return best;
    }
    return null;
  }
}
