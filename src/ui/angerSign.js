// The sign of an angry guardian (ANGER_SIGN, GuardianRage): a cloud of red mist with holes
// for two eyes and a roaring mouth, bursting in as the guardians roar. Right over each
// guardian's middle while it's on screen, big, above everything; otherwise smaller, pinned
// in from the screen's edge on the line toward it, an arrow pointing the way the roar came
// from. It follows the guardian there and back, and fades once the roar is over (world
// time, so it holds while the game is paused).
import { h } from './dom.js';
import { mistFx } from './common.js';
import { iconUrls } from '../render/assets.js';
import { ANGER_SIGN as A } from '../data/config.js';

export class AngerSign {
  constructor() {
    this.el = h('div', { class: 'anger-signs' });
    this.roar = null; // the roar on screen (GuardianRage.roar)
    this.signs = [];
    this.size = 0; // px across, as big as A.size world units shows
  }

  update(world, alpha) {
    const roar = world.rage.roar;
    if (roar !== this.roar) {
      this.roar = roar;
      this.signs = roar ? roar.guardians.map((guardian) => this.make(guardian)) : [];
      this.el.replaceChildren(...this.signs.map((s) => s.el));
    }
    if (!this.signs.length) return;
    if (world.time - roar.at > A.time) { // the roar's over
      this.signs = [];
      this.el.replaceChildren();
      return;
    }
    const cam = world.camera, W = cam.viewW, H = cam.viewH;
    const size = Math.round(A.size * cam.ppu);
    if (size !== this.size) {
      this.size = size;
      this.el.style.setProperty('--size', `${size}px`);
      this.el.style.setProperty('--edge-scale', A.edgeScale);
    }
    // Inside this rect it sits on the guardian; outside it, where the line from the middle
    // of the screen toward the guardian crosses the rect's edge, so it glides between the two.
    const inset = (size * A.edgeScale) / 2 + A.edge, x0 = inset, x1 = W - inset, y0 = inset, y1 = H - inset;
    for (const s of this.signs) {
      const g = s.guardian;
      if (!g.dead) s.at = g.body.lerpPos(alpha);
      const p = cam.worldToScreen(s.at.x, s.at.y);
      const inside = p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
      let x = p.x, y = p.y;
      const dx = p.x - W / 2, dy = p.y - H / 2;
      if (!inside) {
        const k = Math.min(dx ? (dx > 0 ? x1 - W / 2 : x0 - W / 2) / dx : Infinity, dy ? (dy > 0 ? y1 - H / 2 : y0 - H / 2) / dy : Infinity, 1);
        x = W / 2 + dx * k;
        y = H / 2 + dy * k;
      }
      s.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      s.el.classList.toggle('off', !inside);
      s.el.classList.toggle('gone', g.dead);
      if (!inside) s.el.style.setProperty('--a', `${Math.atan2(dy, dx).toFixed(3)}rad`);
    }
  }

  make(guardian) {
    const el = h('div', { class: 'anger-sign' },
      h('div', { class: 'anger-arrow' }),
      h('div', { class: 'anger-body' },
        // Rising off its crown, clear of the eyes and mouth so they stay holes.
        mistFx('anger-mist', { puffs: 16, embers: 10, x: [0.3, 0.7], y: [0.24, 0.3], size: [50, 90], dur: [1, 1.8], emberDur: [0.8, 1.4] }),
        h('img', { class: 'anger-face', src: iconUrls.anger_sign, alt: '' })));
    el.style.setProperty('--dur', `${A.time}s`);
    return { el, guardian, at: { ...guardian.body.pos } };
  }
}
