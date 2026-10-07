// The menu's backdrop: faint nebulae under two tiled star layers drifting at different
// speeds. Tiles are drawn once and cached; the drift is a CSS transform, so it costs
// nothing per frame on the main thread.
import { h } from './dom.js';
import { seededRandom, lerp, TAU } from '../engine/math.js';

const LAYERS = [
  { tile: 512, count: 140, size: [0.4, 1], alpha: [0.15, 0.55], speed: 240, seed: 11 }, // far
  { tile: 768, count: 60, size: [0.7, 1.6], alpha: [0.35, 0.9], speed: 150, seed: 23, glints: 4 }, // near
];

const tiles = new Map();

function starTile({ tile, count, size, alpha, seed, glints = 0 }) {
  if (tiles.has(seed)) return tiles.get(seed);
  const c = document.createElement('canvas');
  c.width = c.height = tile;
  const ctx = c.getContext('2d');
  const rand = seededRandom(seed);
  ctx.fillStyle = '#fff';
  for (let i = 0; i < count; i++) {
    ctx.globalAlpha = lerp(alpha[0], alpha[1], rand() ** 2);
    ctx.beginPath();
    ctx.arc(rand() * tile, rand() * tile, lerp(size[0], size[1], rand() ** 3), 0, TAU);
    ctx.fill();
  }
  // A few brighter four-point glints with a soft halo, tinted like the icons' starlight.
  for (let i = 0; i < glints; i++) {
    const x = rand() * tile, y = rand() * tile, r = lerp(4, 7, rand());
    ctx.globalAlpha = 1;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.6);
    g.addColorStop(0, 'rgba(190,205,255,0.35)');
    g.addColorStop(1, 'rgba(190,205,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r * 2, y - r * 2, r * 4, r * 4);
    ctx.fillStyle = '#eef1ff';
    const k = r * 0.14;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.quadraticCurveTo(x + k, y + k, x, y + r);
    ctx.quadraticCurveTo(x - k, y + k, x - r, y);
    ctx.quadraticCurveTo(x - k, y - k, x, y - r);
    ctx.quadraticCurveTo(x + k, y - k, x + r, y);
    ctx.fill();
  }
  const url = `url(${c.toDataURL()})`;
  tiles.set(seed, url);
  return url;
}

export function sky() {
  return h('div', { class: 'sky' }, LAYERS.map((layer) => {
    const el = h('div', { class: 'sky-stars' });
    el.style.backgroundImage = starTile(layer);
    el.style.setProperty('--tile', `${layer.tile}px`);
    el.style.animationDuration = `${layer.speed}s, ${6 + layer.seed % 5}s`;
    return el;
  }));
}
