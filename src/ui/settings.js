// Settings panel: audio, display (and performance), controls (key bindings, grouped) and
// accessibility (marked with the assists' icon, lit while one is on), one tab each. Opens
// over the main menu or the pause menu, which step aside (settings-open on the root) so the
// sky or the paused game shows through; every change applies and saves at once. Esc backs
// out, or cancels a key being bound.
import { h } from './dom.js';
import { replay, mouseIcon, assistIcon, backCorner } from './common.js';
import { sfx } from '../audio/sfx.js';
import { iconUrls } from '../render/assets.js';
import { profile } from '../meta/profile.js';
import {
  settings, setSetting, onSettingsChange, resetSettings, bind, keyLabel, ACTIONS, RESERVED_KEYS,
  CHOICES, QUALITY, qualityOf, setQuality, assistsOn,
} from '../meta/settings.js';

const percent = (v) => `${Math.round(v * 100)}%`;
const sameValue = (a, b) => Math.abs(a - b) < 1e-6;
const ROW_STAGGER = 0.035; // seconds between rows rising in on a tab

// A stepped setting's values (CHOICES) with their names.
const named = (key, names) => CHOICES[key].map((v, i) => [v, names[i]]);
const QUALITY_NAMES = { high: 'High', medium: 'Medium', low: 'Low' };

const TABS = [
  {
    name: 'Audio',
    rows: [
      { type: 'slider', key: 'masterVolume', label: 'Master volume' },
      { type: 'slider', key: 'sfxVolume', label: 'Effects volume', preview: true },
      { type: 'slider', key: 'musicVolume', label: 'Music volume' },
      { type: 'toggle', key: 'muteInBackground', label: 'Mute in background' },
    ],
  },
  {
    name: 'Display',
    rows: [
      { type: 'heading', label: 'Screen' },
      { type: 'fullscreen', label: 'Fullscreen' },
      { type: 'choice', key: 'fpsLimit', label: 'Frame rate limit', options: named('fpsLimit', ['Off', '30', '60', '120', '144']) },
      { type: 'toggle', key: 'showFps', label: 'Show frame rate' },
      { type: 'toggle', key: 'pauseOnBlur', label: 'Pause when unfocused' },
      { type: 'heading', label: 'Performance' },
      // The preset reads Custom once a setting below is changed on its own.
      { type: 'choice', label: 'Graphics', options: Object.keys(QUALITY).map((q) => [q, QUALITY_NAMES[q]]), get: qualityOf, set: setQuality, other: 'Custom' },
      { type: 'choice', key: 'resolutionCap', label: 'Resolution', options: named('resolutionCap', ['High', 'Standard', 'Low']) },
      { type: 'choice', key: 'particles', label: 'Particles', options: named('particles', ['Full', 'Fewer', 'Minimal']) },
      { type: 'toggle', key: 'afterimages', label: 'Afterimages' },
      { type: 'toggle', key: 'shockwaves', label: 'Shockwaves' },
      { type: 'toggle', key: 'nebula', label: 'Background clouds' },
    ],
  },
  {
    name: 'Controls',
    rows: [{ type: 'binds', key: 'bindings' }],
  },
  {
    name: 'Accessibility',
    icon: true,
    rows: [
      { type: 'heading', label: 'Assist' },
      { type: 'choice', key: 'gameSpeed', label: 'Game speed', options: named('gameSpeed', ['Normal', 'Relaxed', 'Gentle']) },
      { type: 'toggle', key: 'lessDamage', label: 'Take less damage' },
      { type: 'choice', key: 'parryWindow', label: 'Parry window', options: named('parryWindow', ['Normal', 'Wide', 'Wider']) },
      { type: 'heading', label: 'Comfort' },
      { type: 'slider', key: 'screenShake', label: 'Screen shake' },
      { type: 'toggle', key: 'hitPause', label: 'Hit pause' },
      { type: 'toggle', key: 'reduceFlashing', label: 'Reduce flashing' },
    ],
  },
];

