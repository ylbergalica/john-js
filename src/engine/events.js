// Minimal typed event channel: `const off = emitter.on(fn); emitter.emit(...args); off();`
export class Emitter {
  constructor() { this.handlers = new Set(); }
  on(fn) {
    this.handlers.add(fn);
    return () => this.handlers.delete(fn);
  }
  emit(...args) {
    for (const fn of [...this.handlers]) fn(...args);
  }
}
