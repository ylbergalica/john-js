// Astral Blades: every parry draws small swords of blue light out of the player, one for each
// level of the parry streak, a moment apart. Each glides out to its own spot on an arc behind
// the player (from the enemy parried), turning to point at that enemy, and eases to a stop;
// a moment later it flies at it (or, if it's dead, at the enemy nearest the player), homing
// in through walls, cutting props on the way and breaking on the first enemy it meets. It
// trails a thin, tapering line of blue light; all of it crimson while the player is Exalted.
import { Graphics, Sprite } from 'pixi.js';
import { Aspect } from './aspect.js';
import { Entity } from '../game/entity.js';
import { FIXED_DT, FX, PLAYER } from '../data/config.js';
import { clamp, clamp01, deltaAngle, lerp, lerpColor, randRange } from '../engine/math.js';
import { anims, tex } from '../render/assets.js';
import { ASTRAL_BLADE } from '../render/sprites.js';
import { hurtBySegment } from '../game/hurtbox.js';

const DEG = Math.PI / 180;
const U = 32; // the trail is drawn at this many units to the world unit, then scaled back down
const easeOut = (t) => 1 - (1 - t) ** 3;
const alive = (e) => !!e && !e.dead && !e.dying;

export class AstralAspect extends Aspect {
  constructor(player, data) {
    super(player, data);
    this.queue = []; // blades still to come: { at, target, offset (from straight behind) }
  }