// The bindings in groups: movement as a cluster of keys laid out like them, the rest a row of
// keycaps, each over its name (an aspect slot's over the aspect in it). The fixed keys show
// with the others but can't be changed: Esc, and Tab once there's a playground to spawn in.
const actionName = Object.fromEntries(ACTIONS);
const BIND_GROUPS = [
  { name: 'Move', cls: 'move', keys: [['up'], ['left'], ['down'], ['right']] },
  { name: 'Combat', keys: [['attack', 'Attack'], ['parry', 'Parry'], ['dash', 'Dash'], ['exalted', 'Exalted']] },
  { name: 'Aspects', keys: [['slot1', 0], ['slot2', 1], ['slot3', 2]] },
  { name: 'Other', keys: [[null, 'Pause', 'Esc'], [null, 'Spawn', 'Tab', () => profile.tutorialDone]] },
];

// What a keycap shows: the mouse with its button lit for the left and right buttons, else the key's name.
const keyGlyph = (code) => (code === 'Mouse0' ? mouseIcon('left') : code === 'Mouse2' ? mouseIcon('right') : keyLabel(code));

// Fullscreen: the desktop window's own (remembered across launches), or the page's in a browser.
const fullscreen = {
  desktopOn: false,
  listeners: new Set(),
  get on() { return window.desktop ? this.desktopOn : !!document.fullscreenElement; },
  toggle() {
    if (window.desktop) window.desktop.toggleFullscreen();
    else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
  },
  changed() { for (const fn of this.listeners) fn(); },
};
window.desktop?.isFullscreen?.().then((on) => { fullscreen.desktopOn = on; fullscreen.changed(); });
window.desktop?.onFullscreen?.((on) => { fullscreen.desktopOn = on; fullscreen.changed(); });
document.addEventListener('fullscreenchange', () => fullscreen.changed());

export class SettingsPanel {
  constructor(root) {
    this.root = root;
    this.tab = 0;
    this.controls = []; // the open tab's: { update() } each, run after any change
    this.bindButtons = new Map(); // action → its keycap, on the controls tab
    this.binding = null; // { action, button } while waiting for a key
    this.listeners = null; // while open

    // The tabs as words along a faint line, a star gliding under the one open.
    this.tabButtons = TABS.map((t, i) => h('button', { class: 'set-tab', onclick: () => this.showTab(i) }, t.icon ? assistIcon('set-tab-icon') : null, t.name));
    this.tabStar = h('span', { class: 'set-tab-star', text: '✦' });
    this.body = h('div', { class: 'set-body' });
    this.el = h('div', { class: 'settings interactive hidden' },
      h('div', { class: 'settings-card' },
        h('h2', { class: 'set-title title-in', text: 'Settings' }),
        h('nav', { class: 'set-tabs' }, this.tabButtons, this.tabStar),
        this.body,
        h('div', { class: 'set-actions' },
          h('button', { class: 'set-reset', text: 'Defaults', onclick: () => this.resetTab() }),
        ),
      ),
      backCorner(() => this.close()), // stays put however far the tab has scrolled
    );
    // Keys pressed on the panel's own controls (a slider's arrows) stay here, out of the game's input.
    this.el.addEventListener('keydown', (e) => { if (e.code !== 'Escape') e.stopPropagation(); });
    root.append(this.el);

    this.offChange = onSettingsChange(() => this.sync());
    const syncFullscreen = () => this.sync();
    fullscreen.listeners.add(syncFullscreen);
    this.offFullscreen = () => fullscreen.listeners.delete(syncFullscreen);
  }

  get isOpen() { return !this.el.classList.contains('hidden'); }

  open() {
    if (this.isOpen) return;
    this.el.classList.remove('hidden');
    replay(this.el.querySelector('.set-title'), 'title-in');
    this.root.classList.add('settings-open');
    this.showTab(this.tab);
    this.listeners = new AbortController();
    const opts = { signal: this.listeners.signal, capture: true };
    window.addEventListener('keydown', (e) => this.onKey(e), opts);
    window.addEventListener('mousedown', (e) => this.onMouse(e), opts);
    window.addEventListener('blur', () => this.stopBinding(), opts);
    window.addEventListener('resize', () => this.placeTabStar(), { signal: this.listeners.signal });
  }

