// A run (or the playground): drives the world at a fixed rate with interpolated
// rendering, and owns the HUD, pause state and keyboard shortcuts.
import { FIXED_DT, MAX_STEPS_PER_FRAME } from '../data/config.js';
import { World } from './world.js';
import { RunSession } from './session.js';
import { Hud } from '../ui/hud.js';

export class GameScene {
  constructor({ app, input, uiRoot, mode, onExit }) {
    this.app = app;
    this.input = input;
    this.onExit = onExit;
    this.session = new RunSession(mode);
    this.world = new World({ session: this.session, input });
    app.stage.addChild(this.world.root);
    this.accumulator = 0;
    this.alpha = 1;
    this.paused = false;
    this.hud = new Hud(uiRoot, this);

    input.reset();
    this.world.startFloor();

    this.listeners = new AbortController();
    const opts = { signal: this.listeners.signal };
    window.addEventListener('keydown', (e) => this.onKeyDown(e), opts);
    window.addEventListener('blur', () => this.pause(), opts); // don't die while alt-tabbed
  }

  frame(dt) {
    const world = this.world;
    if (!this.paused) {
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
      if (world.finished) {
        this.onExit();
        return;
      }
    }
    world.render(this.alpha, this.paused ? 0 : dt, this.app.screen.width, this.app.screen.height);
    this.hud.update();
  }

  onKeyDown(e) {
    if (e.repeat) return;
    if (e.code === 'Escape') this.togglePause();
    else if (import.meta.env.DEV && !this.paused) this.devShortcut(e.code);
  }

  togglePause() { if (this.paused) this.resume(); else this.pause(); }

  pause() {
    if (this.paused) return;
    this.paused = true;
    this.input.reset();
    this.hud.setPaused(true);
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.input.reset();
    this.hud.setPaused(false);
  }

  // Quitting forfeits the run's unbanked coins (dying banks them).
  quitToMenu() {
    this.session.forfeitCoins();
    this.onExit();
  }

  devShortcut(code) {
    const w = this.world, p = w.livePlayer;
    switch (code) {
      case 'KeyK': p?.takeDamage(99999); break;
      case 'KeyH': p?.heal(99999); break;
      case 'KeyL': w.adrenaline.add(99999); break;
      case 'KeyC': w.cores.collected++; break;
      case 'KeyN': w.requestNextFloor(); break;
      case 'KeyR': p?.aspects.refreshCooldowns(); break;
    }
  }

  destroy() {
    this.listeners.abort();
    this.hud.destroy();
    this.world.destroy();
  }
}
