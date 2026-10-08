// Player visuals: the wobbling blob body, trailing tail followers, swing and parry
// sprites, the hurt flash/blink (derived from the time of the last hit), the dash's stretch,
// afterimages and trails (DashView), and the Exalted state's fire and wings (ExaltedView).
import { Container, MeshSimple, Sprite, Texture } from 'pixi.js';
import { EXALTED_FX, FIXED_DT, FX, PLAYER, PARTICLES } from '../data/config.js';
import { lerp, lerpColor, smoothDamp, isZero, TAU } from '../engine/math.js';
import { anims, tex } from '../render/assets.js';
import { FrameAnim } from '../render/fx.js';
import { DashView } from './dashView.js';
import { ExaltedView } from './exaltedView.js';

const B = PLAYER.blob, T = PLAYER.tail, A = PLAYER.attack, P = PLAYER.parry, HF = PLAYER.hitFeedback;
const SWINGS = ['first_swing', 'second_swing', 'third_swing', 'fourth_swing'];
const TRAIL_STRIDE = Math.max(1, Math.ceil(T.delayPerFollower / FIXED_DT)); // samples between followers

export class PlayerView {
  constructor(player) {
    this.player = player;
    const layers = player.world.layers;
    const { x, y } = player.body.pos;

    // Tail followers trail recorded physics positions, each a bit smaller and laggier.
    this.trail = Array.from({ length: TRAIL_STRIDE * T.followerCount + 1 }, () => ({ x, y }));
    this.followers = Array.from({ length: T.followerCount }, (_, i) => {
      const sprite = new Sprite(tex.tail);
      sprite.anchor.set(0.5);
      sprite.width = sprite.height = Math.max(0.1, T.firstFollowerScale - T.scaleStep * i);
      sprite.alpha = Math.max(0, Math.min(1, T.firstFollowerAlpha - T.alphaStep * i));
      sprite.position.set(x, y);
      sprite.zIndex = T.followerCount - i; // nearer followers draw over farther ones
      layers.playerBack.addChild(sprite);
      return { sprite, vx: { v: 0 }, vy: { v: 0 }, smoothTime: T.baseSmoothTime + T.smoothTimeStep * i };
    });

    this.body = new Container();
    this.tailSource = new Sprite(tex.tail);
    this.tailSource.anchor.set(0.5);
    this.tailSource.width = this.tailSource.height = T.sourceScale;
    this.blob = new BlobMesh(Math.max(3, B.resolution));
    this.body.addChild(this.tailSource, this.blob.outline, this.blob.fill);
    layers.player.addChild(this.body);
    this.waveTime = 0;
    this.breathingTime = 0;
    this.flashing = false;

    // Swing + parry sprites ride on the attack point and rotate with the aim.
    this.attackPoint = new Container();
    layers.player.addChild(this.attackPoint);
    this.swings = SWINGS.map((name) => {
      const sprite = new Sprite(anims[name][0]);
      sprite.anchor.set(0.5);
      sprite.width = sprite.height = A.visualSize;
      sprite.visible = false;
      this.attackPoint.addChild(sprite);
      return new FrameAnim(sprite, anims[name]);
    });
    this.swingIndex = 0;
    const parry = new Sprite(anims.parry[0]);
    parry.anchor.set(0.5);
    parry.position.set(-0.35 * PLAYER.scale, 0);
    parry.width = 2 * 1.4 * PLAYER.scale;
    parry.height = 2 * 0.9 * PLAYER.scale;
    parry.visible = false;
    this.attackPoint.addChild(parry);
    this.parryAnim = new FrameAnim(parry, anims.parry);

    this.dash = new DashView(player);
    this.exalted = new ExaltedView(player);
    this.tint = 0xffffff; // white, warming to EXALTED_FX.tint while Exalted
  }

  playSwing() {
    this.hideSwing();
    const anim = this.swings[this.swingIndex];
    this.swingIndex = (this.swingIndex + 1) % this.swings.length;
    anim.sprite.visible = true;
    anim.play(FX.swingAnimSpeed);
  }

  hideSwing() {
    for (const a of this.swings) { a.sprite.visible = false; a.stop(); }
  }

  playDash(dir) {
    this.dash.start(dir);
  }

  playParry() {
    this.parryAnim.sprite.visible = true;
    this.parryAnim.play(P.clipLength / P.parryDuration);
  }

  hideParry() {
    this.parryAnim.sprite.visible = false;
    this.parryAnim.stop();
  }

  // `level` is the parry streak beyond the first (0 … comboMax - 1); each one grows the flash
  // and sparks and warms their colour, and the top of the streak adds a backward flash and a nova.
  playParryConnect(pos, level = 0) {
    const f = this.player.facing;
    const fx = this.player.world.effects;
    const angle = Math.atan2(f.y, f.x);
    const g = 1 + FX.parryComboGrowth * level, warmth = level / (P.comboMax - 1);
    const grow = (o) => ({
      ...o, count: Math.round(o.count * g), speed: o.speed * g, size: o.size * g,
      color: lerpColor(o.color, FX.parryComboColor, warmth),
    });
    fx.playOnce(anims.parry_connect, pos.x, pos.y, angle, FX.parryConnectSize * g, this.tint);
    fx.burst(pos.x, pos.y, angle, grow(PARTICLES.parryConnect));
    fx.burst(pos.x, pos.y, angle, grow(PARTICLES.parryConnectRing));
    if (level < P.comboMax - 1) return;
    fx.playOnce(anims.parry_connect, pos.x, pos.y, angle + Math.PI, FX.parryConnectSize * g * 0.6, this.tint);
    fx.burst(pos.x, pos.y, angle, PARTICLES.parryComboNova);
  }

