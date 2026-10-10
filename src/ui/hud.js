// In-run HUD: the floor intro, aspect cooldowns, health and adrenaline (bottom left),
// screen-edge effects (hurt, Exalted), the guardian intro's framing, and the pause menu.
// Reads world state each frame and only touches the DOM on change.
import { h, DomWriter } from './dom.js';
import { HUD, GAME } from '../data/config.js';
import { lerpColor } from '../engine/math.js';
import { iconUrls } from '../render/assets.js';
import { RunMode } from '../game/session.js';
import { keycap, replay, mistFx } from './common.js';

const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
const LOW_HEALTH = 0.3; // fraction at which the health bar starts pulsing

// Crimson mist and embers along the adrenaline bar over a pulsing halo; CSS shows them, and
// how, by the bar's state (ready or Exalted).
function adrenalineFx() {
  const fx = mistFx('adr-fx', { puffs: 32, embers: 10, size: [28, 50], dur: [1.6, 2.6] });
  fx.prepend(h('span', { class: 'adr-halo' }));
  return fx;
}

// Starlight sinking into the health bar while a floor heal streams in: pale-blue mist and
// falling star motes over a soft halo, placed over the part of the bar being filled.
function astralFx() {
  const fx = mistFx('astral-fx', { puffs: 14, embers: 18, y: [0.7, 0.95], size: [18, 30], dur: [0.9, 1.5], emberDur: [0.7, 1.2] });
  fx.prepend(h('span', { class: 'astral-halo' }));
  return fx;
}

export class Hud {
  constructor(root, scene) {
    this.scene = scene;
    this.isRun = scene.session.mode === RunMode.Run;
    this.dom = new DomWriter();

    this.floorIntro = h('div', { class: 'floor-intro' });

    // Bottom left: aspects, health, adrenaline.
    this.icons = h('div', { class: 'aspect-icons' });
    this.healthFill = h('div', { class: 'fill' });
    this.healthTrail = h('div', { class: 'trail' });
    this.healIncoming = h('div', { class: 'incoming' }); // the floor heal still to come, ahead of the fill
    this.health = h('div', { class: 'bar health' }, this.healthTrail, this.healIncoming, this.healthFill);
    this.astralFx = astralFx();
    this.healthWrap = h('div', { class: 'hp' }, this.astralFx, this.health);
    this.adrenalineFill = h('div', { class: 'fill' });
    this.adrenaline = h('div', { class: 'bar adrenaline' }, this.adrenalineFill);
    this.adrenalineWrap = h('div', { class: 'adr' }, adrenalineFx(), this.adrenaline);

    this.exaltedGlow = h('div', { class: 'exalted-glow' }); // dark-red screen edges while Exalted
    this.hurtFlash = h('div', { class: 'hurt-flash' });
    this.readyThrob = h('div', { class: 'ready-throb' }); // heartbeat of red at the edges when Exalted becomes ready
    // Guardian intro: red-black vignette and letterbox bars (--focus), fade from black (--fade).
    this.cine = h('div', { class: 'cine' },
      h('div', { class: 'cine-vignette' }), h('div', { class: 'cine-bar top' }), h('div', { class: 'cine-bar bottom' }),
      h('div', { class: 'cine-black' }));
    this.warpWash = h('div', { class: 'warp-wash' }); // white wash taking the exit (World.whiteout)

    this.pausePanel = h('div', { class: 'pause hidden interactive' },
      h('div', { class: 'pause-card' },
        h('h2', { class: 'pause-title title-in', text: 'Paused' }),
        h('div', { class: 'pause-buttons' },
          h('button', { class: 'primary', text: 'Resume', onclick: () => scene.resume() }),
          h('button', { text: 'Main Menu', onclick: () => scene.quitToMenu() }),
        ),
      ),
    );

    this.el = h('div', { class: 'hud' },
      this.exaltedGlow, this.hurtFlash, this.readyThrob, this.cine, this.warpWash, this.floorIntro,
      h('div', { class: 'hud-cluster' },
        this.icons,
        this.healthWrap,
        this.adrenalineWrap,
      ),
      this.pausePanel,
    );
    root.append(this.el);

    this.iconsFor = null;
    this.iconSlots = [];
    this.introFor = null; // floorStartedAt of the intro on screen
    this.trackedPlayer = null;
    this.lastHealth = 0;
    this.healFor = null; // the world.floorHeal on screen
    this.adrenalineReady = false;
  }

  setPaused(on) {
    this.el.classList.toggle('paused', on); // also freezes the floor intro's animation
    this.pausePanel.classList.toggle('hidden', !on);
  }

  setVisible(on) { this.el.classList.toggle('hidden', !on); }

