// Main menu: start a run or the playground, manage the aspect loadout, buy tier
// boxes, reveal unlocks, and show hover tooltips. Esc backs out of open panels.
import { h } from './dom.js';
import { TIERS, HUD, MAX_EQUIPPED_ASPECTS, ASPECTS } from '../data/config.js';
import { iconUrls } from '../render/assets.js';
import { profile } from '../meta/profile.js';
import { sfx } from '../audio/sfx.js';
import { coinIcon, keycap, easeOut, replay, mistFx } from './common.js';
import { sky } from './sky.js';

const tierOf = (a) => TIERS.find((t) => t.tier === a.tier);
const COIN_COUNT_TIME = 0.6; // seconds the coin counter takes to roll to a new balance
const TOAST_TIME = 2.6;
const REVEAL_GUARD = 0.6; // seconds before a key or click can dismiss an unlock
const DRAG_START = 6; // pixels the pointer moves before a press on an aspect becomes a drag
const CONTROLS = [
  ['WASD', 'Move'], ['Mouse', 'Aim'], ['LMB', 'Attack'], ['RMB', 'Parry'], ['Shift', 'Dash'],
  ['X', 'Exalted'], ['1 2 3', 'Aspects'], ['Esc', 'Pause'], ['M', 'Mute'],
];

const setTier = (el, a) => { el.style.setProperty('--tier', a ? tierOf(a).color : null); return el; };

export class MenuScene {
  constructor(root, { onStartRun, onPlayground }) {
    this.coinValues = []; // every balance readout (main menu, shop), rolled together
    this.coinShown = profile.coins;
    this.coinTween = null;
    this.toast = h('div', { class: 'toast hidden' });
    this.revealListeners = null;

    // Staggered entrance: each piece rises in a beat after the one before.
    let beat = 0;
    const rise = (el) => { el.classList.add('rise'); el.style.setProperty('--d', `${0.35 + beat++ * 0.07}s`); return el; };
    const coinPill = () => {
      const value = h('span', { class: 'coin-amount' });
      this.coinValues.push(value);
      return h('div', { class: 'coin-pill' }, coinIcon(), value);
    };

    // The loadout on the main menu is a glance only: hover for details.
    this.loadoutSlots = Array.from({ length: MAX_EQUIPPED_ASPECTS }, (_, i) => {
      const el = h('div', { class: 'loadout-slot' });
      this.attachTooltip(el, () => profile.loadout()[i]);
      return el;
    });
    const main = h('div', { class: 'menu interactive' },
      h('h1', { class: 'menu-title title-in', text: 'Starspite' }),
      h('div', { class: 'rule menu-rule' }, '✦'),
      h('div', { class: 'main-buttons' },
        rise(h('button', { class: 'primary', text: 'Start Run', onclick: onStartRun })),
        rise(h('button', { text: 'Playground', onclick: onPlayground })),
        rise(h('button', { text: 'Aspects', onclick: () => this.openAspects() })),
        window.desktop ? rise(h('button', { text: 'Quit', onclick: () => window.desktop.quit() })) : null,
      ),
      rise(h('div', { class: 'loadout' },
        h('div', { class: 'loadout-slots' }, this.loadoutSlots),
      )),
      rise(coinPill()),
    );

    // Aspects: the equipped slots as three icons spread in a triangle on the left (click
    // one to unequip), the collection scrolling on the right (click to equip/unequip).
    // Aspects can also be dragged: onto a slot to equip them there, between slots to swap,
    // or from a slot back to the collection to unequip.
    this.slotButtons = Array.from({ length: MAX_EQUIPPED_ASPECTS }, (_, i) => {
      const b = h('button', { class: `slot s${i}`, onclick: () => this.clicked() && this.unequipSlot(i) });
      this.attachTooltip(b, () => profile.loadout()[i]);
      this.draggable(b, () => profile.loadout()[i], true);
      return b;
    });
    this.list = h('div', { class: 'aspect-list' });
    this.collectionSide = h('section', { class: 'collection-side' }, h('div', { class: 'eyebrow', text: 'Collection' }), this.list);
    this.drag = null;
    this.aspectsPanel = h('div', { class: 'panel interactive hidden' },
      h('div', { class: 'panel-card aspects-card' },
        h('header', { class: 'panel-head' }, h('h2', { text: 'Aspects' })),
        h('div', { class: 'aspects-body' },
          h('section', { class: 'loadout-side' }, h('div', { class: 'eyebrow', text: 'Loadout' }), h('div', { class: 'slots' }, this.slotButtons)),
          this.collectionSide,
        ),
        h('div', { class: 'panel-actions' },
          h('button', { class: 'primary', text: 'Request Aspect', onclick: () => this.openShop() }),
          h('button', { text: 'Back', onclick: () => this.closeAspects() }),
        ),
      ),
    );

    // Shop: one card per tier, its gem floating in its tier's rising mist and embers;
    // each holds that tier's aspects not yet unlocked.
    this.boxes = TIERS.map(({ tier, name, color }) => {
      const price = h('div', { class: 'box-price coin-amount' });
      const button = h('button', { class: 'box', onclick: () => this.buyTierBox(tier) },
        h('div', { class: 'box-stage' },
          mistFx('box-mist', { puffs: 24, embers: 10, x: [0.15, 0.85], y: [0.45, 0.9], size: [46, 84], dur: [2.2, 3.6], emberDur: [1.6, 2.8] }),
          h('img', { class: 'box-gem', src: iconUrls[`gem_${name.toLowerCase()}`], alt: '' }),
          [0, 1, 2].map((i) => h('span', { class: `box-glint g${i}` })),
        ),
        h('div', { class: 'box-name', text: name }),
        price,
      );
      button.style.setProperty('--tier', color);
      return { tier, button, price };
    });
    this.shopPanel = h('div', { class: 'panel shop interactive hidden' },
      h('div', { class: 'panel-card' },
        h('header', { class: 'panel-head' },
          h('div', {}, h('div', { class: 'eyebrow', text: 'Unlock a random aspect' }), h('h2', { text: 'Request' })),
        ),
        h('div', { class: 'boxes' }, this.boxes.map((b) => b.button)),
        coinPill(),
        h('div', { class: 'panel-actions' }, h('button', { text: 'Back', onclick: () => this.closeShop() })),
      ),
    );

    this.revealPanel = h('div', { class: 'reveal interactive hidden' });
    this.tooltip = h('div', { class: 'tooltip hidden' });

    const hint = h('div', { class: 'hint' },
      CONTROLS.map(([key, action]) => h('span', {}, keycap(key), action)),
      import.meta.env.DEV ? h('div', { class: 'hint-dev', text: 'Dev: ` tools · H heal · R refresh aspects · G noclip' }) : null,
    );
    rise(hint);

    this.el = h('div', { class: 'menu-screen' },
      sky(), main, hint, this.aspectsPanel, this.shopPanel, this.revealPanel, this.toast, this.tooltip,
    );
    root.append(this.el);

    this.listeners = new AbortController();
    const { signal } = this.listeners;
    window.addEventListener('keydown', (e) => this.onKey(e), { signal });
    window.addEventListener('pointermove', (e) => this.dragMove(e), { signal });
    window.addEventListener('pointerup', (e) => this.dragEnd(e), { signal });
    window.addEventListener('pointercancel', () => this.dragEnd(null), { signal });
    window.addEventListener('blur', () => this.dragEnd(null), { signal });
    this.el.addEventListener('dragstart', (e) => e.preventDefault()); // no native image drag
    this.refresh();
  }

