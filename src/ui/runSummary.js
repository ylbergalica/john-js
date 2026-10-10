// End-of-run screen. Panels for the run itself (floor, time, Exalted, aspect stats),
// slain enemies, slain guardians and achievements, then the total coins earned.
// Everything is revealed step by step with counting numbers; any key or click skips
// to the end. Tiles wrap, so long runs with many enemy types stay compact.
import { h } from './dom.js';
import { ENEMY_TYPES } from '../data/config.js';
import { enemyIconUrls, iconUrls } from '../render/assets.js';
import { profile } from '../meta/profile.js';
import { sfx } from '../audio/sfx.js';
import { coinIcon, easeOut, formatTime } from './common.js';

const SKIP_GUARD = 0.5; // seconds before input can skip, so a key held while dying doesn't
const TICK_INTERVAL = 0.05; // fastest a counter ticks, seconds
const TILE_STAGGER = 0.09; // between tiles popping in; shrinks so a full panel takes ≤ TILES_MAX
const TILES_MAX = 1.2;

const times = (n) => `×${n}`;
// Bigger numbers count for longer, within limits.
const countDuration = (n, max = 1) => Math.min(max, 0.3 + Math.abs(n) * 0.03);

export class RunSummary {
  constructor(root, { session, onMenu }) {
    const { stats, floor, adrenaline } = session;
    this.onMenu = onMenu;
    this.t = 0;
    this.lastTick = -Infinity;
    this.skipping = false;
    this.done = false;
    this.beats = [];
    this.cursor = 0; // timeline position while beats are added

    // ── layout ──
    this.title = h('h1', { class: 'rs-title', text: 'You Died' });
    const panel = (cls) => {
      const body = h('div', { class: 'rs-tiles' });
      return { el: h('section', { class: `rs-panel ${cls} rs-pending` }, body), body };
    };
    const run = panel('rs-run');
    const enemies = panel('rs-enemies');
    const guardians = panel('rs-guardians');
    const achievements = panel('rs-achievements');
    this.coinTotal = h('span', { class: 'rs-coin-total', text: '+0' });
    const coins = h('div', { class: 'rs-coins rs-pending' }, h('div', { class: 'rs-coin-line' }, coinIcon(), this.coinTotal));
    this.el = h('div', { class: 'run-summary interactive' },
      h('div', { class: 'rs-card' },
        this.title,
        h('div', { class: 'rs-grid' }, run.el, enemies.el, guardians.el, achievements.el),
        coins,
        h('div', { class: 'rs-actions' }, h('button', { text: 'Main Menu', onclick: () => this.onMenu() })),
      ),
      h('div', { class: 'rs-hint', text: 'Click or press any key to skip' }),
    );
    root.append(this.el);

    // ── timeline ──
    this.beat(0.15, 0.9, { start: () => { this.title.classList.add('in'); this.sound('summary'); } });

    // Run: floor, time, Exalted, then each equipped aspect's uses or hits (its AspectStat).
    this.showPanel(0.1, run.el);
    this.tiles(run.body, [
      this.statTile('Floor', floor),
      this.statTile('Time', Math.floor(stats.timeSurvived), formatTime),
      this.statTile('Exalted', adrenaline.uses, times),
      ...profile.equippedAspects().map((a) => this.iconTile(iconUrls[a.icon], stats.aspectCounts[a.id] ?? 0, 'rs-aspect', a.stat.label)),
    ]);

    // Slain, most killed first, guardians apart from the rest.
    const slain = Object.keys(stats.kills).filter((k) => ENEMY_TYPES[k]).sort((a, b) => stats.kills[b] - stats.kills[a]);
    const killTiles = (guardian) => slain.filter((k) => !!ENEMY_TYPES[k].isChaser === guardian)
      .map((k) => this.iconTile(enemyIconUrls[k], stats.kills[k], 'rs-enemy'));
    this.showPanel(0.2, enemies.el);
    this.tiles(enemies.body, killTiles(false));
    this.showPanel(0.2, guardians.el);
    this.tiles(guardians.body, killTiles(true));
    this.showPanel(0.2, achievements.el);
    this.tiles(achievements.body, []);

    // Coins: the run's total climbs from zero.
    const total = Object.values(stats.coins).reduce((sum, n) => sum + n, 0);
    this.show(0.3, coins, { dur: countDuration(total, 1.6), run: this.counter(this.coinTotal, 0, total, (v) => `+${v}`, 'coin') });
    this.beat(0.05, 0, { start: () => { coins.classList.add('banked'); if (total > 0) this.sound('bank'); } });

    this.listeners = new AbortController();
    const opts = { signal: this.listeners.signal };
    window.addEventListener('keydown', (e) => this.onKey(e), opts);
    this.el.addEventListener('pointerdown', (e) => { if (!e.target.closest('button')) this.skip(); }, opts);
  }

