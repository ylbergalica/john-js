// Loads the sprite art (bundled and hashed by Vite) and builds the procedural textures:
// basic shapes, the Crescent icon, and white silhouettes used for the hit flash.
import { Assets, Texture } from 'pixi.js';

const urls = import.meta.glob('../assets/*.png', { eager: true, query: '?url', import: 'default' });

export const tex = {};
export const iconUrls = {}; // for <img> elements in the DOM UI

const masks = new Map();

export async function loadAssets() {
  const entries = Object.entries(urls).map(([path, url]) => ({ alias: path.match(/([^/]+)\.png$/)[1], src: url }));
  const loaded = await Assets.load(entries);
  for (const { alias, src } of entries) {
    tex[alias] = loaded[alias];
    iconUrls[alias] = src;
  }

  tex.circle = canvasTexture(128, 128, (ctx, w) => {
    ctx.beginPath(); ctx.arc(w / 2, w / 2, w / 2 - 1, 0, Math.PI * 2); ctx.fill();
  }).texture;
  tex.hexFlat = canvasTexture(256, 222, (ctx, w, h) => { hexPath(ctx, w, h, true); ctx.fill(); }).texture;
  tex.hexPointed = canvasTexture(222, 256, (ctx, w, h) => { hexPath(ctx, w, h, false); ctx.fill(); }).texture;
  tex.core = canvasTexture(128, 160, (ctx, w, h) => {
    ctx.beginPath();
    ctx.moveTo(w / 2, 2); ctx.lineTo(w - 4, h * 0.35); ctx.lineTo(w / 2, h - 2); ctx.lineTo(4, h * 0.35);
    ctx.closePath(); ctx.fill();
  }).texture;

  // The Crescent icon wasn't in the original art; drawn in the same style.
  const crescent = canvasTexture(256, 256, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 10, w / 2, w / 2, w / 2);
    g.addColorStop(0, '#1a1a40'); g.addColorStop(1, '#000');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, w);
    ctx.fillStyle = '#e8ecff';
    ctx.shadowColor = '#9fb4ff'; ctx.shadowBlur = 24;
    ctx.beginPath(); ctx.arc(w * 0.5, w * 0.5, w * 0.34, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(w * 0.36, w * 0.5, w * 0.3, 0, Math.PI * 2); ctx.fill();
  });
  tex.crescent_icon = crescent.texture;
  iconUrls.crescent_icon = crescent.canvas.toDataURL();

  // White silhouettes swapped in while something flashes (replaces a per-object filter).
  for (const name of ['goblin_idle', 'goblin_idle_void', 'striker_idle', 'striker_idle_void', 'tail']) {
    tex[`${name}_white`] = whiteSilhouette(tex[name]);
  }
}

// Low-res alpha grid of a texture, for scattering detail inside a sprite's shape.
export function alphaMask(name, res = 64) {
  let m = masks.get(name);
  if (!m) {
    const c = document.createElement('canvas');
    c.width = c.height = res;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(tex[name].source.resource, 0, 0, res, res);
    const rgba = ctx.getImageData(0, 0, res, res).data;
    const data = new Uint8Array(res * res);
    for (let i = 0; i < data.length; i++) data[i] = rgba[i * 4 + 3];
    m = { res, data };
    masks.set(name, m);
  }
  return m;
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  draw(ctx, w, h);
  return { texture: Texture.from(c), canvas: c };
}

function whiteSilhouette(texture) {
  const { width, height, resource } = texture.source;
  return canvasTexture(width, height, (ctx) => {
    ctx.drawImage(resource, 0, 0, width, height);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillRect(0, 0, width, height);
  }).texture;
}

function hexPath(ctx, w, h, flatTop) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + (flatTop ? 0 : Math.PI / 6);
    const x = w / 2 + (Math.cos(a) * w) / 2 * (flatTop ? 1 : 1 / Math.cos(Math.PI / 6));
    const y = h / 2 + (Math.sin(a) * h) / 2 * (flatTop ? 1 / Math.sin(Math.PI / 3) : 1);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}
