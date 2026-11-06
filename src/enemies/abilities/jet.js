// The Jet's abilities.
import { clamp, clamp01, deltaAngle, dist, dirTo, fromAngle, pickWeighted } from '../../engine/math.js';
import { ATTACK_FX, FIXED_DT } from '../../data/config.js';
import { DEG } from './ability.js';
import { FlightAbility } from './flight.js';

// Body: the Jet's dash, straight through where the player stood when its aim locked and
// on as far again past, over walls too, ending clear of them (see JetDash). It may go
// again at once, `dashes` in all. Cut short over a wall, it glides on to the nearest clear
// spot along its line (`landing`), walls off until it's there.
export class JetDashAbility extends FlightAbility {
  constructor(enemy, data) {
    super(enemy, data);
    this.dashes = 0; // left to go, the one under way included
    this.chained = false;
    this.target = null; // where its aim locked
    this.from = { x: 0, y: 0 }; // the dash under way: from where, which way and how far
    this.dir = { x: 1, y: 0 };
    this.length = 0;
    this.landing = null;
  }

  canExecute() { return !this.landing && super.canExecute(); }

  execute() {
    this.dashes = pickWeighted(this.data.chain).dashes;
    this.chained = false; // whether the wind-up under way leads on from a dash
    this.target = null;
    super.execute();
  }

  // Its aim locked on where the player stood: turning to face that.
  aimLocked(dt) {
    this.target ??= { ...this.player.body.pos };
    this.enemy.ai.turnToward(dirTo(this.enemy.body.pos, this.target), dt);
  }

  advance() {
    if (this.phase === 'active' && --this.dashes > 0) { // straight on into the next, no recovery
      this.endActive();
      this.chained = true;
      this.sound('windup');
      this.setPhase('windup', this.data.chainWindUpTime);
      return;
    }
    super.advance();
    if (this.phase === 'active') this.phaseEndsAt = Infinity; // until it gets there (fly)
  }

  // Toward where its aim locked (where the player is now, if it never did).
  strike() {
    const b = this.enemy.body, to = this.target ?? this.player?.body.pos ?? b.pos;
    const dx = to.x - b.pos.x, dy = to.y - b.pos.y, l = Math.hypot(dx, dy);
    this.target = null;
    this.from = { ...b.pos };
    this.dir = l > 1e-6 ? { x: dx / l, y: dy / l } : fromAngle(b.rotation);
    this.length = this.clearLength(2 * l);
    b.collideWalls = false;
    this.takeOff(this.dir);
  }

  step(dt) {
    super.step(dt);
    if (this.phase === 'active') this.fly(dt);
    if (this.landing) this.land();
  }

  // Along its line, swinging round onto it (`turnEase`) and gathering speed, then braking
  // over its last `brakeTime` to arrive exactly at its end with `carry` of its speed, which
  // it keeps going on into the next dash or the recovery.
  fly(dt) {
    const b = this.enemy.body, d = this.data, dir = this.dir;
    const left = this.length - ((b.pos.x - this.from.x) * dir.x + (b.pos.y - this.from.y) * dir.y);
    const end = d.speed * d.carry;
    if (left <= end * FIXED_DT || this.world.time - this.strikeAt > this.length / d.speed + d.launchTime + 0.5) { // its carry takes it the rest of the way
      b.vel.x = dir.x * end;
      b.vel.y = dir.y * end;
      this.advance();
      return;
    }
    b.rotation += deltaAngle(b.rotation, Math.atan2(dir.y, dir.x)) * (1 - Math.exp(-dt / d.turnEase));
    const brake = (d.speed - end) / d.brakeTime; // its deceleration
    const v = Math.min(this.cruise(), Math.sqrt(end * end + 2 * brake * left), left / FIXED_DT);
    b.vel.x = dir.x * v;
    b.vel.y = dir.y * v;
  }

  // How far it can fly along its line and end clear of walls: `len`, or back from there to
  // the first clear spot (where it set off, at worst).
  clearLength(len) {
    const P = this.world.physics, { from, dir } = this, r = this.enemy.body.radius;
    for (let t = len; t > 0; t -= 0.1) if (!P.circleHitsWall(from.x + dir.x * t, from.y + dir.y * t, r)) return t;
    return 0;
  }

  // Walls back on, unless it's over one.
  endActive() {
    super.endActive();
    const b = this.enemy.body;
    if (this.world.physics.circleHitsWall(b.pos.x, b.pos.y, b.radius)) this.landing = this.landingSpot();
    else b.collideWalls = true;
  }

  // The nearest spot along its line clear of walls, on ahead or back the way it came (both
  // its ends are clear).
  landingSpot() {
    const b = this.enemy.body, P = this.world.physics, { from, dir } = this;
    const at = (b.pos.x - from.x) * dir.x + (b.pos.y - from.y) * dir.y;
    for (let k = 0.1; k < this.length + 0.1; k += 0.1) {
      for (const t of [at + k, at - k]) {
        const u = clamp(t, 0, this.length), x = from.x + dir.x * u, y = from.y + dir.y * u;
        if (!P.circleHitsWall(x, y, b.radius)) return { x, y };
      }
    }
    return { ...from };
  }

