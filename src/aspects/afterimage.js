// Afterimage: setting off on a dash leaves a copy of the player where they stood, and every
// enemy hunts it instead of them (World.decoy) until it fades, the player drawn see-through
// meanwhile. Kills take time off the cooldown.
import { AlphaFilter, Container, Sprite } from 'pixi.js';
import { Aspect } from './aspect.js';
import { clamp01, lerp, lerpColor, smoothDamp, TAU } from '../engine/math.js';
import { EXALTED_FX, PLAYER } from '../data/config.js';
import { tex } from '../render/assets.js';
import { RING_RADIUS } from '../render/sprites.js';
import { BlobMesh } from '../player/playerView.js';

const B = PLAYER.blob, T = PLAYER.tail;
const easeOut = (t) => 1 - (1 - t) ** 3;

export class AfterimageAspect extends Aspect {
  constructor(player, data) {
    super(player, data);
    this.remaining = 0;
    this.image = null; // the copy the enemies hunt
    this.fading = []; // copies dissolving away
  }

  get cooldownFraction() { return clamp01(this.remaining / this.data.cooldown); }

  step(dt) {
    this.remaining = Math.max(0, this.remaining - dt);
    if (this.image && this.now >= this.image.endsAt) this.vanish();
  }

  onDash() {
    if (this.remaining > 0) return;
    if (this.image) this.vanish(); // still standing after a cooldown refresh
    this.image = new Afterimage(this.player, this.data);
    this.world.decoy = this.image;
    this.remaining = this.data.cooldown;
    this.used();
    this.world.sound('afterimage', this.image.body.pos);
  }

  onEnemyKilled() { this.remaining = Math.max(0, this.remaining - this.data.cooldownReductionPerKill); }

  refreshCooldown() { this.remaining = 0; }

  vanish() {
    const image = this.image;
    this.image = null;
    if (this.world.decoy === image) this.world.decoy = null;
    image.vanish();
    this.fading.push(image);
    this.world.sound('afterimageFade', image.body.pos);
  }

  // The player fades while the copy stands and comes back as it goes, over unseen.time.
  render(_alpha, dt) {
    const p = this.player, U = this.data.fx.unseen;
    if (this.image && p.death) this.vanish();
    const to = this.image ? U.alpha : 1, step = ((1 - U.alpha) * dt) / U.time;
    p.bodyAlpha = to < p.bodyAlpha ? Math.max(to, p.bodyAlpha - step) : Math.min(to, p.bodyAlpha + step);
    this.image?.render(dt);
    this.fading = this.fading.filter((image) => image.render(dt));
  }

  dispose() {
    if (this.image && this.world.decoy === this.image) this.world.decoy = null;
    this.image?.destroy();
    for (const image of this.fading) image.destroy();
    this.image = null;
    this.fading = [];
  }
}

// The copy: the player's body and tail as they were when they set off, standing still, the
// body wobbling and breathing on and the tail settling in behind it. Enemies read its `body`
// as they would the player's.
class Afterimage {
  constructor(player, data) {
    this.player = player;
    this.world = player.world;
    this.data = data;
    const { x, y } = player.body.pos, pv = player.view, { player: front, playerBack } = this.world.layers;
    this.body = { pos: { x, y }, vel: { x: 0, y: 0 }, radius: player.body.radius };
    this.endsAt = this.world.time + data.lifetime;
    this.size = PLAYER.scale * player.sizeScale * player.bodyScale;
    this.dissolve = null; // seconds into fading away, once gone (see vanish)

    this.view = new Container();
    this.tailSource = new Sprite(tex.tail);
    this.tailSource.anchor.set(0.5);
    this.tailSource.width = this.tailSource.height = T.sourceScale;
    this.blob = new BlobMesh(Math.max(3, B.resolution));
    this.view.addChild(this.tailSource, this.blob.outline, this.blob.fill);
    this.view.position.set(x, y);
    this.view.scale.set(this.size);
    front.addChildAt(this.view, 0); // under the player
    this.waveTime = pv.waveTime;
    this.breathingTime = pv.breathingTime;
    this.fade = new AlphaFilter(); // fades it as one piece, as the player's body is (PlayerView)
    this.faded = false;

    this.followers = pv.followers.map((fl) => {
      const sprite = new Sprite(tex.tail);
      sprite.anchor.set(0.5);
      sprite.width = sprite.height = fl.size * player.bodyScale;
      sprite.position.set(fl.sprite.x, fl.sprite.y);
      sprite.zIndex = fl.sprite.zIndex;
      playerBack.addChild(sprite);
      return { sprite, alpha: fl.alpha, x: fl.x, y: fl.y, vx: { v: fl.vx.v }, vy: { v: fl.vy.v }, smoothTime: fl.smoothTime };
    });
    this.appearFx();
  }

