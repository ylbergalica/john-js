// Player logic: movement, aiming, melee attack, dash, parry and health.
// All timing uses timestamps on the world's simulation clock.
import { Entity } from '../game/entity.js';
import { Body, ContactSet, circleVsCapsule } from '../engine/physics.js';
import { norm, isZero } from '../engine/math.js';
import { PLAYER, PARTICLES, ADRENALINE } from '../data/config.js';
import { InputBuffer } from './inputBuffer.js';
import { PlayerView } from './playerView.js';
import { AspectController } from '../aspects/controller.js';
import { devFlags } from '../game/devFlags.js';

const A = PLAYER.attack, P = PLAYER.parry, D = PLAYER.dash, H = PLAYER.health;

export class Player extends Entity {
  constructor(world, x, y) {
    super(world);
    this.body = world.physics.add(new Body({ x, y, radius: PLAYER.radius, mass: PLAYER.mass, damping: PLAYER.linearDamping }));
    this.facing = { x: 0, y: 0 };
    this.movement = { x: 0, y: 0 };
    this.sizeScale = 1; // shrunk by the Anchor teleport
    this.teleporting = false; // set by aspects; locks out other actions

    this.attacking = false;
    this.attackEndsAt = 0;
    this.attackReadyAt = 0;
    this.attackBuffer = new InputBuffer(PLAYER.inputBufferTime);
    this.attackContacts = new ContactSet();

    this.dashing = false;
    this.dashEndsAt = 0;
    this.dashReadyAt = 0;
    this.dashBuffer = new InputBuffer(PLAYER.inputBufferTime);

    this.parrying = false;
    this.parryEndsAt = 0;
    this.parryReadyAt = 0;
    this.parrySucceeded = false;
    this.parriedThisWindow = new Set();
    this.parryStreak = 0; // consecutive successful parries, see PLAYER.parry.comboWindow
    this.lastParryAt = -Infinity;
    this.parryBuffer = new InputBuffer(PLAYER.inputBufferTime);

    this.maxHealth = H.maxHealth;
    this.health = this.maxHealth;
    this.invincibleUntil = 0;
    this.lastHitAt = -Infinity;

    this.view = new PlayerView(this);
    this.aspects = new AspectController(this);
    // A successful parry refunds the dash.
    this.offParried = world.events.parried.on(() => { this.dashReadyAt = 0; });
  }

  get now() { return this.world.time; }
  get healthFraction() { return this.maxHealth > 0 ? this.health / this.maxHealth : 0; }

  cursorWorld() {
    const m = this.world.input.mouse;
    return this.world.camera.screenToWorld(m.x, m.y);
  }

  // ── step ─────────────────────────────────────────────────────────
  step(dt) {
    const input = this.world.input, now = this.now;
    this.body.collideWalls = !devFlags.noclip;
    this.movement = input.moveVector();
    const look = this.cursorWorld();
    const lx = look.x - this.body.pos.x, ly = look.y - this.body.pos.y;
    this.facing = norm({ x: lx, y: ly });
    this.body.rotation = Math.atan2(ly, lx);

    if (input.wasPressed('exalted')) this.world.adrenaline.activate();

    if (input.wasPressed('attack')) this.attackBuffer.press(now);
    if (this.attacking && now >= this.attackEndsAt) this.endAttack();
    this.attackBuffer.consume(now, () => this.tryStartAttack());

    if (input.wasPressed('dash')) this.dashBuffer.press(now);
    if (this.dashing && now >= this.dashEndsAt) this.dashing = false;
    this.dashBuffer.consume(now, () => this.tryStartDash());

    if (input.wasPressed('parry')) this.parryBuffer.press(now);
    if (this.parrying && now >= this.parryEndsAt) this.endParry();
    this.parryBuffer.consume(now, () => this.tryStartParry());

    this.aspects.step(dt);

    if (this.teleporting) {
      this.steer(0, 0, 1);
    } else if (!this.dashing) {
      const speed = PLAYER.moveSpeed * this.world.adrenaline.speedMultiplier * (devFlags.noclip ? 3 : 1);
      this.steer(this.movement.x * speed, this.movement.y * speed, PLAYER.movementResponsiveness);
    }
  }

