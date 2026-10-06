// Level layout: rooms anchored off each other, Perlin-eroded edges, stamped interior
// walls, corridors joining rooms along a minimum spanning tree plus random extras.
import { randRange, randInt, roundHalfEven, perlinNoise, lerp, clamp, signNonZero } from '../engine/math.js';

export class Grid {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.cells = new Uint8Array(width * height); // 1 = floor
  }
  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.width && y < this.height; }
  isFloor(x, y) { return this.inBounds(x, y) && this.cells[x + y * this.width] === 1; }
  setFloor(x, y, floor) {
    // The outer ring always stays wall so the map is closed.
    if (x > 0 && y > 0 && x < this.width - 1 && y < this.height - 1) this.cells[x + y * this.width] = floor ? 1 : 0;
  }
}

class Room {
  constructor(x, y, width, height) {
    this.x = x; this.y = y; this.width = width; this.height = height;
  }
  get xMax() { return this.x + this.width; }
  get yMax() { return this.y + this.height; }
  get center() { return { x: this.x + Math.trunc(this.width / 2), y: this.y + Math.trunc(this.height / 2) }; }
}

const rectsOverlap = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

// → { grid, rooms, start, exit } with start/exit as floor-cell centres in world units.
export function generateLayout(cfg) {
  const grid = new Grid(cfg.width, cfg.height);
  const rooms = [];
  generateRooms(grid, rooms, cfg);
  connectRooms(grid, rooms, cfg);

  const startCell = nearestFloorCell(grid, rooms[0].center);
  keepReachableFrom(grid, startCell);
  const exitCell = nearestFloorCell(grid, rooms[rooms.length - 1].center);
  return {
    grid,
    rooms,
    start: { x: startCell.x + 0.5, y: startCell.y + 0.5 },
    exit: { x: exitCell.x + 0.5, y: exitCell.y + 0.5 },
  };
}

function generateRooms(grid, rooms, cfg) {
  const fw = randInt(cfg.roomMinSize.x, cfg.roomMaxSize.x + 1);
  const fh = randInt(cfg.roomMinSize.y, cfg.roomMaxSize.y + 1);
  addRoom(grid, rooms, new Room(Math.trunc(cfg.width / 2) - Math.trunc(fw / 2), Math.trunc(cfg.height / 2) - Math.trunc(fh / 2), fw, fh), cfg);

  const MAX_FAILED_ATTEMPTS = 100;
  let failures = 0;
  while (rooms.length < cfg.roomCount && failures <= MAX_FAILED_ATTEMPTS) {
    const anchor = rooms[randInt(0, rooms.length)];
    const w = randInt(cfg.roomMinSize.x, cfg.roomMaxSize.x + 1);
    const h = randInt(cfg.roomMinSize.y, cfg.roomMaxSize.y + 1);
    const gap = randInt(cfg.minRoomDistance, cfg.maxRoomDistance + 1);
    let x, y;
    switch (randInt(0, 4)) {
      case 0: x = anchor.xMax + gap; y = randInt(anchor.y - h + 1, anchor.yMax); break;
      case 1: x = anchor.x - gap - w; y = randInt(anchor.y - h + 1, anchor.yMax); break;
      case 2: x = randInt(anchor.x - w + 1, anchor.xMax); y = anchor.yMax + gap; break;
      default: x = randInt(anchor.x - w + 1, anchor.xMax); y = anchor.y - gap - h; break;
    }
    x = clamp(x, 1, cfg.width - w - 1);
    y = clamp(y, 1, cfg.height - h - 1);
    const d = cfg.minRoomDistance;
    const candidate = { x, y, width: w, height: h };
    const blocked = rooms.some((r) => rectsOverlap({ x: r.x - d, y: r.y - d, width: r.width + d * 2, height: r.height + d * 2 }, candidate));
    if (blocked) { failures++; continue; }
    addRoom(grid, rooms, new Room(x, y, w, h), cfg);
    failures = 0;
  }
  if (rooms.length < cfg.roomCount) console.warn(`Level generator placed ${rooms.length}/${cfg.roomCount} rooms.`);
}

function addRoom(grid, rooms, room, cfg) {
  rooms.push(room);
  carveRoom(grid, room, cfg);
}

