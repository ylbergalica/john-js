// The Comet's abilities.
import { clamp, clamp01, clampLength, dist, dirTo, fromAngle, lerp, randRange, smoothStep01 } from '../../engine/math.js';
import { COMET, FIXED_DT } from '../../data/config.js';
import { Projectile } from '../projectile.js';
import { PathTell, Wake } from '../wake.js';
import { DEG, Ability } from './ability.js';
import { FlightAbility } from './flight.js';

// ── the Comet ──────────────────────────────────────────────────────
// Its wake (CometWake), never picked by its AI: laid while it runs fast, unless it's stunned or
// only being knocked about. The Wake sees to itself, and lasts past this.
export class WakeAbility extends Ability {
  constructor(enemy, data) {
    super(enemy, data);
    this.wake = enemy.world.add(new Wake(enemy.world, this));
    this.hissAt = 0;
  }

  shouldExecute() { return false; }

  step(dt) {
    super.step(dt);
    const e = this.enemy, b = e.body, now = this.world.time;
    if (e.stunned || now < e.ai.movementSuppressedUntil || Math.hypot(b.vel.x, b.vel.y) < COMET.wake.layFrom) return;
    this.wake.lay(b.pos.x, b.pos.y);
    if (now < this.hissAt) return;
    this.hissAt = now + this.data.hissEvery;
    this.sound('cometHiss');
  }
}

// Body: what all its attacks share (see CometStreak): running on through the wind-up, flying till
// `finish`, and a parry guttering its wake. Each shows the way it will go on the floor (`plot`).
class CometRunAbility extends FlightAbility {
  constructor(enemy, data) {
    super(enemy, data);
    this.view = new PathTell(this);
    this.lastPos = { x: 0, y: 0 };
    this.heldFor = 0; // steps it's been held up
  }

  get wake() { return this.enemy.abilities.get('CometWake').wake; }

  execute() {
    super.execute();
    this.sound('cometRev');
  }

  advance() {
    super.advance();
    if (this.phase === 'active') {
      this.phaseEndsAt = Infinity; // until it's done (fly)
      this.lastPos = { ...this.enemy.body.pos };
      this.heldFor = 0;
    }
  }

  step(dt) {
    super.step(dt);
    if (this.phase === 'active') this.fly(dt);
  }

  // Into the recovery.
  finish() { this.advance(); }

  // Whether a wall has held it up these last steps, flying along (dx, dy) at `v`; call once a step.
  held(dx, dy, v) {
    const b = this.enemy.body, moved = (b.pos.x - this.lastPos.x) * dx + (b.pos.y - this.lastPos.y) * dy;
    this.lastPos = { ...b.pos };
    this.heldFor = moved < v * FIXED_DT * 0.3 && this.world.time - this.strikeAt > this.data.launchTime + FIXED_DT ? this.heldFor + 1 : 0;
    return this.heldFor >= 2;
  }

  // On toward (x, y) this step, at no more than `max`, its nose along.
  toward(x, y, max) {
    const b = this.enemy.body, v = clampLength({ x: (x - b.pos.x) / FIXED_DT, y: (y - b.pos.y) / FIXED_DT }, max);
    b.vel.x = v.x;
    b.vel.y = v.y;
    b.rotation = Math.atan2(v.y, v.x);
  }

  onParry() {
    super.onParry();
    const e = this.enemy;
    if (!e.dead && !e.dying) this.wake.gutter();
  }

  plot() { return null; }
}

// How far along `dir` from (x, y) a circle `r` round gets in `length`, stopping short of walls.
function runLength(P, x, y, dir, length, r) {
  for (let t = 0.12; t < length; t += 0.12) if (P.circleHitsWall(x + dir.x * t, y + dir.y * t, r)) return t - 0.12;
  return length;
}

// Streak: down its aim, off the first wall it meets, on to the second (see CometStreak).
export class CometStreakAbility extends CometRunAbility {
  constructor(enemy, data) {
    super(enemy, data);
    this.target = null; // where its aim locked
    this.line = []; // the points it runs through
    this.leg = 1; // the one it's making for
    this.dir = { x: 1, y: 0 };
  }

