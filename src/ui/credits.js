// Credits: who made the game and with what, rising in line by line over the sky while the
// main menu steps aside (settings-open, as for the settings). Esc or the back corner closes it.
import { h } from './dom.js';
import { backCorner, replay, logo } from './common.js';
import { sfx } from '../audio/sfx.js';

const LINE_STAGGER = 0.18; // seconds between lines rising in

// [role, name] pairs; a lone line stands apart.
const LINES = [
  ['A game by', 'flippy'],
  ['Built with', 'PixiJS · Vite · Electron'],
  ['Thank you for playing'],
];

export class CreditsPanel {
  constructor(root) {
    this.root = root;
    this.listeners = null;
    this.lines = LINES.map(([role, name]) => (name
      ? h('div', { class: 'credit' }, h('div', { class: 'credit-role', text: role }), h('div', { class: 'credit-name', text: name }))
      : h('div', { class: 'credit credit-end', text: role })));
    this.lines.forEach((el, i) => el.style.setProperty('--d', `${0.5 + i * LINE_STAGGER}s`));
    this.title = logo('credits-title title-in');
    this.el = h('div', { class: 'credits interactive hidden' },
      h('div', { class: 'credits-card' }, this.title, h('div', { class: 'rule credits-rule' }, '✦'), this.lines),
      backCorner(() => this.close()),
    );
    root.append(this.el);
  }

  get isOpen() { return !this.el.classList.contains('hidden'); }

  open() {
    if (this.isOpen) return;
    this.el.classList.remove('hidden');
    for (const el of [this.title, ...this.lines]) replay(el, el === this.title ? 'title-in' : 'credit');
    this.root.classList.add('settings-open');
    this.listeners = new AbortController();
    // Esc is the credits' alone while they're open.
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) { this.close(); sfx.play('click'); }
    }, { signal: this.listeners.signal, capture: true });
  }

  close() {
    if (!this.isOpen) return;
    this.listeners?.abort();
    this.listeners = null;
    this.el.classList.add('hidden');
    this.root.classList.remove('settings-open');
  }

  destroy() {
    this.close();
    this.el.remove();
  }
}
