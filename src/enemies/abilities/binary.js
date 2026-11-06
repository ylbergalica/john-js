// The Binary's abilities.
import { clamp, clamp01, clampLength, deltaAngle, dist, dirTo, fromAngle, lerp, randSign, smoothStep01, TAU } from '../../engine/math.js';
import { FIXED_DT } from '../../data/config.js';
import { DamageCause } from '../../game/damage.js';
import { LashView } from '../tether.js';
import { DEG, Ability, HitboxAbility } from './ability.js';

// ── the Binary ─────────────────────────────────────────────────────
// The Binary's beam attack, made by its two stars together (see BinaryOrbit). The star whose
// AI picks it leads it: it draws its twin's own copy of the attack in as its partner
// (EnemyAI.draft), which only mirrors its phases, so the twin winds up, strikes and recovers
// with it and looks it, and the lead moves them both. Only their Tether hurts. A parry of it
// stuns them both (beamParried). Interrupted, or with the twin gone, it comes to nothing.
const MIRRORED = ['phase', 'phaseStartedAt', 'phaseEndsAt', 'strikeAt', 'cueAt', 'activeEndedAt'];

class PairAbility extends Ability {
  constructor(enemy, data) {
    super(enemy, data);
    this.kind = 'zone';
    this.lead = null; // drawn in by its twin's copy of this attack: mirroring that
    this.partner = null; // leading: its twin's copy, drawn in
    this.bound = null; // leading: the tether between them
    this.axis = null; // leading: which way the attack goes (see place)
  }

  // Leading: the two stars, itself first (its twin gone once it's let go).
  get stars() { return [this.enemy, this.partner?.enemy].filter((e) => e && !e.dead && !e.dying); }

  // Its twin's copy of this attack, if the twin can join in: free, near enough the player,
  // and their beam able to burn.
  partnerFor() {
    const t = this.enemy.tether, p = this.player;
    if (!t?.ready || !p) return null;
    const twin = t.a === this.enemy ? t.b : t.a;
    if (twin.isActing || twin.stunned || twin.passive || dist(twin.body.pos, p.body.pos) > this.data.pairRange) return null;
    return [...twin.abilities.values()].find((a) => a.data === this.data && !a.lead) ?? null;
  }

  canExecute() { return !this.lead && super.canExecute() && !!this.partnerFor(); }

  execute() {
    const e = this.enemy;
    this.partner = this.partnerFor();
    this.bound = e.tether;
    this.axis = null;
    e.isActing = true;
    this.partner.lead = this;
    this.partner.enemy.ai.draft(this.partner);
    this.sound('windup');
    this.sound('binaryCharge');
    this.setPhase('windup', this.data.windUpTime);
    this.bound.prime(this);
    this.place();
  }

  setPhase(phase, duration) {
    super.setPhase(phase, duration);
    this.partner?.mirror();
  }

  // Drawn in: its phases are its lead's. Once its lead is done or gone, it's let go.
  mirror() {
    const L = this.lead;
    if (!L) return;
    if (L.enemy.dead || L.enemy.dying || L.partner !== this || L.phase === 'ready') { this.letGo(); return; }
    const was = this.phase;
    for (const k of MIRRORED) this[k] = L[k];
    if (was === 'windup' && this.phase === 'active') this.notifyAttackStarted();
  }

  // Free again, stunned on for as long as its lead's stun had left (if its lead is gone).
  letGo() {
    const e = this.enemy, L = this.lead;
    if (!L) return;
    if (this.phase === 'stunned') {
      e.stunned = false;
      e.stunUntil = Math.max(e.stunUntil, L.phaseEndsAt);
    }
    e.body.ignores = null;
    this.lead = null;
    this.phase = 'ready';
    e.isActing = false;
  }

  step(dt) {
    if (this.lead) { this.mirror(); return; }
    super.step(dt);
    if (this.phase === 'recovery') this.settle();
    if (this.phase !== 'windup' && this.phase !== 'active') return;
    if (!this.bound?.intact) this.finish(); // its twin gone
    else if (this.phase === 'windup') this.gather();
    else this.fly();
  }

  advance() {
    switch (this.phase) {
      case 'windup':
        this.notifyAttackStarted();
        this.strikeAt = this.world.time;
        this.strike();
        this.sound(this.data.strikeSound);
        this.setPhase('active', Infinity); // until it's done (fly)
        break;
      case 'active':
        this.endActive();
        this.setPhase('recovery', this.data.recoveryTime);
        break;
      default: this.finish();
    }
  }

  // Done, or called off: both free again, the beam a faint thread.
  finish() {
    const e = this.enemy;
    if (this.phase === 'stunned') e.stunned = false;
    this.endActive();
    this.phase = 'ready';
    e.isActing = false;
    this.partner?.letGo();
    this.partner = this.bound = null;
  }

