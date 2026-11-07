// Small UI pieces shared by the menu, HUD and run summary.
import { h } from './dom.js';
import { iconUrls } from '../render/assets.js';
import { GEM_CUTS, gemRings } from '../render/sprites/ui.js';

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

// Back out of a panel: a U-turn arrow in a ring, beside the Esc key that does the same.
const BACK_ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 13.5 4.5 9 9 4.5"/><path d="M4.5 9h9.5a5.25 5.25 0 0 1 0 10.5H10"/></svg>';

export function backCorner(onBack) {
  const b = h('button', { class: 'back-button', 'aria-label': 'Back', title: 'Back', onclick: onBack });
  b.innerHTML = BACK_ARROW;
  return h('div', { class: 'back-corner' }, b, keycap('Esc'));
}

// A panel card's last row: the back corner at its bottom left, anything else centred.
export function cardFoot(cls, onBack, ...middle) {
  return h('div', { class: `card-foot ${cls}` }, backCorner(onBack), h('div', { class: 'card-foot-mid' }, middle));
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

// A tier gem's effects, laid over its image. Every tier: `sparks` glints, each flaring and
// fading (CSS: .gem-spark), then waiting a moment and flaring again somewhere else on the
// stone, at its own size and tilt. Prestige and up: now and then a shimmer, lines of light
// sweeping across the stone (.gem-shimmer). Mythic: small shooting stars streaking through
// the stone now and then, bending where they cross the table's edges as light would,
// glancing off them when too shallow to get out (.gem-stars). Both are masked to the gem.
const SVG_NS = 'http://www.w3.org/2000/svg';
const STAR = { every: [1.8, 4.2], time: [1.1, 1.6], eta: 0.72, tail: 42 }; // eta: how hard they bend going into the table
const STAR_TRAILS = [{ cls: 'glow', tail: 1 }, { cls: 'mid', tail: 0.6 }, { cls: 'core', tail: 0.3 }, { cls: 'head', tail: 0.03 }]; // fading tail: shorter layers on top, a bright point at its head

export function gemFx(tierName, { sparks = 1 } = {}) {
  const key = tierName.toLowerCase(), cut = GEM_CUTS[key], rank = Object.keys(GEM_CUTS).indexOf(key);
  const { rx, ry, sides } = cut;
  const onStone = () => {
    for (;;) { // a point well inside the cut: the rhombus by its edges, the rest by a circle
      const u = rand(-1, 1), v = rand(-1, 1);
      if (sides === 4 ? Math.abs(u) + Math.abs(v) <= 0.8 : Math.hypot(u, v) <= 0.78) return [0.5 + u * rx, 0.5 + v * ry];
    }
  };
  const flare = (el, first) => {
    const [x, y] = onStone();
    el.style.cssText = `left:${(x * 100).toFixed(1)}%;top:${(y * 100).toFixed(1)}%;--k:${rand(0.65, 1.1).toFixed(2)};--tilt:${Math.round(rand(-25, 25))}deg;--delay:${rand(first ? 0 : 0.35, first ? 1.2 : 1.6).toFixed(2)}s`;
    el.style.animation = 'none';
    void el.offsetWidth; // restart it
    el.style.animation = '';
  };
  const fx = h('div', { class: 'gem-fx' }, Array.from({ length: sparks }, () => {
    const el = h('span', { class: 'gem-spark' });
    el.addEventListener('animationend', () => flare(el, false));
    flare(el, true);
    return el;
  }));
  fx.style.setProperty('--gem-mask', `url(${iconUrls[`gem_${key}`]})`);
  if (rank >= 1) {
    const shimmer = h('div', { class: 'gem-shimmer' });
    shimmer.style.setProperty('--wait', `${(-rand(0, 7)).toFixed(2)}s`); // each gem on its own beat
    fx.append(shimmer);
  }
  if (rank >= 2) fx.append(shootingStars(cut));
  return fx;
}

// The Mythic's shooting stars: an SVG over the stone (0…100), one star at a time, `every`
// seconds or so while it's on screen, until it's taken off the page.
function shootingStars(cut) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'gem-stars');
  svg.setAttribute('viewBox', '0 0 100 100');
  const rings = gemRings(cut);
  let seen = false;
  const next = () => setTimeout(tick, rand(...STAR.every) * 1000);
  const tick = () => {
    if (svg.isConnected) seen = true;
    else if (seen) return; // gone for good
    if (svg.isConnected && svg.getClientRects().length) launch();
    next();
  };
  const launch = () => {
    const pts = starPath(rings).map(([x, y]) => [x * 100, y * 100]);
    const len = pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
    const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join('');
    const ms = rand(...STAR.time) * 1000, run = len + STAR.tail;
    for (const { cls, tail } of STAR_TRAILS) {
      const t = STAR.tail * tail;
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', `gem-star ${cls}`);
      path.style.strokeDasharray = `${t} ${run + t}`;
      svg.append(path);
      // The dash runs [s - t, s] along the path as its head s goes from the start to past the end.
      path.animate([{ strokeDashoffset: t }, { strokeDashoffset: t - run }], { duration: ms, easing: 'cubic-bezier(0.3, 0, 0.7, 1)' }).onfinish = () => path.remove();
    }
  };
  next();
  return svg;
}