  playHitImpact(pos) {
    const f = this.player.facing;
    const angle = Math.atan2(f.y, f.x) + (Math.random() * 2 - 1) * FX.hitImpactJitter;
    this.player.world.effects.playOnce(anims.hit_impact, pos.x, pos.y, angle, FX.hitImpactSize);
  }

  // Called every simulation step with the post-physics position.
  recordTrail() {
    const last = this.trail.pop();
    last.x = this.player.body.pos.x;
    last.y = this.player.body.pos.y;
    this.trail.unshift(last);
  }

  render(alpha, dt) {
    const player = this.player;
    this.waveTime += dt * B.waveSpeed;
    this.breathingTime += dt;
    this.blob.update(this.waveTime, this.breathingTime);

    const p = player.body.lerpPos(alpha);
    this.body.position.set(p.x, p.y);
    this.exalted.render(p, dt);
    this.dash.render(p, dt, this.exalted.glow);
    this.dash.shape(this.body, PLAYER.scale * player.sizeScale);
    this.tint = lerpColor(0xffffff, EXALTED_FX.tint, this.exalted.glow);
    this.blob.outline.tint = lerpColor(B.outlineColor, EXALTED_FX.tint, this.exalted.glow);
    for (const a of this.swings) a.sprite.tint = this.tint;
    this.parryAnim.sprite.tint = this.tint;

    const f = isZero(player.facing) ? { x: 1, y: 0 } : player.facing;
    this.attackPoint.position.set(p.x + f.x * A.attackRange, p.y + f.y * A.attackRange);
    this.attackPoint.rotation = Math.atan2(f.y, f.x);
    this.attackPoint.scale.set(player.sizeScale);
    for (const a of this.swings) a.update(dt);
    this.parryAnim.update(dt);

    this.followers.forEach((fl, i) => {
      const target = this.trail[Math.min(this.trail.length - 1, (i + 1) * TRAIL_STRIDE)];
      fl.sprite.x = smoothDamp(fl.sprite.x, target.x, fl.vx, fl.smoothTime, dt);
      fl.sprite.y = smoothDamp(fl.sprite.y, target.y, fl.vy, fl.smoothTime, dt);
    });

    // Hurt feedback: solid white flash, then blink until invincibility ends.
    const since = player.now - player.lastHitAt;
    const flashing = since < HF.flashDuration;
    const blinking = !flashing && since < PLAYER.health.invincibilityDuration;
    const visible = !blinking || Math.floor((since - HF.flashDuration) / Math.max(0.01, HF.blinkInterval)) % 2 === 1;
    this.setFlash(flashing);
    this.body.visible = visible;
    // The tail's ring warms with the outline, but the hurt flash stays white.
    const tailTint = this.flashing ? 0xffffff : this.tint;
    this.tailSource.tint = tailTint;
    for (const fl of this.followers) { fl.sprite.visible = visible; fl.sprite.tint = tailTint; }
  }

  setFlash(on) {
    if (on === this.flashing) return;
    this.flashing = on;
    const tail = on ? tex.tail_white : tex.tail;
    this.tailSource.texture = tail;
    for (const fl of this.followers) fl.sprite.texture = tail;
    this.blob.fill.tint = on ? 0xffffff : B.fillColor;
  }

  destroy() {
    this.body.destroy({ children: true });
    this.attackPoint.destroy({ children: true });
    this.exalted.destroy();
    this.dash.destroy();
    for (const fl of this.followers) fl.sprite.destroy();
  }
}

// Wobbling, breathing circle drawn as two meshes (outline band + fill) whose vertex
// buffers are rewritten each frame — no re-triangulation.
class BlobMesh {
  constructor(n) {
    this.n = n;
    const fanIdx = [], bandIdx = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      fanIdx.push(0, i + 1, j + 1);
      bandIdx.push(i, j, n + i, j, n + j, n + i); // outer ring 0..n-1, inner ring n..2n-1
    }
    this.fill = new MeshSimple({
      texture: Texture.WHITE,
      vertices: new Float32Array((n + 1) * 2),
      uvs: new Float32Array((n + 1) * 2),
      indices: new Uint32Array(fanIdx),
    });
    this.fill.tint = B.fillColor;
    this.outline = new MeshSimple({
      texture: Texture.WHITE,
      vertices: new Float32Array(n * 4),
      uvs: new Float32Array(n * 4),
      indices: new Uint32Array(bandIdx),
    });
    this.outline.tint = B.outlineColor;
  }

  update(waveTime, breathingTime) {
    const maxA = Math.max(0, B.waveAmplitude);
    const minA = Math.min(Math.max(B.breathingCycleLowerBound, 0), maxA);
    const amp = B.breathingCycleDuration > 0
      ? lerp(minA, maxA, 0.5 - 0.5 * Math.cos((breathingTime * TAU) / B.breathingCycleDuration))
      : maxA;
    const n = this.n;
    const fv = this.fill.vertices, ov = this.outline.vertices;
    const thickness = Math.max(0, B.outlineThickness);
    for (let i = 0; i < n; i++) {
      const a = (TAU * i) / n;
      const c = Math.cos(a), s = Math.sin(a);
      const r = B.radius + amp * Math.sin(B.waveCount * a + waveTime);
      const ri = Math.max(0.0001, r - thickness);
      ov[i * 2] = c * r; ov[i * 2 + 1] = s * r;
      ov[(n + i) * 2] = c * ri; ov[(n + i) * 2 + 1] = s * ri;
      fv[(i + 1) * 2] = c * ri; fv[(i + 1) * 2 + 1] = s * ri;
    }
  }
}
