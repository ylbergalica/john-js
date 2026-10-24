// Player logic: movement, aiming, melee attack, dash, parry, health and death.
// All timing uses timestamps on the world's simulation clock.
import { Entity } from '../game/entity.js';
import { Body, ContactSet } from '../engine/physics.js';
import { hurtBySegment } from '../game/hurtbox.js';
import { norm, isZero } from '../engine/math.js';
import { PLAYER, PARTICLES, ADRENALINE, ENEMY_HIT } from '../data/config.js';
import { InputBuffer } from './inputBuffer.js';
import { PlayerView } from './playerView.js';
import { PlayerDeath } from './death.js';
import { AspectController } from '../aspects/controller.js';
import { devFlags } from '../game/devFlags.js';
import { DamageCause } from '../game/damage.js';
import { Buffs } from './buffs.js';
import { settings, damageTakenScale } from '../meta/settings.js';

const A = PLAYER.attack, P = PLAYER.parry, D = PLAYER.dash, H = PLAYER.health;

export class Player extends Entity {
  constructor(world, x, y) {
    super(world);
    this.body = world.physics.add(new Body({ x, y, radius: PLAYER.radius, mass: PLAYER.mass, damping: PLAYER.linearDamping }));
    this.facing = { x: 0, y: 0 };
    this.movement = { x: 0, y: 0 };
    this.sizeScale = 1; // shrunk by the Anchor teleport
    this.bodyScale = 1; // the drawn body's size alone (not its reach), eased by aspects re-forming it
    this.bodyAlpha = 1; // how solid the body and tail are drawn: faded by aspects while enemies can't see the player
    this.teleporting = false; // set by aspects; locks out other actions
    this.intangible = false; // set by aspects; enemy attacks pass through
    this.shrouded = false; // turned to mist by an aspect: drawn as its form instead of the body, and enemy attacks and walls pass through
    this.fieryDash = false; // set by aspects: dashes burst out as fire, their own look, instead of rings, mist and afterimages
    this.hidden = false; // not drawn: gone into the exit, or not yet appeared on a new floor
    this.alight = false; // drawn solid white: dissolving into the exit's light
    this.shoved = null; // { vx, vy, at, time }: a push fading out on top of walking (see shove)
    this.reeledBy = null; // the Weaver's reel while it has the player caught in web: it drags them instead of walking (its pullOn), and they can't attack or dash, only struggle

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
    this.pendingHit = null; // { attack, damage, hitPoint, source, landsAt }: a hit about to land (see hitBy)
    this.parryGuardUntil = 0; // until then, every hit that connects is parried (the Tutorial's parry lesson)
    this.hurtBy = null; // the attack that last hurt the player, while it can still hurt: it can't be parried
    this.death = null; // PlayerDeath once killed: out of the fight while it plays, then hidden

    this.view = new PlayerView(this);
    this.buffs = new Buffs(this);
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
    this.body.collideWalls = !devFlags.noclip && !this.shrouded;
    if (this.death) { this.steer(0, 0, 0.2); this.death.step(dt); return; }
    const input = this.world.input, now = this.now;
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

    // The attack that hurt the player passes through their parries while it can still hurt
    // them: until it's over, or for one that lingers (a thread), until they're out of it.
    const hurt = this.hurtBy, b = this.body.pos;
    if (hurt && (!this.world.hostileAttacks.has(hurt) || (hurt.lingers && !hurt.overlapsCircle(b.x, b.y, this.body.radius)))) this.hurtBy = null;
    if (input.wasPressed('parry')) this.parryBuffer.press(now);
    if (this.parrying && now >= this.parryEndsAt) this.endParry();
    this.parryBuffer.consume(now, () => this.tryStartParry());
    if (this.pendingHit && now < this.parryGuardUntil) this.parryPendingHit();
    if (this.pendingHit && now >= this.pendingHit.landsAt) this.landPendingHit();

    this.aspects.step(dt);
    this.buffs.step();

    if (this.teleporting) {
      this.steer(0, 0, 1);
    } else if (!this.dashing) {
      const pull = this.reeledBy?.pullOn(this);
      if (pull) { this.steer(pull.x, pull.y, 1); return; }
      const speed = PLAYER.moveSpeed * this.world.adrenaline.speedMultiplier * this.buffs.speedMultiplier * (devFlags.noclip ? 3 : 1);
      const push = this.shoveVelocity(now);
      this.steer(this.movement.x * speed + push.x, this.movement.y * speed + push.y, PLAYER.movementResponsiveness);
    }
  }