// A star's way through the stone, in the gem image's 0…1 space: in at the rim, crossing
// the table (bent going in and coming out, or glancing back off its inside edge), and out
// at the rim again.
function starPath({ outer, inner }) {
  const a = rand(0, Math.PI * 2), dir = [Math.cos(a), Math.sin(a)];
  const off = rand(-0.12, 0.12); // to the side of the middle, so it clips the table at a slant
  const from = [0.5 - dir[0] + -dir[1] * off, 0.5 - dir[1] + dir[0] * off];
  const inAt = cast(from, dir, outer), pts = [inAt.p];
  let p = inAt.p, d = dir;
  const tableIn = cast(p, d, inner);
  if (tableIn) {
    pts.push(tableIn.p);
    d = refract(d, tableIn.n, STAR.eta);
    p = tableIn.p;
    for (let bounce = 0; bounce < 3; bounce++) { // out the far side, or glancing off it
      const hit = cast(p, d, inner);
      if (!hit) break;
      pts.push(hit.p);
      p = hit.p;
      d = refract(d, hit.n, 1 / STAR.eta);
      if (dot(d, hit.n) <= 0) break; // through
    }
  }
  const out = cast(p, d, outer);
  if (out) pts.push(out.p);
  return pts;
}

const dot = (u, v) => u[0] * v[0] + u[1] * v[1];

// The nearest edge of `poly` a ray from `p` along `d` crosses (a little way on, so it never
// finds the edge it's on): where, and the edge's normal facing back at the ray.
function cast(p, d, poly) {
  let best = null;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], e = [b[0] - a[0], b[1] - a[1]];
    const den = d[0] * e[1] - d[1] * e[0];
    if (Math.abs(den) < 1e-9) continue;
    const w = [a[0] - p[0], a[1] - p[1]];
    const t = (w[0] * e[1] - w[1] * e[0]) / den, u = (w[0] * d[1] - w[1] * d[0]) / den;
    if (t > 1e-4 && u >= 0 && u <= 1 && (!best || t < best.t)) {
      let n = [e[1], -e[0]];
      const m = Math.hypot(...n);
      n = [n[0] / m, n[1] / m];
      if (dot(n, d) > 0) n = [-n[0], -n[1]];
      best = { t, p: [p[0] + d[0] * t, p[1] + d[1] * t], n };
    }
  }
  return best;
}

// Bends unit `d` crossing a surface with normal `n` (facing back at it) by the ratio `eta`;
// too shallow to get through, it reflects off instead.
function refract(d, n, eta) {
  const c = dot(n, d), k = 1 - eta * eta * (1 - c * c);
  if (k < 0) return [d[0] - 2 * c * n[0], d[1] - 2 * c * n[1]];
  const s = eta * c + Math.sqrt(k);
  return [eta * d[0] - s * n[0], eta * d[1] - s * n[1]];
}

// Restarts a one-shot CSS animation class (a pop, a flash) on an element that may
// still have it from last time.
export function replay(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}
