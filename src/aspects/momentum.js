// Momentum: setting off on a dash charges the player's next swing to land on anything (an enemy
// or a prop), which deals `multiplier` times the damage to everything it strikes. The charge
// lasts until `window` seconds after the dash ends (a swing started by then still counts).
// While charged the player sheds embers, and a charged swing that lands on an enemy is shown
// as an empowered chop (CHOP, src/render/sprites/combat.js): the swings' white blade, thicker and brighter, brought down
// from over a shoulder onto the far edge of the swing's reach, slamming there in a flash and
// chips. A charged hit lands in a flash, a ring, a bigger impact, a spray of sparks, a stream
// of red sparks like a grinder's and a shake. Only the look changes, never the hitbox.
import { Container, Sprite } from 'pixi.js';
import { Aspect } from './aspect.js';
import { randRange } from '../engine/math.js';
import { FX } from '../data/config.js';
import { anims, tex } from '../render/assets.js';
import { Plume } from '../render/fx.js';
import { CHOP, CHOP_DRAW_FRAMES } from '../render/sprites/combat.js';

const pick = ([min, max]) => randRange(min, max);

export class MomentumAspect extends Aspect {
  constructor(player, data) {
    super(player, data);
    this.charged = false;
    this.chargedUntil = 0;
    this.chargedSwing = null; // the swing started while charged (its attackEndsAt)
    this.swing = null; // the charged swing (its attackEndsAt) once it has landed: the rest of it strikes charged too
    this.motes = new Plume(player.world.layers.fx, tex.glint, { drag: 3, lift: 0.6 });
    this.moteDebt = 0;
    this.side = Math.random() < 0.5 ? -1 : 1; // which shoulder the next chop comes over, alternating
    this.strike = null; // the chop being shown: { t, landed, dir }
    // Placed like the swings (on the attack point, turning with the aim), but over the
    // player's body, since it comes down across it.
    const sprite = new Sprite({ texture: anims.momentum_chop[0], anchor: 0.5 });
    sprite.position.set(CHOP.center, 0);
    this.mount = new Container();
    this.mount.visible = false;
    this.mount.addChild(sprite);
    player.world.layers.fx.addChild(this.mount);
    this.chop = sprite;
  }

  get available() { return this.charged; }
  get striking() { return this.player.attacking && this.player.attackEndsAt === this.swing; }
  get damageMultiplier() { return this.charged || this.striking ? this.data.multiplier : 1; }

  onDash() {
    this.charged = true;
    this.chargedUntil = this.player.dashEndsAt + this.data.window;
  }

  // The charge runs out `window` after the dash, unless a swing it empowered is still going.
  step() {
    const p = this.player;
    if (this.charged && this.now > this.chargedUntil && !(p.attacking && p.attackEndsAt === this.chargedSwing)) this.charged = false;
  }

  onSwing() { if (this.charged) this.chargedSwing = this.player.attackEndsAt; }

  // A charged swing that lands on an enemy shows the chop in place of the usual swing (from
  // the moment it lands, which is mostly as the swing starts); one that misses, or only hits
  // a prop, looks like any other.
  showChop() {
    const p = this.player, s = this.chop;
    p.view.hideSwing();
    this.side = -this.side;
    s.texture = anims.momentum_chop[0];
    const k = CHOP.size / s.texture.width;
    s.scale.set(k, k * this.side); // mirrored for the other shoulder
    s.tint = p.view.swingTint;
    this.mount.visible = true;
    const f = p.attackFacing;
    this.strike = { t: 0, landed: false, dir: Math.atan2(f.y, f.x) };
  }

  onHitProp(_prop, hitPoint) { this.onHitEnemy(null, hitPoint); }

  onHitEnemy(enemy, hitPoint) {
    if (this.charged) {
      this.charged = false;
      this.swing = this.player.attackEndsAt;
      this.used();
      this.world.sound('momentum', hitPoint);
      if (enemy) this.showChop();
    } else if (!this.striking) return;
    this.impactFx(hitPoint);
    if (enemy) this.pierceFx(enemy, hitPoint);
  }

