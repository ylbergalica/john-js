// Rift: a successful parry unfolds blades on both sides of the player for a moment.
// Each enemy hit halves the damage of the next one, down to a floor. While out, the blades
// shed motes; both take the player's tint, so they burn red while Exalted.
import { Sprite } from 'pixi.js';
import { Aspect } from './aspect.js';
import { ContactSet, circleVsBox } from '../engine/physics.js';
import { randRange } from '../engine/math.js';
import { FX } from '../data/config.js';
import { anims, tex } from '../render/assets.js';
import { FrameAnim, Plume } from '../render/fx.js';

// Where the blades lie in the sprite, in units of its width from the centre: across
// (behind to in front of the player) and along each side (from the body out to the tip).
const BLADE_X = [-0.15, 0.25], BLADE_Y = [0.2, 1.8];
const pick = ([min, max]) => randRange(min, max);

export class RiftAspect extends Aspect {
  constructor(player, data) {
    super(player, data);
    this.active = false;
    this.activeUntil = 0;
    this.hiddenAt = Infinity; // when the closing animation finishes
    this.damage = data.damage;
    this.minDamage = data.minDamage;
    this.contacts = new ContactSet();
    this.sprite = new Sprite(anims.rift_open[0]);
    this.sprite.anchor.set(0.5);
    this.sprite.visible = false;
    player.world.layers.player.addChildAt(this.sprite, 0); // behind the player's body
    this.openAnim = new FrameAnim(this.sprite, anims.rift_open);
    this.closeAnim = new FrameAnim(this.sprite, anims.rift_close);
    this.closeDuration = anims.rift_close.length / FX.animFps;
    this.motes = new Plume(player.world.layers.fx, tex.glint, { drag: 3 });
  }

  onParry() {
    const mult = this.world.adrenaline.damageMultiplier;
    this.damage = this.data.damage * mult;
    this.minDamage = this.data.minDamage * mult;
    this.active = true;
    this.activeUntil = this.now + Math.max(0, this.data.activeTime);
    this.hiddenAt = Infinity;
    this.sprite.visible = true;
    this.contacts.clear();
    this.closeAnim.stop();
    this.openAnim.play();
    this.world.sound('rift');
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
    enemy.takeDamage(this.damage, enemy.closestPoint(source), source, this.data.id);
    if (!enemy.dead) enemy.applyKnockback(this.data.enemyKnockbackForce, source);
    this.damage = Math.max(this.minDamage, this.damage * 0.5);
  }

  render(alpha, dt) {
    this.motes.update(dt);
    if (!this.sprite.visible) return;
    this.openAnim.update(dt);
    this.closeAnim.update(dt);
    const b = this.player.body, s = this.player.sizeScale;
    const p = b.lerpPos(alpha);
    this.sprite.position.set(p.x, p.y);
    this.sprite.rotation = b.lerpRotation(alpha);
    this.sprite.width = this.data.spriteW * s;
    this.sprite.height = this.data.spriteH * s;
    this.sprite.tint = this.player.view.tint;
    if (this.active) this.shed(p, this.sprite.rotation, s, dt);
  }

  // Motes from random spots on either blade, drifting outward and back off the player.
  shed(p, rotation, s, dt) {
    const M = this.data.motes, unit = this.data.spriteW * s;
    const fx = Math.cos(rotation), fy = Math.sin(rotation); // forward; the blades lie along (-fy, fx)
    for (let i = Math.floor(M.rate * dt + Math.random()); i > 0; i--) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = pick(BLADE_X) * unit, y = side * pick(BLADE_Y) * unit;
      const out = side * pick(M.outward), back = -pick(M.back);
      this.motes.spawn({
        x: p.x + fx * x - fy * y, y: p.y + fy * x + fx * y,
        vx: fx * back - fy * out + randRange(-M.jitter, M.jitter), vy: fy * back + fx * out + randRange(-M.jitter, M.jitter),
        size: pick(M.size) * s, life: pick(M.life), color: this.player.view.tint,
      });
    }
  }

  dispose() {
    this.sprite.destroy();
    this.motes.destroy();
  }
}
