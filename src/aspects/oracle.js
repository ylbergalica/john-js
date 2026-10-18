// Oracle Discs: every parry throws a spinning ring of metal out of the player at the enemy nearest
// them. It flies fast and turns instantly, straight for its target's centre, through walls; there
// it strikes and ricochets on to the nearest enemy it hasn't struck yet, a few strikes in all, more
// the higher the parry streak. With only one enemy about it's knocked off it, arcs back round and
// strikes it again, over and over; with none new to go for it flies off, bouncing off walls and
// striking whatever it passes through, for a while. Out of strikes or time, it flies on and fades
// out. It spins so fast it blurs into one pale teal and glows; crimson while the player is Exalted.
import { Sprite } from 'pixi.js';
import { Aspect } from './aspect.js';
import { Entity } from '../game/entity.js';
import { FIXED_DT, FX } from '../data/config.js';
import { clamp01, deltaAngle, lerp, lerpColor, randSign, TAU } from '../engine/math.js';
import { anims, tex } from '../render/assets.js';
import { ORACLE_DISC } from '../render/sprites.js';
import { hurtByCircle } from '../game/hurtbox.js';

const easeOut = (t) => 1 - (1 - t) ** 3;
const alive = (e) => !!e && !e.dead && !e.dying;
// Each ricochet chimes a step higher up a pentatonic scale (semitones), holding at the top.
const CHIME = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

export class OracleAspect extends Aspect {
  onParry() {
    const d = this.data, p = this.player.body.pos;
    const target = this.nearest(p, new Set()); // none in reach: it's thrown off any which way
    const targets = d.targets + Math.max(0, this.player.parryStreak - 1) * d.perStreak;
    this.world.add(new OracleDisc(this, p, target, targets));
    this.world.sound('oracleLaunch', p);
    this.used();
  }

