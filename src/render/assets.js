// Turns the procedural art (sprites.js) into Pixi textures: single sprites in `tex`,
// frame sequences in `anims`, aspect and UI icons in `tex` plus data URLs for the DOM UI,
// enemy portraits for the run summary, and white silhouettes used for the hit flash.
import { CanvasSource, Texture } from 'pixi.js';
import { animations, icons, sprites, MAUL_ART, BLADE_ART } from './sprites.js';
import { BLADES, ENEMY_TYPES, MAUL } from '../data/config.js';

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

  iconUrls.mist = tex.mist.source.resource.toDataURL(); // the HUD's adrenaline mist, same puff as the Exalted haze
  for (const [key, type] of Object.entries(ENEMY_TYPES)) enemyIconUrls[key] = enemyPortrait(type.visual).toDataURL();

  // White silhouettes swapped in while something flashes (replaces a per-object filter),
  // and tinted over an enemy as it winds up an attack.
  for (const name of ['goblin_idle', 'goblin_idle_void', 'striker_idle', 'striker_idle_void', 'seraph_idle', 'seraph_idle_void', 'mauler_idle', 'mauler_idle_void', 'star_maul', 'shade_idle', 'shade_idle_void', 'shade_blade', 'tail', 'hexFlat']) {
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
  if (visual.rig === 'maul') return maulerPortrait(c, ctx, visual, S);
  if (visual.rig === 'blades') return shadePortrait(c, ctx, visual, S);
  const layers = visual.kind === 'sprite' ? [visual.void, visual.outline] : ['hexFlat'];
  for (const name of layers) {
    const src = tex[name].source.resource;
    const k = S / Math.max(src.width, src.height);
    const w = src.width * k, h = src.height * k;
    ctx.drawImage(src, (S - w) / 2, (S - h) / 2, w, h);
  }
  return c;
}

// The Mauler with its maul at rest, which reaches well past its body: shrunk and shifted
// back to fit.
function maulerPortrait(c, ctx, visual, S) {
  const u = S / 2.5, cx = S / 2 - 0.33 * u, cy = S / 2 - 0.05 * u, half = (visual.size / 2) * u;
  for (const name of [visual.void, visual.outline]) ctx.drawImage(tex[name].source.resource, cx - half, cy - half, half * 2, half * 2);
  const { phi, r, rot } = MAUL.poses.idle;
  ctx.translate(cx + Math.cos(phi) * r * u, cy + Math.sin(phi) * r * u);
  ctx.rotate(rot);
  ctx.drawImage(tex.star_maul.source.resource, -MAUL_ART.grip * u, (-MAUL_ART.h / 2) * u, MAUL_ART.w * u, MAUL_ART.h * u);
  return c;
}

// The Shade with its blades at rest, reaching ahead of it: shrunk and shifted back to fit.
function shadePortrait(c, ctx, visual, S) {
  const u = S / 2, cx = S / 2 - 0.2 * u, cy = S / 2, half = (visual.size / 2) * u;
  for (const name of [visual.void, visual.outline]) ctx.drawImage(tex[name].source.resource, cx - half, cy - half, half * 2, half * 2);
  const { phi, r, rot } = BLADES.poses.idle;
  for (const side of [1, -1]) {
    ctx.save();
    ctx.translate(cx + Math.cos(phi * side) * r * u, cy + Math.sin(phi * side) * r * u);
    ctx.rotate(rot * side);
    ctx.scale(1, side);
    ctx.drawImage(tex.shade_blade.source.resource, -BLADE_ART.root * u, (-BLADE_ART.h / 2) * u, BLADE_ART.w * u, BLADE_ART.h * u);
    ctx.restore();
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