  endActive() {
    this.bound?.douse();
    if (this.phase === 'active') this.activeEndedAt = this.world.time;
    for (const e of this.stars) e.body.ignores = null;
  }

  // Called off by a stun from outside, the twin's too.
  interrupt() {
    if (this.lead) this.lead.interrupt();
    else if (this.phase === 'windup' || this.phase === 'active') this.finish();
  }

  // Its beam parried: both stars knocked back from the player, hurt as if parried and
  // stunned.
  beamParried() {
    const d = this.data, p = this.player;
    this.endActive();
    for (const e of this.stars) {
      const k = p ? dirTo(p.body.pos, e.body.pos) : { x: 0, y: 0 };
      e.body.stop();
      e.body.addImpulse(k.x * d.parryKnockback, k.y * d.parryKnockback);
      e.takeDamage(this.parryDamage(), null, null, DamageCause.Parry);
    }
    if (this.enemy.dead || this.enemy.dying) { // its lead gone: the twin's stun is its own
      for (const e of this.stars) e.stun(d.parryStunTime);
      return;
    }
    for (const e of this.stars) e.stunned = true;
    this.takeOverStun();
    this.partner?.takeOverStun();
    this.setPhase('stunned', d.parryStunTime);
  }

  // Easing `e` toward velocity `to`, by no more than `accel` per second.
  steerTo(e, to, accel) {
    const v = e.body.vel, dv = clampLength({ x: to.x - v.x, y: to.y - v.y }, accel * FIXED_DT);
    v.x += dv.x;
    v.y += dv.y;
  }

  // How far along `dir` from `from` there's room for, up to `len`, keeping `margin` off
  // walls (but at least `min`).
  room(from, dir, len, margin = 0.6, min = 1) {
    return Math.max(min, Math.min(len, this.world.physics.rayLength(from.x, from.y, dir.x, dir.y, len + margin) - margin));
  }

  // Setting off: passing over the player, the other enemies and the props.
  takeOff() {
    const w = this.world, bodies = new Set([...w.enemies, ...w.props, w.livePlayer, this.player].filter((t) => t?.body).map((t) => t.body));
    for (const e of this.stars) e.body.ignores = bodies;
  }

  dispose() {
    super.dispose();
    this.partner?.letGo();
  }
}

// Orbit: drawn in close side by side through the wind-up, spiralling in, then flying apart
// round either side of a point past the player, as if orbiting it, and back in together
// beyond it, the beam between them sweeping over the player on the way (BinaryOrbit). They
// move with weight: each eases toward where it should be going (by `accel`), never set
// there outright.
const ORBIT_SAMPLES = 24; // points along a way, to measure how long it is

export class OrbitPairAbility extends PairAbility {
  constructor(enemy, data) {
    super(enemy, data);
    this.side = 1; // flying: which side of the way to the player the leading star takes
    this.aim = null; // where the player stands, until the aim locks
    this.center = null; // where their middle draws in to, `stand` from the player
    this.across = 0; // the angle (world) the line between them settles at, across the way to the player
    this.drift = null; // winding up: how fast their middle moves
    this.spin = 0; // winding up: how fast they were circling each other as it began (rad/s)
    this.apart0 = 0; // winding up: how far apart they were as it began
    this.ways = null; // flying: each star's way round
    this.flight = 0; // flying: how long it takes them (seconds)
  }

  // Where they draw in to: their middle `stand` from the player (as far as it is, within
  // min–max, kept off walls), the line between them across the way to the player.
  place() {
    const d = this.data, p = this.player.body.pos, [e0, e1] = this.stars, a = e0.body.pos, b = e1.body.pos;
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, t = dirTo(m, p);
    if (!this.axis) { // setting off: how they were moving
      const va = e0.body.vel, vb = e1.body.vel, rx = b.x - a.x, ry = b.y - a.y, r2 = rx * rx + ry * ry || 1e-6;
      this.drift = { x: (va.x + vb.x) / 2, y: (va.y + vb.y) / 2 };
      this.spin = (rx * (vb.y - va.y) - ry * (vb.x - va.x)) / r2;
      this.apart0 = Math.sqrt(r2);
    }
    this.axis = t.x || t.y ? t : (this.axis ?? fromAngle(Math.random() * TAU));
    const n = this.axis, back = this.room(p, { x: -n.x, y: -n.y }, clamp(dist(m, p), d.stand.min, d.stand.max));
    this.center = { x: p.x - n.x * back, y: p.y - n.y * back };
    this.across = Math.atan2(n.x, -n.y);
    this.aim = { x: p.x, y: p.y };
  }