  // The live enemy nearest `from` within reach that isn't in `struck`, or null.
  nearest(from, struck) {
    let best = null, bestD = this.data.reach ** 2;
    for (const e of this.world.enemies) {
      if (!alive(e) || struck.has(e)) continue;
      const d = (e.body.pos.x - from.x) ** 2 + (e.body.pos.y - from.y) ** 2;
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  // The enemies in the fight: every live one within reach of the player.
  fighting() {
    const from = this.player.body.pos, r2 = this.data.reach ** 2;
    return this.world.enemies.filter((e) => alive(e) && (e.body.pos.x - from.x) ** 2 + (e.body.pos.y - from.y) ** 2 < r2);
  }
}

class OracleDisc extends Entity {
  constructor(aspect, from, target, targets) {
    const world = aspect.world, F = aspect.data.fx;
    super(world);
    this.aspect = aspect;
    this.data = aspect.data;
    this.pos = { ...from };
    this.prev = { ...from };
    this.target = target;
    this.left = targets; // strikes it has left
    this.hits = 0; // strikes so far
    this.struck = new Set(); // every enemy it's struck
    this.touching = new Set(); // enemies it's passing through while roaming
    this.mode = 'hunt'; // hunt: for its target | out: knocked off it | arc: curving back in | roam: nothing to go for
    this.modeUntil = 0; // when `out` turns back, or `roam` gives out
    this.side = 1; // the way an arc turns
    this.dir = { x: 1, y: 0 };
    this.speed = this.data.speed;
    this.born = world.time;
    this.huntSince = world.time; // since it last set off for a target, for `lifetime`
    this.fadeAt = null; // done: flying on and fading out
    this.spin = Math.random() * Math.PI * 2;
    this.glow = new Sprite({ texture: tex.oracle_glow, anchor: 0.5 });
    this.glow.blendMode = 'add';
    this.glow.tint = F.color;
    this.core = new Sprite({ texture: tex.oracle_glow, anchor: 0.5 });
    this.core.blendMode = 'add';
    this.core.tint = F.hot;
    this.sprite = new Sprite({ texture: tex.oracle_disc, anchor: 0.5 });
    // The crimson disc, faded in over the teal one while the player is Exalted.
    this.exalted = new Sprite({ texture: tex.oracle_disc_exalted, anchor: 0.5 });
    world.layers.fx.addChild(this.glow, this.sprite, this.exalted, this.core);
    this.flash(from, F.launch);
    if (!target) {
      const a = Math.random() * TAU;
      this.dir = { x: Math.cos(a), y: Math.sin(a) };
      this.choose();
    }
  }

  // How far its colours have turned to Exalted crimson, with the player's own glow.
  get exaltedGlow() { return this.aspect.player.view?.exalted.glow ?? 0; }

  // `teal`, turned toward `crimson` while the player is Exalted.
  tone(teal, crimson) { return lerpColor(teal, crimson, this.exaltedGlow); }

  // A soft round flash at `at`, white cooling to teal (or crimson).
  flash({ x, y }, f) {
    const F = this.data.fx;
    this.world.deathFx.flare(tex.mist, x, y, 0, { time: f.time, w0: f.size, h0: f.size, w1: f.size * f.grow, h1: f.size * f.grow, alpha: f.alpha, color0: 0xffffff, color1: this.tone(F.color, F.exalted.color) });
  }

  step(dt) {
    const d = this.data, w = this.world;
    this.prev.x = this.pos.x;
    this.prev.y = this.pos.y;
    if (this.fadeAt !== null) {
      const k = 1 - clamp01((w.time - this.fadeAt) / d.fx.fade);
      this.pos.x += this.dir.x * this.speed * k * dt;
      this.pos.y += this.dir.y * this.speed * k * dt;
      if (k <= 0) this.destroy();
      return;
    }
    if (this.target && !alive(this.target)) this.choose();
    if (this.fadeAt !== null) return;
    if ((this.mode === 'hunt' || this.mode === 'arc') && w.time - this.huntSince > d.lifetime) { this.fade(); return; }
    if (this.mode === 'hunt') this.hunt(dt);
    else if (this.mode === 'arc') this.arc(dt);
    else if (this.mode === 'out') {
      this.roll(dt);
      if (w.time >= this.modeUntil) this.turnBack();
    } else this.roam(dt);
  }

  // Where to go next, with strikes left (`from`: the enemy it's just struck, and sits on): the
  // nearest enemy in reach it hasn't struck yet; else, if only one enemy is in the fight (in reach
  // of the player), back at that one, knocked off it first if it's just struck it; else off roaming. Out of strikes, it's done.
  choose(from = null) {
    const w = this.world;
    if (this.left <= 0) { this.fade(); return; }
    this.huntSince = w.time;
    const fresh = this.aspect.nearest(this.pos, this.struck);
    if (fresh) {
      this.target = fresh;
      this.mode = 'hunt';
      return;
    }
    const near = this.aspect.fighting();
    if (near.length === 1) {
      this.target = near[0];
      if (near[0] !== from) { this.turnBack(); return; }
      const a = Math.random() * TAU;
      this.dir = { x: Math.cos(a), y: Math.sin(a) };
      this.mode = 'out';
      this.modeUntil = w.time + this.data.arc.out;
      return;
    }
    this.target = null;
    if (this.mode === 'roam') return;
    this.mode = 'roam';
    this.modeUntil = w.time + this.data.roam;
    // Whatever it's sitting on as it sets off isn't struck again until it's left it.
    const r = this.data.fx.size / 2;
    this.touching = new Set(this.world.enemies.filter((e) => alive(e) && hurtByCircle(e, this.pos.x, this.pos.y, r)));
  }

  fade() {
    this.fadeAt = this.world.time;
    this.target = null;
  }

  // Straight for its target's centre, however it moves, turning instantly and passing over
  // anything else; reaching it this step, it strikes it there and carries on with what's left
  // of the step to wherever it goes next.
  hunt(dt) {
    let move = this.speed * dt;
    while (this.mode === 'hunt' && this.fadeAt === null && move > 0) {
      const e = this.target, t = e.body.pos, dx = t.x - this.pos.x, dy = t.y - this.pos.y, l = Math.hypot(dx, dy);
      if (l > 1e-6) this.dir = { x: dx / l, y: dy / l };
      if (l > move) {
        this.pos.x += this.dir.x * move;
        this.pos.y += this.dir.y * move;
        return;
      }
      this.pos.x = t.x;
      this.pos.y = t.y;
      move -= l;
      this.strike(e);
      this.choose(e);
    }
  }

  // Knocked off the only enemy about, it swings back round to it, turning one way or the other.
  turnBack() {
    this.mode = 'arc';
    this.side = randSign();
  }

  // Curving back in to its target: facing away, it swings round its own way at arc.turnRate;
  // once facing it, it runs in along the circle through it (an even turn the whole way, re-fitted
  // as it moves), passing over anything else, and strikes it on reaching its centre.
  arc(dt) {
    const e = this.target, t = e.body.pos, dx = t.x - this.pos.x, dy = t.y - this.pos.y, l = Math.hypot(dx, dy);
    const move = this.speed * dt;
    if (l <= move) {
      this.pos.x = t.x;
      this.pos.y = t.y;
      this.strike(e);
      this.choose(e);
      return;
    }
    const heading = Math.atan2(this.dir.y, this.dir.x), off = deltaAngle(heading, Math.atan2(dy, dx));
    const rate = Math.abs(off) > Math.PI / 2 ? this.side * this.data.arc.turnRate : (2 * this.speed * Math.sin(off)) / l;
    const a = heading + rate * dt;
    this.dir = { x: Math.cos(a), y: Math.sin(a) };
    this.pos.x += this.dir.x * move;
    this.pos.y += this.dir.y * move;
  }

  // No enemy to go for: bouncing off walls, striking every enemy it passes through (once each
  // time through, whether it's struck it before or not), until its strikes or its time run out.
  // An enemy it hasn't struck coming in reach sets it after that one, and only one enemy left in
  // the fight sets it arcing in at that one.
  roam(dt) {
    const w = this.world;
    if (this.aspect.nearest(this.pos, this.struck) || this.aspect.fighting().length === 1) { this.choose(); return; }
    this.roll(dt);
    const r = this.data.fx.size / 2;
    for (const e of w.enemies) {
      if (!alive(e) || !hurtByCircle(e, this.pos.x, this.pos.y, r)) { this.touching.delete(e); continue; }
      if (this.touching.has(e)) continue;
      this.touching.add(e);
      this.strike(e);
      if (this.left <= 0) { this.fade(); return; }
    }
    if (w.time >= this.modeUntil) this.fade();
  }

  // Straight on, bouncing off any wall it runs into (the walls are whole tiles, so it turns back
  // along whichever way took it in); come out through one while homing, it carries on until clear.
  roll(dt) {
    const ph = this.world.physics, r = this.data.fx.size / 2, n = 2, step = (this.speed * dt) / n;
    for (let i = 0; i < n; i++) {
      const stuck = ph.circleHitsWall(this.pos.x, this.pos.y, r);
      const x = this.pos.x + this.dir.x * step, y = this.pos.y + this.dir.y * step;
      if (!stuck && ph.circleHitsWall(x, this.pos.y, r)) this.bounce('x');
      else this.pos.x = x;
      if (!stuck && ph.circleHitsWall(this.pos.x, y, r)) this.bounce('y');
      else this.pos.y = y;
    }
  }

  // Turned back along `axis` off a wall, with a few sparks thrown off the wall and a chime.
  bounce(axis) {
    const r = this.data.fx.size / 2, at = { x: this.pos.x + (axis === 'x' ? this.dir.x * r : 0), y: this.pos.y + (axis === 'y' ? this.dir.y * r : 0) };
    this.dir[axis] = -this.dir[axis];
    const F = this.data.fx;
    this.world.effects.burst(at.x, at.y, Math.atan2(this.dir.y, this.dir.x), { ...F.bounce.sparks, color: this.tone(F.bounce.sparks.color, F.exalted.sparks) });
    this.world.sound('oracleBounce', at);
  }

  strike(e) {
    const d = this.data, H = d.fx.hit, w = this.world, angle = Math.atan2(this.dir.y, this.dir.x);
    this.struck.add(e);
    this.left--;
    this.hits++;
    const src = { x: e.body.pos.x - this.dir.x * (e.body.radius + 1), y: e.body.pos.y - this.dir.y * (e.body.radius + 1) }; // straight back along its flight
    const hitPoint = e.closestPoint(src);
    e.takeDamage(d.damage * w.adrenaline.damageMultiplier, hitPoint, src, d.id);
    if (!e.dead) e.applyKnockback(d.enemyKnockbackForce, src);
    this.flash(e.body.pos, H.flash);
    w.effects.playOnce(anims.hit_impact, hitPoint.x, hitPoint.y, angle, FX.hitImpactSize * H.impact, this.tone(H.impactTint, d.fx.exalted.sparks));
    w.effects.burst(e.body.pos.x, e.body.pos.y, angle, { ...H.sparks, color: this.tone(H.sparks.color, d.fx.exalted.sparks) });
    const step = CHIME[Math.min(this.hits - 1, CHIME.length - 1)];
    w.sound('oracleHit', e.body.pos, { pitch: 2 ** (step / 12), jitter: 0 });
  }

  render(alpha, dt) {
    const w = this.world, F = this.data.fx;
    const now = w.time - (1 - alpha) * FIXED_DT;
    const x = lerp(this.prev.x, this.pos.x, alpha), y = lerp(this.prev.y, this.pos.y, alpha);
    const grown = lerp(F.grow, 1, easeOut(clamp01((now - this.born) / F.growTime)));
    const fading = this.fadeAt === null ? 1 : 1 - clamp01((now - this.fadeAt) / F.fade);
    const size = F.size * grown * lerp(0.4, 1, fading);
    this.spin += F.spin * dt;
    // The light it gives off breathes a little with the spin.
    const breathe = 1 + Math.sin(this.spin * 0.5) * F.glow.pulse;
    const E = F.exalted, glow = this.exaltedGlow;
    for (const [s, opacity] of [[this.sprite, 1 - glow], [this.exalted, glow]]) {
      s.visible = opacity > 0;
      s.position.set(x, y);
      s.rotation = this.spin;
      s.width = s.height = size / ORACLE_DISC.fill;
      s.alpha = fading * opacity;
    }
    this.glow.tint = this.tone(F.color, E.color);
    this.core.tint = this.tone(F.hot, E.hot);
    this.glow.position.set(x, y);
    this.glow.width = this.glow.height = size * F.glow.size;
    this.glow.alpha = F.glow.alpha * fading * breathe;
    this.core.position.set(x, y);
    this.core.width = this.core.height = size * F.glow.size;
    this.core.alpha = F.core.alpha * fading * breathe;
  }

  dispose() {
    this.glow.destroy();
    this.sprite.destroy();
    this.exalted.destroy();
    this.core.destroy();
  }
}
