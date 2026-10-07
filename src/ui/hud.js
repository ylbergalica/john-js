// In-run HUD (health, adrenaline, aspect cooldowns, cores, floor intro) and the
// pause menu. Reads world state each frame and only touches the DOM on change.
import { h, DomWriter } from './dom.js';
import { HUD, GAME } from '../data/config.js';
import { lerpColor } from '../engine/math.js';
import { iconUrls } from '../render/assets.js';
import { RunMode } from '../game/session.js';

const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;

export class Hud {
  constructor(root, scene) {
    this.scene = scene;
    this.dom = new DomWriter();
    this.cores = h('div', { class: 'hud-cores' });
    this.floorIntro = h('div', { class: 'floor-intro hidden' });
    this.icons = h('div', { class: 'aspect-icons' });
    this.healthFill = h('div', { class: 'fill' });
    this.health = h('div', { class: 'bar' }, this.healthFill);
    this.adrenalineFill = h('div', { class: 'fill adrenaline' });
    this.adrenaline = h('div', { class: 'bar' }, this.adrenalineFill);
    this.exaltedGlow = h('div', { class: 'exalted-glow' }); // dark-red screen edges while Exalted
    this.pausePanel = h('div', { class: 'pause hidden interactive' },
      h('button', { text: 'Resume', onclick: () => scene.resume() }),
      h('button', { text: 'Main Menu', onclick: () => scene.quitToMenu() }),
    );
    this.el = h('div', { class: 'hud' },
      this.exaltedGlow, this.cores, this.floorIntro,
      h('div', { class: 'hud-cluster' }, this.icons, this.health, this.adrenaline),
      this.pausePanel,
    );
    root.append(this.el);
    this.iconsFor = null;
    this.iconOverlays = [];
  }

  setPaused(on) { this.pausePanel.classList.toggle('hidden', !on); }
  setVisible(on) { this.el.classList.toggle('hidden', !on); }

  update() {
    const { world, session } = this.scene;
    const d = this.dom;

    d.set(this.cores, 'text', `Cores: ${world.cores.collected}/${world.cores.required}`);

    const introUntil = world.floorStartedAt + GAME.floorIntroDuration;
    const showIntro = session.mode === RunMode.Run && world.time < introUntil;
    d.set(this.floorIntro, 'hidden', !showIntro);
    if (showIntro) d.set(this.floorIntro, 'text', `Floor ${session.floor}`);

    const p = world.livePlayer;
    const px = HUD.pixelsPerHealthPoint;
    if (p) {
      d.set(this.health, 'width', `${Math.max(1, p.maxHealth) * px}px`);
      d.set(this.healthFill, 'width', `${Math.max(0, p.health) * px}px`);
      d.set(this.healthFill, 'background', hex(lerpColor(HUD.lowHealthColor, HUD.healthyColor, Math.min(1, Math.max(0, p.healthFraction)))));
    } else {
      d.set(this.healthFill, 'width', '0px');
    }

    // The bar itself grows as tolerance rises.
    const a = world.adrenaline, apx = HUD.pixelsPerAdrenalinePoint;
    d.set(this.adrenaline, 'width', `${a.max * apx}px`);
    d.set(this.adrenalineFill, 'width', `${(a.current * apx).toFixed(1)}px`);
    d.set(this.exaltedGlow, 'opacity', a.isExalted ? '1' : '0');
    d.set(this.exaltedGlow, 'animation-play-state', a.isExalted ? 'running' : 'paused');

    this.updateAspectIcons(p);
  }

  // Icon per equipped aspect with a radial cooldown overlay.
  updateAspectIcons(player) {
    const aspects = player ? player.aspects.aspects : [];
    if (aspects !== this.iconsFor) {
      this.iconsFor = aspects;
      this.icons.replaceChildren();
      this.iconOverlays = aspects.map((aspect, i) => {
        const url = iconUrls[aspect.data.icon];
        const overlay = h('div', { class: 'cd' });
        overlay.style.maskImage = overlay.style.webkitMaskImage = `url(${url})`;
        this.icons.append(h('div', { class: 'aspect-icon' },
          h('img', { src: url, alt: aspect.data.displayName }),
          overlay,
          aspect.data.activatable ? h('span', { class: 'key', text: String(i + 1) }) : null,
        ));
        return overlay;
      });
    }
    aspects.forEach((aspect, i) => {
      const pct = Math.round(Math.min(1, Math.max(0, aspect.cooldownFraction)) * 200) / 2;
      this.dom.set(this.iconOverlays[i], 'background', pct > 0 ? `conic-gradient(${HUD.cooldownOverlay} ${pct}%, transparent ${pct}%)` : 'none');
    });
  }

  destroy() { this.el.remove(); }
}
