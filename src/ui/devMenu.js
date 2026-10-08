// Dev tools (dev builds only), opened with ` at the top left: one-shot actions, which
// close the menu, and switches (devFlags), which stay put. Actions and switches with a key
// keep it as a hotkey while the menu is closed. Switches that change the rules stay listed in the
// corner while on, so they aren't forgotten.
import { h } from './dom.js';
import { keycap } from './common.js';
import { devFlags, setDevFlag } from '../game/devFlags.js';

const ACTIONS = [
  { label: 'Heal', key: 'KeyH', run: (s, p) => p?.heal(p.maxHealth) },
  { label: 'Refresh cooldowns', key: 'KeyR', run: (s, p) => p?.aspects.refreshCooldowns() },
  { label: 'Fill adrenaline', run: (s) => s.world.adrenaline.add(99999) },
  { label: 'Collect a core', run: (s) => s.world.cores.collected++ },
  { label: 'Next floor', run: (s) => s.world.requestNextFloor() },
  { label: 'Kill player', run: (s, p) => p?.die() },
  { label: 'Spawn enemies…', run: (s) => s.setMenu(s.spawnMenu) },
];

const SWITCHES = [
  { flag: 'combatReadout', label: 'Combat readout' },
  { flag: 'fullResistance', label: '100% resistance', badge: 'resist 100%' },
  { flag: 'noDamage', label: 'Deal no damage', badge: 'no damage' },
  { flag: 'noclip', label: 'Noclip', badge: 'noclip', key: 'KeyG' },
  { flag: 'allEnemies', label: 'Unlock all enemies' },
];

export class DevMenu {
  constructor(corner, scene) {
    this.scene = scene;
    this.open = false;
    const actions = ACTIONS.map((a) => h('button', { class: 'tool', onclick: () => this.trigger(a) },
      h('span', { class: 'grow', text: a.label }), a.key ? keycap(a.key.slice(3)) : null));
    this.switches = SWITCHES.map((s) => {
      const b = h('button', { class: 'tool', onclick: () => this.flip(s) },
        h('span', { class: 'check' }), h('span', { class: 'grow', text: s.label }), s.key ? keycap(s.key.slice(3)) : null);
      return { s, b };
    });
    this.el = h('div', { class: 'tool-menu dev interactive hidden' },
      h('div', { class: 'tool-head' }, h('span', { text: 'Dev tools' }), keycap('`')),
      h('div', { class: 'tool-group' }, actions),
      h('div', { class: 'tool-rule' }),
      h('div', { class: 'tool-group' }, this.switches.map(({ b }) => b)),
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

  sync() {
    for (const { s, b } of this.switches) b.classList.toggle('on', devFlags[s.flag]);
    const on = SWITCHES.filter((s) => s.badge && devFlags[s.flag]).map((s) => s.badge);
    this.badge.textContent = on.length ? `dev: ${on.join(' · ')}` : '';
    this.badge.classList.toggle('hidden', !on.length);
  }

  destroy() {
    this.el.remove();
    this.badge.remove();
  }
}
