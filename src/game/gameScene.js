// A run (or the playground): drives the world at a fixed rate with interpolated
// rendering, and owns the HUD, pause state, the tool menus at the top left (spawning in
// the playground, dev tools in dev builds) and, once a run ends in death, the run summary.
import { FIXED_DT, MAX_STEPS_PER_FRAME } from '../data/config.js';
import { World } from './world.js';
import { RunSession, RunMode } from './session.js';
import { Hud } from '../ui/hud.js';
import { RunSummary } from '../ui/runSummary.js';
import { DevOverlay } from '../ui/devOverlay.js';
import { DevMenu } from '../ui/devMenu.js';
import { devFlags } from './devFlags.js';
import { SpawnMenu } from '../ui/spawnMenu.js';
import { h } from '../ui/dom.js';
import { sfx } from '../audio/sfx.js';

const DEV = import.meta.env.DEV;

export class GameScene {
  constructor({ app, input, uiRoot, mode, onExit }) {
    this.app = app;
    this.input = input;
    this.uiRoot = uiRoot;
    this.onExit = onExit;
    this.session = new RunSession(mode);
    this.world = new World({ session: this.session, input });
    app.stage.addChild(this.world.root);
    this.accumulator = 0;
    this.alpha = 1;
    this.paused = false;
    this.summary = null;
    this.hud = new Hud(uiRoot, this);
    this.devOverlay = DEV ? new DevOverlay(uiRoot, this) : null;

    // Tool menus: one open at a time, and the world holds still while one is.
    const playground = mode === RunMode.Playground;
    this.menu = null;
    this.toolCorner = h('div', { class: 'tool-corner' });
    uiRoot.append(this.toolCorner);
    this.spawnMenu = playground || DEV ? new SpawnMenu(this.toolCorner, this.world, { hotkey: playground ? 'Tab' : null }) : null;
    this.devMenu = DEV ? new DevMenu(this.toolCorner, this) : null;

    input.reset();
    this.world.startFloor();

    this.listeners = new AbortController();
    const opts = { signal: this.listeners.signal };
    window.addEventListener('keydown', (e) => this.onKeyDown(e), opts);
    window.addEventListener('blur', () => this.pause(), opts); // don't die while alt-tabbed
  }

  get frozen() { return this.paused || !!this.menu; }

  frame(dt) {
    const world = this.world;
    if (this.summary) {
      this.summary.update(dt);
    } else if (!this.frozen) {
      if (DEV) dt *= devFlags.gameSpeed;
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
        world.step(FIXED_DT);
        this.input.consumePresses();
        this.accumulator -= FIXED_DT;
        steps++;
      }
      if (steps === MAX_STEPS_PER_FRAME) this.accumulator = Math.min(this.accumulator, FIXED_DT);
      this.alpha = this.accumulator / FIXED_DT;
      if (world.finished && !this.endRun()) return;
    }
    const frameDt = this.frozen ? 0 : dt;
    world.render(this.alpha, frameDt, this.app.screen.width, this.app.screen.height);
    if (!this.summary) {
      this.hud.update();
      this.devOverlay?.update(frameDt, this.alpha);
    }
  }

  // A run that ends in death opens the summary over the frozen world; the playground
  // goes straight back to the menu. Returns false once the scene has been left.
  endRun() {
    if (this.session.mode !== RunMode.Run) {
      this.onExit();
      return false;
    }
    this.setMenu(null);
    this.hud.setVisible(false);
    this.toolCorner.classList.add('hidden');
    this.devOverlay?.destroy();
    this.devOverlay = null;
    this.summary = new RunSummary(this.uiRoot, { session: this.session, onMenu: this.onExit });
    return true;
  }

  onKeyDown(e) {
    if (e.repeat || this.summary) return;
    if (e.code === 'Escape') {
      if (this.menu) this.setMenu(null);
      else this.togglePause();
    } else if (this.paused) {
      // the pause menu takes no other keys
    } else if (e.code === 'Backquote' && this.devMenu) {
      this.toggleMenu(this.devMenu);
    } else if (e.code === 'Tab' && this.session.mode === RunMode.Playground) {
      this.toggleMenu(this.spawnMenu);
    } else if (!this.menu) {
      this.devMenu?.hotkey(e.code);
    }
  }

  toggleMenu(menu) { this.setMenu(this.menu === menu ? null : menu); }

  setMenu(menu) {
    if (menu === this.menu) return;
    this.menu?.setOpen(false);
    this.menu = menu;
    menu?.setOpen(true);
    this.toolCorner.classList.toggle('menu-open', !!menu);
    this.input.reset();
  }

  togglePause() { if (this.paused) this.resume(); else this.pause(); }

  pause() {
    if (this.paused || this.summary) return;
    this.setMenu(null);
    this.paused = true;
    this.input.reset();
    this.hud.setPaused(true);
    this.toolCorner.classList.add('hidden');
    sfx.play('pause');
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.input.reset();
    this.hud.setPaused(false);
    this.toolCorner.classList.remove('hidden');
  }

  // Quitting forfeits the run's unbanked coins (dying banks them, so quitting while the
  // player is dying banks them too).
  quitToMenu() {
    if (this.world.player?.death) this.session.bankCoins();
    else this.session.forfeitCoins();
    this.onExit();
  }

  destroy() {
    this.listeners.abort();
    this.summary?.destroy();
    this.devOverlay?.destroy();
    this.toolCorner.remove();
    this.hud.destroy();
    this.world.destroy();
  }
}
