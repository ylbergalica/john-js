// An enemy: body, health, hit feedback and drops. Behaviour lives in EnemyAI and
// the ability state machines.
import { Container, Sprite } from 'pixi.js';
import { Entity } from '../game/entity.js';
import { Body, swapRemove } from '../engine/physics.js';
import { clamp01, lerp, lerpColor, randInt, randInsideUnitCircle, norm, fromAngle, TAU } from '../engine/math.js';
import { ENEMY_TYPES, ABILITIES, DEATH_FX, PARTICLES, PICKUPS } from '../data/config.js';
import { tex } from '../render/assets.js';
import { rectContainsCircle } from '../render/camera.js';
import { StarField } from '../render/starField.js';
import { createAbility } from './abilities.js';
import { EnemyAI } from './ai.js';
import { EnemyAttackFx, renderTime } from './attackView.js';
import { MaulerRig } from './maulerRig.js';
import { ShadeRig } from './shadeRig.js';
import { AdrenalineOrb, ChaserCore } from '../game/pickups.js';
import { devFlags } from '../game/devFlags.js';

const RIGS = { maul: MaulerRig, blades: ShadeRig };

export class Enemy extends Entity {
  constructor(world, typeKey, x, y) {
    super(world);
    this.typeKey = typeKey;
    this.type = ENEMY_TYPES[typeKey];
    this.body = world.physics.add(new Body({ x, y, radius: this.type.radius, mass: this.type.mass, damping: this.type.linearDamping }));
    this.health = this.type.maxHealth;
    this.isActing = false; // committed to an ability (wind-up through recovery)
    this.stunned = false;
    this.flashUntil = -Infinity;
    this.flashing = false;
    this.lastHitDir = null; // direction of the latest hit, so the death bursts along the killing blow
    this.summoned = false; // spawned from the spawn menu (World.summonEnemy)
    this.dying = null; // { at, nextSparkAt } while a slain guardian goes critical (see die)
    this.dyingWhite = false; // blinking white while dying

    this.buildView();
    this.abilities = new Map();
    for (const { ability } of this.type.ai.attacks) {
      if (!this.abilities.has(ability)) this.abilities.set(ability, createAbility(this, ABILITIES[ability]));
    }
    this.ai = new EnemyAI(this, this.type.ai);
    this.attackFx = new EnemyAttackFx(this, this.silhouette);
    const Rig = RIGS[this.type.visual.rig];
    this.rig = Rig ? new Rig(this) : null; // held weapons, posed by the attacks
  }

  get damage() { return this.type.damage; }
  get player() { return this.world.livePlayer; }

  buildView() {
    const v = this.type.visual;
    this.view = new Container();
    if (v.kind === 'sprite') {
      this.voidSprite = new Sprite(tex[v.void]);
      this.outline = new Sprite(tex[v.outline]);
      this.stars = new StarField(v.void, v.size, v.sparkleCount);
      for (const s of [this.voidSprite, this.outline]) {
        s.anchor.set(0.5);
        s.width = s.height = v.size;
      }
      this.view.addChild(this.voidSprite, this.stars.container, this.outline);
      this.silhouette = { texture: tex[`${v.outline}_white`], width: v.size, height: v.size };
    } else {
      const hex = this.hex = new Sprite(tex.hexFlat);
      hex.anchor.set(0.5);
      hex.width = v.width; hex.height = v.height;
      hex.tint = v.color;
      this.view.addChild(hex);
      this.silhouette = { texture: tex.hexFlat_white, width: v.width, height: v.height };
    }
    this.world.layers.enemies.addChild(this.view);
  }

  step(dt) {
    if (this.dying) { this.stepDying(); return; }
    for (const a of this.abilities.values()) a.step(dt);
    if (this.player) this.ai.step(dt);
  }

  afterPhysics() {
    for (const a of this.abilities.values()) a.hitbox?.afterPhysics();
  }

  closestPoint(p) {
    const b = this.body;
    const d = norm({ x: p.x - b.pos.x, y: p.y - b.pos.y });
    return { x: b.pos.x + d.x * b.radius, y: b.pos.y + d.y * b.radius };
  }

