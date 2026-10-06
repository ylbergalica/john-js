// Rift: a successful parry unfolds blades on both sides of the player for a moment.
// Each enemy hit halves the damage of the next one.
import { Sprite } from 'pixi.js';
import { Aspect } from './aspect.js';
import { ContactSet, circleVsBox } from '../engine/physics.js';
import { FX } from '../data/config.js';
import { tex } from '../render/assets.js';
import { FrameAnim } from '../render/fx.js';

const frames = (name, n) => Array.from({ length: n }, (_, i) => tex[`${name}${i}`]);

export class RiftAspect extends Aspect {
  constructor(player, data) {
    super(player, data);
    this.active = false;
    this.activeUntil = 0;
    this.hiddenAt = Infinity; // when the closing animation finishes
    this.damage = data.damage;
    this.contacts = new ContactSet();
    this.sprite = new Sprite(tex.rift_open0);
    this.sprite.anchor.set(0.5);
    this.sprite.visible = false;
    player.world.layers.player.addChild(this.sprite);
    const openFrames = frames('rift_open', 5), closeFrames = frames('rift_close', 4);
    this.openAnim = new FrameAnim(this.sprite, openFrames);
    this.closeAnim = new FrameAnim(this.sprite, closeFrames);
    this.closeDuration = closeFrames.length / FX.animFps;
  }

  onParry() {
    this.damage = this.data.damage * this.world.adrenaline.damageMultiplier;
    this.active = true;
    this.activeUntil = this.now + Math.max(0, this.data.activeTime);
    this.hiddenAt = Infinity;
    this.sprite.visible = true;
    this.contacts.clear();
    this.closeAnim.stop();
    this.openAnim.play();
    this.afterPhysics(); // enemies already inside are hit immediately
  }

  step() {
    if (this.active && this.now >= this.activeUntil) {
      this.active = false;
      this.contacts.clear();
      this.hiddenAt = this.now + this.closeDuration;
      this.openAnim.stop();
      this.closeAnim.play();
    }
    if (this.now >= this.hiddenAt) {
      this.sprite.visible = false;
      this.hiddenAt = Infinity;
    }
  }

  afterPhysics() {
    if (!this.active) return;
    const b = this.player.body, s = this.player.sizeScale;
    const box = { x: b.pos.x, y: b.pos.y, hw: (this.data.hitboxDepth * s) / 2, hh: (this.data.hitboxWidth * s) / 2, angle: b.rotation };
    const hits = this.world.enemies.filter((e) => !e.dead && circleVsBox(e.body.pos.x, e.body.pos.y, e.body.radius, box));
    this.contacts.update(hits, (enemy) => this.hit(enemy, { x: box.x, y: box.y }));
  }

  hit(enemy, source) {
    if (enemy.dead) return;
    enemy.takeDamage(this.damage, enemy.closestPoint(source), source);
    if (!enemy.dead) enemy.applyKnockback(this.data.enemyKnockbackForce, source);
    if (this.damage >= this.data.minDamage) this.damage *= 0.5;
  }

  render(alpha, dt) {
    if (!this.sprite.visible) return;
    this.openAnim.update(dt);
    this.closeAnim.update(dt);
    const b = this.player.body, s = this.player.sizeScale;
    const p = b.lerpPos(alpha);
    this.sprite.position.set(p.x, p.y);
    this.sprite.rotation = b.lerpRotation(alpha);
    this.sprite.width = this.data.spriteW * s;
    this.sprite.height = this.data.spriteH * s;
  }

  dispose() { this.sprite.destroy(); }
}
