// Turns the procedural art (sprites.js) into Pixi textures: single sprites in `tex`,
// frame sequences in `anims`, aspect and UI icons in `tex` plus data URLs for the DOM UI,
// enemy and prop portraits for the run summary and spawn menu, and white silhouettes used
// for the hit flash.
import { CanvasSource, Texture } from 'pixi.js';
import { animations, icons, sprites, spawnerSprites, PART_ART, MAUL_ART, SHIELD_ART, BLADE_ART, SCIMITAR_ART, SPADE_ART, blightParts, lemurTailRest, tailBanded, tailEdges, weaverKnee, weaverLegsRest } from './sprites.js';
import { BLADES, BLIGHT, CAPES, ENEMY_TYPES, LEMUR_TAIL, MAUL, PROPS, SCIMITAR, SHIELD, WEAVER_LEGS } from '../data/config.js';
import { capeRest } from '../enemies/cape.js';

export const tex = {};
export const anims = {};
export const iconUrls = {}; // for <img> elements in the DOM UI
export const enemyIconUrls = {}; // by enemy type key
export const propIconUrls = {}; // by prop type key

const masks = new Map();

export async function loadAssets() {
  for (const [name, canvas] of Object.entries(sprites())) tex[name] = toTexture(canvas);
  for (const [name, frames] of Object.entries(animations())) anims[name] = frames.map(toTexture);
  for (const [name, canvas] of Object.entries(icons())) {
    tex[name] = toTexture(canvas);
    iconUrls[name] = canvas.toDataURL();
  }

  iconUrls.mist = tex.mist.source.resource.toDataURL(); // the HUD's adrenaline mist, same puff as the Exalted haze
  iconUrls.glint = tex.glint.source.resource.toDataURL(); // the HUD's ready sparkle, same star as the blinks
  for (const [key, type] of Object.entries(ENEMY_TYPES)) enemyIconUrls[key] = enemyPortrait(type.visual).toDataURL();
  for (const key of Object.keys(PROPS)) propIconUrls[key] = tex[`${key}_0`].source.resource.toDataURL();

  // White silhouettes swapped in while something flashes (replaces a per-object filter),
  // and tinted over an enemy as it winds up an attack. A prop's cracks never change its
  // outline, so one serves all its stages.
  for (const name of ['goblin_idle', 'goblin_idle_void', 'striker_idle', 'striker_idle_void', 'seraph_idle', 'seraph_idle_void', 'mauler_idle', 'mauler_idle_void', 'star_maul', 'shade_idle', 'shade_idle_void', 'shade_blade', 'seer_idle', 'seer_idle_void', 'lemur_idle', 'lemur_idle_void', 'lemur_spade', 'lemur_spade_rim', 'boxer_idle', 'boxer_idle_void', 'boxer_fist', 'gunner_idle', 'gunner_idle_void', 'corsair_idle', 'corsair_idle_void', 'scimitar', 'weaver_idle', 'weaver_idle_void', 'nova_idle', 'nova_idle_void', 'bulwark_idle', 'bulwark_idle_void', 'bulwark_shield', 'jet_idle', 'jet_idle_void', 'binary_idle', 'binary_idle_void', 'binary_twin_idle', 'binary_twin_idle_void', 'blight_idle', 'blight_idle_void', 'tail', 'hexFlat']) {
    tex[`${name}_white`] = toTexture(whiteSilhouette(tex[name].source.resource));
  }
  blightParts().forEach((_, i) => { tex[`blight_part_${i}_white`] = toTexture(whiteSilhouette(tex[`blight_part_${i}`].source.resource)); });
  for (const key of Object.keys(PROPS)) tex[`${key}_white`] = toTexture(whiteSilhouette(tex[`${key}_0`].source.resource));
}