  // `cause`: what dealt the hit (a DamageCause or an aspect id).
  takeDamage(damage, hitPoint = null, source = null, cause = null) {
    if (this.dead || this.dying) return;
    source ??= this.player ? { ...this.player.body.pos } : { ...this.body.pos };
    hitPoint ??= { ...this.body.pos };
    if (damage > 0) this.onHurt(hitPoint, source);
    if (devFlags.noDamage) return; // hits still land, they just don't hurt
    this.health -= damage;
    if (damage > 0) this.world.events.enemyDamaged.emit(this, damage, cause);
    if (this.health <= 0) this.die(cause);
  }

  onHurt(hitPoint, source) {
    this.flashUntil = this.world.time + this.type.flashDuration;
    const b = this.body;
    let dir = { x: b.pos.x - source.x, y: b.pos.y - source.y };
    if (dir.x * dir.x + dir.y * dir.y < 0.0001) dir = { x: b.pos.x - hitPoint.x, y: b.pos.y - hitPoint.y };
    if (dir.x * dir.x + dir.y * dir.y < 0.0001) dir = fromAngle(b.rotation);
    dir = norm(dir);
    this.lastHitDir = dir;
    // Particles spray out of the far side of the body.
    const off = b.radius + this.type.particleOffset;
    const x = b.pos.x + dir.x * off, y = b.pos.y + dir.y * off, angle = Math.atan2(dir.y, dir.x);
    this.world.effects.burst(x, y, angle, PARTICLES.enemyHit);
    this.world.effects.burst(x, y, angle, { ...PARTICLES.enemyHitTinted, color: this.type.hitColor });
    this.world.sound('hit', b.pos, { pitch: this.type.sfxPitch });
  }

  applyKnockback(force, source = null) {
    if (force <= 0 || this.dead || this.dying) return;
    const eff = force * (1 - this.type.knockbackResistance);
    if (eff <= 0) return;
    const b = this.body;
    source ??= this.player ? this.player.body.pos : b.pos;
    let dir = norm({ x: b.pos.x - source.x, y: b.pos.y - source.y });
    if (dir.x === 0 && dir.y === 0) {
      const f = fromAngle(b.rotation);
      dir = { x: -f.x, y: -f.y };
    }
    // Cancel velocity heading into the hit so knockback always reads.
    const into = -(b.vel.x * dir.x + b.vel.y * dir.y);
    if (into > 0) { b.vel.x += dir.x * into; b.vel.y += dir.y * into; }
    b.addImpulse(dir.x * eff, dir.y * eff);
    this.ai.suppressMovementFor(this.type.knockbackMovementPause);
  }

  // A guardian doesn't burst at once: it stops dead and goes critical first (see
  // DEATH_FX.guardian.dying), out of the fight and the enemy list, and bursts after.
  die(cause = null) {
    if (this.type.isChaser) this.startDying();
    else this.burst();
    this.world.events.enemyKilled.emit(this, cause);
  }

  startDying() {
    const { world, body } = this;
    this.ai.onDeath();
    for (const a of this.abilities.values()) a.dispose();
    this.abilities.clear();
    this.isActing = this.stunned = false;
    swapRemove(world.enemies, this);
    this.dying = { at: world.time, nextSparkAt: world.time };
    world.sound('bossDying', body.pos);
  }

  stepDying() {
    const D = DEATH_FX.guardian.dying, w = this.world, b = this.body;
    b.stop();
    const k = clamp01((w.time - this.dying.at) / D.time);
    if (k >= 1) { this.burst(); return; }
    if (w.time >= this.dying.nextSparkAt) {
      this.dying.nextSparkAt = w.time + lerp(D.sparkEvery[0], D.sparkEvery[1], k);
      const a = Math.random() * TAU;
      w.effects.burst(b.pos.x + Math.cos(a) * b.radius, b.pos.y + Math.sin(a) * b.radius, a, { ...D.sparks, color: this.type.hitColor });
    }
  }

