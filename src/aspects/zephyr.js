// Zephyr: the player's blade turns to wind. Its swings (data.attack, read through
// AspectController.attack) come quick, hit or miss, keep coming while the attack key is held,
// barely knock anything back and deal half the usual damage. Each is drawn as a round, see-through
// crescent in the usual swings' colours sweeping about the player (ZEPHYR_ARC,
// src/render/sprites/aspects/zephyr.js) in place of the usual swing, every other one the other
// way, its head shedding motes round the arc. The hitbox is the usual one.
import { Container, Sprite } from 'pixi.js';
import { Aspect } from './aspect.js';
import { randRange } from '../engine/math.js';
import { anims, tex } from '../render/assets.js';
import { Plume } from '../render/fx.js';
import { ZEPHYR_ARC, zephyrHead } from '../render/sprites/aspects/zephyr.js';

const DEG = Math.PI / 180;
const pick = ([min, max]) => randRange(min, max);

export class ZephyrAspect extends Aspect {
  constructor(player, data) {
    super(player, data);
    this.side = 1; // which way the next swing sweeps, alternating
    this.layer = new Container();
    player.world.layers.player.addChild(this.layer);
    this.arcs = []; // { sprite, t, angle, side, scale, moteDebt }, live swings (a held flurry overlaps a little)
    this.pool = [];
    this.motes = new Plume(player.world.layers.fx, tex.glint, { drag: 5 });
  }

  onSwing() {
    const F = this.data.fx, f = this.player.attackFacing;
    const sprite = this.pool.pop() ?? this.layer.addChild(new Sprite({ texture: anims.zephyr_swing[0], anchor: 0.5 }));
    sprite.visible = true;
    this.side = -this.side;
    this.arcs.push({
      sprite, t: 0, side: this.side, moteDebt: 0,
      angle: Math.atan2(f.y, f.x), // straight along the aim, so it reaches as far round either side
      scale: 1 + randRange(-F.scale, F.scale),
    });
  }

  render(alpha, dt) {
    const F = this.data.fx, frames = anims.zephyr_swing, p = this.player;
    const at = p.body.lerpPos(alpha), tint = p.view.swingTint;
    for (let i = this.arcs.length - 1; i >= 0; i--) {
      const a = this.arcs[i];
      a.t += dt / F.time;
      const frame = Math.floor(a.t * frames.length);
      if (frame >= frames.length || p.death) {
        a.sprite.visible = false;
        this.pool.push(a.sprite);
        this.arcs.splice(i, 1);
        continue;
      }
      const s = a.sprite, k = (ZEPHYR_ARC.size / s.texture.width) * a.scale * p.sizeScale;
      s.texture = frames[frame];
      s.position.set(at.x, at.y);
      s.rotation = a.angle;
      s.scale.set(k, k * a.side); // mirrored every other swing, so it sweeps back the other way
      s.tint = tint;
      s.alpha = F.alpha;
      this.shed(a, at, dt);
    }
    this.motes.update(dt);
  }

  // Motes thrown off the head as it sweeps, blown on round the arc the way it's going.
  shed(a, at, dt) {
    const M = this.data.fx.motes, { deg, sweeping } = zephyrHead(a.t);
    if (!sweeping) return;
    const r = ZEPHYR_ARC.r * a.scale * this.player.sizeScale;
    const h = a.angle + deg * DEG * a.side, along = h + (Math.PI / 2) * a.side;
    for (a.moteDebt += M.rate * dt; a.moteDebt >= 1; a.moteDebt--) {
      const v = pick(M.speed), rr = r + randRange(-0.08, 0.12);
      this.motes.spawn({
        x: at.x + Math.cos(h) * rr, y: at.y + Math.sin(h) * rr,
        vx: Math.cos(along) * v, vy: Math.sin(along) * v,
        size: pick(M.size), life: pick(M.life), alpha: M.alpha, color: M.color, fade: M.fade,
      });
    }
  }

  dispose() {
    this.motes.destroy();
    this.layer.destroy({ children: true });
  }
}
