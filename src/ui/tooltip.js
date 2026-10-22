// An aspect's details (icon, name, quote, description) in a card over whatever it's attached
// to, shown after a short hover or at once when focused from the keyboard, kept on screen.
// Shared by the main menu and the pause menu.
import { h } from './dom.js';
import { TIERS, HUD } from '../data/config.js';
import { iconUrls } from '../render/assets.js';

const tierOf = (a) => TIERS.find((t) => t.tier === a.tier);
// Sets --tier, which colours an aspect's frame, glow and tooltip, from its tier (cleared for none).
export const setTier = (el, a) => { el.style.setProperty('--tier', a ? tierOf(a).color : null); return el; };

// Its card is `el`, for the owner to place in its screen.
export class AspectTooltip {
  // held(): true while the tooltip should stay away (an aspect being dragged).
  constructor({ held = () => false } = {}) {
    this.held = held;
    this.el = h('div', { class: 'tooltip hidden' });
    this.timer = null;
  }

  // getAspect(): the aspect to show for `el`, or null for none.
  attach(el, getAspect) {
    const show = (delay) => {
      this.hide();
      const a = !this.held() && getAspect();
      if (a) this.timer = setTimeout(() => this.show(a, el), delay * 1000);
    };
    el.addEventListener('mouseenter', () => show(HUD.tooltipHoverDelay));
    el.addEventListener('mouseleave', () => this.hide());
    el.addEventListener('focus', () => { if (el.matches(':focus-visible')) show(0); });
    el.addEventListener('blur', () => this.hide());
  }

  show(a, anchor) {
    const t = this.el;
    t.replaceChildren(...[
      h('div', { class: 't-head' },
        h('img', { class: 't-icon', src: iconUrls[a.icon], alt: '' }),
        h('div', { class: 't-name', text: a.displayName }),
      ),
      a.quote && h('div', { class: 't-quote', text: `"${a.quote}"` }),
      a.description && h('div', { class: 't-desc', text: a.description }),
    ].filter(Boolean));
    setTier(t, a).classList.remove('hidden');
    const r = anchor.getBoundingClientRect(), tr = t.getBoundingClientRect();
    const pad = 12, gap = 12;
    const x = Math.min(Math.max(r.left + r.width / 2 - tr.width / 2, pad), innerWidth - pad - tr.width);
    let y = r.top - gap - tr.height;
    if (y < pad) y = r.bottom + gap;
    t.style.left = `${x}px`;
    t.style.top = `${Math.min(Math.max(y, pad), innerHeight - pad - tr.height)}px`;
  }

  hide() {
    clearTimeout(this.timer);
    this.el.classList.add('hidden');
  }

  destroy() {
    this.hide();
    this.el.remove();
  }
}
