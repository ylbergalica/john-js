// Small UI pieces shared by the menu, HUD and run summary.
import { h } from './dom.js';
import { iconUrls } from '../render/assets.js';

// Sized by the surrounding font, so it sits inline before an amount.
export const coinIcon = () => h('img', { class: 'coin-icon', src: iconUrls.coin_icon, alt: 'Coins' });

export const keycap = (text) => h('kbd', { text });

// A mouse, its left or right button lit.
export function mouseIcon(side, cls = 'mouse-icon') {
  const el = h('span', { class: cls });
  const button = side === 'left' ? 'M8 1A7 7 0 0 0 1 8V9H8Z' : 'M8 1A7 7 0 0 1 15 8V9H8Z';
  el.innerHTML = `<svg viewBox="0 0 16 22" fill="none" stroke="currentColor" stroke-width="1.4"><path d="${button}" fill="currentColor" stroke="none"/><rect x="1" y="1" width="14" height="20" rx="7"/><path d="M1 9H15M8 1V9"/></svg>`;
  return el;
}

// The assists' mark: a heart held in an open hand. Sized by the surrounding font.
export function assistIcon(cls = '') {
  const el = h('span', { class: `assist-icon ${cls}`.trim(), 'aria-hidden': 'true' });
  el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M12.5 13.2c-2.7-2-4.5-3.5-4.5-5.4 0-1.4 1.1-2.4 2.4-2.4.9 0 1.6.4 2.1 1.1.5-.7 1.2-1.1 2.1-1.1 1.3 0 2.4 1 2.4 2.4 0 1.9-1.8 3.4-4.5 5.4z" fill="currentColor" stroke="none"/>'
    + '<path d="M2.5 14.2v7.3"/>'
    + '<path d="M2.5 15.4h3.3c1 0 1.9.3 2.7.9l1.1.8h3.3c.8 0 1.4.6 1.4 1.4s-.6 1.4-1.4 1.4H9.4"/>'
    + '<path d="M14.2 18.3l4.4-2.5c.8-.5 1.8-.2 2.2.6.4.7.2 1.6-.5 2.1l-5.4 3.4c-.8.5-1.7.7-2.6.7H2.5"/>'
    + '</svg>';
  return el;
}

// The game's name as its logo, in Cinzel: STAR in cool starlight, SPITE smouldering red with
// embers drifting up off it, and a sweep of light crossing the word now and then (CSS: .logo).
export function logo(cls) {
  const embers = mistFx('logo-embers', { puffs: 6, embers: 16, x: [0.05, 0.95], y: [0.3, 0.85], size: [30, 60], dur: [2, 3.2], emberSize: [2, 3], emberDur: [1.8, 3] });
  return h('h1', { class: `logo ${cls}`, 'data-text': 'Starspite' },
    h('span', { class: 'logo-star', text: 'Star' }),
    h('span', { class: 'logo-spite', text: 'spite' }, embers),
  );
}

// Back out of a panel: a U-turn arrow in a ring, fixed at the screen's bottom left, beside
// the Esc key that does the same.
const BACK_ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 13.5 4.5 9 9 4.5"/><path d="M4.5 9h9.5a5.25 5.25 0 0 1 0 10.5H10"/></svg>';

export function backCorner(onBack) {
  const b = h('button', { class: 'back-button', 'aria-label': 'Back', title: 'Back', onclick: onBack });
  b.innerHTML = BACK_ARROW;
  return h('div', { class: 'back-corner' }, b, keycap('Esc'));
}

// The mark with a word beside it (or alone, for a tooltip only).
export const assistBadge = (cls, text = null, title = null) =>
  h('div', { class: `assist-badge ${cls}`, title }, assistIcon(), text ? h('span', { text }) : null);

export const formatTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export const easeOut = (p) => 1 - (1 - p) ** 3;

const rand = (a, b) => a + Math.random() * (b - a);

// Rising mist and embers, the look of the in-game Exalted haze: puffs of its mist texture
// and small embers scattered over the box this is placed in (x, y: 0…1 ranges of it), each
// looping on its own timing, with negative delays so they start mid-flight. CSS (.mist-fx)
// animates and colours them; extra classes pick a variant.
export function mistFx(cls, { puffs, embers, x = [0, 1], y = [0.5, 0.5], size, dur, emberSize = [2, 3], emberDur = [1.2, 2] }) {
  const particle = (kind, s, d) => {
    const t = rand(...d);
    const el = h('span', { class: kind });
    el.style.cssText = `--x:${rand(...x).toFixed(3)};--y:${rand(...y).toFixed(3)};--s:${rand(...s).toFixed(1)}px;--t:${t.toFixed(2)}s;--d:${(-rand(0, t)).toFixed(2)}s;--dx:${rand(-10, 10).toFixed(1)}px;--r:${Math.round(rand(0, 360))}deg`;
    return el;
  };
  const fx = h('div', { class: `mist-fx ${cls}` },
    Array.from({ length: puffs }, () => particle('puff', size, dur)),
    Array.from({ length: embers }, () => particle('ember', emberSize, emberDur)));
  fx.style.setProperty('--mist', `url(${iconUrls.mist})`);
  return fx;
}

// Restarts a one-shot CSS animation class (a pop, a flash) on an element that may
// still have it from last time.
export function replay(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}