  afterPhysics() {
    if (this.attacking) {
      const cap = this.attackCapsule();
      const hits = this.world.enemies.filter((e) => !e.dead && circleVsCapsule(e.body.pos.x, e.body.pos.y, e.body.radius, cap));
      this.attackContacts.update(hits, (e) => this.onAttackHit(e));
    }
    if (this.parrying) this.parryOverlapping();
    this.aspects.afterPhysics();
    this.view.recordTrail();
  }

  // Moves velocity a fraction `k` of the way toward (vx, vy).
  steer(vx, vy, k) {
    const v = this.body.vel;
    v.x += (vx - v.x) * k;
    v.y += (vy - v.y) * k;
  }

  // Recoil opposite the aim direction.
  applyRecoil(force) {
    if (isZero(this.facing) || force <= 0) return;
    const k = force * (1 - PLAYER.knockbackResistance);
    this.body.addImpulse(-this.facing.x * k, -this.facing.y * k);
  }

  // ── attack ───────────────────────────────────────────────────────
  get attackPoint() {
    return { x: this.body.pos.x + this.facing.x * A.attackRange, y: this.body.pos.y + this.facing.y * A.attackRange };
  }

  tryStartAttack() {
    const now = this.now;
    if (now < this.attackReadyAt || this.attacking || this.parrying || this.teleporting) return false;
    this.aspects.beforeAttack();
    this.attackReadyAt = now + A.cooldown;
    this.attacking = true;
    this.attackEndsAt = now + A.attackDuration;
    this.attackContacts.clear();
    this.view.playSwing();
    this.world.sound('swing');
    const p = this.attackPoint;
    this.world.effects.burst(p.x, p.y, Math.atan2(this.facing.y, this.facing.x), { ...PARTICLES.swing, color: this.view.tint });
    return true;
  }

  endAttack() {
    this.attacking = false;
    this.attackContacts.clear();
    this.view.hideSwing();
  }

  onAttackHit(enemy) {
    if (enemy.dead) return;
    const src = this.attackPoint;
    const hitPoint = enemy.closestPoint(src);
    enemy.takeDamage(A.attackDamage * this.world.adrenaline.damageMultiplier, hitPoint, src);
    this.view.playHitImpact(hitPoint);
    this.attackReadyAt = Math.min(this.attackReadyAt, this.now + A.cooldownAfterHit);
    if (!enemy.dead) enemy.applyKnockback(A.enemyKnockbackForce, src);
    this.applyRecoil(A.playerKnockbackForce);
    this.aspects.onHitEnemy(enemy, hitPoint);
  }

  // Capsule `forward` ahead of the player, long axis perpendicular to facing.
  capsuleAt(forward, depth, width) {
    const f = isZero(this.facing) ? { x: 1, y: 0 } : this.facing;
    const s = this.sizeScale;
    const cx = this.body.pos.x + f.x * forward, cy = this.body.pos.y + f.y * forward;
    const r = (depth * s) / 2;
    const half = Math.max(0, (width * s) / 2 - r);
    return { ax: cx + f.y * half, ay: cy - f.x * half, bx: cx - f.y * half, by: cy + f.x * half, r, cx, cy };
  }
  attackCapsule() { return this.capsuleAt(A.attackRange, A.hitboxDepth, A.hitboxWidth); }
  parryCapsule() { return this.capsuleAt(P.hitboxForward, P.hitboxDepth, P.hitboxWidth); }

  // ── dash ─────────────────────────────────────────────────────────
  tryStartDash() {
    const now = this.now;
    if (this.dashing || this.teleporting || now < this.dashReadyAt || isZero(this.movement)) return false;
    const d = norm(this.movement);
    this.dashing = true;
    this.dashEndsAt = now + D.dashDuration;
    this.dashReadyAt = now + D.dashCooldown;
    this.body.vel.x = d.x * D.dashSpeed;
    this.body.vel.y = d.y * D.dashSpeed;
    this.view.playDash(d);
    this.world.sound('dash');
    return true;
  }

  // ── parry ────────────────────────────────────────────────────────
  tryStartParry() {
    const now = this.now;
    if (this.attacking || this.parrying || this.teleporting || now < this.parryReadyAt) return false;
    this.parrying = true;
    this.parryEndsAt = now + P.parryDuration;
    this.parrySucceeded = false;
    this.parriedThisWindow.clear();
    this.view.playParry();
    this.world.sound('parryStart');
    this.parryOverlapping(); // attacks already inside the window count immediately
    return true;
  }