  // Drawing in through the wind-up, following the player until the aim locks: their middle
  // pulled to its place (`draw.pull`, `draw.damp`, at up to `glide`), the two spiralling in
  // round it, `close` apart by `draw.settle` of the wind-up, circling on as they were but
  // slowing, turning to lie across the way to the player by its end.
  gather() {
    if (this.player && (this.tracking() || !this.center)) this.place();
    const d = this.data, D = d.draw, dt = FIXED_DT, [e0, e1] = this.stars, a = e0.body.pos, b = e1.body.pos;
    const k = clamp01((this.world.time + dt - this.phaseStartedAt) / d.windUpTime), left = Math.max(d.windUpTime * (1 - k), D.settleTime);
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, v = this.drift;
    v.x += ((this.center.x - m.x) * D.pull - v.x * D.damp) * dt;
    v.y += ((this.center.y - m.y) * D.pull - v.y * D.damp) * dt;
    Object.assign(v, clampLength(v, d.glide));
    let off = deltaAngle(Math.atan2(b.y - a.y, b.x - a.x), this.across); // the nearer way round to lie across
    if (off > Math.PI / 2) off -= Math.PI;
    else if (off < -Math.PI / 2) off += Math.PI;
    const ang = Math.atan2(b.y - a.y, b.x - a.x) + (this.spin * (1 - k) ** 2 + off / left) * dt;
    const half = lerp(this.apart0, d.close, smoothStep01(k / D.settle)) / 2, c = Math.cos(ang) * half, s = Math.sin(ang) * half;
    const mx = m.x + v.x * dt, my = m.y + v.y * dt;
    this.steerTo(e0, { x: (mx - c - a.x) / dt, y: (my - s - a.y) / dt }, d.accel);
    this.steerTo(e1, { x: (mx + c - b.x) / dt, y: (my + s - b.y) / dt }, d.accel);
  }

  // Their ways round, from where they are: about a point `past` the player, out `wide` to
  // either side and in again `beyond` it, kept off walls; flown in `flight` at `speed` on
  // average. Each takes the side it's on.
  strike() {
    const d = this.data, n = this.axis, a = this.aim, stars = this.stars;
    const past = this.room(a, n, d.past, 0.6, 0), at = { x: a.x + n.x * past, y: a.y + n.y * past };
    const m = { x: (stars[0].body.pos.x + stars[1].body.pos.x) / 2, y: (stars[0].body.pos.y + stars[1].body.pos.y) / 2 };
    const from = Math.max(0.5, (at.x - m.x) * n.x + (at.y - m.y) * n.y), to = this.room(at, n, d.beyond, 0.6, 0.5);
    this.side = (stars[0].body.pos.x - m.x) * -n.y + (stars[0].body.pos.y - m.y) * n.x >= 0 ? 1 : -1;
    this.ways = stars.map((e, i) => {
      const s = i === 0 ? this.side : -this.side, across = { x: -n.y * s, y: n.x * s };
      const way = { at, n, across, from, to, wide: this.room(at, across, (d.wide * (from + to)) / 2, 0.6, 0.5) };
      const start = this.wayAt(way, 0);
      way.off = { x: e.body.pos.x - start.x, y: e.body.pos.y - start.y };
      return way;
    });
    let len = 0;
    for (const way of this.ways) {
      let l = 0, prev = this.wayAt(way, 0);
      for (let i = 1; i <= ORBIT_SAMPLES; i++) {
        const q = this.wayAt(way, i / ORBIT_SAMPLES);
        l += Math.hypot(q.x - prev.x, q.y - prev.y);
        prev = q;
      }
      len = Math.max(len, l);
    }
    this.flight = len / d.speed;
    this.takeOff();
    this.bound.light(this, d.beamWidth, this.enemy.damage * d.damageMultiplier);
  }

  // Where a star flying `way` is `u` of the way round (0 → 1): half an orbit of the point,
  // drawing in from `from` behind it to `to` beyond it, `close` apart from its twin at the
  // start and `endApart` at the end.
  wayAt(way, u) {
    const d = this.data, a = Math.PI * u, r = lerp(way.from, way.to, smoothStep01(u));
    const along = -Math.cos(a) * r, out = Math.sin(a) * way.wide + lerp(d.close, d.endApart, u) / 2;
    return { x: way.at.x + way.n.x * along + way.across.x * out, y: way.at.y + way.n.y * along + way.across.y * out };
  }