  execute() {
    this.target = null;
    super.execute();
  }

  aimLocked(dt) {
    this.target ??= { ...this.player.body.pos };
    this.enemy.ai.turnToward(dirTo(this.enemy.body.pos, this.target), dt);
  }

  // The points it would run through from `from`: there, the wall if it meets one, and the end.
  plan(from) {
    const P = this.world.physics, d = this.data, b = this.enemy.body, r = b.radius * 0.95;
    const to = this.target ?? this.player?.body.pos ?? from, l = dist(from, to);
    const dir = l > 1e-6 ? dirTo(from, to) : fromAngle(b.rotation), total = clamp(l + d.past, d.minLength, d.maxLength);
    const first = runLength(P, from.x, from.y, dir, total, r), wall = { x: from.x + dir.x * first, y: from.y + dir.y * first };
    if (first >= total) return [from, wall];
    const hitX = P.circleHitsWall(wall.x + Math.sign(dir.x) * 0.16, wall.y, r), hitY = P.circleHitsWall(wall.x, wall.y + Math.sign(dir.y) * 0.16, r);
    const off = { x: hitX || !hitY ? -dir.x : dir.x, y: hitY || !hitX ? -dir.y : dir.y };
    const on = runLength(P, wall.x, wall.y, off, Math.max(total - first, d.minGlance), r);
    return [from, wall, { x: wall.x + off.x * on, y: wall.y + off.y * on }];
  }

  plot(alpha) { return this.plan(this.enemy.body.lerpPos(alpha)); }

  strike() {
    const b = this.enemy.body;
    this.line = this.plan({ ...b.pos });
    this.target = null;
    this.leg = 1;
    this.dir = dirTo(b.pos, this.line[1]);
    this.takeOff(this.dir);
  }

  fly() {
    const b = this.enemy.body, v = this.cruise(), { dir } = this, to = this.line[this.leg];
    const left = (to.x - b.pos.x) * dir.x + (to.y - b.pos.y) * dir.y;
    if (left <= v * FIXED_DT || this.held(dir.x, dir.y, v)) {
      if (++this.leg < this.line.length) this.glance();
      else this.finish();
      return;
    }
    b.rotation = Math.atan2(dir.y, dir.x);
    b.vel.x = dir.x * v;
    b.vel.y = dir.y * v;
  }

  // Off the wall, in a burst of sparks: it can hit afresh.
  glance() {
    const b = this.enemy.body, w = this.world, G = COMET.glance, dir = dirTo(b.pos, this.line[this.leg]), v = this.cruise();
    w.effects.burst(b.pos.x, b.pos.y, Math.atan2(dir.y, dir.x), G.sparks);
    const { volume } = w.positional(b.pos);
    if (volume > 0) w.camera.shake(G.shake.duration, G.shake.strength * volume, G.shake.frequency);
    this.sound('cometGlance');
    this.dir = dir;
    this.heldFor = 0;
    this.hitbox.contacts.clear();
    b.vel.x = dir.x * v;
    b.vel.y = dir.y * v;
    b.rotation = Math.atan2(dir.y, dir.x);
  }
}

// Noose: round the player and back nearly to where it started, leaving its wake in a ring, which
// flares and flings embers in (see CometNoose). The way out is the gap, or through the fire.
export class CometNooseAbility extends CometRunAbility {
  constructor(enemy, data) {
    super(enemy, data);
    this.center = null; // where its aim locked, or the player, until it does
    this.ring = null; // { R, side, sweep (radians) }
    this.want = data.sweepDeg[1] * DEG; // how far round
    this.theta = 0; // where it's got to, round the middle
    this.swept = 0;
    this.fromR = 0;
    this.laidTo = 0; // the wake's count as it set off: what's newer is the ring's
    this.flareAt = null;
  }

  shouldExecute() { return super.shouldExecute() && !!this.ringRound(this.player.body.pos); }

