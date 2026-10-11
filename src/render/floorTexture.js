// The ground (FLOOR_LIGHT): light pooling in open floor and dimming against walls, each room
// leaning toward one of the floor's colours, blending through corridors. Worked out per
// tile, then drawn a few pixels per tile with bilinear blending and nearest filtering, so
// the light is smooth while the floor's edge stays sharp against the walls.
import { Texture } from 'pixi.js';
import { COLORS, FLOOR_LIGHT as FL, NEBULA } from '../data/config.js';
import { clamp01, lerp, smoothStep01 } from '../engine/math.js';

const MAX_PIXELS = 2.5e6; // fewer pixels per tile on the biggest floors, to keep building them quick
const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const luma = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;

// grid, rooms: the layout's; floor: the floor number; colors: the nebula palette to tint with.
export function floorTexture(grid, rooms, floor, colors) {
  const { width: W, height: H } = grid;
  const tiles = tileColors(grid, rooms, floor, colors);
  const S = Math.max(1, Math.min(FL.pixelsPerTile, Math.floor(Math.sqrt(MAX_PIXELS / (W * H)))));

  const canvas = document.createElement('canvas');
  canvas.width = W * S; canvas.height = H * S;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W * S, H * S);
  const data = img.data, rowPx = W * S;
  for (let ty = 0; ty < H; ty++) {
    for (let tx = 0; tx < W; tx++) {
      if (grid.cells[tx + ty * W] !== 1) continue;
      for (let sy = 0; sy < S; sy++) {
        // Tile-centre coordinates of this pixel, for blending with the neighbours.
        const fy = ty + (sy + 0.5) / S - 0.5;
        const y0 = Math.max(0, Math.floor(fy)), y1 = Math.min(H - 1, y0 + 1), v = clamp01(fy - y0);
        for (let sx = 0; sx < S; sx++) {
          const fx = tx + (sx + 0.5) / S - 0.5;
          const x0 = Math.max(0, Math.floor(fx)), x1 = Math.min(W - 1, x0 + 1), u = clamp01(fx - x0);
          const a = (x0 + y0 * W) * 3, b = (x1 + y0 * W) * 3, c = (x0 + y1 * W) * 3, d = (x1 + y1 * W) * 3;
          const o = ((tx * S + sx) + (ty * S + sy) * rowPx) * 4;
          for (let k = 0; k < 3; k++) {
            const top = lerp(tiles[a + k], tiles[b + k], u), bottom = lerp(tiles[c + k], tiles[d + k], u);
            data[o + k] = lerp(top, bottom, v) + Math.random() - 0.5; // dithered, so the dark gradients don't band
          }
          data[o + 3] = 255;
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  const texture = Texture.from(canvas);
  texture.source.scaleMode = 'nearest';
  return { texture, scale: 1 / S };
}

// → Float32Array of rgb (0…255) per tile.
function tileColors(grid, rooms, floor, colors) {
  const { width: W, height: H } = grid;
  const base = rgb(COLORS.floor), baseLuma = luma(base);
  const k = clamp01((floor - 1) / Math.max(1, NEBULA.fullFloor - 1));
  const tintAmount = lerp(FL.tint.min, FL.tint.max, k);
  // Each room's colour, brought to the floor's brightness; null leaves it plain.
  const choices = [...colors.map((c) => rgb(c)), null];
  const tints = rooms.map(() => {
    const c = choices[Math.floor(Math.random() * choices.length)];
    if (!c) return base;
    const s = baseLuma / Math.max(1, luma(c));
    return base.map((v, i) => lerp(v, c[i] * s, tintAmount));
  });

  const wallDist = distanceToWalls(grid);
  const spread2 = 2 * FL.tintSpread * FL.tintSpread;
  const out = new Float32Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = base[0] * 1e-6, g = base[1] * 1e-6, b = base[2] * 1e-6, sum = 1e-6; // plain where no room reaches
      for (let i = 0; i < rooms.length; i++) {
        const room = rooms[i];
        const dx = Math.max(room.x - x, 0, x - room.xMax + 1), dy = Math.max(room.y - y, 0, y - room.yMax + 1);
        const w = Math.exp(-(dx * dx + dy * dy) / spread2);
        r += tints[i][0] * w; g += tints[i][1] * w; b += tints[i][2] * w; sum += w;
      }
      const light = lerp(FL.edgeLight, FL.centerLight, smoothStep01(clamp01(wallDist[x + y * W] / FL.poolRadius)));
      const o = (x + y * W) * 3;
      out[o] = (r / sum) * light; out[o + 1] = (g / sum) * light; out[o + 2] = (b / sum) * light;
    }
  }
  return out;
}

// Chamfer distance (in tiles) from each tile to the nearest wall; walls are 0.
function distanceToWalls(grid) {
  const { width: W, height: H, cells } = grid;
  const d = new Float32Array(W * H);
  for (let i = 0; i < d.length; i++) d[i] = cells[i] === 1 ? Infinity : 0;
  const D = Math.SQRT2;
  const relax = (i, j, cost) => { if (d[j] + cost < d[i]) d[i] = d[j] + cost; };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = x + y * W;
      if (x > 0) relax(i, i - 1, 1);
      if (y > 0) {
        relax(i, i - W, 1);
        if (x > 0) relax(i, i - W - 1, D);
        if (x < W - 1) relax(i, i - W + 1, D);
      }
    }
  }
  for (let y = H - 1; y >= 0; y--) {
    for (let x = W - 1; x >= 0; x--) {
      const i = x + y * W;
      if (x < W - 1) relax(i, i + 1, 1);
      if (y < H - 1) {
        relax(i, i + W, 1);
        if (x < W - 1) relax(i, i + W + 1, D);
        if (x > 0) relax(i, i + W - 1, D);
      }
    }
  }
  return d;
}
