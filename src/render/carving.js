// Words and pictures cut into the floor (Tutorial): drawn once to a canvas as dark grey
// grooves, shadowed under their top edge, and laid on the ground in world units. A carving
// can cut itself in left to right, a dim glint running along the cut.
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { TUTORIAL } from '../data/config.js';
import { tex } from './assets.js';
import { clamp01 } from '../engine/math.js';

const PX = 80; // canvas pixels per world unit
const FONT = "'Liberation Sans', Arial, Helvetica, sans-serif";
const STROKE = 0.05; // groove width for drawn pictures, world units
const SHADE = 0.03; // the shadow under a groove's top edge, world units
const GROOVE = 'rgba(120, 120, 120, 0.2)';
const SHADOW = 'rgba(0, 0, 0, 0.55)';
const ICON_GAP = 0.25; // between a picture and its words
const GLINT_SIZE = 0.8; // the glint running along a cut, world units

// Pictures a line can start with: size in world units and how to cut them (ctx in units).
const ICONS = {
  lmb: { w: 0.32, h: 0.48, draw: (ctx) => mouse(ctx, -1) },
  rmb: { w: 0.32, h: 0.48, draw: (ctx) => mouse(ctx, 1) },
  shift: { w: 0.9, h: 0.4, draw: shiftKey },
};

// A mouse, its left (side -1) or right (1) button cut out.
function mouse(ctx, side) {
  const { w, h } = ICONS.lmb, split = h * 0.42;
  const body = () => { ctx.beginPath(); ctx.roundRect(STROKE / 2, STROKE / 2, w - STROKE, h - STROKE, (w - STROKE) / 2); };
  ctx.save();
  body();
  ctx.clip();
  ctx.fillRect(side < 0 ? 0 : w / 2, 0, w / 2, split);
  ctx.restore();
  body();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(STROKE, split); ctx.lineTo(w - STROKE, split);
  ctx.moveTo(w / 2, STROKE); ctx.lineTo(w / 2, split);
  ctx.stroke();
}

function shiftKey(ctx) {
  const { w, h } = ICONS.shift;
  ctx.beginPath();
  ctx.roundRect(STROKE / 2, STROKE / 2, w - STROKE, h - STROKE, 0.07);
  ctx.stroke();
  ctx.save();
  ctx.scale(1 / PX, 1 / PX); // fonts in pixels
  ctx.font = `bold ${0.15 * PX}px ${FONT}`;
  ctx.letterSpacing = `${0.02 * PX}px`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SHIFT', (w / 2) * PX, (h / 2 + 0.01) * PX);
  ctx.restore();
}

const canvasOf = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });

// The same shape in one colour.
function tinted(mask, color) {
  const c = canvasOf(mask.width, mask.height), ctx = c.getContext('2d');
  ctx.drawImage(mask, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

// lines: [{ icon?: 'lmb' | 'rmb' | 'shift', text }], left-aligned after a column for the
// pictures if any line has one, else centred. → { canvas, width, height } (world units).
function carve(lines) {
  const { textSize, lineHeight } = TUTORIAL.carving;
  const font = `bold ${textSize * PX}px ${FONT}`, spacing = `${textSize * 0.14 * PX}px`;
  const measure = canvasOf(1, 1).getContext('2d');
  measure.font = font;
  measure.letterSpacing = spacing;
  const iconCol = Math.max(0, ...lines.map((l) => (l.icon ? ICONS[l.icon].w + ICON_GAP : 0)));
  const textW = Math.max(...lines.map((l) => measure.measureText(l.text.toUpperCase()).width / PX));
  const pad = 0.15, width = iconCol + textW + pad * 2, height = lines.length * lineHeight + pad * 2;

  // The grooves, as a mask.
  const mask = canvasOf(Math.ceil(width * PX), Math.ceil(height * PX)), ctx = mask.getContext('2d');
  ctx.fillStyle = ctx.strokeStyle = '#fff';
  ctx.lineCap = ctx.lineJoin = 'round';
  lines.forEach((line, i) => {
    const cy = pad + (i + 0.5) * lineHeight;
    if (line.icon) {
      const icon = ICONS[line.icon];
      ctx.save();
      ctx.scale(PX, PX);
      ctx.translate(pad + iconCol - ICON_GAP - icon.w, cy - icon.h / 2);
      ctx.lineWidth = STROKE;
      icon.draw(ctx);
      ctx.restore();
    }
    ctx.font = font;
    ctx.letterSpacing = spacing;
    ctx.textBaseline = 'middle';
    ctx.textAlign = iconCol ? 'left' : 'center';
    ctx.fillText(line.text.toUpperCase(), (iconCol ? pad + iconCol : width / 2) * PX, cy * PX + textSize * 0.04 * PX);
  });

  // The grey groove, shadowed where its top edge overhangs it (the shape less itself moved down).
  const canvas = tinted(mask, GROOVE), out = canvas.getContext('2d');
  const shadow = tinted(mask, SHADOW), sh = shadow.getContext('2d');
  sh.globalCompositeOperation = 'destination-out';
  sh.drawImage(mask, 0, SHADE * PX);
  out.globalCompositeOperation = 'source-atop';
  out.drawImage(shadow, 0, 0);
  return { canvas, width, height };
}

export class Carving {
  // Built off the floor until place(); `cut` > 0 cuts it in over that many seconds once
  // placed (update drives it). Its texture is its own and goes with its view, however that's
  // destroyed (World.clearFloor destroys the ground's children); the glint's is shared.
  constructor(lines, cut = 0) {
    const { canvas, width, height } = carve(lines);
    this.width = width;
    this.height = height;
    this.view = new Container();
    const texture = Texture.from(canvas);
    this.view.once('destroyed', () => texture.destroy(true));
    this.sprite = new Sprite(texture);
    this.sprite.scale.set(1 / PX);
    this.view.addChild(this.sprite);
    this.cut = cut > 0 ? { t: 0, time: cut } : null;
    if (this.cut) {
      this.mask = new Graphics();
      this.sprite.mask = this.mask;
      this.glint = new Sprite(tex.glint);
      this.glint.anchor.set(0.5);
      this.glint.blendMode = 'add';
      this.glint.tint = 0x4a4a4a; // dim: dust off the cut, not light
      this.glint.scale.set(GLINT_SIZE / this.glint.texture.width);
      this.view.addChild(this.mask, this.glint);
      this.update(0);
    }
  }

  // Lays it on `layer`, centred on `pos`.
  place(layer, pos) {
    this.view.position.set(pos.x - this.width / 2, pos.y - this.height / 2);
    layer.addChild(this.view);
  }

  destroy() { this.view.destroy({ children: true }); }

  update(dt) {
    const c = this.cut;
    if (!c || this.view.destroyed) return;
    c.t += dt;
    const k = clamp01(c.t / c.time), x = this.width * k;
    this.mask.clear().rect(0, -0.2, x, this.height + 0.4).fill(0xffffff);
    this.glint.position.set(x, this.height / 2 + Math.sin(c.t * 40) * this.height * 0.25);
    if (k < 1) return;
    this.sprite.mask = null;
    this.mask.destroy();
    this.glint.destroy();
    this.cut = null;
  }
}
