// Base for everything that lives in the world. Per simulation step the world calls
// step() → physics → afterPhysics() (overlap tests); render() runs once per frame.
export class Entity {
  constructor(world) {
    this.world = world;
    this.dead = false;
  }

  step(_dt) {}
  afterPhysics() {}
  render(_alpha, _dt, _view) {}

  // Releases bodies and display objects. Called once, from destroy().
  dispose() {}

  destroy() {
    if (this.dead) return;
    this.dead = true;
    this.dispose();
  }
}