  // The widest ring round `c`, whichever way has room for the most of it, if there's room for
  // enough. A wall in the way ends it there: it can only run so much of it.
  ringRound(c) {
    const P = this.world.physics, d = this.data, b = this.enemy.body, a0 = Math.atan2(b.pos.y - c.y, b.pos.x - c.x), dir = this.enemy.ai.orbitDirection;
    let best = null;
    for (const R of d.radii) {
      for (const side of [dir, -dir]) {
        let sweep = 0;
        while (sweep < this.want) {
          const a = a0 + side * (sweep + 12 * DEG);
          if (P.circleHitsWall(c.x + Math.cos(a) * R, c.y + Math.sin(a) * R, b.radius)) break;
          sweep += 12 * DEG;
        }
        if (!best || sweep > best.sweep + 1e-6) best = { R, side, sweep: Math.min(sweep, this.want) };
      }
      if (best.sweep >= this.want) break;
    }
    return best.sweep >= d.minSweepDeg * DEG ? best : null;
  }

  execute() {
    this.want = randRange(this.data.sweepDeg[0], this.data.sweepDeg[1]) * DEG;
    this.center = { ...this.player.body.pos };
    this.ring = this.ringRound(this.center);
    this.flareAt = null;
    super.execute();
  }

  // Where it'd be `swept` round: settling on to the ring from where it starts.
  radiusAt(swept, from, R) { return lerp(from, R, smoothStep01(clamp01(swept / (this.data.settleDeg * DEG)))); }

  plot(alpha) {
    const { center: c, ring } = this, p = this.enemy.body.lerpPos(alpha);
    if (!c || !ring) return null;
    const a0 = Math.atan2(p.y - c.y, p.x - c.x), from = Math.hypot(p.x - c.x, p.y - c.y), out = [];
    for (let s = 0; ; s += 8 * DEG) {
      const t = Math.min(s, ring.sweep), a = a0 + ring.side * t, r = this.radiusAt(t, from, ring.R);
      out.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
      if (s >= ring.sweep) return out;
    }
  }

  step(dt) {
    if (this.phase === 'windup' && this.tracking() && this.player) {
      this.center = { ...this.player.body.pos };
      this.ring = this.ringRound(this.center) ?? this.ring;
    }
    super.step(dt);
    if (this.flareAt === null) return;
    if (this.enemy.stunned) this.flareAt = null;
    else if (this.world.time >= this.flareAt) this.flareUp();
  }

  strike() {
    const b = this.enemy.body, c = this.center;
    this.ring ??= { R: dist(b.pos, c), side: this.enemy.ai.orbitDirection, sweep: Math.PI / 2 }; // walled in since: as far as it gets
    this.theta = Math.atan2(b.pos.y - c.y, b.pos.x - c.x);
    this.swept = 0;
    this.fromR = dist(b.pos, c);
    this.laidTo = this.wake.serial;
    this.takeOff(fromAngle(this.theta + (this.ring.side * Math.PI) / 2));
  }

  fly(dt) {
    const b = this.enemy.body, { center: c, ring } = this, v = this.cruise(), r = this.radiusAt(this.swept, this.fromR, ring.R);
    const was = fromAngle(b.rotation);
    if (this.swept >= ring.sweep || this.held(was.x, was.y, v)) {
      this.flareAt = this.world.time + this.data.flareDelay;
      this.finish();
      return;
    }
    const turn = (v / Math.max(1, r)) * dt;
    this.swept += turn;
    this.theta += ring.side * turn;
    const on = this.radiusAt(this.swept, this.fromR, ring.R);
    this.toward(c.x + Math.cos(this.theta) * on, c.y + Math.sin(this.theta) * on, v * 1.5);
  }

  // The ring flares, and flings embers in at its middle from all along it.
  flareUp() {
    const w = this.world, e = this.enemy, d = this.data, S = d.shots, c = this.center, { R, side } = this.ring, F = COMET.wake.flare;
    this.flareAt = null;
    this.wake.flare(this.laidTo);
    const start = this.theta - side * this.swept, n = S.count;
    for (let i = 0; i < n; i++) {
      const a = start + side * this.swept * ((i + 0.5) / n), x = c.x + Math.cos(a) * R, y = c.y + Math.sin(a) * R;
      if (w.physics.circleHitsWall(x, y, S.size / 2)) continue;
      w.add(new Projectile(w, this, x, y, { dir: fromAngle(a + Math.PI), speed: S.speed, lifetime: (R * S.reach) / S.speed, damage: e.damage * S.damageMultiplier, size: S.size, look: 'ember' }));
    }
    w.sound('cometFlare', c, { pitch: e.type.sfxPitch });
    const { volume } = w.positional(c);
    if (volume > 0) w.camera.shake(F.shake.duration, F.shake.strength * volume, F.shake.frequency);
  }

