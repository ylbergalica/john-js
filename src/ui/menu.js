// Main menu: start a run or the playground, manage the aspect loadout, buy tier
// boxes, reveal unlocks, and show hover tooltips.
import { h } from './dom.js';
import { TIERS, HUD, MAX_EQUIPPED_ASPECTS, ASPECTS } from '../data/config.js';
import { iconUrls } from '../render/assets.js';
import { profile } from '../meta/profile.js';

const tierOf = (a) => TIERS.find((t) => t.tier === a.tier);

export class MenuScene {
  constructor(root, { onStartRun, onPlayground }) {
    this.coins = h('div', { class: 'coins' });
    this.status = h('div', { class: 'status' });
    this.revealListeners = null;

    const main = h('div', { class: 'menu interactive' },
      h('h1', { text: 'JOHN' }),
      h('div', { class: 'main-buttons' },
        h('button', { text: 'Start Run', onclick: onStartRun }),
        h('button', { text: 'Aspects', onclick: () => this.openAspects() }),
        h('button', { text: 'Playground', onclick: onPlayground }),
      ),
      this.status,
    );

    this.slotButtons = Array.from({ length: MAX_EQUIPPED_ASPECTS }, (_, i) => {
      const b = h('button', { class: 'slot', onclick: () => this.unequipSlot(i) });
      this.attachTooltip(b, () => profile.equippedAspects()[i]);
      return b;
    });
    this.list = h('div', { class: 'aspect-list' });
    this.aspectsPanel = h('div', { class: 'panel interactive hidden' },
      h('h2', { text: 'Aspects' }),
      h('div', { class: 'slots' }, this.slotButtons),
      this.list,
      h('div', { class: 'row' },
        h('button', { text: 'Request Aspect', onclick: () => this.openShop() }),
        h('button', { text: 'Back', onclick: () => this.closeAspects() }),
      ),
    );

    this.boxButtons = TIERS.map(({ tier }) => h('button', { onclick: () => this.buyTierBox(tier) }));
    this.shopPanel = h('div', { class: 'panel shop interactive hidden' },
      h('h2', { text: 'Request Aspect' }),
      h('div', { class: 'boxes' }, this.boxButtons),
      h('button', { text: 'Back', onclick: () => this.closeShop() }),
    );

    this.revealIcon = h('img', { alt: '' });
    this.revealName = h('div', { class: 'name' });
    this.revealQuote = h('div', { class: 'quote' });
    this.revealDesc = h('div', { class: 'desc' });
    this.revealPanel = h('div', { class: 'reveal interactive hidden' },
      this.revealIcon, this.revealName, this.revealQuote, this.revealDesc,
      h('div', { class: 'continue', text: 'Press any key to continue' }),
    );

    this.tooltip = h('div', { class: 'tooltip hidden' });

    const devHint = import.meta.env.DEV ? '\nDev: K kill · H heal · L adrenaline · C core · N next floor · R refresh aspects' : '';
    this.el = h('div', {},
      main, this.coins,
      h('div', { class: 'hint', text: `WASD move · Mouse aim · LMB attack · RMB parry · Shift dash · X Exalted · 1/2/3 aspects · Esc pause${devHint}` }),
      this.aspectsPanel, this.shopPanel, this.revealPanel, this.tooltip,
    );
    root.append(this.el);
    this.refresh();
  }

  frame() {}

  setStatus(msg) { this.status.textContent = msg; }

  openAspects() { this.aspectsPanel.classList.remove('hidden'); this.refresh(); }
  closeAspects() { this.aspectsPanel.classList.add('hidden'); this.closeShop(); this.hideTooltip(); }
  openShop() { this.shopPanel.classList.remove('hidden'); this.refresh(); }
  closeShop() { this.shopPanel.classList.add('hidden'); }

  buyTierBox(tier) {
    const res = profile.buyTierBox(tier);
    if (!res.ok) { this.setStatus(res.reason); this.refresh(); return; }
    this.closeShop();
    this.refresh();
    this.openReveal(res.aspect);
  }

  toggleEquip(id) {
    this.setStatus(profile.toggleEquip(id) ? '' : 'Could not equip aspect.');
    this.refresh();
  }