  // Pushed at (vx, vy), easing off over `time`; walking still steers on top of it.
  shove(vx, vy, time) {
    this.shoved = { vx, vy, at: this.now, time };
  }

  shoveVelocity(now) {
    const s = this.shoved;
    const k = s ? 1 - (now - s.at) / s.time : 0;
    if (k <= 0) { this.shoved = null; return { x: 0, y: 0 }; }
    return { x: s.vx * k * k, y: s.vy * k * k };
  }

  afterPhysics() {
    if (this.attacking) {
      const cap = this.attackCapsule();
      const struck = (e) => !e.dead && hurtBySegment(e, cap.ax, cap.ay, cap.bx, cap.by, cap.r);
      const hits = [...this.world.enemies.filter(struck), ...this.world.props.filter(struck)];
      this.attackContacts.update(hits, (e) => (e.isProp ? this.onAttackProp(e) : this.onAttackHit(e)));
    }
    if (this.parrying) this.parryOverlapping();
    if (!this.death) this.aspects.afterPhysics();
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
    if (this.reeledBy) { this.reeledBy.struggle(this); return true; } // caught in web: they only shake it
    if (now < this.attackReadyAt || this.attacking || this.parrying || this.teleporting) return false;
    this.aspects.beforeAttack();
    this.attackReadyAt = now + A.cooldown * this.buffs.cooldownMultiplier;
    this.attacking = true;
    this.attackEndsAt = now + A.attackDuration;
    this.attackContacts.clear();
    this.view.playSwing();
    this.world.sound('swing');
    const p = this.attackPoint;
    const angle = Math.atan2(this.facing.y, this.facing.x);
    this.world.effects.burst(p.x, p.y, angle, { ...PARTICLES.swing, color: this.view.swingTint });
    this.buffs.view.swung(p, angle);
    return true;
  }

  endAttack() {
    this.attacking = false;
    this.attackContacts.clear();
    this.view.hideSwing();
  }

  get attackDamage() { return A.attackDamage * this.world.adrenaline.damageMultiplier * this.buffs.damageMultiplier * this.aspects.damageMultiplier; }

  onAttackHit(enemy) {
    if (enemy.dead) return;
    const src = this.attackPoint;
    const hitPoint = enemy.closestPoint(src);
    enemy.takeDamage(this.attackDamage, hitPoint, src, DamageCause.Attack);
    this.view.playHitImpact(hitPoint);
    this.world.holdStill(enemy.dead ? ENEMY_HIT.killHitstop : ENEMY_HIT.hitstop);
    this.world.camera.shakeAtLeast(ENEMY_HIT.shake);
    this.attackReadyAt = Math.min(this.attackReadyAt, this.now + A.cooldownAfterHit * this.buffs.cooldownMultiplier);
    if (!enemy.dead) enemy.applyKnockback(A.enemyKnockbackForce, src, this.facing);
    this.applyRecoil(A.playerKnockbackForce);
    this.aspects.onHitEnemy(enemy, hitPoint);
  }