  onParry() {
    this.flareAt = null;
    super.onParry();
  }
}

// Sling: in past the player, round them, spraying embers, and flung back out (see CometSling).
export class CometSlingAbility extends CometRunAbility {
  constructor(enemy, data) {
    super(enemy, data);
    this.side = 1; // the way it comes round them: 1 the way angles grow
    this.pivot = null; // the player, until its aim locks
    this.stage = 'in'; // in, round, out
    this.theta = 0; // where it's got to round them
    this.swept = 0;
    this.nextEmber = 0;
    this.outDir = { x: 1, y: 0 };
    this.outFrom = { x: 0, y: 0 };
  }

  // The hairpin from `from` round `c`, the way `side` goes, as { at, theta }: where it touches the
  // circle and at what angle. Null from within it.
  entry(from, c, side) {
    const R = this.data.pivot, dx = from.x - c.x, dy = from.y - c.y, D = Math.hypot(dx, dy);
    if (D <= R) return null;
    const theta = Math.atan2(dy, dx) + side * Math.acos(R / D);
    return { theta, at: { x: c.x + Math.cos(theta) * R, y: c.y + Math.sin(theta) * R } };
  }

  // Whether it has room for all that, way out included.
  fits(from, c, side) {
    const P = this.world.physics, d = this.data, r = this.enemy.body.radius, h = this.entry(from, c, side);
    if (!h || P.circleCastHitsWall(from.x, from.y, ...this.along(from, h.at), r)) return false;
    const sweep = d.sweepDeg * DEG;
    for (let s = 0; s <= sweep; s += 30 * DEG) {
      const a = h.theta + side * s;
      if (P.circleHitsWall(c.x + Math.cos(a) * d.pivot, c.y + Math.sin(a) * d.pivot, r)) return false;
    }
    return true;
  }

  // (dx, dy, distance) from `p` to `q`, as a circle cast takes them.
  along(p, q) {
    const l = dist(p, q);
    return l > 1e-6 ? [(q.x - p.x) / l, (q.y - p.y) / l, l] : [1, 0, 0];
  }

  shouldExecute() {
    if (!super.shouldExecute()) return false;
    const b = this.enemy.body, c = this.player.body.pos;
    return this.fits(b.pos, c, 1) || this.fits(b.pos, c, -1);
  }

  execute() {
    this.side = this.enemy.ai.orbitDirection;
    this.pivot = { ...this.player.body.pos };
    super.execute();
  }

  plot(alpha) {
    const { pivot: c, side } = this, d = this.data, from = this.enemy.body.lerpPos(alpha), h = c && this.entry(from, c, side);
    if (!h) return null;
    const out = [from], sweep = d.sweepDeg * DEG;
    for (let s = 0; ; s += 15 * DEG) {
      const a = h.theta + side * Math.min(s, sweep);
      out.push({ x: c.x + Math.cos(a) * d.pivot, y: c.y + Math.sin(a) * d.pivot });
      if (s >= sweep) break;
    }
    const end = out[out.length - 1], a = h.theta + side * sweep, dir = { x: -Math.sin(a) * side, y: Math.cos(a) * side };
    const run = runLength(this.world.physics, end.x, end.y, dir, d.outLength, this.enemy.body.radius * 0.95);
    out.push({ x: end.x + dir.x * run, y: end.y + dir.y * run });
    return out;
  }

  step(dt) {
    if (this.phase === 'windup' && this.tracking() && this.player) {
      const b = this.enemy.body;
      this.pivot = { ...this.player.body.pos };
      if (!this.fits(b.pos, this.pivot, this.side) && this.fits(b.pos, this.pivot, -this.side)) this.side = -this.side;
    }
    super.step(dt);
  }