  frame(dt) {
    const tw = this.coinTween;
    if (tw) {
      tw.t = Math.min(COIN_COUNT_TIME, tw.t + dt);
      this.coinShown = Math.round(tw.from + (tw.to - tw.from) * easeOut(tw.t / COIN_COUNT_TIME));
      this.showCoins(this.coinShown);
      if (tw.t >= COIN_COUNT_TIME) this.coinTween = null;
    }
  }

  // Brief message over everything, e.g. why a purchase failed.
  setStatus(msg) {
    clearTimeout(this.toastTimer);
    this.toast.classList.toggle('hidden', !msg);
    if (!msg) return;
    this.toast.textContent = msg;
    replay(this.toast, 'show');
    this.toastTimer = setTimeout(() => this.toast.classList.add('hidden'), TOAST_TIME * 1000);
  }

  onKey(e) {
    if (e.code !== 'Escape' || e.repeat || !this.revealPanel.classList.contains('hidden')) return;
    if (!this.shopPanel.classList.contains('hidden')) this.closeShop();
    else if (!this.aspectsPanel.classList.contains('hidden')) this.closeAspects();
    else return;
    sfx.play('click');
  }

  openAspects() { this.hideTooltip(); this.aspectsPanel.classList.remove('hidden'); this.refresh(); }
  closeAspects() { this.dragEnd(null); this.aspectsPanel.classList.add('hidden'); this.closeShop(); this.hideTooltip(); }
  openShop() { this.hideTooltip(); this.shopPanel.classList.remove('hidden'); this.refresh(); }
  closeShop() { this.shopPanel.classList.add('hidden'); }

