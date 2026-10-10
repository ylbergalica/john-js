// Finds where a body of a given radius fits (no walls, no solid bodies): the desired
// spot itself if it's clear, else the nearest floor-tile centre. Used by the
// blink/teleport aspects.
export class TeleportResolver {
  constructor(world, body) {
    this.world = world;
    this.body = body;
  }

  isWall(p) { return this.world.physics.isWall(Math.floor(p.x), Math.floor(p.y)); }

  // Nearest valid spot to `desired` that is also within `maxDistance` of `origin`.
  findNearest(origin, desired, maxDistance) {
    return this.search(desired, Math.max(1, Math.ceil(maxDistance)), (c) => distSq(c, origin) <= maxDistance * maxDistance);
  }

  // Nearest valid spot to `desired` anywhere on the map. `radius` overrides the body's
  // own (the Anchor checks the full-size player while it's shrunk).
  findNearestUnlimited(desired, radius) {
    const { width, height } = this.world.level.grid;
    return this.search(desired, Math.max(width, height), () => true, radius);
  }

  search(desired, maxRing, accept, radius = this.body.radius) {
    const grid = this.world.level.grid;
    const r = radius * 0.95;
    const fits = (c) => accept(c) && this.world.physics.isCircleFree(c.x, c.y, r, this.body);
    const dx0 = Math.floor(desired.x), dy0 = Math.floor(desired.y);
    if (grid.isFloor(dx0, dy0) && fits(desired)) return { x: desired.x, y: desired.y };
    if (grid.isFloor(dx0, dy0)) {
      const c = { x: dx0 + 0.5, y: dy0 + 0.5 };
      if (fits(c)) return c;
    }
    for (let ring = 1; ring <= maxRing; ring++) {
      let best = null, bestD = Infinity;
      for (let oy = -ring; oy <= ring; oy++) {
        for (let ox = -ring; ox <= ring; ox++) {
          if (Math.max(Math.abs(ox), Math.abs(oy)) !== ring || !grid.isFloor(dx0 + ox, dy0 + oy)) continue;
          const c = { x: dx0 + ox + 0.5, y: dy0 + oy + 0.5 };
          const d = distSq(c, desired);
          if (d < bestD && fits(c)) { bestD = d; best = c; }
        }
      }
      if (best) return best;
    }
    return null;
  }
}

const distSq = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
