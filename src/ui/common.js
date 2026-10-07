// Small UI pieces shared by the menu, HUD and run summary.
import { h } from './dom.js';
import { iconUrls } from '../render/assets.js';

// Sized by the surrounding font, so it sits inline before an amount.
export const coinIcon = () => h('img', { class: 'coin-icon', src: iconUrls.coin_icon, alt: 'Coins' });

export const keycap = (text) => h('kbd', { text });

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
