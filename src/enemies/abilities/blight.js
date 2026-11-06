// The Blight's abilities.
import { clamp, clamp01, deltaAngle, fromAngle, randRange, TAU } from '../../engine/math.js';
import { ATTACK_FX, BLIGHT } from '../../data/config.js';
import { Projectile } from '../projectile.js';
import { lookColor } from '../attackView.js';
import { Glob } from '../glob.js';
import { blightMuzzle, blightParts } from '../../render/sprites/enemies/blight.js';
import { DEG } from './ability.js';
import { ThrowAbility, CannonsAbility } from './throw.js';

// The Alembic's parts (blightParts): its valves fire its toxin from over their irises
// (blightMuzzle) and its canisters launch, from their places at rest; its rig moves them to
// match (`parts`, see blightRig.js).
function shuffled(list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const rimValves = () => blightParts().filter((h) => h.rim);

// A point in the enemy's frame → the world, for its body as it is now.
function bodyToWorld(e, p) {
  const b = e.body, c = Math.cos(b.rotation), s = Math.sin(b.rotation);
  return { x: b.pos.x + c * p.x - s * p.y, y: b.pos.y + s * p.x + c * p.y };
}

// Projectile: cannons all round (the Alembic's ring), one in each valve, firing out evenly
// round. It turns after the player the whole time (lockTime 0), so the valve in front
// always fires at them, and only that shot is cued.
export class RingAbility extends CannonsAbility {
  constructor(enemy, data) {
    super(enemy, data);
    this.muzzles = rimValves().map((h, i, all) => ({ ...blightMuzzle(h), angle: (TAU * i) / all.length }));
  }

  cuePoints() { return [{ x: this.muzzles[0].x, y: this.muzzles[0].y }]; }
}

// Projectile: `count` of the Alembic's canisters strain out through the wind-up, then launch
// and fly off away from its centre, homing in on the player (the canisters themselves show
// the wind-up, so it has no ChargeView). A new one slides up in time (`launched`, which its
// rig reads); a socket still empty isn't picked.
export class CanistersAbility extends ThrowAbility {
  constructor(enemy, data) {
    super(enemy, data);
    this.view = null;
    this.chosen = []; // the canisters launching this time
    this.launched = new Map(); // part index → when it last launched
  }

  regrowing(i) {
    const at = this.launched.get(i), d = this.data;
    return at != null && this.world.time < at + d.regrowDelay + d.regrowTime;
  }

  execute() {
    const free = blightParts().flatMap((h, i) => (h.kind === 'pod' && !this.regrowing(i) ? [i] : []));
    this.chosen = shuffled(free).slice(0, this.data.count);
    super.execute();
  }

  // Where canister `h` is once pushed out, in the enemy's frame.
  strained(h) {
    const k = this.data.pushOut;
    return { x: h.x + Math.cos(h.rot) * k, y: h.y + Math.sin(h.rot) * k };
  }

  release() {
    const e = this.enemy, d = this.data, parts = blightParts();
    for (const i of this.chosen) {
      const h = parts[i], { x, y } = bodyToWorld(e, this.strained(h));
      const rot = e.body.rotation + (Math.hypot(h.x, h.y) > 0.1 ? Math.atan2(h.y, h.x) : h.rot); // away from its centre
      this.world.add(new Projectile(this.world, this, x, y, {
        dir: fromAngle(rot), speed: d.projectileSpeed, lifetime: d.projectileLifetime, damage: e.damage * d.damageMultiplier,
        size: d.projectileSize, look: d.look, turnRate: d.turnRate, homingDelay: d.homingDelay, homingTime: d.homingTime,
        passesWalls: d.passesWalls, variant: i,
      }));
      this.launched.set(i, this.world.time);
      this.world.effects.burst(x, y, rot, BLIGHT.launch);
    }
    this.sound('podLaunch');
  }

  cuePoints() { return this.chosen.map((i) => this.strained(blightParts()[i])); }
}

// Projectile: it builds pressure through the wind-up, every valve opening, then fires
// `bursts` of orbs, `burstInterval` apart, each from `perBurst` of its valves picked at
// random, straight out of each, a little off at random. Each burst's orbs flying at the
// player are cued. A stun (an orb parried) stops the rest.
export class SpewAbility extends ThrowAbility {
  constructor(enemy, data) {
    super(enemy, data);
    this.view = null; // its tell and opening valves show the wind-up
    this.plan = []; // each burst's shots: [{ i (valve), off (radians) }]
    this.fired = 0;
    this.cued = 0;
    this.cuedBurst = 0;
    this.firstAt = 0;
    this.spatAt = new Map(); // valve index → when it last fired (for its rig)
  }

  execute() {
    const d = this.data, rim = rimValves().map((_, i) => i);
    this.plan = Array.from({ length: d.bursts }, () => shuffled(rim).slice(0, d.perBurst).map((i) => ({ i, off: randRange(-d.jitterDeg, d.jitterDeg) * DEG })));
    this.fired = this.cued = this.cuedBurst = 0;
    super.execute();
    this.firstAt = this.phaseEndsAt;
  }

  burstTime(n) { return this.firstAt + n * this.data.burstInterval; }

  step(dt) {
    const live = this.phase === 'windup' || this.phase === 'active';
    if (live && this.cued < this.plan.length && this.world.time >= this.burstTime(this.cued) - ATTACK_FX.cue.lead) {
      this.cuedBurst = this.cued++;
      if (this.aimed(this.cuedBurst).length) this.cueAt = this.world.time;
    }
    super.step(dt);
    if (this.phase !== 'active') return;
    while (this.fired < this.plan.length && this.world.time >= this.burstTime(this.fired)) this.burst();
  }

  advance() {
    switch (this.phase) {
      case 'windup':
        this.notifyAttackStarted();
        this.burst();
        this.setPhase('active', (this.plan.length - 1) * this.data.burstInterval);
        return;
      case 'active':
        while (this.fired < this.plan.length) this.burst();
        this.setPhase('recovery', this.data.recoveryTime);
        return;
    }
    super.advance();
  }

  burst() {
    const e = this.enemy, d = this.data, b = e.body, heads = rimValves();
    const spits = this.plan[this.fired++];
    if (this.fired === 1) this.strikeAt = this.world.time; // the body pops once, as it starts; each shot kicks its valve (spatAt)
    if (!this.player) return;
    for (const { i, off } of spits) {
      const { x, y } = bodyToWorld(e, blightMuzzle(heads[i])), rot = b.rotation + heads[i].rot + off;
      this.world.add(new Projectile(this.world, this, x, y, {
        dir: fromAngle(rot), speed: d.projectileSpeed, lifetime: d.projectileLifetime, damage: e.damage * d.damageMultiplier,
        size: d.projectileSize, look: d.look,
      }));
      this.world.effects.burst(x, y, rot, { ...ATTACK_FX.projectile.muzzle, color: lookColor(d.look) });
      this.spatAt.set(i, this.world.time);
    }
    this.sound('puff');
  }

  // Burst `n`'s shots flying within `cueWithinDeg` of the player, as it faces now.
  aimed(n) {
    const p = this.player, b = this.enemy.body, heads = rimValves();
    if (!p || !this.plan[n]) return [];
    const to = Math.atan2(p.body.pos.y - b.pos.y, p.body.pos.x - b.pos.x) - b.rotation;
    return this.plan[n].filter(({ i, off }) => Math.abs(deltaAngle(heads[i].rot + off, to)) <= this.data.cueWithinDeg * DEG);
  }

  cuePoints() { return this.aimed(this.cuedBurst).map(({ i }) => blightMuzzle(rimValves()[i])); }
}

// Projectile: big globs form over the valves `from` over the wind-up, then `globs` of them
// are lobbed, `globInterval` apart, from each of those valves in turn, each at
// a spot around where the player is as it is thrown (the first right at them), where it
// splats into a pool of poison (Glob). Meanwhile it turns after the player at up to
// `turnRate`, each valve's next glob re-forms as the others are thrown, and each throw is
// cued at its valve. A stun (a glob parried) stops the rest.
export class GlobsAbility extends ThrowAbility {
  constructor(enemy, data) {
    super(enemy, data);
    this.offsets = []; // each glob's landing spot off the player: { angle, dist }, or null for right at them
    this.thrown = 0;
    this.cued = 0;
    this.cuedGlob = 0;
    this.firstAt = 0;
    this.spatAt = new Map(); // valve index → when it last lobbed (for its rig)
  }

  execute() {
    const d = this.data, n = d.globs, start = Math.random() * TAU;
    this.offsets = Array.from({ length: n }, (_, k) => (k === 0 ? null
      : { angle: start + (TAU * (k - 1 + randRange(-0.3, 0.3))) / Math.max(1, n - 1), dist: randRange(...d.spread) }));
    this.thrown = this.cued = this.cuedGlob = 0;
    super.execute();
    this.firstAt = this.phaseEndsAt;
  }

  throwTime(k) { return this.firstAt + k * this.data.globInterval; }

  step(dt) {
    const d = this.data, live = this.phase === 'windup' || this.phase === 'active';
    if (live && this.cued < d.globs && this.world.time >= this.throwTime(this.cued) - ATTACK_FX.cue.lead) {
      this.cueAt = this.world.time;
      this.cuedGlob = this.cued++;
    }
    super.step(dt);
    if (this.phase !== 'active') return;
    while (this.thrown < d.globs && this.world.time >= this.throwTime(this.thrown)) this.hurl();
    if (this.player) {
      const b = this.enemy.body, want = this.dirToPlayer(), max = d.turnRate * dt;
      b.rotation += clamp(deltaAngle(b.rotation, Math.atan2(want.y, want.x)), -max, max);
    }
  }

  advance() {
    switch (this.phase) {
      case 'windup':
        this.notifyAttackStarted();
        this.hurl();
        this.setPhase('active', (this.data.globs - 1) * this.data.globInterval);
        return;
      case 'active':
        while (this.thrown < this.data.globs) this.hurl();
        this.setPhase('recovery', this.data.recoveryTime);
        return;
    }
    super.advance();
  }

  hurl() {
    const e = this.enemy, d = this.data, k = this.thrown++, i = d.from[k % d.from.length];
    this.strikeAt = this.world.time;
    if (!this.player) return;
    const from = bodyToWorld(e, blightMuzzle(blightParts()[i]));
    this.world.add(new Glob(this.world, this, from, this.landingSpot(this.offsets[k]), {
      speed: d.projectileSpeed, size: d.projectileSize, damage: e.damage * d.damageMultiplier,
      pool: { radius: d.pool.radius, time: d.pool.time, damage: e.damage * d.pool.damageMultiplier },
    }));
    this.spatAt.set(i, this.world.time);
    this.sound('lob');
  }

  // `off` from where the player is now, never past a wall in the way.
  landingSpot(off) {
    const p = this.player.body.pos;
    if (!off) return { x: p.x, y: p.y };
    const dx = Math.cos(off.angle), dy = Math.sin(off.angle), margin = 0.5;
    const reach = Math.min(off.dist, Math.max(0, this.world.physics.rayLength(p.x, p.y, dx, dy, off.dist + margin) - margin));
    return { x: p.x + dx * reach, y: p.y + dy * reach };
  }

  // A glob is forming then sitting over each valve with one still to throw: the first of
  // each valve's over the wind-up, each later one from that valve's last throw until two
  // throws before its own.
  charge(now) {
    if (this.phase === 'active' && this.thrown < this.data.globs) return { t: 1, since: Infinity };
    return super.charge(now);
  }

  chargePoints(alpha, now) {
    const d = this.data, n = d.from.length, b = this.enemy.body, p = b.lerpPos(alpha), rot = b.lerpRotation(alpha);
    const c = Math.cos(rot), s = Math.sin(rot), first = this.phase === 'windup' ? 0 : this.thrown, out = [];
    for (let k = first; k < Math.min(first + n, d.globs); k++) {
      const h = blightParts()[d.from[k % n]], m = blightMuzzle(h);
      const t = k < n ? undefined : clamp01((now - this.throwTime(k - n)) / (d.globInterval * (n - 1)));
      out.push({ x: p.x + c * m.x - s * m.y, y: p.y + s * m.x + c * m.y, rot: rot + h.rot, t });
    }
    return out;
  }

  cuePoints() { return [blightMuzzle(blightParts()[this.data.from[this.cuedGlob % this.data.from.length]])]; }
}