  // ── builders ──
  // A beat starts `gap` after the previous beat's hold ends and animates over `dur`:
  // start() once, then run(p) with p going 0 → 1. `hold` (default `dur`) is how long
  // the next beat waits, so beats with a short hold overlap.
  beat(gap, dur, { start, run } = {}, hold = dur) {
    this.cursor += gap;
    this.beats.push({ at: this.cursor, dur, start, run, started: false, finished: false });
    this.cursor += hold;
  }

  // Reveals an element (rendered hidden with .rs-pending) when its beat comes.
  show(gap, el, { sound = 'reveal', soundOpts, dur = 0, run, hold } = {}) {
    this.beat(gap, dur, { start: () => { el.classList.remove('rs-pending'); this.sound(sound, soundOpts); }, run }, hold);
  }

  showPanel(gap, el) { this.show(gap, el, { dur: 0.25 }); }

  // Pops tiles in one after another, each counting up while the next appears.
  tiles(container, tiles) {
    const stagger = Math.min(TILE_STAGGER, TILES_MAX / tiles.length);
    tiles.forEach(({ el, run, dur }, i) => {
      container.append(el);
      const last = i === tiles.length - 1;
      this.show(i === 0 ? 0.05 : 0, el, {
        soundOpts: { volume: 0.6, pitch: 1.1 + 0.3 * (i / tiles.length) }, dur, run, hold: last ? dur : stagger,
      });
    });
  }

  // A big number counting up over a small caption.
  statTile(label, value, format = String) {
    const num = h('span', { class: 'rs-num', text: format(0) });
    const el = h('div', { class: 'rs-tile rs-stat rs-pending' }, num, h('span', { class: 'rs-caption', text: label }));
    return { el, dur: countDuration(value, 0.8), run: this.counter(num, 0, value, format, 'tally') };
  }

  // An icon over a ×count, with an optional hover label saying what's counted.
  iconTile(src, count, cls, tip = null) {
    const num = h('span', { class: 'rs-count', text: times(0) });
    const el = h('div', { class: `rs-tile ${cls} rs-pending` }, h('img', { src, alt: '' }), num);
    if (tip) el.dataset.tip = tip;
    return { el, dur: countDuration(count, 0.8), run: this.counter(num, 0, count, times, 'tally') };
  }

  // run(p) for a beat: writes the eased count, ticking as it climbs and popping at the end.
  counter(el, from, to, format, tick) {
    let shown = from;
    return (p) => {
      const n = Math.round(from + (to - from) * easeOut(p));
      if (n !== shown) {
        shown = n;
        el.textContent = format(n);
        if (this.t - this.lastTick >= TICK_INTERVAL) {
          this.lastTick = this.t;
          this.sound(tick, { pitch: 1 + 0.6 * p, jitter: 0.02 });
        }
      }
      if (p >= 1 && to !== from) el.classList.add('pop');
    };
  }

  // ── playback ──
  update(dt) {
    if (this.done) return;
    this.t += dt;
    let pending = false;
    for (const b of this.beats) {
      if (this.t < b.at) { pending = true; break; }
      if (!b.started) { b.started = true; b.start?.(); }
      if (b.finished) continue;
      const p = b.dur > 0 ? Math.min(1, (this.t - b.at) / b.dur) : 1;
      b.run?.(p);
      if (p >= 1) b.finished = true;
      else pending = true;
    }
    if (!pending) this.finish();
  }

  // Plays every remaining beat to its end at once, silently.
  skip() {
    if (this.done || this.t < SKIP_GUARD) return;
    this.skipping = true;
    this.t = Infinity;
    this.update(0);
    this.skipping = false;
  }

  finish() {
    this.done = true;
    this.el.classList.add('done');
  }

  sound(name, opts) { if (name && !this.skipping) sfx.play(name, opts); }

  onKey(e) {
    if (e.repeat) return;
    if (!this.done) this.skip();
    else if (e.code === 'Enter' || e.code === 'Escape') this.onMenu();
  }

  destroy() {
    this.listeners.abort();
    this.el.remove();
  }
}