  // Props land like enemy hits (the quicker follow-up, the recoil) but aren't enemies to
  // the aspects (they hear of them through onHitProp) or the adrenaline meter.
  onAttackProp(prop) {
    if (prop.dead) return;
    const src = this.attackPoint;
    const hitPoint = prop.closestPoint(src);
    prop.takeDamage(this.attackDamage, hitPoint, src);
    this.view.playHitImpact(hitPoint);
    this.attackReadyAt = Math.min(this.attackReadyAt, this.now + A.cooldownAfterHit * this.buffs.cooldownMultiplier);
    this.applyRecoil(A.playerKnockbackForce);
    this.aspects.onHitProp(prop, hitPoint);
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

  // The parry's hitbox: a chain of capsules along the curve its look sweeps (see
  // PLAYER.parry.look), placed as the look is, scaled about the attack point.
  parryCapsules(segments = 8) {
    const L = P.look, { cx, cy, r } = L.arc, s = this.sizeScale;
    const f = isZero(this.facing) ? { x: 1, y: 0 } : this.facing;
    const a = r * L.width * P.size, b = r * L.height * P.size; // the ellipse's radii, ahead and across
    const x0 = (L.forward + (cx - 0.5) * L.width) * P.size, y0 = (cy - 0.5) * L.height * P.size;
    const points = Array.from({ length: segments + 1 }, (_, i) => {
      const t = ((i / segments) * 2 - 1) * L.sweepDeg * (Math.PI / 180), c = Math.cos(t), sn = Math.sin(t);
      const n = Math.hypot(b * c, a * sn);
      const u = A.attackRange + s * (x0 + a * c - (P.hitboxInset * b * c) / n - A.attackRange);
      const v = s * (y0 + b * sn - (P.hitboxInset * a * sn) / n);
      return { x: this.body.pos.x + f.x * u - f.y * v, y: this.body.pos.y + f.y * u + f.x * v };
    });
    const rad = P.hitboxRadius * s;
    return points.slice(1).map((q, i) => {
      const p = points[i];
      return { ax: p.x, ay: p.y, bx: q.x, by: q.y, r: rad, cx: (p.x + q.x) / 2, cy: (p.y + q.y) / 2 };
    });
  }

  // The first of the parry's capsules `attack` reaches, if any.
  parryCapsuleHit(attack) { return this.parryCapsules().find((cap) => attack.overlapsCapsule(cap)) ?? null; }

  // Whether `point` lies ahead of the player, within the angle the parry's band wraps round to.
  inParryArc(point) {
    const b = this.body.pos, f = isZero(this.facing) ? { x: 1, y: 0 } : this.facing;
    const caps = this.parryCapsules(1), end = { x: caps[0].ax - b.x, y: caps[0].ay - b.y };
    const dx = point.x - b.x, dy = point.y - b.y, l = Math.hypot(dx, dy);
    return l < 1e-6 || (dx * f.x + dy * f.y) / l >= (end.x * f.x + end.y * f.y) / Math.hypot(end.x, end.y);
  }

  // Whether the parry takes `attack`: it reaches the parry's band, or it has reached the player
  // (or, given `hitPoint`, struck them there) from ahead. Nothing from behind.
  parryCovers(attack, hitPoint = null) {
    if (this.parryCapsuleHit(attack)) return true;
    const b = this.body;
    if (!hitPoint) {
      if (!attack.overlapsCircle(b.pos.x, b.pos.y, b.radius)) return false;
      hitPoint = attack.closestPoint({ ax: b.pos.x, ay: b.pos.y, bx: b.pos.x, by: b.pos.y, r: 0, cx: b.pos.x, cy: b.pos.y });
    }
    return this.inParryArc(hitPoint);
  }

  // ── dash ─────────────────────────────────────────────────────────
  tryStartDash() {
    const now = this.now;
    if (this.reeledBy) { this.reeledBy.struggle(this); return true; } // caught in web: they only shake it
    if (this.dashing || this.teleporting || now < this.dashReadyAt || isZero(this.movement)) return false;
    const d = norm(this.movement);
    this.dashing = true;
    this.dashEndsAt = now + D.dashDuration;
    this.dashReadyAt = now + D.dashCooldown;
    this.body.vel.x = d.x * D.dashSpeed;
    this.body.vel.y = d.y * D.dashSpeed;
    this.aspects.onDash(d); // first, so the dash's look knows if an aspect has changed the body
    this.view.playDash(d);
    this.world.sound('dash');
    return true;
  }

  // ── parry ────────────────────────────────────────────────────────
  get parryDuration() { return P.parryDuration * settings.parryWindow; }

  tryStartParry() {
    const now = this.now, b = this.body;
    if (this.attacking || this.parrying || this.teleporting || now < this.parryReadyAt) return false;
    // No parrying while still inside the attack that hurt the player.
    if (this.hurtBy?.overlapsCircle(b.pos.x, b.pos.y, b.radius)) return false;
    this.parrying = true;
    this.parryEndsAt = now + this.parryDuration;
    this.parrySucceeded = false;
    this.parriedThisWindow.clear();
    this.view.playParry();
    this.world.sound('parryStart');
    // A hit about to land is parried as if the parry had been in time, if it came from ahead.
    const hit = this.pendingHit;
    if (hit && this.parryCovers(hit.attack, hit.hitPoint) && this.tryParry(hit.attack)) this.pendingHit = null;
    this.parryOverlapping(); // attacks already inside the window count immediately
    return true;
  }

  endParry() {
    this.parrying = false;
    this.parriedThisWindow.clear();
    if (this.parrySucceeded) return; // its look already gave way to the connect
    this.view.fadeParry();
    this.parryReadyAt = this.now + P.parryCooldown;
  }

  parryOverlapping() {
    const caps = this.parryCapsules();
    for (const attack of [...this.world.hostileAttacks]) if (caps.some((cap) => attack.overlapsCapsule(cap))) this.tryParry(attack);
  }

  // Called by an enemy attack right before it would deal damage: a parry wins ties.
  tryParryIncoming(attack) {
    return this.parrying && this.parryCovers(attack) && this.tryParry(attack);
  }

  // The attack that hurt the player passes through their parries.
  tryParry(attack) {
    if (attack === this.hurtBy) return false;
    if (this.parriedThisWindow.has(attack)) return true;
    const b = this.body.pos;
    const contact = attack.closestPoint(this.parryCapsuleHit(attack) ?? { ax: b.x, ay: b.y, bx: b.x, by: b.y, r: 0, cx: b.x, cy: b.y });
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
      this.world.events.parried.emit(attack);
      this.world.adrenaline.extend(ADRENALINE.extendPerParry);
    }
    return true;
  }