  endParry() {
    this.parrying = false;
    this.parriedThisWindow.clear();
    this.view.hideParry();
    if (!this.parrySucceeded) this.parryReadyAt = this.now + P.parryCooldown;
  }

  parryOverlapping() {
    const cap = this.parryCapsule();
    for (const attack of [...this.world.hostileAttacks]) if (attack.overlapsCapsule(cap)) this.tryParry(attack);
  }

  // Called by an enemy attack right before it would deal damage: a parry wins ties.
  tryParryIncoming(attack) {
    if (!this.parrying) return false;
    const b = this.body;
    if (!attack.overlapsCapsule(this.parryCapsule()) && !attack.overlapsCircle(b.pos.x, b.pos.y, b.radius)) return false;
    return this.tryParry(attack);
  }

  tryParry(attack) {
    if (this.parriedThisWindow.has(attack)) return true;
    const contact = attack.closestPoint(this.parryCapsule());
    // The window's first connect extends the streak before attack.parry() reads the bonus damage.
    const first = !this.parrySucceeded, prevStreak = this.parryStreak;
    if (first) this.parryStreak = this.now - this.lastParryAt <= P.comboWindow ? Math.min(prevStreak + 1, P.comboMax) : 1;
    if (!attack.parry()) { this.parryStreak = prevStreak; return false; }
    this.parriedThisWindow.add(attack);
    if (first) {
      this.parrySucceeded = true;
      this.lastParryAt = this.now;
      const level = this.parryStreak - 1, maxed = this.parryStreak === P.comboMax;
      this.view.hideParry();
      this.world.camera.shake(P.shakeDuration * (1 + 0.25 * level), P.shakeStrength * (1 + P.comboShakeStep * level), P.shakeFrequency);
      this.view.playParryConnect(contact, level);
      this.world.sound('parry', null, { pitch: P.comboPitchStep ** level, volume: 1 + P.comboVolumeStep * level, jitter: 0.005 });
      if (maxed) this.world.sound('parryCrown');
      this.world.events.parried.emit();
      this.world.adrenaline.extend(ADRENALINE.extendPerParry);
    }
    return true;
  }

  // Extra damage a parry deals for the current streak (0 on the first parry).
  get parryBonusDamage() { return Math.max(0, this.parryStreak - 1) * P.comboDamageStep; }

  // ── health ───────────────────────────────────────────────────────
  takeDamage(damage, hitPoint = this.body.pos, source = this.body.pos) {
    if (this.dead || this.now < this.invincibleUntil) return;
    const final = devFlags.fullResistance ? 0 : damage * this.world.adrenaline.damageTakenMultiplier;
    this.health -= final;
    if (final > 0) {
      this.onHurt(hitPoint, source);
      this.world.events.playerDamaged.emit(this, final, damage);
    }
    if (this.health <= 0) this.die();
    else this.invincibleUntil = this.now + H.invincibilityDuration;
  }

  heal(amount) { this.health = Math.min(this.health + amount, this.maxHealth); }

  onHurt(hitPoint, source) {
    const b = this.body.pos;
    let dx = b.x - source.x, dy = b.y - source.y;
    if (dx * dx + dy * dy < 0.0001) { dx = b.x - hitPoint.x; dy = b.y - hitPoint.y; }
    if (dx * dx + dy * dy < 0.0001) { dx = 1; dy = 0; }
    this.lastHitAt = this.now;
    this.parryStreak = 0; // getting hit breaks the parry combo
    this.world.sound('hurt');
    this.world.effects.burst(b.x, b.y, Math.atan2(dy, dx), PARTICLES.playerHit);
    const hf = PLAYER.hitFeedback;
    this.world.camera.shake(hf.shakeDuration, hf.shakeStrength, hf.shakeFrequency);
  }

  die() {
    this.world.sound('death');
    this.world.session.bankCoins();
    this.destroy();
    this.world.gameOver();
  }

  // ── lifecycle ────────────────────────────────────────────────────
  render(alpha, dt) {
    this.view.render(alpha, dt);
    this.aspects.render(alpha, dt);
  }

  dispose() {
    this.offParried();
    this.aspects.dispose();
    this.world.physics.remove(this.body);
    this.view.destroy();
  }
}
