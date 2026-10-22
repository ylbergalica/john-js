// Player settings in localStorage, kept apart from the save (shared by the demo and the full
// game): audio levels, display and performance, key bindings and accessibility. Read straight
// off `settings` (gameplay code reads it every step); change through setSetting so listeners
// hear of it.
// Bindings map each action to one key code (KeyboardEvent.code, or Mouse0…Mouse4).

const KEY = 'john.settings';

export const ACTIONS = [
  ['up', 'Move up'], ['left', 'Move left'], ['down', 'Move down'], ['right', 'Move right'],
  ['attack', 'Attack'], ['parry', 'Parry'], ['dash', 'Dash'], ['exalted', 'Exalted'],
  ['slot1', 'Aspect 1'], ['slot2', 'Aspect 2'], ['slot3', 'Aspect 3'],
];

export const DEFAULT_BINDINGS = {
  up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD',
  attack: 'Mouse0', parry: 'Mouse2', dash: 'ShiftLeft', exalted: 'KeyX',
  slot1: 'Digit1', slot2: 'Digit2', slot3: 'Digit3',
};

// Escape always pauses and backs out of menus, and Tab opens the playground's spawn menu, so
// neither can be bound.
export const RESERVED_KEYS = new Set(['Escape', 'Tab']);

const DEFAULTS = {
  // Audio, 0…1
  masterVolume: 1, sfxVolume: 1, musicVolume: 1, muteInBackground: false,
  // Display
  fpsLimit: 0, // 0: as fast as the screen refreshes
  showFps: false,
  pauseOnBlur: true,
  // Performance: the most pixels drawn per screen pixel, the share of particles spawned,
  // and the heavier effects that can be left out
  resolutionCap: 2, particles: 1, afterimages: true, shockwaves: true, nebula: true,
  // Controls
  bindings: DEFAULT_BINDINGS,
  // Accessibility: assists (they make the game easier; see assistsOn) and comfort
  gameSpeed: 1, lessDamage: false, parryWindow: 1,
  screenShake: 1, hitPause: true, reduceFlashing: false,
};

// The values a stepped setting can take, in the order they're stepped through.
export const CHOICES = {
  fpsLimit: [0, 30, 60, 120, 144],
  resolutionCap: [2, 1, 0.75],
  particles: [1, 0.55, 0.25],
  gameSpeed: [1, 0.85, 0.7],
  parryWindow: [1, 1.5, 2],
};

// Graphics presets: the performance settings each one sets.
export const QUALITY = {
  high: { resolutionCap: 2, particles: 1, afterimages: true, shockwaves: true, nebula: true },
  medium: { resolutionCap: 1, particles: 0.55, afterimages: true, shockwaves: true, nebula: true },
  low: { resolutionCap: 0.75, particles: 0.25, afterimages: false, shockwaves: false, nebula: false },
};

const LESS_DAMAGE = 0.7; // of the damage taken, with lessDamage on

const defaults = () => structuredClone(DEFAULTS);

// Keeps each saved value only if it has the default's type; one code per action, no two alike.
function sanitize(raw) {
  const s = defaults();
  if (!raw || typeof raw !== 'object') return s;
  for (const [k, def] of Object.entries(DEFAULTS)) {
    const v = raw[k];
    if (k === 'bindings') continue;
    if (CHOICES[k] ? CHOICES[k].includes(v) : typeof def === 'number' ? Number.isFinite(v) : typeof v === typeof def) s[k] = v;
  }
  if (raw.bindings && typeof raw.bindings === 'object') {
    const used = new Set();
    for (const [action] of ACTIONS) {
      const code = raw.bindings[action];
      if (typeof code === 'string' && code && !RESERVED_KEYS.has(code) && !used.has(code)) s.bindings[action] = code;
      used.add(s.bindings[action]);
    }
  }
  return s;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? sanitize(JSON.parse(raw)) : defaults();
  } catch {
    return defaults(); // corrupt or blocked storage
  }
}

export const settings = load();
const listeners = new Set();

function write() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* storage unavailable */ }
}

function changed(key) {
  write();
  for (const fn of listeners) fn(key);
}

export function setSetting(key, value) {
  if (settings[key] === value) return;
  settings[key] = value;
  changed(key);
}

// Calls fn(key) after every change; returns the unsubscribe.
export function onSettingsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Binds an action to a code; an action already on that code swaps over to this one's old code.
export function bind(action, code) {
  const b = settings.bindings;
  if (RESERVED_KEYS.has(code) || b[action] === code) return;
  const other = Object.keys(b).find((a) => b[a] === code);
  if (other) b[other] = b[action];
  b[action] = code;
  changed('bindings');
}

// The graphics preset the performance settings match, or null (custom).
export function qualityOf() {
  return Object.keys(QUALITY).find((q) => Object.entries(QUALITY[q]).every(([k, v]) => settings[k] === v)) ?? null;
}

export function setQuality(name) {
  Object.assign(settings, QUALITY[name]);
  changed('quality');
}

// Whether any assist is on: what makes a run an assisted one.
export const assistsOn = () => settings.gameSpeed !== 1 || settings.lessDamage || settings.parryWindow !== 1;
export const damageTakenScale = () => (settings.lessDamage ? LESS_DAMAGE : 1);

// Puts the given settings back to their defaults.
export function resetSettings(keys) {
  const d = defaults();
  for (const k of keys) settings[k] = d[k];
  changed(keys[0]);
}

// ── key names ──────────────────────────────────────────────────────
const MOUSE = ['LMB', 'MMB', 'RMB', 'Mouse 4', 'Mouse 5'];
const NAMED = {
  ShiftLeft: 'Shift', ShiftRight: 'R Shift', ControlLeft: 'Ctrl', ControlRight: 'R Ctrl', AltLeft: 'Alt', AltRight: 'R Alt',
  MetaLeft: 'Meta', MetaRight: 'R Meta', Space: 'Space', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', CapsLock: 'Caps',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Insert: 'Ins', Delete: 'Del', Home: 'Home', End: 'End',
  PageUp: 'PgUp', PageDown: 'PgDn', NumpadEnter: 'Num Enter', ContextMenu: 'Menu',
};
// The key printed for a code on the player's own layout (Chromium only), e.g. Z for KeyW on AZERTY.
let layout = null;
navigator.keyboard?.getLayoutMap?.().then((m) => { layout = m; }).catch(() => {});

// Short name for a key code, for keycaps.
export function keyLabel(code) {
  if (!code) return '—';
  if (code.startsWith('Mouse')) return MOUSE[Number(code.slice(5))] ?? `Mouse ${Number(code.slice(5)) + 1}`;
  if (NAMED[code]) return NAMED[code];
  const printed = layout?.get(code);
  if (printed && printed.trim()) return printed.toUpperCase();
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}

export const actionLabel = (action) => keyLabel(settings.bindings[action]);