  // A ring closes onto it in a faint flash and a few glints.
  appearFx() {
    const F = this.data.fx, A = F.appear, fx = this.world.deathFx, { x, y } = this.body.pos;
    const d0 = A.ring.from / RING_RADIUS, d1 = A.ring.to / RING_RADIUS; // sprite width for that band radius
    fx.flare(tex.ring, x, y, 0, { time: A.ring.time, w0: d0, h0: d0, w1: d1, h1: d1, alpha: A.ring.alpha, color0: F.color, color1: F.hot });
    fx.flare(tex.mist, x, y, 0, { time: A.flash.time, w0: A.flash.size, h0: A.flash.size, w1: A.flash.size * 0.5, h1: A.flash.size * 0.5, alpha: A.flash.alpha, color0: F.hot, color1: F.color });
    fx.scatter(fx.stars, A.glints, x, y, 0.4, F.hot, { fade: F.color });
  }

  // Gone: it swells and fades away in a flash, a ring racing out, glints and pale mist.
  vanish() {
    this.dissolve = 0;
    const F = this.data.fx, V = F.vanish, fx = this.world.deathFx, { x, y } = this.body.pos;
    fx.flare(tex.mist, x, y, 0, {
      time: V.flash.time, w0: V.flash.size, h0: V.flash.size, w1: V.flash.size * V.flash.grow, h1: V.flash.size * V.flash.grow,
      alpha: V.flash.alpha, color0: F.hot, color1: F.color,
    });
    const d0 = V.ring.from / RING_RADIUS, d1 = V.ring.to / RING_RADIUS;
    fx.flare(tex.ring, x, y, 0, { time: V.ring.time, w0: d0, h0: d0, w1: d1, h1: d1, alpha: V.ring.alpha, color0: F.hot, color1: F.color });
    fx.scatter(fx.stars, V.glints, x, y, 0.4, F.hot, { fade: F.color });
    fx.scatter(fx.mist, V.mist, x, y, 0.3, F.color, { alpha: V.mist.alpha, grow: V.mist.grow, fade: 0x000000 });
  }

  // False once it has faded away (and been destroyed).
  render(dt) {
    const F = this.data.fx, pv = this.player.view, { x, y } = this.body.pos;
    let alpha = 1, scale = this.size;
    if (this.dissolve !== null) {
      this.dissolve += dt;
      const t = this.dissolve / F.vanish.time;
      if (t >= 1) { this.destroy(); return false; }
      alpha = 1 - t;
      scale *= lerp(1, F.vanish.grow, easeOut(t));
    } else if (this.endsAt - this.world.time < F.flicker.from) {
      alpha = lerp(F.flicker.alpha, 1, 0.5 + 0.5 * Math.cos(this.world.time * F.flicker.rate * TAU));
    }

    this.waveTime += dt * B.waveSpeed;
    this.breathingTime += dt;
    this.blob.update(this.waveTime, this.breathingTime);
    this.view.scale.set(scale);
    // It warms with the player while they're Exalted.
    this.blob.outline.tint = lerpColor(B.outlineColor, EXALTED_FX.tint, pv.exalted.glow);
    this.tailSource.tint = pv.tint;
    this.fade.alpha = alpha;
    const faded = alpha < 1;
    if (faded !== this.faded) this.view.filters = (this.faded = faded) ? [this.fade] : null;

    for (const fl of this.followers) {
      fl.x = smoothDamp(fl.x, x, fl.vx, fl.smoothTime, dt);
      fl.y = smoothDamp(fl.y, y, fl.vy, fl.smoothTime, dt);
      fl.sprite.position.set(fl.x, fl.y);
      fl.sprite.tint = pv.tint;
      fl.sprite.alpha = fl.alpha * alpha;
    }
    return true;
  }

  destroy() {
    this.view.destroy({ children: true });
    this.fade.destroy();
    for (const fl of this.followers) fl.sprite.destroy();
  }
}