  // Extra damage a parry of an attack worth `base` deals for the current streak (0 on the
  // first parry): a fraction of the base per level.
  parryBonusDamage(base) { return Math.max(0, this.parryStreak - 1) * P.comboDamageFraction * base; }

  // ── health ───────────────────────────────────────────────────────
  // An enemy attack connects (having beaten any parry). The hit lands H.hitCoyoteTime later,
  // unless a parry started by then takes the attack instead (see tryStartParry). Nothing
  // else can hit the player meanwhile. An attack can land however recently they were hurt
  // (its ignoresInvincibility: the Weaver's, on a player it has caught).
  hitBy(attack, damage, hitPoint, source) {
    if (this.dead || this.death || this.pendingHit) return;
    const pierce = !!attack.ignoresInvincibility?.(this);
    if (this.now < this.invincibleUntil && !pierce) return;
    this.pendingHit = { attack, damage, hitPoint, source, pierce, landsAt: this.now + H.hitCoyoteTime };
    this.world.events.playerThreatened.emit(this, this.pendingHit);
  }

  // A parry, turned toward the hit about to land, that takes it whatever the player was doing
  // (under parryGuardUntil). False if there's no such hit or it can't be parried.
  parryPendingHit() {
    const hit = this.pendingHit, b = this.body;
    if (!hit || hit.attack === this.hurtBy) return false;
    const to = Math.hypot(hit.source.x - b.pos.x, hit.source.y - b.pos.y) > 0.01 ? hit.source : hit.hitPoint;
    this.facing = norm({ x: to.x - b.pos.x, y: to.y - b.pos.y });
    b.rotation = Math.atan2(this.facing.y, this.facing.x);
    if (this.attacking) this.endAttack();
    if (this.parrying) { this.parrying = false; this.view.hideParry(); }
    this.parryReadyAt = 0;
    this.hurtBy = null;
    return this.tryStartParry() && !this.pendingHit;
  }

  landPendingHit() {
    const { attack, damage, hitPoint, source, pierce } = this.pendingHit;
    this.pendingHit = null;
    this.hurtBy = this.world.hostileAttacks.has(attack) ? attack : null;
    this.takeDamage(damage, hitPoint, source, pierce);
  }

  // `pierce`: however recently they were hurt.
  takeDamage(damage, hitPoint = this.body.pos, source = this.body.pos, pierce = false) {
    if (this.dead || this.death || (this.now < this.invincibleUntil && !pierce)) return;
    // A ward takes the hit instead, with the moment of invulnerability a hit would give.
    if (damage > 0 && this.buffs.absorb(source)) {
      this.lastHitAt = this.now;
      this.invincibleUntil = this.now + H.invincibilityDuration;
      return;
    }
    const final = devFlags.fullResistance ? 0 : damage * this.world.adrenaline.damageTakenMultiplier * damageTakenScale();
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
    if (this.death) return;
    this.endAttack();
    if (this.parrying) { this.parrying = false; this.view.hideParry(); }
    this.dashing = false;
    this.death = new PlayerDeath(this);
    this.world.playerDied(this.death.duration);
  }

  // ── lifecycle ────────────────────────────────────────────────────
  render(alpha, dt) {
    this.view.render(alpha, dt);
    this.buffs.render(alpha, dt);
    this.aspects.render(alpha, dt);
  }

  dispose() {
    this.offParried();
    this.buffs.destroy();
    this.aspects.dispose();
    this.world.physics.remove(this.body);
    this.view.destroy();
    this.death?.destroy();
  }
}
