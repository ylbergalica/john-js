// The Razor's abilities.
import { clamp, clamp01, deltaAngle, fromAngle, randSign, smoothStep01 } from '../../engine/math.js';
import { FIXED_DT } from '../../data/config.js';
import { DEG, HitboxAbility } from './ability.js';

// ── the Razor ──────────────────────────────────────────────────────
// Its blades (RazorBlades), never picked by its AI: a hitbox that's always on, unless the
// Razor is stunned or one of its strikes is hurting in its place. Touching it hurts whenever
// the player can be hurt, and having hurt them it passes through their parries only until
// they're out of it (`lingers`).
export class BladeDiscAbility extends HitboxAbility {
  constructor(enemy, data) {
    super(enemy, data, { type: 'circle', r: data.hitboxRadius }, null, { kind: 'body', stopsOnStart: false, parryKnockback: data.parryKnockback, continuous: true });
    this.hitbox.lingers = true;
  }

  shouldExecute() { return false; }

  get armed() {
    const e = this.enemy;
    if (e.stunned || e.dying) return false;
    for (const a of e.abilities.values()) if (a !== this && a.phase === 'active') return false;
    return true;
  }

  step(dt) {
    super.step(dt);
    this.hitbox.setActive(this.armed);
  }
}

// Body: the Razor's dashes, one after another (see RazorDash, RazorZigzag), through the player
// and on. It turns itself: through the wind-up to face its first dash, and halfway along each
// dash on to the next. Over the recovery it skids to a halt (`skidEase`).
export class BladeDashAbility extends HitboxAbility {
  constructor(enemy, data) {
    super(enemy, data, { type: 'circle', r: data.hitboxRadius }, null, { kind: 'body', parryKnockback: data.parryKnockback, strikeSound: data.strikeSound });
    this.side = 1; // the way its first dash goes off its aim: 1 to its left, as its tell shows
    this.leg = 0; // the dash under way
    this.aim = 0; // toward the player, until its aim locks (radians)
    this.axis = 0; // the line it advances along (radians)
    this.turn = 1; // the way the dash under way goes off it
    this.from = { x: 0, y: 0 }; // the dash under way: from where, which way, how far, and when
    this.dir = { x: 1, y: 0 };
    this.heading = 0;
    this.length = 0;
    this.legAt = 0;
    this.lastPos = { x: 0, y: 0 };
    this.restUntil = null; // when it sets off again, between dashes
  }

  // On the disc's front edge.
  cuePoints() { return [{ x: this.data.hitboxRadius, y: 0 }]; }

  execute() {
    this.side = randSign();
    this.aim = this.angleToPlayer();
    super.execute();
    this.sound('razorRev');
  }

  // It turns itself (step), not its AI.
  tracking() { return false; }

  angleToPlayer() {
    const { x, y } = this.dirToPlayer();
    return Math.atan2(y, x);
  }

  advance() {
    super.advance();
    if (this.phase === 'active') this.phaseEndsAt = Infinity; // until its last dash ends (fly)
  }

  strike() {
    const b = this.enemy.body, p = this.player;
    this.axis = this.aim;
    this.turn = this.side;
    this.leg = 0;
    this.restUntil = null;
    b.ignores = new Set(p ? [p.body] : []); // it cuts through them, not into them
    this.startLeg();
  }

  // Its line of advance for the next dash: turned after the player, while they're ahead.
  nextAxis() {
    const off = deltaAngle(this.axis, this.angleToPlayer()), max = this.data.steerDeg * DEG;
    return Math.abs(off) < Math.PI / 2 ? this.axis + clamp(off, -max, max) : this.axis;
  }

  startLeg() {
    const b = this.enemy.body, d = this.data;
    if (this.leg > 0) {
      this.axis = this.nextAxis();
      this.sound(d.legSound);
    }
    this.heading = this.axis + this.turn * d.offDeg * DEG;
    this.dir = fromAngle(this.heading);
    this.turn = -this.turn;
    this.from = { ...b.pos };
    this.lastPos = { ...b.pos };
    this.length = d.legs[this.leg] * d.legLength;
    this.legAt = this.world.time;
    this.hitbox.contacts.clear(); // each dash can hit afresh
  }

  step(dt) {
    super.step(dt);
    if (this.phase === 'windup') {
      if (super.tracking()) this.aim = this.angleToPlayer();
      this.enemy.ai.turnToward(fromAngle(this.aim + this.side * this.data.offDeg * DEG), dt);
    } else if (this.phase === 'active') this.fly(dt);
    else if (this.phase === 'recovery') this.skid(dt);
  }

  skid(dt) {
    const b = this.enemy.body, k = Math.exp(-dt / this.data.skidEase);
    b.vel.x *= k;
    b.vel.y *= k;
  }

  // Along its line, gathering speed, then braking to arrive at its end. A wall in the way
  // ends the dash there.
  fly(dt) {
    const b = this.enemy.body, d = this.data, now = this.world.time;
    if (this.restUntil !== null) {
      if (now < this.restUntil) { this.skid(dt); return; }
      this.restUntil = null;
      this.startLeg();
    }
    const { dir, from, lastPos } = this, t = now - this.legAt, end = d.speed * d.carry;
    const left = this.length - ((b.pos.x - from.x) * dir.x + (b.pos.y - from.y) * dir.y);
    const stuck = t > d.launchTime + FIXED_DT && (b.pos.x - lastPos.x) * dir.x + (b.pos.y - lastPos.y) * dir.y < d.speed * FIXED_DT * 0.2;
    if (left <= end * FIXED_DT || stuck) {
      b.vel.x = dir.x * end;
      b.vel.y = dir.y * end;
      if (++this.leg < d.legs.length) this.restUntil = now + d.legGap;
      else super.advance(); // into the recovery
      return;
    }
    b.rotation += deltaAngle(b.rotation, this.facing(left)) * (1 - Math.exp(-dt / d.turnEase));
    const brake = (d.speed - end) / d.brakeTime;
    const v = Math.min(d.speed * Math.min(1, (t + FIXED_DT) / d.launchTime), Math.sqrt(end * end + 2 * brake * left), left / FIXED_DT);
    b.vel.x = dir.x * v;
    b.vel.y = dir.y * v;
    this.lastPos = { ...b.pos };
  }

  // The way it faces with `left` to go: along the dash for the first half, then turning on to
  // the next, there by the end of this one. On its last dash it just faces along it.
  facing(left) {
    if (this.leg + 1 >= this.data.legs.length) return this.heading;
    const next = this.nextAxis() + this.turn * this.data.offDeg * DEG; // `turn`: already the next one's
    return this.heading + deltaAngle(this.heading, next) * smoothStep01(clamp01(1 - (2 * left) / this.length));
  }

  endActive() {
    super.endActive();
    this.enemy.body.ignores = null;
  }

  dispose() {
    super.dispose();
    this.enemy.body.ignores = null;
  }
}
