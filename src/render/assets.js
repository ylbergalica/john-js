// Turns the procedural art (sprites.js) into Pixi textures: single sprites in `tex`,
// frame sequences in `anims`, aspect icons in `tex` plus data URLs for the DOM UI,
// enemy portraits for the run summary, and white silhouettes used for the hit flash.
import { CanvasSource, Texture } from 'pixi.js';
import { animations, icons, sprites } from './sprites.js';
import { ENEMY_TYPES } from '../data/config.js';

export const tex = {};
export const anims = {};
export const iconUrls = {}; // for <img> elements in the DOM UI
export const enemyIconUrls = {}; // by enemy type key

const masks = new Map();

export async function loadAssets() {
  for (const [name, canvas] of Object.entries(sprites())) tex[name] = toTexture(canvas);
  for (const [name, frames] of Object.entries(animations())) anims[name] = frames.map(toTexture);
  for (const [name, canvas] of Object.entries(icons())) {
    tex[name] = toTexture(canvas);
    iconUrls[name] = canvas.toDataURL();
  }

  for (const [key, type] of Object.entries(ENEMY_TYPES)) enemyIconUrls[key] = enemyPortrait(type.visual).toDataURL();

  // White silhouettes swapped in while something flashes (replaces a per-object filter),
  // and tinted over an enemy as it winds up an attack.
  for (const name of ['goblin_idle', 'goblin_idle_void', 'striker_idle', 'striker_idle_void', 'seraph_idle', 'seraph_idle_void', 'tail', 'hexFlat']) {
    tex[`${name}_white`] = toTexture(whiteSilhouette(tex[name].source.resource));
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

// Mipmapped so the glows and thin strokes stay smooth when drawn small.
function toTexture(canvas) {
  return new Texture({ source: new CanvasSource({ resource: canvas, autoGenerateMipmaps: true }) });
}

// An enemy as it looks in game (void fill under its outline, or the Warden's hexagon),
// fitted into a square.
function enemyPortrait(visual, S = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const layers = visual.kind === 'sprite' ? [visual.void, visual.outline] : ['hexFlat'];
  for (const name of layers) {
    const src = tex[name].source.resource;
    const k = S / Math.max(src.width, src.height);
    const w = src.width * k, h = src.height * k;
    ctx.drawImage(src, (S - w) / 2, (S - h) / 2, w, h);
  }
  return c;
}

function whiteSilhouette(source) {
  const c = document.createElement('canvas');
  c.width = source.width; c.height = source.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(source, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}