  strike() {
    const b = this.enemy.body, h = this.entry(b.pos, this.pivot, this.side);
    this.stage = 'in';
    this.takeOff(h ? dirTo(b.pos, h.at) : fromAngle(b.rotation));
  }

  fly(dt) {
    if (this.stage === 'in') this.flyIn();
    else if (this.stage === 'round') this.flyRound(dt);
    else this.flyOut();
  }

  // After the player for as long as they're ahead, along the tangent to the circle round them.
  flyIn() {
    const b = this.enemy.body, d = this.data, v = this.cruise(), p = this.player, c = p ? p.body.pos : this.pivot, h = this.entry(b.pos, c, this.side);
    if (!h || dist(b.pos, h.at) <= v * FIXED_DT || this.world.time - this.strikeAt > d.inTime) { this.startRound(c); return; }
    const dir = dirTo(b.pos, h.at);
    if (this.held(dir.x, dir.y, v)) { this.fling(); return; }
    b.vel.x = dir.x * v;
    b.vel.y = dir.y * v;
    b.rotation = Math.atan2(dir.y, dir.x);
  }

  startRound(c) {
    const b = this.enemy.body;
    this.pivot = { ...c };
    this.theta = Math.atan2(b.pos.y - c.y, b.pos.x - c.x);
    this.swept = 0;
    this.nextEmber = this.data.embers.fromDeg * DEG;
    this.embersLeft = this.data.embers.count;
    this.stage = 'round';
    this.heldFor = 0;
    this.sound('cometTurn');
  }

  flyRound(dt) {
    const b = this.enemy.body, d = this.data, c = this.pivot, was = fromAngle(b.rotation), turn = (d.speed / d.pivot) * dt;
    if (this.swept >= d.sweepDeg * DEG || this.held(was.x, was.y, d.speed)) { this.fling(); return; }
    this.swept += turn;
    this.theta += this.side * turn;
    this.toward(c.x + Math.cos(this.theta) * d.pivot, c.y + Math.sin(this.theta) * d.pivot, d.speed * 1.5);
    if (this.embersLeft > 0 && this.swept >= this.nextEmber) {
      this.embersLeft--;
      this.nextEmber += d.embers.everyDeg * DEG;
      this.ember();
    }
  }

  // At the player as they are now.
  ember() {
    const e = this.enemy, E = this.data.embers, b = e.body, w = this.world, to = this.dirToPlayer(), a = Math.atan2(to.y, to.x) + randRange(-E.jitterDeg, E.jitterDeg) * DEG;
    w.add(new Projectile(w, this, b.pos.x, b.pos.y, { dir: fromAngle(a), speed: E.speed, lifetime: E.lifetime, damage: e.damage * E.damageMultiplier, size: E.size, look: 'ember' }));
    this.sound('cometEmber');
  }

  // Off along its tangent, hard, with a kick of sparks behind it.
  fling() {
    const b = this.enemy.body, a = this.theta, s = this.side;
    this.outDir = this.stage === 'round' ? { x: -Math.sin(a) * s, y: Math.cos(a) * s } : fromAngle(b.rotation);
    this.outFrom = { ...b.pos };
    this.stage = 'out';
    this.heldFor = 0;
    this.lastPos = { ...b.pos };
    this.world.effects.burst(b.pos.x, b.pos.y, Math.atan2(-this.outDir.y, -this.outDir.x), COMET.hairpin);
    this.sound('cometFling');
  }

  flyOut() {
    const b = this.enemy.body, d = this.data, { outDir: dir, outFrom: from } = this;
    const run = (b.pos.x - from.x) * dir.x + (b.pos.y - from.y) * dir.y;
    if (run >= d.outLength || this.held(dir.x, dir.y, d.flingSpeed)) { this.finish(); return; }
    b.vel.x = dir.x * d.flingSpeed;
    b.vel.y = dir.y * d.flingSpeed;
    b.rotation = Math.atan2(dir.y, dir.x);
  }
}