  close() {
    if (!this.isOpen) return;
    this.stopBinding();
    this.listeners?.abort();
    this.listeners = null;
    this.el.classList.add('hidden');
    this.root.classList.remove('settings-open');
  }

  // While open, Esc is the panel's alone (the menu or pause behind it doesn't see it).
  onKey(e) {
    if (this.binding) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat) return;
      if (e.code === 'Escape') { this.stopBinding(); sfx.play('click'); }
      else if (!RESERVED_KEYS.has(e.code)) this.finishBinding(e.code);
      return;
    }
    if (e.code !== 'Escape') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!e.repeat) { this.close(); sfx.play('click'); }
  }

  // A mouse button pressed while binding is the binding; the click it makes is swallowed.
  onMouse(e) {
    if (!this.binding) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const swallow = (ev) => { ev.preventDefault(); ev.stopImmediatePropagation(); };
    const after = e.button === 0 ? ['click'] : ['auxclick', 'contextmenu'];
    for (const type of after) window.addEventListener(type, swallow, { capture: true });
    // The click follows the button's release in the same go; once that's past, clicks count again.
    window.addEventListener('mouseup', () => setTimeout(() => {
      for (const type of after) window.removeEventListener(type, swallow, { capture: true });
    }), { capture: true, once: true });
    this.finishBinding(`Mouse${e.button}`);
  }

  showTab(i) {
    this.stopBinding();
    this.tab = i;
    this.tabButtons.forEach((b, j) => b.classList.toggle('active', j === i));
    this.placeTabStar();
    this.controls = [];
    this.bindButtons.clear();
    this.body.replaceChildren(...TABS[i].rows.map((row) => this.row(row)));
    [...this.body.querySelectorAll(':scope > .set-row, :scope > .set-heading, .set-group')].forEach((el, j) => el.style.setProperty('--d', `${j * ROW_STAGGER}s`));
    this.sync();
  }

  placeTabStar() {
    const b = this.tabButtons[this.tab];
    this.tabStar.style.left = `${b.offsetLeft + b.offsetWidth / 2}px`;
  }

  sync() {
    for (const c of this.controls) c.update();
    this.tabButtons[TABS.findIndex((t) => t.icon)].classList.toggle('assisting', assistsOn());
  }

  resetTab() {
    const keys = TABS[this.tab].rows.map((r) => r.key).filter(Boolean);
    this.stopBinding();
    resetSettings(keys);
  }

  // ── rows ─────────────────────────────────────────────────────────
  row(row) {
    if (row.type === 'heading') return h('div', { class: 'rule set-heading', text: row.label });
    if (row.type === 'binds') return this.binds();
    return h('div', { class: 'set-row' }, h('span', { class: 'set-label', text: row.label }), this[row.type](row));
  }

  control(el, update) {
    this.controls.push({ update });
    return el;
  }

  // A line of starlight filled up to a diamond.
  slider({ key, preview }) {
    const input = h('input', { class: 'set-slider', type: 'range', min: 0, max: 100, step: 5 });
    const value = h('span', { class: 'set-value' });
    input.addEventListener('input', () => setSetting(key, Number(input.value) / 100));
    if (preview) input.addEventListener('change', () => sfx.play('click'));
    return this.control(h('div', { class: 'set-control' }, input, value), () => {
      input.value = String(Math.round(settings[key] * 100));
      input.style.setProperty('--p', `${input.value}%`);
      value.textContent = percent(settings[key]);
    });
  }

  // A gem that lights up when on.
  toggle({ key }) { return this.gem(() => settings[key], () => setSetting(key, !settings[key])); }
  fullscreen() { return this.gem(() => fullscreen.on, () => fullscreen.toggle()); }

  gem(get, flip) {
    const state = h('span', { class: 'set-state' });
    const b = h('button', { class: 'set-toggle', onclick: flip }, h('span', { class: 'set-gem' }), state);
    let shown = null;
    return this.control(h('div', { class: 'set-control' }, b), () => {
      const on = get();
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
      state.textContent = on ? 'On' : 'Off';
      if (shown === false && on) replay(b, 'lit');
      shown = on;
    });
  }

  // ‹ value › stepping through the options, a pip for each underneath (click one to jump there).
  // A row with its own get and set (a preset) shows `other` when the value is none of them,
  // and steps from there to the middle one.
  choice({ key, options, get = () => settings[key], set = (v) => setSetting(key, v), other = null }) {
    const index = () => {
      const v = get(), i = options.findIndex(([o]) => (typeof o === 'number' ? sameValue(o, v) : o === v));
      return i < 0 && !other ? 0 : i;
    };
    const step = (d) => {
      const at = index(), i = at < 0 ? Math.floor(options.length / 2) : at + d;
      if (i >= 0 && i < options.length) set(options[i][0]);
    };
    const prev = h('button', { class: 'set-arrow', text: '‹', 'aria-label': 'Less', onclick: () => step(-1) });
    const next = h('button', { class: 'set-arrow', text: '›', 'aria-label': 'More', onclick: () => step(1) });
    const value = h('span', { class: 'set-step-value' });
    const pips = options.map(([v, text]) => h('button', { class: 'set-pip', 'aria-label': text, onclick: () => set(v) }));
    let shown = null;
    return this.control(h('div', { class: 'set-control set-stepper' }, prev, h('div', { class: 'set-step-mid' }, value, h('div', { class: 'set-pips' }, pips)), next), () => {
      const i = index();
      value.textContent = i < 0 ? other : options[i][1];
      if (shown !== null && shown !== i) replay(value, 'pop');
      shown = i;
      prev.disabled = i === 0;
      next.disabled = i === options.length - 1;
      pips.forEach((p, j) => p.classList.toggle('on', j === i));
    });
  }

  // The bindings by group (BIND_GROUPS); click a keycap, then press the key (or mouse button) for it.
  binds() {
    const loadout = profile.loadout();
    const caption = (c) => {
      if (typeof c === 'string') return h('span', { class: 'set-caption', text: c });
      if (typeof c !== 'number') return null;
      const a = loadout[c]; // an aspect slot: the aspect in it
      return a ? h('img', { class: 'set-caption-aspect', src: iconUrls[a.icon], alt: a.displayName }) : h('span', { class: 'set-caption-empty' });
    };
    const key = ([action, c, fixed, shown]) => {
      if (shown && !shown()) return null;
      if (!action) return h('div', { class: 'set-keyed' }, h('button', { class: 'set-key fixed', disabled: true, text: fixed }), caption(c));
      const button = h('button', { class: 'set-key', 'aria-label': actionName[action], onclick: () => this.startBinding(action, button) });
      this.bindButtons.set(action, button);
      this.control(button, () => {
        if (this.binding?.action !== action) button.replaceChildren(keyGlyph(settings.bindings[action]));
      });
      return h('div', { class: `set-keyed k-${action}` }, button, caption(c));
    };
    return h('div', { class: 'set-binds' }, BIND_GROUPS.map((g) => h('section', { class: `set-group ${g.cls ?? ''}` },
      h('div', { class: 'rule set-heading', text: g.name }),
      h('div', { class: 'set-keys' }, g.keys.map(key)),
    )));
  }

  startBinding(action, button) {
    this.stopBinding();
    this.binding = { action, button };
    button.classList.add('listening');
    button.textContent = '· · ·';
  }

  // Binds the key; its keycap (and any it swapped with) flashes as it takes the new key.
  finishBinding(code) {
    const { action } = this.binding;
    const before = { ...settings.bindings };
    this.stopBinding();
    bind(action, code);
    for (const [a, button] of this.bindButtons) if (settings.bindings[a] !== before[a]) replay(button, 'bound');
    sfx.play('click');
  }

  stopBinding() {
    const b = this.binding;
    if (!b) return;
    this.binding = null;
    b.button.classList.remove('listening');
    this.sync();
  }

  destroy() {
    this.close();
    this.offChange();
    this.offFullscreen();
    this.el.remove();
  }
}