  buyTierBox(tier) {
    const res = profile.buyTierBox(tier);
    if (!res.ok) { sfx.play('deny'); this.setStatus(res.reason); this.refresh(); return; }
    this.closeShop();
    this.refresh();
    this.openReveal(res.aspect);
  }

  toggleEquip(id) {
    if (!profile.toggleEquip(id)) { sfx.play('deny'); this.setStatus('Loadout full. Unequip one first.'); }
    this.hideTooltip(); // its tile is rebuilt
    this.refresh();
  }

  unequipSlot(i) {
    const a = profile.loadout()[i];
    if (!a) return;
    profile.unequip(a.id);
    this.hideTooltip();
    this.refresh();
  }

  refresh() {
    this.refreshCoins();
    this.refreshShop();
    this.refreshList();
    this.refreshSlots();
  }

  // Rolls the counter to a new balance (a purchase) instead of jumping.
  refreshCoins() {
    const to = profile.coins;
    if (to === this.coinShown && !this.coinTween) { this.showCoins(to); return; }
    if (this.coinTween?.to === to) return;
    this.coinTween = { from: this.coinShown, to, t: 0 };
  }

  showCoins(n) { for (const v of this.coinValues) v.textContent = n; }

  refreshShop() {
    for (const { tier, button, price } of this.boxes) {
      const soldOut = !profile.hasLockedInTier(tier);
      button.disabled = !profile.canBuyTier(tier);
      button.classList.toggle('sold-out', soldOut);
      button.classList.toggle('cant-afford', !soldOut && profile.coins < profile.priceForTier(tier));
      price.replaceChildren(...(soldOut ? ['Sold out'] : [coinIcon(), String(profile.priceForTier(tier))]));
    }
  }

  refreshList() {
    const unlocked = ASPECTS.filter((a) => profile.isUnlocked(a.id))
      .sort((a, b) => a.tier - b.tier || a.displayName.localeCompare(b.displayName));
    // Icons only; the tooltip carries the name and details, and a click equips or unequips.
    this.list.replaceChildren(...unlocked.map((a) => {
      const equipped = profile.isEquipped(a.id);
      const canEquip = equipped || profile.canEquipMore();
      const tile = h('button', { class: `collection-tile${equipped ? ' equipped' : ''}${canEquip ? '' : ' unavailable'}`, onclick: () => this.clicked() && this.toggleEquip(a.id) },
        h('img', { src: iconUrls[a.icon], alt: a.displayName }),
        equipped ? h('span', { class: 'tile-check', text: '✓' }) : null,
      );
      this.attachTooltip(tile, () => a);
      this.draggable(tile, () => a, false);
      return setTier(tile, a);
    }));
  }

  refreshSlots() {
    const eq = profile.loadout();
    this.slotButtons.forEach((b, i) => {
      const a = eq[i];
      b.disabled = !a;
      b.classList.toggle('empty', !a);
      setTier(b, a).replaceChildren(...(a ? [h('img', { src: iconUrls[a.icon], alt: a.displayName })] : []));
    });
    this.loadoutSlots.forEach((b, i) => {
      const a = eq[i];
      b.classList.toggle('empty', !a);
      b.title = a ? '' : 'Empty slot';
      setTier(b, a).replaceChildren(...(a ? [h('img', { src: iconUrls[a.icon], alt: a.displayName })] : []));
    });
  }

  // Full-screen unlock card, built fresh so its entrance plays every time; the next
  // key press or click (after a short guard) dismisses it.
  openReveal(a) {
    const tier = tierOf(a);
    this.revealPanel.replaceChildren(
      h('div', { class: 'eyebrow reveal-kicker', text: `${tier.name} aspect unlocked` }),
      h('div', { class: 'reveal-stage' },
        mistFx('reveal-mist', { puffs: 30, embers: 22, x: [0.08, 0.92], y: [0.35, 0.95], size: [70, 140], dur: [2.6, 4.2], emberSize: [2, 4], emberDur: [1.8, 3.2] }),
        h('img', { class: 'reveal-icon', src: iconUrls[a.icon], alt: '' }),
      ),
      h('div', { class: 'reveal-name title-in', text: a.displayName }),
      a.quote ? h('div', { class: 'reveal-quote', text: `"${a.quote}"` }) : null,
      h('div', { class: 'reveal-desc', text: a.description }),
      h('div', { class: 'reveal-continue', text: 'Press any key to continue' }),
    );
    setTier(this.revealPanel, a).classList.remove('hidden');
    sfx.play('unlock');
    this.revealListeners = new AbortController();
    const opts = { signal: this.revealListeners.signal };
    const openedAt = performance.now();
    const close = () => { if (performance.now() - openedAt >= REVEAL_GUARD * 1000) this.closeReveal(); };
    window.addEventListener('keydown', close, opts);
    window.addEventListener('pointerdown', close, opts);
  }

