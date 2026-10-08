// Enemy behaviour: Idle → Reposition (orbit) → Chase → WindUp → Attack → Recover.
// Chasers (bosses) are always aggressive and path with a wider footprint.
import { randRange, randSign, clamp, norm, dist, dirTo, clampLength, smoothDampAngle, pickWeighted } from '../engine/math.js';

export const AIState = { Idle: 'Idle', Reposition: 'Reposition', Chase: 'Chase', WindUp: 'WindUp', Attack: 'Attack', Recover: 'Recover', Dead: 'Dead' };

export class EnemyAI {
  constructor(enemy, cfg) {
    this.enemy = enemy;
    this.cfg = cfg;
    this.attacks = cfg.attacks.map((a) => ({ weight: a.weight, ability: enemy.abilities.get(a.ability) }));
    this.attackRange = Math.max(0, ...this.attacks.map((a) => a.ability.data.range));
    this.footprint = enemy.type.navFootprint ?? 1;
    this.state = AIState.Idle;
    this.stateTimer = 0;
    this.nextDecisionTime = 0;
    this.hasSlot = false;
    this.orbitDirection = 1;
    this.turnVelocity = { v: 0 };
    this.movementSuppressedUntil = 0;
    this.activeAbility = null;
    this.availableCache = null; // per-step memo of hasAvailableAttack()
  }

  get body() { return this.enemy.body; }
  get player() { return this.enemy.player; }
  get now() { return this.enemy.world.time; }
  get isChaser() { return this.enemy.type.isChaser; }

  step(dt) {
    if (this.state === AIState.Dead || !this.player) return;
    this.availableCache = null;
    const suppressed = this.now < this.movementSuppressedUntil;
    if (this.enemy.stunned) {
      this.stateTimer = 0;
      // Let knockback play out, but cap it.
      if (!suppressed) this.setVelocity(clampLength(this.body.vel, this.cfg.preservedExternalVelocityLimit));
      return;
    }

    this.stateTimer -= dt;
    switch (this.state) {
      case AIState.Idle: this.decideIdle(); break;
      case AIState.Reposition: this.decideReposition(); break;
      case AIState.Chase: this.decideChase(); break;
      case AIState.WindUp:
      case AIState.Attack:
        if (!this.enemy.isActing) this.changeState(AIState.Recover);
        break;
      case AIState.Recover: this.decideRecover(); break;
    }

    if (suppressed) return;
    switch (this.state) {
      case AIState.Chase: this.moveChase(dt); break;
      case AIState.Reposition: this.moveOrbit(dt, this.cfg.repositionSpeed, false); break;
      case AIState.Idle: this.moveOrbit(dt, this.cfg.orbitSpeed, true); break;
      case AIState.WindUp: if (this.activeAbility?.tracking() ?? true) this.turnToward(this.dirToPlayer(), dt); break;
      // Attack/Recover: no steering; abilities and momentum drive the body.
    }
  }

  // ── state machine ────────────────────────────────────────────────
  changeState(next) {
    const prev = this.state;
    if (prev === AIState.Attack || (prev === AIState.WindUp && next !== AIState.Attack)) {
      this.releaseSlot();
      this.activeAbility = null;
      this.enemy.isActing = false;
    } else if (prev === AIState.Recover) {
      this.enemy.isActing = false;
    }

    this.state = next;
    switch (next) {
      case AIState.Idle: this.stateTimer = 0; break;
      case AIState.Reposition:
        this.stateTimer = randRange(this.cfg.repositionDurationRange.x, this.cfg.repositionDurationRange.y);
        this.orbitDirection = randSign();
        break;
      case AIState.WindUp:
      case AIState.Attack: this.enemy.isActing = true; break;
      case AIState.Recover: this.stateTimer = this.cfg.recoverDuration; break;
      case AIState.Dead: this.body.stop(); break;
    }
  }

  decideIdle() {
    if (this.shouldAggro(this.distToPlayer())) this.changeState(AIState.Reposition);
  }

  decideReposition() {
    const d = this.distToPlayer();
    if (this.shouldLoseAggro(d)) this.changeState(AIState.Idle);
    else if (d <= this.attackRange && this.hasAvailableAttack()) this.changeState(AIState.Chase);
    else if (this.stateTimer <= 0 && this.now >= this.nextDecisionTime) this.changeState(AIState.Chase);
  }

  decideChase() {
    const d = this.distToPlayer();
    const available = this.hasAvailableAttack();
    if (this.shouldLoseAggro(d)) this.changeState(AIState.Idle);
    else if (d <= this.engageRange && available) {
      if (this.now >= this.nextDecisionTime) this.tryAttack();
    } else if (!available && d <= this.blockedSightDistance && this.now >= this.nextDecisionTime) {
      this.changeState(AIState.Reposition);
    }
  }

  decideRecover() {
    if (this.shouldLoseAggro(this.distToPlayer())) this.changeState(AIState.Idle);
    else if (this.stateTimer <= 0) {
      this.scheduleNextDecision();
      this.changeState(AIState.Reposition);
    }
  }

  suppressMovementFor(seconds) {
    this.movementSuppressedUntil = Math.max(this.movementSuppressedUntil, this.now + Math.max(0, seconds));
  }