  update() {
    const { world, session } = this.scene;
    const d = this.dom;

    this.updateFloorIntro(world, session);
    this.updateCine(world.intro);
    d.set(this.warpWash, 'opacity', world.whiteout.toFixed(3));

    const p = world.livePlayer;
    const px = HUD.pixelsPerHealthPoint;
    if (p) {
      const frac = Math.min(1, Math.max(0, p.healthFraction));
      const width = `${Math.max(0, p.health) * px}px`;
      d.set(this.health, 'width', `${Math.max(1, p.maxHealth) * px}px`);
      d.set(this.healthFill, 'width', width);
      d.set(this.healthTrail, 'width', width); // eases down after a delay (CSS), showing the hit
      d.set(this.health, '--c', hex(lerpColor(HUD.lowHealthColor, HUD.healthyColor, frac))); // fill and glow
      d.set(this.health, '.low', frac <= LOW_HEALTH);
    } else {
      d.set(this.healthFill, 'width', '0px');
      d.set(this.healthTrail, 'width', '0px');
      d.set(this.health, '.low', false);
    }
    this.updateFloorHeal(world, p);
    this.updateHurt(world.player);

    // The bar itself grows as tolerance rises.
    const a = world.adrenaline, apx = HUD.pixelsPerAdrenalinePoint;
    d.set(this.adrenaline, 'width', `${a.max * apx}px`);
    d.set(this.adrenalineFill, 'width', `${(a.current * apx).toFixed(1)}px`);
    d.set(this.adrenaline, '.ready', a.canActivate);
    d.set(this.adrenaline, '.exalted', a.isExalted);
    d.set(this.adrenalineWrap, '.ready', a.canActivate);
    d.set(this.adrenalineWrap, '.exalted', a.isExalted);
    d.set(this.adrenalineWrap, '.purging', !!world.player?.death?.purging); // wrung out of the dying player
    if (a.canActivate && !this.adrenalineReady) { // just became available (adrenalineFull plays with this)
      replay(this.adrenalineWrap, 'surge');
      replay(this.readyThrob, 'on');
    }
    this.adrenalineReady = a.canActivate;
    d.set(this.exaltedGlow, 'opacity', a.isExalted ? '1' : '0');
    d.set(this.exaltedGlow, 'animation-play-state', a.isExalted ? 'running' : 'paused');

    this.updateAspectIcons(p);
  }

  // The floor heal (World.carryHealth), once play starts: the bar blooms with starlight, the
  // health to come shows ahead of the fill as it streams in, and a flash when it's all in.
  updateFloorHeal(world, p) {
    const d = this.dom, px = HUD.pixelsPerHealthPoint;
    const fh = p && !world.intro ? world.floorHeal : null;
    const health = Math.max(0, p?.health ?? 0);
    d.set(this.healIncoming, 'width', `${(health + (fh ? fh.amount - fh.applied : 0)) * px}px`);
    d.set(this.healthWrap, '.astral', !!fh);
    if (fh && this.healFor !== fh) {
      d.set(this.astralFx, 'left', `${health * px}px`);
      d.set(this.astralFx, 'width', `${fh.amount * px}px`);
      replay(this.healthWrap, 'astral-surge');
    } else if (!fh && this.healFor && p) {
      replay(this.healthWrap, 'astral-done');
    }
    this.healFor = fh;
  }

  // While the camera shows the guardian the HUD steps aside for the framing.
  updateCine(intro) {
    const d = this.dom;
    d.set(this.el, '.cinematic', !!intro);
    d.set(this.cine, 'hidden', !intro);
    if (!intro) return;
    d.set(this.cine, '--focus', intro.focus.toFixed(3));
    d.set(this.cine, '--fade', intro.fade.toFixed(3));
  }

  // "Floor N" title for the first seconds of each floor (after any guardian intro), built
  // fresh per floor so its CSS entrance replays; the HUD's paused class freezes it with the game.
  updateFloorIntro(world, session) {
    const show = this.isRun && !world.intro && world.time < world.floorStartedAt + GAME.floorIntroDuration;
    if (show && this.introFor !== world.floorStartedAt) {
      this.introFor = world.floorStartedAt;
      const fi = h('div', { class: 'fi' },
        h('div', { class: 'rule fi-rule' }, '✦'),
        h('div', { class: 'fi-title title-in', text: `Floor ${session.floor}` }),
      );
      fi.style.setProperty('--dur', `${GAME.floorIntroDuration}s`);
      this.floorIntro.replaceChildren(fi);
    } else if (!show && this.introFor !== null) {
      this.introFor = null;
      this.floorIntro.replaceChildren();
    }
  }

  // Red screen-edge flash whenever the player loses health (including the killing blow).
  updateHurt(player) {
    if (player !== this.trackedPlayer) {
      this.trackedPlayer = player;
    } else if (player && player.health < this.lastHealth) {
      replay(this.hurtFlash, 'on');
    }
    this.lastHealth = player?.health ?? 0;
  }

  // Icon per equipped aspect with a radial cooldown overlay; flashes when it comes back.
  updateAspectIcons(player) {
    const aspects = player ? player.aspects.aspects : [];
    if (aspects !== this.iconsFor) {
      this.iconsFor = aspects;
      this.iconSlots = aspects.map((aspect) => {
        const overlay = h('div', { class: 'cd' });
        const el = h('div', { class: 'aspect-icon' },
          h('img', { src: iconUrls[aspect.data.icon], alt: aspect.data.displayName }),
          overlay,
          aspect.data.activatable ? keycap(String(aspect.slot + 1)) : null,
        );
        return { el, overlay, cooling: false };
      });
      this.icons.replaceChildren(...this.iconSlots.map((s) => s.el));
    }
    aspects.forEach((aspect, i) => {
      const slot = this.iconSlots[i];
      const pct = Math.round(Math.min(1, Math.max(0, aspect.cooldownFraction)) * 200) / 2;
      const cooling = pct > 0;
      if (cooling !== slot.cooling) {
        slot.cooling = cooling;
        slot.el.classList.toggle('cooling', cooling);
        if (!cooling) replay(slot.el, 'ready');
      }
      this.dom.set(slot.overlay, 'background', cooling ? `conic-gradient(${HUD.cooldownOverlay} ${pct}%, transparent ${pct}%)` : 'none');
    });
  }

  destroy() { this.el.remove(); }
}