// A spawner's own textures (src/game/spawner.js), grown from `seed`: one per crack stage,
// and its white silhouette. Destroy them once nothing shows them any more.
export function spawnerTextures(seed) {
  const stages = spawnerSprites(seed).map(toTexture);
  return { stages, white: toTexture(whiteSilhouette(stages[0].source.resource)) };
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
  if (visual.rig === 'tail') return lemurPortrait(c, ctx, visual, S);
  if (visual.rig === 'scimitar') return corsairPortrait(c, ctx, visual, S);
  if (visual.rig === 'alembic') return blightPortrait(c, ctx, visual, S);
  if (visual.rig === 'legs') return weaverPortrait(c, ctx, visual, S);
  if (visual.rig === 'shield') return bulwarkPortrait(c, ctx, visual, S);
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

// The Bulwark behind its shield, which stands out ahead of its body: shifted back to fit.
function bulwarkPortrait(c, ctx, visual, S) {
  const u = S / 1.55, cx = S / 2 - 0.12 * u, cy = S / 2, half = (visual.size / 2) * u;
  for (const name of [visual.void, visual.outline]) ctx.drawImage(tex[name].source.resource, cx - half, cy - half, half * 2, half * 2);
  ctx.drawImage(tex.bulwark_shield.source.resource, cx + SHIELD.poses.idle.ahead * u, cy - (SHIELD_ART.h / 2) * u, SHIELD_ART.w * u, SHIELD_ART.h * u);
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
    ctx.drawImage(tex.shade_blade.source.resource, -BLADE_ART.rootX * u, -BLADE_ART.rootY * u, BLADE_ART.w * u, BLADE_ART.h * u);
    ctx.restore();
  }
  return c;
}

// The Lemur with its tail at rest, trailing out behind it: shrunk and shifted forward to fit.
function lemurPortrait(c, ctx, visual, S) {
  const u = S / 2.1, cx = S / 2 + 0.47 * u, cy = S / 2, half = (visual.size / 2) * u, T = LEMUR_TAIL, C = T.color;
  const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
  const pts = lemurTailRest().map((p) => ({ x: cx + p.x * u, y: cy + p.y * u }));
  const { left, right } = tailEdges(pts, T.width.map((w) => w * u));
  const stalk = new Path2D();
  [...left, ...[...right].reverse()].forEach((p, i) => (i ? stalk.lineTo(...p) : stalk.moveTo(...p)));
  stalk.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = T.line * 2 * u;
  ctx.strokeStyle = hex(C.outline);
  ctx.stroke(stalk);
  ctx.fillStyle = hex(C.fill);
  ctx.fill(stalk);
  ctx.fillStyle = hex(C.band);
  for (let i = 0; i < T.segments; i++) {
    if (!tailBanded(i)) continue;
    ctx.beginPath();
    [left[i], left[i + 1], right[i + 1], right[i]].forEach((p, j) => (j ? ctx.lineTo(...p) : ctx.moveTo(...p)));
    ctx.fill();
  }
  const tip = pts[T.segments], neck = pts[T.segments - 1];
  ctx.save();
  ctx.translate(tip.x, tip.y);
  ctx.rotate(Math.atan2(tip.y - neck.y, tip.x - neck.x));
  ctx.drawImage(tex.lemur_spade.source.resource, -SPADE_ART.rootX * u, (-SPADE_ART.h / 2) * u, SPADE_ART.w * u, SPADE_ART.h * u);
  ctx.restore();
  for (const name of [visual.void, visual.outline]) ctx.drawImage(tex[name].source.resource, cx - half, cy - half, half * 2, half * 2);
  return c;
}