  burst() {
    const { world, body, type } = this;
    this.ai.onDeath();
    world.deathFx.play(this, this.lastHitDir ?? fromAngle(body.rotation));
    this.rig?.onDeath();
    world.sound(type.isChaser ? 'bossKill' : 'kill', body.pos, { pitch: type.isChaser ? 1 : type.sfxPitch });
    if (type.isChaser) world.shove(body.pos, DEATH_FX.guardian.push, this);
    if (type.isChaser && !this.summoned) world.guardianBurst(this);
    const drops = randInt(type.minAdrenalineDrops, type.maxAdrenalineDrops + 1);
    for (let i = 0; i < drops; i++) {
      const o = randInsideUnitCircle();
      const s = PICKUPS.adrenalineOrb.scatter;
      world.add(new AdrenalineOrb(world, body.pos.x + o.x * s, body.pos.y + o.y * s));
    }
    if (type.isChaser) world.add(new ChaserCore(world, body.pos.x, body.pos.y));
    this.destroy();
  }

  // Going critical: trembling, swelling, glowing and blinking white ever faster.
  renderDying(now, p) {
    const D = DEATH_FX.guardian.dying, fx = this.attackFx, r = this.body.radius, color = this.type.hitColor;
    const e = Math.max(0, now - this.dying.at), k = clamp01(e / D.time), kk = k * k;
    const j = randInsideUnitCircle(), shake = lerp(D.tremble[0], D.tremble[1], kk) * r;
    this.view.position.set(p.x + j.x * shake, p.y + j.y * shake);
    this.view.scale.set(1 + D.swell * kk);
    // Blink phase: the integral of a linearly rising rate.
    const [b0, b1] = D.blink, phase = b0 * e + ((b1 - b0) * e * e) / (2 * D.time);
    this.dyingWhite = phase % 1 < D.blinkOn || k > 1 - D.whiteOut / D.time;
    const G = D.glow;
    fx.glow.visible = true;
    fx.glow.tint = color;
    fx.glow.alpha = lerp(G.alpha[0], G.alpha[1], k) * (this.dyingWhite ? 1 : 0.75);
    fx.glow.width = fx.glow.height = G.size * r * 2 * (1 + G.grow * kk);
    fx.tint.visible = true;
    fx.tint.tint = lerpColor(color, 0xffffff, k);
    fx.tint.alpha = D.heat * k;
  }

  render(alpha, dt, view) {
    const p = this.body.lerpPos(alpha);
    const visible = rectContainsCircle(view, p.x, p.y, this.body.radius * 2);
    const now = renderTime(this.world, alpha), rot = this.body.lerpRotation(alpha);
    this.view.visible = visible;
    for (const a of this.abilities.values()) a.view?.render(now, alpha, dt);
    this.view.position.set(p.x, p.y);
    this.view.rotation = rot;
    this.attackFx.render(now, p, rot, visible);
    if (this.dying) this.renderDying(now, p);
    this.rig?.render(now, dt);
    this.attackFx.renderCue(now, visible);
    if (!visible) return;
    this.setFlash(this.dying ? this.dyingWhite : this.world.time < this.flashUntil);
    if (!this.flashing) this.stars?.update(this.world.time);
  }

  // Hit flash: swap to white silhouettes (no filter pass).
  setFlash(on) {
    if (on === this.flashing) return;
    this.flashing = on;
    const v = this.type.visual;
    if (this.hex) {
      this.hex.texture = on ? tex.hexFlat_white : tex.hexFlat;
      this.hex.tint = on ? 0xffffff : v.color;
      return;
    }
    this.voidSprite.texture = tex[on ? `${v.void}_white` : v.void];
    this.outline.texture = tex[on ? `${v.outline}_white` : v.outline];
    this.stars.container.visible = !on;
    this.rig?.setFlash(on);
  }

  dispose() {
    this.ai.releaseSlot();
    for (const a of this.abilities.values()) a.dispose();
    this.attackFx.destroy();
    this.world.physics.remove(this.body);
    this.view.destroy({ children: true });
  }
}