  // Gliding on to its landing spot, however it's knocked about meanwhile; walls back on once
  // it's clear of them, and there it stops.
  land() {
    const b = this.enemy.body, to = this.landing, dx = to.x - b.pos.x, dy = to.y - b.pos.y, l = Math.hypot(dx, dy);
    if (l < 0.02 || !this.world.physics.circleHitsWall(b.pos.x, b.pos.y, b.radius)) {
      this.landing = null;
      b.collideWalls = true;
      b.stop();
      return;
    }
    const v = Math.min(this.data.landSpeed, l / FIXED_DT);
    b.vel.x = (dx / l) * v;
    b.vel.y = (dy / l) * v;
    this.enemy.ai.suppressMovementFor(FIXED_DT);
  }

  dispose() {
    super.dispose();
    this.enemy.body.collideWalls = true;
  }
}

// Body: the Jet's swoop. Its aim locked, it banks away toward the way it circles, then
// flies on its heading, coming round after the player along the circle through them (see
// JetSwoop) until they're behind it, then straight on until it pulls out. Walls stop
// it: a crash.
export class SwoopAbility extends FlightAbility {
  constructor(enemy, data) {
    super(enemy, data);
    this.side = 1; // the way it banks: 1 to its left, as it circles (EnemyAI.orbitDirection)
    this.aim = null; // the heading it banks to, once its aim locks (radians)
    this.heading = 0;
    this.committedAt = null; // when it stopped turning after the player
    this.lastPos = { x: 0, y: 0 };
  }

  execute() {
    this.side = this.enemy.ai.orbitDirection;
    this.aim = null;
    super.execute();
  }

  // Banking out no further than it could come round from onto the player as they stand,
  // turning at `turnFit` of its `turnRate`.
  aimLocked(dt) {
    const b = this.enemy.body, p = this.player.body.pos, d = this.data;
    if (this.aim === null) {
      const fit = (d.turnFit * d.turnRate * dist(b.pos, p)) / (2 * d.speed);
      this.aim = Math.atan2(p.y - b.pos.y, p.x - b.pos.x) + this.side * Math.min(d.outDeg * DEG, Math.asin(clamp01(fit)));
    }
    this.enemy.ai.turnToward(fromAngle(this.aim), dt);
  }

  strike() {
    const b = this.enemy.body;
    this.heading = b.rotation;
    this.committedAt = null;
    this.lastPos = { ...b.pos };
    this.takeOff(fromAngle(this.heading));
  }

  step(dt) {
    super.step(dt);
    if (this.phase === 'active') this.fly(dt);
  }

  fly(dt) {
    const b = this.enemy.body, d = this.data, w = this.world, p = this.player, v = this.cruise();
    let c = Math.cos(this.heading), s = Math.sin(this.heading);
    // Held up against a wall (not just knocked back by a blow): a crash.
    if (w.time > this.strikeAt) {
      const moved = (b.pos.x - this.lastPos.x) * c + (b.pos.y - this.lastPos.y) * s;
      if (moved < v * dt * 0.75 && w.physics.circleHitsWall(b.pos.x + c * 0.1, b.pos.y + s * 0.1, b.radius)) {
        this.crash();
        return;
      }
    }
    // Turning as fast as the circle on from its heading through the player needs, until it
    // commits: close in, or gone past them.
    if (this.committedAt === null && p) {
      const dx = p.body.pos.x - b.pos.x, dy = p.body.pos.y - b.pos.y, l = Math.hypot(dx, dy), off = deltaAngle(this.heading, Math.atan2(dy, dx));
      if (l <= d.commitRange || Math.abs(off) > Math.PI / 2) this.committedAt = w.time;
      else this.heading += clamp((2 * v * Math.sin(off)) / l, -d.turnRate, d.turnRate) * dt;
    }
    if (this.committedAt !== null && w.time - this.committedAt >= d.followTime) {
      this.advance();
      return;
    }
    c = Math.cos(this.heading);
    s = Math.sin(this.heading);
    b.rotation = this.heading;
    b.vel.x = c * v;
    b.vel.y = s * v;
    this.lastPos = { ...b.pos };
  }

  crash() {
    const b = this.enemy.body, d = this.data, w = this.world, C = ATTACK_FX.crash;
    const c = Math.cos(this.heading), s = Math.sin(this.heading), x = b.pos.x + c * b.radius, y = b.pos.y + s * b.radius;
    this.endActive();
    b.stop();
    b.addImpulse(-c * d.bounceForce, -s * d.bounceForce);
    w.effects.burst(x, y, this.heading + Math.PI, { ...C, color: ATTACK_FX.color });
    w.effects.burst(x, y, this.heading + Math.PI, { ...C, count: C.count / 2, color: ATTACK_FX.hot });
    this.sound('crash');
    this.setPhase('recovery', d.crashRecoveryTime);
  }
}
