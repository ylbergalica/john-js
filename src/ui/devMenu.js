// Dev tools (dev builds only), opened with ` at the top left: one-shot actions, which
// close the menu, and switches (devFlags), which stay put. Actions and switches with a key
// keep it as a hotkey while the menu is closed. Switches that change the rules stay listed in the
// corner while on, so they aren't forgotten.
import { h } from './dom.js';
import { keycap } from './common.js';
import { devFlags, setDevFlag } from '../game/devFlags.js';

// Line icons, one per tool, drawn in currentColor on a 24-unit grid.
const ICONS = {
  heal: '<path d="M9 4h6v5h5v6h-5v5H9v-5H4V9h5z"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/>',
  adrenaline: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  core: '<path d="M12 3l8 9-8 9-8-9z"/><path d="M12 8.5l3 3.5-3 3.5-3-3.5z"/>',
  floor: '<path d="M3 5h4.5v4.5H12V14h4.5v4.5H21"/>',
  skull: '<path d="M5 11a7 7 0 1 1 14 0v4h-2v4H7v-4H5z"/><circle cx="9.5" cy="11" r="1.5"/><circle cx="14.5" cy="11" r="1.5"/><path d="M10.5 19v-2M13.5 19v-2"/>',
  spawn: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M19 8v6M16 11h6"/>',
  readout: '<path d="M5 20V11M12 20V4M19 20v-7"/>',
  shield: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/>',
  noDamage: '<path d="M20 4 9.5 14.5M6.5 11.5l6 6M8 16l-4 4"/><path d="M4 4l16 16"/>',
  ghost: '<path d="M6 20V10a6 6 0 0 1 12 0v10l-2-2-2 2-2-2-2 2-2-2z"/><circle cx="10" cy="10" r="1"/><circle cx="14" cy="10" r="1"/>',
  unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
  hitboxes: '<path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><circle cx="12" cy="12" r="3"/>',
  speed: '<path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4-5"/>',
};
const icon = (name) => {
  const el = h('span', { class: 'tool-icon' });
  el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
  return el;
};

const ACTIONS = [
  { icon: 'heal', label: 'Heal', key: 'KeyH', run: (s, p) => p?.heal(p.maxHealth) },
  { icon: 'refresh', label: 'Refresh cooldowns', key: 'KeyR', run: (s, p) => p?.aspects.refreshCooldowns() },
  { icon: 'adrenaline', label: 'Fill adrenaline', run: (s) => s.world.adrenaline.add(99999) },
  { icon: 'core', label: 'Collect a core', run: (s) => s.world.cores.collected++ },
  { icon: 'floor', label: 'Next floor', run: (s) => s.world.requestNextFloor() },
  { icon: 'skull', label: 'Kill player', run: (s, p) => p?.die() },
  { icon: 'spawn', label: 'Spawn enemies…', run: (s) => s.setMenu(s.spawnMenu) },
];

const SWITCHES = [
  { flag: 'combatReadout', icon: 'readout', label: 'Combat readout' },
  { flag: 'fullResistance', icon: 'shield', label: '100% resistance', badge: 'resist 100%' },
  { flag: 'noDamage', icon: 'noDamage', label: 'Deal no damage', badge: 'no damage' },
  { flag: 'noclip', icon: 'ghost', label: 'Noclip', badge: 'noclip', key: 'KeyG' },
  { flag: 'allEnemies', icon: 'unlock', label: 'Unlock all enemies' },
  { flag: 'hitboxes', icon: 'hitboxes', label: 'Show hitboxes', key: 'KeyB' },
];

export class DevMenu {
  constructor(corner, scene) {
    this.scene = scene;
    this.open = false;
    const actions = ACTIONS.map((a) => h('button', { class: 'tool', onclick: () => this.trigger(a) },
      icon(a.icon), h('span', { class: 'grow', text: a.label }), a.key ? keycap(a.key.slice(3)) : null));
    this.switches = SWITCHES.map((s) => {
      const b = h('button', { class: 'tool', onclick: () => this.flip(s) },
        icon(s.icon), h('span', { class: 'grow', text: s.label }), s.key ? keycap(s.key.slice(3)) : null, h('span', { class: 'check' }));
      return { s, b };
    });
    // Game speed: 0–1×, 0 freezes the world. Clicking the label snaps it back to 1×.
    this.speedValue = h('span', { class: 'speed-value' });
    this.speedSlider = h('input', { type: 'range', min: 0, max: 1, step: 0.05,
      oninput: () => this.setSpeed(Number(this.speedSlider.value)) });
    const speed = h('div', { class: 'tool-slider' },
      h('button', { class: 'tool', title: 'Reset to 1×', onclick: () => this.setSpeed(1) },
        icon('speed'), h('span', { class: 'grow', text: 'Game speed' }), this.speedValue),
      this.speedSlider);
    this.el = h('div', { class: 'tool-menu dev interactive hidden' },
      h('div', { class: 'tool-head' }, h('span', { text: 'Dev tools' }), keycap('`')),
      h('div', { class: 'tool-group' }, actions),
      h('div', { class: 'tool-rule' }),
      h('div', { class: 'tool-group' }, this.switches.map(({ b }) => b)),
      h('div', { class: 'tool-rule' }),
      speed,
    );
    this.badge = h('div', { class: 'tool-hint dev-badge' });
    corner.prepend(this.badge, this.el);
    this.sync();
  }

  setOpen(on) {
    this.open = on;
    this.el.classList.toggle('hidden', !on);
  }

  trigger(action) {
    this.scene.setMenu(null);
    action.run(this.scene, this.scene.world.livePlayer);
  }

  hotkey(code) {
    const action = ACTIONS.find((a) => a.key === code);
    if (action) action.run(this.scene, this.scene.world.livePlayer);
    const sw = SWITCHES.find((s) => s.key === code);
    if (sw) this.flip(sw);
  }

  flip({ flag }) {
    setDevFlag(flag, !devFlags[flag]);
    this.sync();
  }

  setSpeed(speed) {
    setDevFlag('gameSpeed', speed);
    this.sync();
  }

  sync() {
    for (const { s, b } of this.switches) b.classList.toggle('on', devFlags[s.flag]);
    const speed = devFlags.gameSpeed;
    const speedText = speed === 0 ? 'frozen' : `${speed}×`;
    this.speedSlider.value = speed;
    this.speedValue.textContent = speedText;
    const on = SWITCHES.filter((s) => s.badge && devFlags[s.flag]).map((s) => s.badge);
    if (speed !== 1) on.push(speed === 0 ? 'frozen' : `speed ${speedText}`);
    this.badge.textContent = on.length ? `dev: ${on.join(' · ')}` : '';
    this.badge.classList.toggle('hidden', !on.length);
  }

  destroy() {
    this.el.remove();
    this.badge.remove();
  }
}