  onParry(attack) {
    const target = attack?.enemy ?? attack?.sourceAbility?.enemy ?? null;
    const max = PLAYER.parry.comboMax, n = clamp(this.player.parryStreak, 1, max), arc = this.data.arcDeg * DEG;
    // The higher the streak, the quicker they come.
    const [slow, fast] = this.data.stagger, gap = max > 2 ? lerp(slow, fast, (n - 2) / (max - 2)) : slow;
    // Each blade gets its own share of the arc, somewhere inside it, and they take them in a random order.
    const offsets = Array.from({ length: n }, (_, i) => ((i + randRange(0.2, 0.8)) / n - 0.5) * arc);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [offsets[i], offsets[j]] = [offsets[j], offsets[i]];
    }
    offsets.forEach((offset, i) => this.queue.push({ at: this.now + i * gap, target, offset }));
    this.used();
  }

  step() {
    if (!this.queue.length) return;
    const due = this.queue.filter((q) => this.now >= q.at);
    if (!due.length) return;
    this.queue = this.queue.filter((q) => this.now < q.at);
    for (const q of due) this.draw(q);
  }

  // A blade drawn out of the player toward its spot behind them, `offset` round from straight
  // back (away from the target).
  draw({ target, offset }) {
    const p = this.player.body.pos;
    const t = alive(target) ? target : this.nearest(p);
    const back = t ? Math.atan2(p.y - t.body.pos.y, p.x - t.body.pos.x) : this.player.body.rotation + Math.PI;
    const a = back + offset, r = randRange(...this.data.distance);
    this.world.add(new AstralBlade(this, p, { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r }, t));
    this.world.sound('astralDraw');
  }

  // The live enemy nearest `from`, or null.
  nearest(from) {
    let best = null, bestD = Infinity;
    for (const e of this.world.enemies) {
      if (!alive(e)) continue;
      const d = (e.body.pos.x - from.x) ** 2 + (e.body.pos.y - from.y) ** 2;
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  dispose() { this.queue = []; }
}

class AstralBlade extends Entity {
  constructor(aspect, from, spot, target) {
    const world = aspect.world;
    super(world);
    this.aspect = aspect;
    this.data = aspect.data;
    this.from = { ...from };
    this.spot = spot;
    this.pos = { ...from };
    this.prev = { ...from };
    this.angle = this.prevAngle = Math.atan2(spot.y - from.y, spot.x - from.x); // pointing out, then round at the target
    this.target = target;
    this.born = world.time;
    this.launchAt = world.time + this.data.launchDelay;
    this.flownAt = null; // set on launch
    this.spentAt = null; // broke on an enemy or gave out: gone, while its trail fades
    this.cut = new Set(); // props already cut
    this.points = []; // the trail: { x, y, t } each step
    this.trailTime = this.data.fx.trail.time;
    // Blended normally, not added like most light, so it shows over the player, props and
    // enemies: added to their white it would wash out and look like it went under them.
    this.trail = new Graphics();
    this.trail.scale.set(1 / U);
    this.sprite = new Sprite({ texture: tex.astral_blade, anchor: 0.5 });
    this.sprite.visible = false;
    // The crimson blade, faded in over the blue one while the player is Exalted.
    this.exalted = new Sprite({ texture: tex.astral_blade_exalted, anchor: 0.5 });
    this.exalted.visible = false;
    // A soft glow of light under the blade, so it stands out (added light is fine here: the
    // blade itself covers it).
    const H = this.data.fx.halo;
    this.halo = new Sprite({ texture: tex.mist, anchor: 0.5 });
    this.halo.blendMode = 'add';
    this.halo.tint = H.color;
    this.halo.alpha = H.alpha;
    this.halo.visible = false;
    world.layers.fx.addChild(this.halo, this.trail, this.sprite, this.exalted);
  }

  // How far its colours have turned to Exalted crimson, with the player's own glow.
  get glow() { return this.aspect.player.view?.exalted.glow ?? 0; }

  // `blue`, turned toward `crimson` while the player is Exalted.
  tone(blue, crimson) { return lerpColor(blue, crimson, this.glow); }

  // The enemy it's after: its own while that lives, else whoever is nearest the player.
  aim() {
    if (!alive(this.target)) this.target = this.aspect.nearest(this.world.livePlayer?.body.pos ?? this.pos);
    return this.target;
  }

  step(dt) {
    const w = this.world;
    this.prev.x = this.pos.x;
    this.prev.y = this.pos.y;
    this.prevAngle = this.angle;
    if (this.spentAt !== null) {
      if (w.time - this.spentAt >= this.trailTime) this.destroy();
      return;
    }
    if (this.flownAt === null) this.hover(dt);
    else this.fly(dt);
    this.points.push({ ...this.butt(this.pos, this.angle, w.time), t: w.time });
    while (this.points.length > 2 && w.time - this.points[1].t > this.trailTime) this.points.shift();
  }

  // Gliding out to its spot, easing to a stop, and turning to point at the target.
  hover(dt) {
    const d = this.data, w = this.world;
    const k = easeOut(clamp01((w.time - this.born) / d.settleTime));
    this.pos.x = lerp(this.from.x, this.spot.x, k);
    this.pos.y = lerp(this.from.y, this.spot.y, k);
    const t = this.aim();
    if (t) {
      const want = Math.atan2(t.body.pos.y - this.pos.y, t.body.pos.x - this.pos.x);
      this.angle += deltaAngle(this.angle, want) * (1 - Math.exp(-d.aimRate * dt));
    }
    if (w.time >= this.launchAt) this.launch();
  }

  launch() {
    const L = this.data.fx.launch, { x, y } = this.pos;
    this.flownAt = this.world.time;
    const t = this.aim(); // snaps true, in case it hadn't quite come round
    if (t) this.angle = Math.atan2(t.body.pos.y - y, t.body.pos.x - x);
    const F = this.data.fx;
    this.world.deathFx.flare(tex.mist, x, y, 0, { time: L.time, w0: L.size, h0: L.size, w1: L.size * 0.3, h1: L.size * 0.3, alpha: L.alpha, color0: 0xffffff, color1: this.tone(F.color, F.exalted.color) });
    this.world.sound('astralLaunch', this.pos);
  }

  // At a steady speed, turning toward the target at a steady rate; through walls.
  fly(dt) {
    const d = this.data, age = this.world.time - this.flownAt;
    const t = this.aim();
    if (t) {
      const want = Math.atan2(t.body.pos.y - this.pos.y, t.body.pos.x - this.pos.x), max = d.turnRate * dt;
      this.angle += clamp(deltaAngle(this.angle, want), -max, max);
    }
    this.pos.x += Math.cos(this.angle) * d.speed * dt;
    this.pos.y += Math.sin(this.angle) * d.speed * dt;
    this.strike();
    if (this.spentAt === null && age >= d.lifetime) this.spend();
  }

  // Swept along the tip's path over the step: every prop on it is cut, and it breaks on the
  // first enemy it reaches.
  strike() {
    const half = this.data.fx.length / 2, r = this.data.hitRadius;
    const ax = this.prev.x + Math.cos(this.prevAngle) * half, ay = this.prev.y + Math.sin(this.prevAngle) * half;
    const bx = this.pos.x + Math.cos(this.angle) * half, by = this.pos.y + Math.sin(this.angle) * half;
    const on = (e) => hurtBySegment(e, ax, ay, bx, by, r);
    for (const prop of this.world.props) {
      if (prop.dead || this.cut.has(prop) || !on(prop)) continue;
      this.cut.add(prop);
      this.hit(prop, false);
    }
    let first = null, firstD = Infinity;
    for (const e of this.world.enemies) {
      if (!alive(e) || !on(e)) continue;
      const d = (e.body.pos.x - ax) ** 2 + (e.body.pos.y - ay) ** 2;
      if (d < firstD) { firstD = d; first = e; }
    }
    if (first) { this.hit(first, true); this.spend(); }
  }

  hit(e, enemy) {
    const d = this.data, H = d.fx.hit, E = d.fx.exalted, w = this.world, dx = Math.cos(this.angle), dy = Math.sin(this.angle);
    const src = { x: e.body.pos.x - dx * (e.body.radius + 1), y: e.body.pos.y - dy * (e.body.radius + 1) }; // straight back along its flight
    const hitPoint = e.closestPoint(src);
    e.takeDamage(d.damage * w.adrenaline.damageMultiplier, hitPoint, src, d.id);
    if (!enemy) return;
    if (!e.dead) e.applyKnockback(d.enemyKnockbackForce, src);
    w.effects.playOnce(anims.hit_impact, hitPoint.x, hitPoint.y, this.angle, FX.hitImpactSize, this.tone(H.impactTint, E.hit));
    w.effects.burst(hitPoint.x, hitPoint.y, this.angle, { ...H.sparks, color: this.tone(H.sparks.color, E.hit) });
  }

  spend() {
    this.spentAt = this.world.time;
    this.sprite.visible = false;
    this.exalted.visible = false;
    this.halo.visible = false;
  }

  render(alpha) {
    const w = this.world, F = this.data.fx;
    const now = w.time - (1 - alpha) * FIXED_DT;
    const spent = this.spentAt !== null;
    const x = lerp(this.prev.x, this.pos.x, alpha), y = lerp(this.prev.y, this.pos.y, alpha);
    const angle = this.prevAngle + deltaAngle(this.prevAngle, this.angle) * alpha;
    if (!spent) {
      const width = (F.length / ASTRAL_BLADE.length) * this.growth(now), glow = this.glow;
      for (const [s, opacity] of [[this.sprite, 1 - glow], [this.exalted, glow]]) {
        s.visible = opacity > 0;
        s.alpha = opacity;
        s.position.set(x, y);
        s.rotation = angle;
        s.width = width;
        s.height = width * ASTRAL_BLADE.height;
      }
      const h = this.halo, H = F.halo, size = F.length * this.growth(now);
      h.tint = this.tone(H.color, F.exalted.halo);
      h.alpha = lerp(H.alpha, F.exalted.haloAlpha, glow);
      h.visible = true;
      h.position.set(x, y);
      h.rotation = angle;
      h.width = size * H.length;
      h.height = size * H.width;
    }
    this.drawTrail(now, spent ? null : { ...this.butt({ x, y }, angle, now), t: now });
  }

  // Its size at time `t`, as a fraction of full: it grows out of the player as it leaves them.
  growth(t) { return lerp(this.data.fx.grow, 1, easeOut(clamp01((t - this.born) / this.data.fx.growTime))); }

  // The bottom of its handle, where the trail comes from, for the blade centred on `pos`
  // pointing along `angle` at time `t`.
  butt(pos, angle, t) {
    const back = (this.data.fx.length / 2) * this.growth(t);
    return { x: pos.x - Math.cos(angle) * back, y: pos.y - Math.sin(angle) * back };
  }

  // A ribbon through the trail's points, `width` at the head tapering to nothing at the tail
  // and fading with it, with a pale core down its middle.
  drawTrail(now, head) {
    const F = this.data.fx, T = F.trail, g = this.trail;
    g.clear();
    const pts = this.points.filter((p) => p.t <= now && now - p.t < T.time);
    if (head) pts.push(head);
    if (pts.length < 2) return;
    const n = pts.length;
    const edge = pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return { x: p.x, y: p.y, nx: -(b.y - a.y) / l, ny: (b.x - a.x) / l, k: clamp01(1 - (now - p.t) / T.time) };
    });
    for (const [scale, color, alpha] of [[1, this.tone(T.color, F.exalted.trail), T.alpha], [T.coreWidth, this.tone(T.core, F.exalted.core), T.alpha]]) {
      for (let i = 0; i < n - 1; i++) {
        const a = edge[i], b = edge[i + 1], wa = (T.width / 2) * scale * a.k, wb = (T.width / 2) * scale * b.k;
        g.poly([
          (a.x + a.nx * wa) * U, (a.y + a.ny * wa) * U, (b.x + b.nx * wb) * U, (b.y + b.ny * wb) * U,
          (b.x - b.nx * wb) * U, (b.y - b.ny * wb) * U, (a.x - a.nx * wa) * U, (a.y - a.ny * wa) * U,
        ]).fill({ color, alpha: alpha * (a.k + b.k) / 2 });
      }
    }
  }

  dispose() {
    this.trail.destroy();
    this.sprite.destroy();
    this.exalted.destroy();
    this.halo.destroy();
  }
}
