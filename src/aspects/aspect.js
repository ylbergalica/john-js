// Base class for aspect runtimes. Hooks are no-ops unless an aspect overrides them.
export class Aspect {
  constructor(player, data) {
    this.player = player;
    this.data = data;
  }

  get world() { return this.player.world; }
  get now() { return this.player.world.time; }

  // 0 = ready, 1 = full cooldown (drives the HUD overlay).
  get cooldownFraction() { return 0; }

  step(_dt) {}
  afterPhysics() {}
  render(_alpha, _dt) {}

  tryActivate() { return false; } // slot key, only for `data.activatable` aspects
  beforeAttack() {}
  onHitEnemy(_enemy, _hitPoint) {}
  onEnemyKilled() {}
  onParry() {}
  refreshCooldown() {}
  dispose() {}
}
