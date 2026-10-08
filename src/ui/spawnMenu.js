// Spawn menu: drops enemies near the player. The playground's own menu (Tab); in a dev
// build a run can open it from the dev menu too. Enemies show as portraits, regular mobs
// above and the larger, gold-framed guardians below; a type is listed once it has been
// killed in a run, or always with the dev tool that unlocks them all.
import { h } from './dom.js';
import { keycap } from './common.js';
import { ENEMY_TYPES } from '../data/config.js';
import { enemyIconUrls } from '../render/assets.js';
import { profile } from '../meta/profile.js';
import { devFlags } from '../game/devFlags.js';

export class SpawnMenu {
  constructor(corner, world, { hotkey = null } = {}) {
    this.world = world;
    this.open = false;
    this.mobs = h('div', { class: 'spawn-grid mobs' });
    this.split = h('div', { class: 'tool-rule' });
    this.guardians = h('div', { class: 'spawn-grid guardians' });
    this.empty = h('div', { class: 'spawn-empty', text: 'Kill enemies in a run to spawn them here.' });
    this.el = h('div', { class: 'tool-menu interactive hidden' },
      h('div', { class: 'tool-head' }, h('span', { text: 'Spawn' }), hotkey ? keycap(hotkey) : null),
      this.mobs, this.split, this.guardians, this.empty,
      h('div', { class: 'tool-rule' }),
      h('button', { class: 'tool', onclick: () => world.clearEnemies() }, h('span', { class: 'grow', text: 'Clear enemies' })),
    );
    // While closed, a reminder of the hotkey.
    this.hint = hotkey ? h('div', { class: 'tool-hint' }, keycap(hotkey), h('span', { text: 'Spawn enemies' })) : null;
    corner.append(...[this.hint, this.el].filter(Boolean));
  }

  setOpen(on) {
    this.open = on;
    this.el.classList.toggle('hidden', !on);
    if (on) this.refresh();
  }

  refresh() {
    const unlocked = Object.entries(ENEMY_TYPES).filter(([key]) => devFlags.allEnemies || profile.hasKilled(key));
    const tile = ([key, type]) => h('button', { class: 'spawn-tile', 'aria-label': type.name, onclick: () => this.world.summonEnemy(key) },
      h('img', { src: enemyIconUrls[key], alt: '' }));
    const mobs = unlocked.filter(([, t]) => !t.isChaser).map(tile);
    const guardians = unlocked.filter(([, t]) => t.isChaser).map(tile);
    this.mobs.replaceChildren(...mobs);
    this.guardians.replaceChildren(...guardians);
    this.mobs.classList.toggle('hidden', !mobs.length);
    this.guardians.classList.toggle('hidden', !guardians.length);
    this.split.classList.toggle('hidden', !mobs.length || !guardians.length);
    this.empty.classList.toggle('hidden', unlocked.length > 0);
  }

  destroy() {
    this.el.remove();
    this.hint?.remove();
  }
}
