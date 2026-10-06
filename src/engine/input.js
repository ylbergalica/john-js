// Keyboard/mouse state for the simulation. Presses are latched until the next
// simulation step consumes them, so a tap is never lost on frames where no fixed
// step runs (high refresh rates) and never seen twice when several steps run.

const BINDINGS = {
  up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
  attack: ['Mouse0'],
  parry: ['Mouse2'],
  dash: ['ShiftLeft'],
  exalted: ['KeyX'],
  slot1: ['Digit1'], slot2: ['Digit2'], slot3: ['Digit3'],
};

const PREVENT_DEFAULT = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class Input {
  constructor(canvas) {
    this.held = new Set();
    this.pressed = new Set();
    this.mouse = { x: 0, y: 0 };
    this.controller = new AbortController();
    const opts = { signal: this.controller.signal };

    window.addEventListener('keydown', (e) => {
      if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.held.add(e.code);
      this.pressed.add(e.code);
    }, opts);
    window.addEventListener('keyup', (e) => this.held.delete(e.code), opts);
    window.addEventListener('blur', () => this.held.clear(), opts);
    window.addEventListener('mousemove', (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; }, opts);
    // mousedown (not pointerdown): pointer events don't fire for a second button
    // pressed while another is held, which would swallow attack-while-parrying.
    canvas.addEventListener('mousedown', (e) => {
      this.held.add(`Mouse${e.button}`);
      this.pressed.add(`Mouse${e.button}`);
    }, opts);
    window.addEventListener('mouseup', (e) => this.held.delete(`Mouse${e.button}`), opts);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault(), opts);
  }

  isHeld(action) { return BINDINGS[action].some((c) => this.held.has(c)); }
  wasPressed(action) { return BINDINGS[action].some((c) => this.pressed.has(c)); }

  // Normalised WASD vector (y-down).
  moveVector() {
    const x = (this.isHeld('right') ? 1 : 0) - (this.isHeld('left') ? 1 : 0);
    const y = (this.isHeld('down') ? 1 : 0) - (this.isHeld('up') ? 1 : 0);
    const l = Math.hypot(x, y);
    return l > 0 ? { x: x / l, y: y / l } : { x: 0, y: 0 };
  }

  // Called after each simulation step.
  consumePresses() { this.pressed.clear(); }

  // Drops everything, e.g. on pause/resume so clicks on menus don't leak into play.
  reset() {
    this.held.clear();
    this.pressed.clear();
  }

  dispose() { this.controller.abort(); }
}