  closeReveal() {
    this.revealListeners?.abort();
    this.revealListeners = null;
    this.revealPanel.classList.add('hidden');
    this.refresh();
  }

  // A press on an aspect that moves far enough picks it up; the icon follows the pointer
  // and the slot (or the collection, for a slotted aspect) under it lights up as the drop.
  draggable(el, getAspect, fromSlot) {
    el.addEventListener('pointerdown', (e) => {
      this.justDragged = false;
      const a = e.button === 0 && getAspect();
      if (a) this.drag = { a, el, fromSlot, x: e.clientX, y: e.clientY, ghost: null, target: null };
    });
  }

  dragMove(e) {
    const d = this.drag;
    if (!d) return;
    if (!d.ghost) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < DRAG_START) return;
      this.hideTooltip();
      d.ghost = setTier(h('div', { class: 'drag-ghost' }, h('img', { src: iconUrls[d.a.icon], alt: '' })), d.a);
      d.el.classList.add('drag-source');
      this.el.classList.add('dragging');
      this.el.append(d.ghost);
    }
    d.ghost.style.left = `${e.clientX}px`;
    d.ghost.style.top = `${e.clientY}px`;
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const slot = this.slotButtons.findIndex((b) => b.contains(under));
    d.target = slot >= 0 ? slot : d.fromSlot && this.collectionSide.contains(under) ? 'collection' : null;
    this.slotButtons.forEach((b, i) => b.classList.toggle('drop-target', d.target === i));
    this.collectionSide.classList.toggle('drop-target', d.target === 'collection');
  }

  // Drops the dragged aspect (e is null to cancel). The click that follows a drag (released
  // over its own slot) is swallowed, until the next press.
  dragEnd(e) {
    const d = this.drag;
    this.drag = null;
    if (!d?.ghost) return;
    d.ghost.remove();
    d.el.classList.remove('drag-source');
    this.el.classList.remove('dragging');
    this.slotButtons.forEach((b) => b.classList.remove('drop-target'));
    this.collectionSide.classList.remove('drop-target');
    this.justDragged = true;
    if (!e || d.target === null) return;
    if (d.target === 'collection') profile.unequip(d.a.id);
    else profile.equip(d.a.id, d.target);
    sfx.play('click');
    this.refresh();
  }

  clicked() { return !this.justDragged; }

  // Tooltip after a short hover, kept on screen.
  attachTooltip(el, getData) {
    el.addEventListener('mouseenter', () => {
      this.hideTooltip();
      if (this.drag?.ghost) return;
      const data = getData();
      if (data) this.tooltipTimer = setTimeout(() => this.showTooltip(data, el), HUD.tooltipHoverDelay * 1000);
    });
    el.addEventListener('mouseleave', () => this.hideTooltip());
  }

  showTooltip(a, anchor) {
    const t = this.tooltip;
    t.replaceChildren(...[
      h('div', { class: 't-head' },
        h('img', { class: 't-icon', src: iconUrls[a.icon], alt: '' }),
        h('div', { class: 't-name', text: a.displayName }),
      ),
      a.quote && h('div', { class: 't-quote', text: `"${a.quote}"` }),
      h('div', { class: 't-desc', text: a.description }),
    ].filter(Boolean));
    setTier(t, a).classList.remove('hidden');
    const r = anchor.getBoundingClientRect(), tr = t.getBoundingClientRect();
    const pad = 12, gap = 12;
    const x = Math.min(Math.max(r.left + r.width / 2 - tr.width / 2, pad), innerWidth - pad - tr.width);
    let y = r.top - gap - tr.height;
    if (y < pad) y = r.bottom + gap;
    t.style.left = `${x}px`;
    t.style.top = `${Math.min(Math.max(y, pad), innerHeight - pad - tr.height)}px`;
  }

  hideTooltip() {
    clearTimeout(this.tooltipTimer);
    this.tooltip.classList.add('hidden');
  }

  destroy() {
    this.listeners.abort();
    this.revealListeners?.abort();
    clearTimeout(this.toastTimer);
    this.hideTooltip();
    this.el.remove();
  }
}