  // Flying round, chasing where they should be along their ways (setting off at `launch` ×
  // their average speed and slowing to a stop); where they set off from slipping into their
  // ways over the first stretch.
  fly() {
    const d = this.data, x = (this.world.time + FIXED_DT - this.strikeAt) / this.flight;
    if (x > 1) { this.advance(); return; }
    const u = lerp(smoothStep01(x), 1 - (1 - x) ** 2, d.launch / 2), settle = 1 - smoothStep01(u / 0.3), max = d.speed * 3;
    this.stars.forEach((e, i) => {
      const way = this.ways[i], q = this.wayAt(way, u), b = e.body;
      this.steerTo(e, clampLength({ x: (q.x + way.off.x * settle - b.pos.x) / FIXED_DT, y: (q.y + way.off.y * settle - b.pos.y) / FIXED_DT }, max), d.accel);
      if (b.vel.x || b.vel.y) b.rotation = Math.atan2(b.vel.y, b.vel.x);
    });
  }

  // Recovering: drifting to a stop where their ways end (`settle` /s toward them), braking
  // `brake` × as hard as they speed up.
  settle() {
    const d = this.data;
    this.stars.forEach((e, i) => {
      const q = this.wayAt(this.ways[i], 1), p = e.body.pos;
      this.steerTo(e, clampLength({ x: (q.x - p.x) * d.settle, y: (q.y - p.y) * d.settle }, d.speed), d.accel * d.brake);
    });
  }
}

// Zone: a widowed Binary's broken beam whipped once round it (BinaryLash): swung back from
// the player over the wind-up, growing out of it, its tip curling further back, then
// whipped round through them, the tip trailing the root by up to `lag` seconds so it bends
// like a whip and cracks straight at the end. Each step its hitbox takes in the whip as it
// was at a few times since the last, so it can't pass over the player.
const LASH_POINTS = 8; // points along the whip

const LASH_SAMPLES = 4; // whips per step in its hitbox

export class LashAbility extends HitboxAbility {
  constructor(enemy, data) {
    super(enemy, data, { type: 'group', parts: [] }, null, { parryKnockback: data.parryKnockback, strikeSound: data.strikeSound });
    this.view = new LashView(this);
    this.side = 1; // the way it whips round: 1 to its left
    this.base = 0; // its angle as it strikes (world, radians)
    this.sampledAt = 0; // when its hitbox last took the whip in
  }

  canExecute() { return this.enemy.widowed && super.canExecute(); }

  execute() {
    this.side = randSign();
    super.execute();
  }

  strike() {
    this.base = this.angleAt(this.world.time);
    this.sampledAt = this.world.time;
  }

  // Its root's angle (world) at `time`: swung back from the enemy's facing through the
  // wind-up, then whipping round, done `lag` before the tip is.
  angleAt(time) {
    const d = this.data;
    if (this.phase === 'windup') return this.enemy.body.rotation - this.side * d.backDeg * DEG;
    return this.base + this.side * d.turns * TAU * smoothStep01(clamp01((time - this.strikeAt) / (d.duration - d.lag)));
  }

  // The angle (world) at `f` of the way along it (0 → 1) at `time`: the root's as it was a
  // little earlier, the further along the longer ago, curled back as it's held.
  bendAt(time, f) {
    const d = this.data, curl = -this.side * d.curl * f * f;
    if (this.phase === 'windup') return this.angleAt(time) + curl * this.windup(time);
    const held = 1 - clamp01((time - this.strikeAt) / d.lag);
    return this.angleAt(Math.max(this.strikeAt, time - d.lag * f ** 1.5)) + curl * held;
  }

  windup(time) { return smoothStep01(clamp01((time - this.phaseStartedAt) / Math.max(1e-3, this.phaseEndsAt - this.phaseStartedAt))); }

  // The whip at `time`, `length` long, round `p` (offset by `-turn`): LASH_POINTS + 1 points.
  points(p, time, length, turn = 0) {
    const r0 = this.enemy.body.radius * 0.8;
    return Array.from({ length: LASH_POINTS + 1 }, (_, i) => {
      const f = i / LASH_POINTS, a = this.bendAt(time, f) - turn, r = lerp(r0, length, f);
      return { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r };
    });
  }

  step(dt) {
    super.step(dt);
    if (this.phase !== 'active') return;
    const d = this.data, b = this.enemy.body, now = this.world.time, from = this.sampledAt, parts = [];
    b.stop();
    for (let k = 1; k <= LASH_SAMPLES; k++) {
      const pts = this.points({ x: 0, y: 0 }, lerp(from, now, k / LASH_SAMPLES), d.length, b.rotation);
      for (let i = 0; i < LASH_POINTS; i++) parts.push({ type: 'segment', ax: pts[i].x, ay: pts[i].y, bx: pts[i + 1].x, by: pts[i + 1].y, r: d.width / 2 });
    }
    this.hitbox.shape.parts = parts;
    this.sampledAt = now;
  }

  // At the lash's tip, where it is swung back to.
  cuePoints() {
    const d = this.data, a = -this.side * (d.backDeg * DEG + d.curl);
    return [{ x: Math.cos(a) * d.length, y: Math.sin(a) * d.length }];
  }
}
