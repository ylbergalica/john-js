// Base class for aspect runtimes. Hooks are no-ops unless an aspect overrides them.
export class Aspect {
  constructor(player, data) {
    this.player = player;
    this.data = data;
    this.procs = 0; // times it has fired (the HUD pops its icon on each)
  }

  get world() { return this.player.world; }
  get now() { return this.player.world.time; }

  // 0 = ready, 1 = full cooldown (drives the HUD overlay).
  get cooldownFraction() { return 0; }
  // Whether it can fire right now: the HUD dims its icon while not, and flashes it when it comes back.
  get available() { return this.cooldownFraction <= 0; }
  // A count it's building toward, shown on its HUD icon; null for none.
  get counter() { return null; }
  // Scales the player's attack damage (each aspect's multiplies together).
  get damageMultiplier() { return 1; }

  // It fired: pops its HUD icon, and counts toward its summary stat if that's uses.
  used() {
    this.procs++;
    this.world.session.aspectUsed(this.data.id);
  }

  step(_dt) {}
  afterPhysics() {}
  render(_alpha, _dt) {}

  tryActivate() { return false; } // slot key, only for `data.activatable` aspects
  beforeAttack() {}
  onDash(_dir) {} // the player set off on a dash along unit `dir`
  onHitEnemy(_enemy, _hitPoint) {} // the player's attack landed
  onHitProp(_prop, _hitPoint) {} // the player's attack landed on a prop (a crate and the like)
  // Any damage or kill, with its cause (a DamageCause or an aspect id). The controller
  // never sends an aspect its own hits.
  onEnemyDamaged(_enemy, _damage, _cause) {}
  onEnemyKilled(_enemy, _cause) {}
  onParry(_attack) {} // the player parried `attack` (the first connect of a parry)
  refreshCooldown() {}
  dispose() {}
}