  // As if the blow went right through: sparks bursting out of the enemy's far side along it,
  // with hot white ones shooting out straightest, and some thrown back out the way it went in.
  pierceFx(enemy, hitPoint) {
    const P = this.data.fx.hit.pierce, b = enemy.body, p = this.player.body.pos;
    let dx = b.pos.x - p.x, dy = b.pos.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) { dx = this.player.facing.x; dy = this.player.facing.y; } else { dx /= d; dy /= d; }
    const angle = Math.atan2(dy, dx), r = b.radius;
    const ex = b.pos.x + dx * r, ey = b.pos.y + dy * r, fx = this.world.effects;
    fx.burst(ex, ey, angle, P.exit);
    fx.burst(ex, ey, angle, P.exitHot);
    fx.burst(hitPoint.x, hitPoint.y, angle + Math.PI, P.entry);
  }

  impactFx({ x, y }) {
    const F = this.data.fx, I = F.hit, fx = this.world.deathFx, f = this.player.swingFacing;
    const angle = Math.atan2(f.y, f.x);
    fx.flare(tex.mist, x, y, 0, {
      time: I.flash.time, w0: I.flash.size, h0: I.flash.size, w1: I.flash.size * I.flash.grow, h1: I.flash.size * I.flash.grow,
      alpha: I.flash.alpha, color0: F.hot, color1: F.color,
    });
    fx.flare(tex.ring, x, y, 0, { time: I.ring.time, w0: I.ring.from, h0: I.ring.from, w1: I.ring.to, h1: I.ring.to, alpha: I.ring.alpha, color0: F.hot, color1: F.color });
    this.world.effects.playOnce(anims.hit_impact, x, y, angle, FX.hitImpactSize * I.impact, F.hot);
    this.world.effects.burst(x, y, angle, { ...I.sparks, color: F.color });
    // One stream of short red sparks thrown on along the chop, like off a grinder.
    this.world.effects.burst(x, y, this.strike?.dir ?? angle, I.stream);
    this.world.camera.shakeAtLeast(I.shake);
  }

  // The chop comes down on the far edge of the reach: a white flash and chips kicked back off it.
  landFx(dir) {
    const L = this.data.fx.strike.land, fx = this.world.deathFx, [c0, c1] = L.colors;
    const p = this.player, cap = p.attackCapsule(), f = { x: Math.cos(dir), y: Math.sin(dir) };
    const x = cap.cx + f.x * cap.r, y = cap.cy + f.y * cap.r;
    fx.flare(tex.mist, x, y, 0, {
      time: L.flash.time, w0: L.flash.size, h0: L.flash.size, w1: L.flash.size * L.flash.grow, h1: L.flash.size * L.flash.grow,
      alpha: L.flash.alpha, color0: c0, color1: c1,
    });
    this.world.effects.burst(x, y, dir + Math.PI, { ...L.chips, color: c0 });
  }

  // Plays the chop: shooting out over `draw` seconds, it slams down when it reaches the spot,
  // holds whole for `hold`, then is wiped away from the back over `follow`.
  stepStrike(dt) {
    const s = this.strike, S = this.data.fx.strike, sprite = this.chop;
    if (!s) return;
    s.t += dt;
    const frames = anims.momentum_chop, D = CHOP_DRAW_FRAMES, after = s.t - S.draw - S.hold;
    let i;
    if (s.t < S.draw) i = Math.floor((s.t / S.draw) * D);
    else if (after < 0) i = D;
    else i = D + 1 + Math.floor((after / S.follow) * (frames.length - D - 1));
    if (s.t >= S.draw && !s.landed) {
      s.landed = true;
      this.landFx(s.dir);
    }
    if (i >= frames.length || this.player.death) {
      this.strike = null;
      this.mount.visible = false;
      return;
    }
    sprite.texture = frames[i];
    const at = this.player.view.attackPoint; // where the swings are, this frame
    this.mount.position.copyFrom(at.position);
    this.mount.rotation = at.rotation;
    this.mount.scale.copyFrom(at.scale);
  }

  render(_alpha, dt) {
    const M = this.data.fx.motes, F = this.data.fx;
    if (this.charged && !this.player.hidden && !this.player.death) {
      const p = this.player.body.pos;
      for (this.moteDebt += M.rate * dt; this.moteDebt >= 1; this.moteDebt--) {
        const a = Math.random() * Math.PI * 2, d = pick(M.spread), v = pick(M.drift);
        this.motes.spawn({
          x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          size: pick(M.size), life: pick(M.life), alpha: M.alpha, color: F.hot, fade: F.color,
        });
      }
    } else this.moteDebt = 0;
    this.motes.update(dt);
    this.stepStrike(dt);
  }

  dispose() {
    this.motes.destroy();
    this.mount.destroy({ children: true });
  }
}