// The Corsair with its cape hanging at rest behind it and its scimitar at its right side:
// shrunk and shifted forward to fit.
function corsairPortrait(c, ctx, visual, S) {
  const u = S / 2.3, cx = S / 2 + 0.25 * u, cy = S / 2 - 0.1 * u, half = (visual.size / 2) * u, C = CAPES.color;
  const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
  const cols = CAPES.columns, rows = CAPES.rows + 1, pts = capeRest().map((p) => [cx + p.x * u, cy + p.y * u]);
  const hem = pts.slice((rows - 1) * cols);
  const edge = [
    ...pts.slice(0, cols), ...Array.from({ length: rows - 1 }, (_, i) => pts[(i + 1) * cols + cols - 1]),
    ...[...hem].reverse().slice(1), ...Array.from({ length: rows - 2 }, (_, i) => pts[(rows - 2 - i) * cols]),
  ];
  const cloth = new Path2D();
  edge.forEach((p, i) => (i ? cloth.lineTo(...p) : cloth.moveTo(...p)));
  cloth.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = CAPES.line * 2 * u;
  ctx.strokeStyle = hex(C.outline);
  ctx.stroke(cloth);
  ctx.fillStyle = hex(C.light);
  ctx.fill(cloth);
  ctx.beginPath();
  hem.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
  ctx.lineWidth = CAPES.hem * u;
  ctx.strokeStyle = hex(C.hem);
  ctx.stroke();
  for (const name of [visual.void, visual.outline]) ctx.drawImage(tex[name].source.resource, cx - half, cy - half, half * 2, half * 2);
  const { phi, r, rot } = SCIMITAR.poses.idle;
  ctx.translate(cx + Math.cos(phi) * r * u, cy + Math.sin(phi) * r * u);
  ctx.rotate(rot);
  ctx.drawImage(tex.scimitar.source.resource, -SCIMITAR_ART.rootX * u, -SCIMITAR_ART.rootY * u, SCIMITAR_ART.w * u, SCIMITAR_ART.h * u);
  return c;
}

// The Weaver with its legs at rest, splayed all round it: shrunk to fit.
function weaverPortrait(c, ctx, visual, S) {
  const u = S / 1.2, cx = S / 2 - 0.06 * u, cy = S / 2, half = (visual.size / 2) * u, C = WEAVER_LEGS.color, [w0, w1] = WEAVER_LEGS.width;
  const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
  const at = (p) => [cx + p.x * u, cy + p.y * u];
  const legs = weaverLegsRest().map((leg) => ({ ...leg, knee: weaverKnee(leg.hip, leg.foot) }));
  ctx.lineCap = ctx.lineJoin = 'round';
  for (const [grow, color] of [[WEAVER_LEGS.line, C.outline], [0, C.fill]]) {
    ctx.strokeStyle = hex(color);
    for (const { hip, knee, foot } of legs) {
      ctx.lineWidth = (w0 + grow * 2) * u;
      ctx.beginPath(); ctx.moveTo(...at(hip)); ctx.lineTo(...at(knee)); ctx.stroke();
      ctx.lineWidth = (w1 + grow * 2) * u;
      ctx.beginPath(); ctx.moveTo(...at(knee)); ctx.lineTo(...at(foot)); ctx.stroke();
    }
  }
  for (const name of [visual.void, visual.outline]) ctx.drawImage(tex[name].source.resource, cx - half, cy - half, half * 2, half * 2);
  return c;
}

// The Alembic with its parts at rest, its irises shut and its core alight: shrunk to fit.
function blightPortrait(c, ctx, visual, S) {
  const u = S / 2.7, cx = S / 2, cy = S / 2, half = (visual.size / 2) * u, I = BLIGHT.iris;
  for (const name of [visual.void, visual.outline]) ctx.drawImage(tex[name].source.resource, cx - half, cy - half, half * 2, half * 2);
  blightParts().forEach((h, i) => {
    const w = (h.size / PART_ART.body) * u, r = h.size * u;
    ctx.save();
    ctx.translate(cx + h.x * u, cy + h.y * u);
    ctx.rotate(h.rot);
    ctx.drawImage(tex[`blight_part_${i}`].source.resource, -w / 2, -w / 2, w, w);
    if (h.kind === 'valve') {
      ctx.fillStyle = '#2c3a28';
      ctx.beginPath(); ctx.arc(0, 0, r * I.recess, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#060c04';
      ctx.beginPath(); ctx.arc(0, 0, r * I.recess * I.shut * 1.5, 0, Math.PI * 2); ctx.fill();
    } else if (h.kind === 'core') {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, '#f0ffd0'); g.addColorStop(0.3, '#9cf05a'); g.addColorStop(1, 'rgba(108,200,50,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  });
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