  unequipSlot(i) {
    const a = profile.equippedAspects()[i];
    if (!a) return;
    profile.unequip(a.id);
    this.hideTooltip();
    this.refresh();
  }

  refresh() {
    this.coins.textContent = `Coins: ${profile.coins}`;
    this.refreshShop();
    this.refreshList();
    this.refreshSlots();
  }

  refreshShop() {
    TIERS.forEach(({ tier, name }, i) => {
      const b = this.boxButtons[i];
      b.disabled = !profile.canBuyTier(tier);
      b.textContent = `${name} Box\n${profile.hasLockedInTier(tier) ? `${profile.priceForTier(tier)} Coins` : 'SOLD OUT'}`;
    });
  }

  refreshList() {
    const unlocked = ASPECTS.filter((a) => profile.isUnlocked(a.id))
      .sort((a, b) => a.tier - b.tier || a.displayName.localeCompare(b.displayName));
    if (unlocked.length === 0) {
      this.list.replaceChildren(h('div', { class: 'empty-list', text: 'No aspects unlocked yet. Earn coins by defeating enemies, then request an aspect.' }));
      return;
    }
    this.list.replaceChildren(...unlocked.map((a) => {
      const equipped = profile.isEquipped(a.id);
      const canEquip = equipped || profile.canEquipMore();
      const [state, label] = equipped ? ['Equipped', 'Unequip'] : canEquip ? ['Unlocked', 'Equip'] : ['Max Equipped', 'Full'];
      const item = h('div', { class: `aspect-item${equipped ? ' equipped' : ''}${canEquip ? '' : ' unavailable'}` },
        h('img', { src: iconUrls[a.icon], alt: '' }),
        h('div', { class: 'meta' },
          h('div', { class: 'name', text: a.displayName }),
          h('div', { class: 'tier', text: tierOf(a).name }),
          h('div', { class: 'state', text: state }),
        ),
        h('button', { text: label, disabled: !canEquip, onclick: () => this.toggleEquip(a.id) }),
      );
      item.style.borderLeftColor = tierOf(a).color;
      this.attachTooltip(item, () => a);
      return item;
    }));
  }

  refreshSlots() {
    const eq = profile.equippedAspects();
    this.slotButtons.forEach((b, i) => {
      const a = eq[i];
      b.disabled = !a;
      b.replaceChildren(...(a
        ? [h('img', { src: iconUrls[a.icon], alt: '' }), h('span', { text: `Slot ${i + 1}: ${a.displayName}` })]
        : [h('span', { text: `Slot ${i + 1}: Empty` })]));
    });
  }

  // Full-screen unlock card; the next key press or click dismisses it.
  openReveal(a) {
    this.revealName.textContent = a.displayName;
    this.revealIcon.src = iconUrls[a.icon];
    this.revealQuote.textContent = a.quote ? `"${a.quote}"` : '';
    this.revealDesc.textContent = a.description;
    this.revealPanel.classList.remove('hidden');
    this.revealListeners = new AbortController();
    const opts = { signal: this.revealListeners.signal };
    window.addEventListener('keydown', () => this.closeReveal(), opts);
    window.addEventListener('pointerdown', () => this.closeReveal(), opts);
  }

  closeReveal() {
    this.revealListeners?.abort();
    this.revealListeners = null;
    this.revealPanel.classList.add('hidden');
    this.refresh();
  }

  // Tooltip after a short hover, kept on screen.
  attachTooltip(el, getData) {
    el.addEventListener('mouseenter', () => {
      this.hideTooltip();
      const data = getData();
      if (data) this.tooltipTimer = setTimeout(() => this.showTooltip(data, el), HUD.tooltipHoverDelay * 1000);
    });
    el.addEventListener('mouseleave', () => this.hideTooltip());
  }

  showTooltip(a, anchor) {
    const t = this.tooltip;
    t.replaceChildren(
      h('div', { class: 't-name', text: a.displayName }),
      a.quote ? h('div', { class: 't-quote', text: `"${a.quote}"` }) : null,
      h('div', { class: 't-desc', text: a.description }),
    );
    t.classList.remove('hidden');
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
    this.revealListeners?.abort();
    this.hideTooltip();
    this.el.remove();
  }
}