  // ── attacks ──────────────────────────────────────────────────────
  tryAttack() {
    if (!this.tryAcquireSlot()) {
      this.scheduleNextDecision();
      if (Math.random() < this.cfg.orbitPreference) this.changeState(AIState.Reposition);
      return;
    }
    const usable = this.attacks.filter((a) => a.ability.canExecute());
    if (usable.length === 0) {
      this.releaseSlot();
      this.scheduleNextDecision();
      return;
    }
    const { ability } = pickWeighted(usable);
    this.activeAbility = ability;
    this.changeState(ability.data.windUpTime > 0 ? AIState.WindUp : AIState.Attack);
    ability.forceExecute();
  }

  onAbilityAttackStarted(ability) {
    if (ability === this.activeAbility && this.state === AIState.WindUp) this.changeState(AIState.Attack);
  }

  hasAvailableAttack() {
    this.availableCache ??= this.attacks.some((a) => a.ability.canExecute());
    return this.availableCache;
  }

  get blockedSightDistance() { return Math.max(0.75, this.cfg.orbitRadius * 0.5); }
  get engageRange() { return this.cfg.attackEngageRange > 0 ? this.cfg.attackEngageRange : this.attackRange; }

  tryAcquireSlot() {
    if (!this.hasSlot) this.hasSlot = this.enemy.world.tryAcquireAttackSlot();
    return this.hasSlot;
  }

  releaseSlot() {
    if (!this.hasSlot) return;
    this.enemy.world.releaseAttackSlot();
    this.hasSlot = false;
  }

  scheduleNextDecision() {
    this.nextDecisionTime = this.now + randRange(this.cfg.decisionDelayRange.x, this.cfg.decisionDelayRange.y);
  }

  // ── movement ─────────────────────────────────────────────────────
  moveChase(dt) {
    if (this.enemy.isActing) return;
    this.turnToward(this.dirToPlayer(), dt);
    const stopping = this.hasAvailableAttack() ? this.engageRange : this.blockedSightDistance;
    const dir = this.pathDirection(stopping);
    if (dir) {
      const speed = this.cfg.moveSpeed;
      this.steer(dir.x * speed, dir.y * speed);
    }
  }

  // Circle the player at orbitRadius, drifting in or out toward it.
  moveOrbit(dt, speed, isIdle) {
    const d = this.distToPlayer();
    if (isIdle && this.shouldLoseAggro(d)) return;
    const dir = this.dirToPlayer();
    this.turnToward(dir, dt);
    const radial = clamp((d - this.cfg.orbitRadius) / this.cfg.orbitRadius, -1, 1);
    const move = norm({ x: dir.x * radial - dir.y * this.orbitDirection, y: dir.y * radial + dir.x * this.orbitDirection });
    if (move.x === 0 && move.y === 0) {
      this.setVelocity(clampLength(this.body.vel, this.cfg.preservedExternalVelocityLimit));
      return;
    }
    this.steer(move.x * speed, move.y * speed);
  }

  // Direction toward the player along the flow field, or null inside `stopping` range.
  pathDirection(stopping) {
    const p = this.player.body.pos, pos = this.body.pos;
    if ((p.x - pos.x) ** 2 + (p.y - pos.y) ** 2 <= stopping * stopping) return null;
    const cfg = this.cfg;
    const radius = this.isChaser ? Math.max(cfg.pathGoalSearchRadius, cfg.chaserPathGoalSearchRadius) : cfg.pathGoalSearchRadius;
    const field = this.enemy.world.navField(this.footprint, radius, cfg.pathRefreshInterval);
    const waypoint = field.nextWaypoint(pos);
    // In the player's cell, or cut off from it: head straight for the player.
    const target = waypoint && waypoint !== 'goal' ? waypoint : p;
    const dir = dirTo(pos, target);
    return dir.x || dir.y ? dir : null;
  }

  steer(vx, vy) {
    const v = this.body.vel, k = this.cfg.movementResponsiveness;
    v.x += (vx - v.x) * k;
    v.y += (vy - v.y) * k;
  }

  setVelocity(v) { this.body.vel.x = v.x; this.body.vel.y = v.y; }

  // Eases toward `dir`, never faster than `maxTurnSpeed` (rad/s).
  turnToward(dir, dt) {
    const b = this.body, max = this.cfg.maxTurnSpeed;
    const next = smoothDampAngle(b.rotation, Math.atan2(dir.y, dir.x), this.turnVelocity, this.cfg.turnSmoothTime, dt);
    b.rotation += clamp(next - b.rotation, -max * dt, max * dt);
    this.turnVelocity.v = clamp(this.turnVelocity.v, -max, max);
  }

  shouldAggro(d) { return this.isChaser || d <= this.cfg.aggroRange; }
  shouldLoseAggro(d) { return !this.isChaser && d > this.cfg.aggroRange; }
  distToPlayer() { return dist(this.body.pos, this.player.body.pos); }
  dirToPlayer() { return dirTo(this.body.pos, this.player.body.pos); }

  onDeath() {
    this.releaseSlot();
    this.changeState(AIState.Dead);
  }
}