function carveRoom(grid, room, cfg) {
  const { x: x0, y: y0, xMax, yMax, width: w, height: h } = room;
  const maxIndent = roundHalfEven(Math.min(w, h) * 0.45 * cfg.edgeRoughness);
  if (maxIndent === 0) {
    for (let x = x0; x < xMax; x++) for (let y = y0; y < yMax; y++) grid.setFloor(x, y, true);
  } else {
    const bottom = edgeProfile(w, maxIndent, cfg.edgeRoughness);
    const top = edgeProfile(w, maxIndent, cfg.edgeRoughness);
    const left = edgeProfile(h, maxIndent, cfg.edgeRoughness);
    const right = edgeProfile(h, maxIndent, cfg.edgeRoughness);
    for (let x = x0; x < xMax; x++) {
      for (let y = y0; y < yMax; y++) {
        const lx = x - x0, ly = y - y0;
        if (ly < bottom[lx] || yMax - 1 - y < top[lx] || lx < left[ly] || xMax - 1 - x < right[ly]) continue;
        grid.setFloor(x, y, true);
      }
    }
  }
  if (w >= 7 && h >= 7) carveInteriorWalls(grid, room, cfg);
  keepReachableFrom(grid, nearestFloorCell(grid, room.center, room), room);
}

function edgeProfile(length, maxDepth, roughness) {
  const profile = new Array(length);
  const offset = randRange(0, 1000);
  const frequency = lerp(0.05, 0.35, roughness);
  for (let i = 0; i < length; i++) profile[i] = roundHalfEven(perlinNoise(offset + i * frequency, offset * 0.5) * maxDepth);
  return profile;
}

function carveInteriorWalls(grid, room, cfg) {
  const x0 = room.x + 1, x1 = room.xMax - 1, y0 = room.y + 1, y1 = room.yMax - 1;
  const iw = x1 - x0, ih = y1 - y0;
  const sizeMin = Math.max(1, cfg.wallSizeRange.x);
  const sizeMax = Math.max(sizeMin + 1, Math.min(cfg.wallSizeRange.y, Math.trunc(Math.min(iw, ih) / 2)));
  const avgArea = ((sizeMin + sizeMax) / 2) ** 2;
  const maxWalls = Math.min(12, roundHalfEven(((iw * ih) / avgArea) * cfg.roomBusyness));
  const count = randInt(Math.max(1, Math.trunc(maxWalls / 2)), maxWalls + 1);
  const T = Math.trunc;

  for (let i = 0; i < count; i++) {
    const sw = randInt(sizeMin, Math.min(sizeMax, iw - 2) + 1);
    const sh = randInt(sizeMin, Math.min(sizeMax, ih - 2) + 1);
    if (x1 - sw <= x0 || y1 - sh <= y0) continue;
    const ox = randInt(x0, x1 - sw);
    const oy = randInt(y0, y1 - sh);
    switch (randInt(0, 4)) {
      case 0: stampWall(grid, ox, oy, sw, sh); break; // block
      case 1: stampWall(grid, ox, oy, sw, T(sh / 2)); stampWall(grid, ox, oy, T(sw / 2), sh); break; // L
      case 2: stampWall(grid, ox, oy + T(sh / 2), sw, Math.max(1, T(sh / 2))); stampWall(grid, ox + T(sw / 2), oy, Math.max(1, T(sw / 3)), sh); break; // T
      case 3: stampWall(grid, ox, oy + T(sh / 3), sw, Math.max(1, T(sh / 3))); stampWall(grid, ox + T(sw / 3), oy, Math.max(1, T(sw / 3)), sh); break; // +
    }
  }
}

function stampWall(grid, ox, oy, w, h) {
  for (let x = ox; x < ox + w; x++) for (let y = oy; y < oy + h; y++) grid.setFloor(x, y, false);
}

// Nearest floor cell to `cell` (ring search), optionally restricted to a room.
function nearestFloorCell(grid, cell, room = null) {
  if (grid.isFloor(cell.x, cell.y)) return cell;
  const maxR = Math.max(grid.width, grid.height);
  for (let r = 1; r < maxR; r++) {
    let best = null, bestD = Infinity;
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cell.x + dx, y = cell.y + dy;
        if (room && (x < room.x || y < room.y || x >= room.xMax || y >= room.yMax)) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD && grid.isFloor(x, y)) { bestD = d; best = { x, y }; }
      }
    }
    if (best) return best;
  }
  return cell;
}

