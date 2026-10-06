// Remembers a press for a short window so an action that can't start yet (cooldown,
// another action in progress) still fires as soon as it becomes possible.
export class InputBuffer {
  constructor(window) {
    this.window = window;
    this.expiresAt = -Infinity;
  }

  press(now) { this.expiresAt = now + this.window; }
  clear() { this.expiresAt = -Infinity; }

  // Runs `tryAction` while a press is buffered; clears the buffer once it succeeds.
  consume(now, tryAction) {
    if (now > this.expiresAt || !tryAction()) return false;
    this.clear();
    return true;
  }
}
