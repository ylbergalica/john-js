// A run (or the playground): drives the world at a fixed rate with interpolated
// rendering, and owns the HUD, pause state, keyboard shortcuts and, once a run ends
// in death, the run summary.
import { ENEMY_TYPES, FIXED_DT, MAX_STEPS_PER_FRAME } from '../data/config.js';
import { World } from './world.js';
import { RunSession, RunMode } from './session.js';
import { Hud } from '../ui/hud.js';
import { RunSummary } from '../ui/runSummary.js';
import { sfx } from '../audio/sfx.js';

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

    input.reset();
    this.world.startFloor();

    this.listeners = new AbortController();
    const opts = { signal: this.listeners.signal };
    window.addEventListener('keydown', (e) => this.onKeyDown(e), opts);
    window.addEventListener('blur', () => this.pause(), opts); // don't die while alt-tabbed
  }

  frame(dt) {
    const world = this.world;
    if (this.summary) {
      this.summary.update(dt);
    } else if (!this.paused) {
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
    world.render(this.alpha, this.paused ? 0 : dt, this.app.screen.width, this.app.screen.height);
    if (!this.summary) this.hud.update();
  }

  // A run that ends in death opens the summary over the frozen world; the playground
  // goes straight back to the menu. Returns false once the scene has been left.
  endRun() {
    if (this.session.mode !== RunMode.Run) {
      this.onExit();
      return false;
    }
    this.hud.setVisible(false);
    this.summary = new RunSummary(this.uiRoot, { session: this.session, onMenu: this.onExit });
    return true;
  }

  onKeyDown(e) {
    if (e.repeat || this.summary) return;
    if (e.code === 'Escape') this.togglePause();
    else if (import.meta.env.DEV && !this.paused) this.devShortcut(e.code);
  }

  togglePause() { if (this.paused) this.resume(); else this.pause(); }

  pause() {
    if (this.paused || this.summary) return;
    this.paused = true;
    this.input.reset();
    this.hud.setPaused(true);
    sfx.play('pause');
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
      case 'KeyG': this.devSpawnNear('seraph'); break;
    }
  }

  // Drops an enemy on a free spot a few units from the player.
  devSpawnNear(type) {
    const w = this.world, p = w.livePlayer, r = ENEMY_TYPES[type].radius;
    if (!p) return;
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, d = 6 + Math.random() * 4;
      const x = p.body.pos.x + Math.cos(a) * d, y = p.body.pos.y + Math.sin(a) * d;
      if (w.physics.isCircleFree(x, y, r)) { w.spawnEnemy(type, { x, y }); return; }
    }
  }

  destroy() {
    this.listeners.abort();
    this.summary?.destroy();
    this.hud.destroy();
    this.world.destroy();
  }
}