// Flood-fills 4-connected floor from `start` and turns every floor cell it can't reach
// (within `region`, or the whole grid) back into wall.
function keepReachableFrom(grid, start, region = null) {
  if (!grid.isFloor(start.x, start.y)) return;
  const W = grid.width;
  const visited = new Uint8Array(grid.cells.length);
  const queue = new Int32Array(grid.cells.length);
  let head = 0, tail = 0;
  queue[tail++] = start.x + start.y * W;
  visited[queue[0]] = 1;
  while (head < tail) {
    const cur = queue[head++];
    for (const n of [cur + 1, cur - 1, cur + W, cur - W]) {
      if (visited[n] || grid.cells[n] !== 1) continue; // border is never floor, so no wrap-around
      visited[n] = 1;
      queue[tail++] = n;
    }
  }
  const x0 = region ? region.x : 0, x1 = region ? region.xMax : grid.width;
  const y0 = region ? region.y : 0, y1 = region ? region.yMax : grid.height;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = x + y * W;
      if (grid.cells[i] === 1 && !visited[i]) grid.cells[i] = 0;
    }
  }
}

function connectRooms(grid, rooms, cfg) {
  // Prim's MST over room centres.
  const connected = [0];
  const pending = rooms.map((_, i) => i).slice(1);
  while (pending.length > 0) {
    let bestA = -1, bestB = -1, best = Infinity;
    for (const a of connected) {
      for (const b of pending) {
        const ca = rooms[a].center, cb = rooms[b].center;
        const d = Math.hypot(ca.x - cb.x, ca.y - cb.y);
        if (d < best) { best = d; bestA = a; bestB = b; }
      }
    }
    carveCorridor(grid, rooms[bestA].center, rooms[bestB].center, cfg);
    connected.push(bestB);
    pending.splice(pending.indexOf(bestB), 1);
  }
  for (let i = 0; i < rooms.length; i++) {
    if (Math.random() > cfg.extraCorridorChance) continue;
    const target = randInt(0, rooms.length);
    if (target !== i) carveCorridor(grid, rooms[i].center, rooms[target].center, cfg);
  }
}

// Drunk walk from a to b biased toward the goal, carved with a wobbling width.
function carveCorridor(grid, a, b, cfg) {
  const baseWidth = randInt(cfg.corridorMinWidth, cfg.corridorMaxWidth + 1);
  const path = [{ x: a.x, y: a.y }];
  let pos = path[0];
  const maxSteps = (cfg.width + cfg.height) * 4;
  for (let steps = 0; (pos.x !== b.x || pos.y !== b.y) && steps < maxSteps; steps++) {
    const dx = b.x - pos.x, dy = b.y - pos.y;
    const majorX = Math.abs(dx) >= Math.abs(dy);
    let stepX;
    if (dx === 0) stepX = false;
    else if (dy === 0) stepX = true;
    else stepX = Math.random() < cfg.corridorDrift ? !majorX : majorX; // drift = step along the minor axis
    pos = {
      x: clamp(pos.x + (stepX ? signNonZero(dx) : 0), 1, cfg.width - 2),
      y: clamp(pos.y + (stepX ? 0 : signNonZero(dy)), 1, cfg.height - 2),
    };
    path.push(pos);
  }

  let width = baseWidth;
  for (let i = 0; i < path.length; i++) {
    if (i % 3 === 0) width = clamp(baseWidth + randInt(-1, 2), cfg.corridorMinWidth, cfg.corridorMaxWidth);
    const half = Math.trunc(width / 2);
    const p = path[i];
    const horizontal = i === 0 || p.y === path[i - 1].y;
    for (let o = -half; o < width - half; o++) {
      if (horizontal) grid.setFloor(p.x, p.y + o, true);
      else grid.setFloor(p.x + o, p.y, true);
    }
  }

  // Occasional stubs jutting into the corridor from one side.
  if (Math.random() < cfg.corridorObstacleChance && path.length > 6) {
    const count = randInt(1, Math.max(2, Math.trunc(path.length / 8)));
    for (let n = 0; n < count; n++) {
      const idx = randInt(Math.trunc(path.length / 4), Math.trunc((3 * path.length) / 4));
      const p = path[idx];
      const horizontal = idx > 0 && p.y === path[idx - 1].y;
      const stubLen = randInt(1, Math.max(2, Math.max(1, Math.trunc(baseWidth / 2))));
      const s = randInt(0, 2) ? 1 : -1;
      for (let k = 1; k <= stubLen; k++) {
        if (horizontal) grid.setFloor(p.x, p.y + s * k, false);
        else grid.setFloor(p.x + s * k, p.y, false);
      }
    }
  }
}

// Random floor-cell centre inside a room's interior, or null after `attempts` misses.
export function randomFloorInRoom(grid, room, attempts = 20) {
  for (let i = 0; i < attempts; i++) {
    const x = randInt(room.x + 1, room.xMax - 1);
    const y = randInt(room.y + 1, room.yMax - 1);
    if (grid.isFloor(x, y)) return { x: x + 0.5, y: y + 0.5 };
  }
  return null;
}
