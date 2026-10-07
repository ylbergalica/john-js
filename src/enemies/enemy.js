// An enemy: body, health, hit feedback and drops. Behaviour lives in EnemyAI and
// the ability state machines.
import { Container, Sprite } from 'pixi.js';
import { Entity } from '../game/entity.js';
import { Body } from '../engine/physics.js';
import { randInt, randInsideUnitCircle, norm, fromAngle } from '../engine/math.js';
import { ENEMY_TYPES, ABILITIES, PARTICLES, PICKUPS } from '../data/config.js';
import { tex } from '../render/assets.js';
import { rectContainsCircle } from '../render/camera.js';
import { StarField } from '../render/starField.js';
import { createAbility } from './abilities.js';
import { EnemyAI } from './ai.js';
import { EnemyAttackFx, renderTime } from './attackView.js';
import { AdrenalineOrb, ChaserCore } from '../game/pickups.js';

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

    this.buildView();
    this.abilities = new Map();
    for (const { ability } of this.type.ai.attacks) {
      if (!this.abilities.has(ability)) this.abilities.set(ability, createAbility(this, ABILITIES[ability]));
    }
    this.ai = new EnemyAI(this, this.type.ai);
    this.attackFx = new EnemyAttackFx(this, this.silhouette);
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
      const hex = new Sprite(tex.hexFlat);
      hex.anchor.set(0.5);
      hex.width = v.width; hex.height = v.height;
      hex.tint = v.color;
      this.view.addChild(hex);
      this.silhouette = { texture: tex.hexFlat_white, width: v.width, height: v.height };
    }
    this.world.layers.enemies.addChild(this.view);
  }

  step(dt) {
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

  takeDamage(damage, hitPoint = null, source = null) {
    if (this.dead) return;
    source ??= this.player ? { ...this.player.body.pos } : { ...this.body.pos };
    hitPoint ??= { ...this.body.pos };
    if (damage > 0) this.onHurt(hitPoint, source);
    this.health -= damage;
    if (this.health <= 0) this.die();
  }

  onHurt(hitPoint, source) {
    this.flashUntil = this.world.time + this.type.flashDuration;
    const b = this.body;
    let dir = { x: b.pos.x - source.x, y: b.pos.y - source.y };
    if (dir.x * dir.x + dir.y * dir.y < 0.0001) dir = { x: b.pos.x - hitPoint.x, y: b.pos.y - hitPoint.y };
    if (dir.x * dir.x + dir.y * dir.y < 0.0001) dir = fromAngle(b.rotation);
    dir = norm(dir);
    // Particles spray out of the far side of the body.
    const off = b.radius + this.type.particleOffset;
    const x = b.pos.x + dir.x * off, y = b.pos.y + dir.y * off, angle = Math.atan2(dir.y, dir.x);
    this.world.effects.burst(x, y, angle, PARTICLES.enemyHit);
    this.world.effects.burst(x, y, angle, { ...PARTICLES.enemyHitTinted, color: this.type.hitColor });
    this.world.sound('hit', b.pos, { pitch: this.type.sfxPitch });
  }

  applyKnockback(force, source = null) {
    if (force <= 0 || this.dead) return;
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

  die() {
    const { world, body, type } = this;
    this.ai.onDeath();
    world.sound(type.isChaser ? 'bossKill' : 'kill', body.pos, { pitch: type.isChaser ? 1 : type.sfxPitch });
    const drops = randInt(type.minAdrenalineDrops, type.maxAdrenalineDrops + 1);
    for (let i = 0; i < drops; i++) {
      const o = randInsideUnitCircle();
      const s = PICKUPS.adrenalineOrb.scatter;
      world.add(new AdrenalineOrb(world, body.pos.x + o.x * s, body.pos.y + o.y * s));
    }
    if (type.isChaser) world.add(new ChaserCore(world, body.pos.x, body.pos.y));
    this.destroy();
    world.events.enemyKilled.emit(this);
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
    if (!visible) return;
    this.setFlash(this.world.time < this.flashUntil);
    if (!this.flashing) this.stars?.update(this.world.time);
  }

  // Hit flash: swap to white silhouettes (no filter pass).
  setFlash(on) {
    if (on === this.flashing || !this.voidSprite) return;
    this.flashing = on;
    const v = this.type.visual;
    this.voidSprite.texture = tex[on ? `${v.void}_white` : v.void];
    this.outline.texture = tex[on ? `${v.outline}_white` : v.outline];
    this.stars.container.visible = !on;
  }

  dispose() {
    this.ai.releaseSlot();
    for (const a of this.abilities.values()) a.dispose();
    this.attackFx.destroy();
    this.world.physics.remove(this.body);
    this.view.destroy({ children: true });
  }
}
