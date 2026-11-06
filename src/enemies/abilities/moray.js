// The Moray's abilities.
import { clamp, clamp01, dist, dirTo, fromAngle, lerp, smoothStep01, TAU } from '../../engine/math.js';
import { MORAY } from '../../data/config.js';
import { Projectile } from '../projectile.js';
import { AIState } from '../ai.js';
import { DEG, Ability, HitboxAbility } from './ability.js';
import { ThrowAbility } from './throw.js';

// ── the Moray ──────────────────────────────────────────────────────
// Its life in the wall (MorayLurk), never picked by its AI, which leaves its moving to this
// (enemy.lair). `mode`:
//   lurk    swimming the shore, in the wall: it can't be aimed at, and passes through everything
//   out     an attack has it, past the outline; when that's over it pulls back in
//   rewind  pulling back in, back along the way it came
//   pop     struck in the wall and flung out
//   crawl   on the floor, a body like any other, making for the nearest wall
//   dive    sinking into the wall
export class WallLurkAbility extends Ability {
  constructor(enemy, data) {
    super(enemy, data);
    enemy.lair = this;
    this.mode = 'crawl'; // it's set down on the floor
    this.tile = null; // the shore tile it's at
    this.route = []; // the tiles it's swimming along
    this.routeAt = -Infinity; // when it looks again
    this.wakeAt = 0; // when it next rumbles
    this.popTo = null;
    this.popped = null; // where it last came out: { x, y, nx, ny }
    this.peekAt = null; // where it looks out from, through a wind-up
    this.riseMark = 0; // how much of its trail it had when it came out
    this.tethered = false; // out of the wall but with its tail in it: its body stretches to reach (a bite, a spit)
    this.length = MORAY.length; // how much of its body is drawn out along its trail
    this.outlineAt = -Infinity; // when `points` was worked out
    this.points = null;
    // The way its head has gone, oldest first, its body laid along it. At first, straight behind.
    const b = enemy.body, back = fromAngle(b.rotation + Math.PI);
    this.trail = [];
    for (let d = MORAY.length + 1; d > 0; d -= 0.25) this.trail.push({ x: b.pos.x + back.x * d, y: b.pos.y + back.y * d });
  }

  shouldExecute() { return false; }

  get physics() { return this.world.physics; }
  get inWall() { const { x, y } = this.enemy.body.pos; return this.physics.isWall(Math.floor(x), Math.floor(y)); }
  // Can't be aimed at, only reached: its head's in the wall.
  get submerged() { return this.mode === 'lurk' || ((this.mode === 'dive' || this.mode === 'rewind') && this.inWall); }

  setGhost(on) {
    const b = this.enemy.body;
    b.ghost = on;
    b.collideWalls = !on;
  }

  // Heads for `to` at `speed`, arriving exactly. → how far it had left to go.
  moveTo(to, speed, dt) {
    const b = this.enemy.body, dx = to.x - b.pos.x, dy = to.y - b.pos.y, l = Math.hypot(dx, dy);
    if (l < 1e-4) { b.stop(); return 0; }
    const v = Math.min(speed, l / dt);
    b.vel.x = (dx / l) * v;
    b.vel.y = (dy / l) * v;
    return l;
  }

  step(dt) {
    switch (this.mode) {
      case 'lurk': this.swim(dt); break;
      case 'out': if (!this.enemy.isActing && !this.enemy.stunned) this.mode = 'rewind'; break;
      case 'rewind': this.rewind(dt); break;
      case 'pop': this.fling(dt); break;
      case 'crawl': this.crawl(dt); break;
      case 'dive': this.sink(dt); break;
    }
    this.fitLength(dt);
  }

  // Where it's after: the player, or a spot to one side of them, circling; nowhere out of the fight.
  goal() {
    const ai = this.enemy.ai, p = this.player;
    if (!p) return null;
    if (ai.state === AIState.Chase) return p.body.pos;
    if (ai.state !== AIState.Reposition) return null;
    const dir = ai.dirToPlayer(), r = ai.cfg.orbitRadius * ai.orbitDirection;
    return { x: p.body.pos.x - dir.y * r, y: p.body.pos.y + dir.x * r };
  }

  swim(dt) {
    const e = this.enemy, b = e.body, ai = e.ai, w = this.world, now = w.time;
    if (e.isActing || e.stunned) { b.stop(); return; }
    this.tile ??= w.shore.nearest(b.pos.x, b.pos.y);
    if (!this.tile) return;
    if (now >= this.routeAt) {
      this.routeAt = now + this.data.routeEvery;
      const goal = this.goal();
      if (goal) {
        this.tile = w.shore.nearest(b.pos.x, b.pos.y) ?? this.tile;
        this.route = w.shore.route(this.tile, goal, this.physics);
      } else this.route = [];
    }
    const next = this.route[0] ?? this.tile, at = { x: next.x + 0.5, y: next.y + 0.5 };
    const speed = this.route.length === 0 ? ai.cfg.repositionSpeed : ai.state === AIState.Chase ? ai.cfg.moveSpeed : ai.cfg.repositionSpeed;
    const left = this.moveTo(at, speed, dt);
    if (this.route.length && left < 0.15) this.tile = this.route.shift();
    if (Math.hypot(b.vel.x, b.vel.y) > 0.5) {
      ai.turnToward({ x: b.vel.x, y: b.vel.y }, dt);
      if (now >= this.wakeAt) {
        this.wakeAt = now + this.data.wakeEvery;
        w.sound('morayWake', b.pos, { pitch: e.type.sfxPitch });
      }
    } else if (this.player) ai.turnToward(ai.dirToPlayer(), dt);
  }

  // Whether it can strike from the wall just now: where it would come out is within `range`
  // of the player (and no nearer than `minRange`), with a clear view of them.
  canStrike(range, minRange = 0) {
    const p = this.player;
    if (!p || this.mode !== 'lurk' || !this.tile) return false;
    const m = this.world.shore.mouth(this.tile, p.body.pos), d = dist(m, p.body.pos);
    return d <= range && d >= minRange && this.world.shore.sees(this.tile, p.body.pos, this.physics);
  }

  // An attack has it: it looks out on the side the player's on.
  rise() {
    const b = this.enemy.body, p = this.player, m = this.world.shore.mouth(this.tile, p ? p.body.pos : b.pos);
    this.mode = 'out';
    this.route = [];
    this.tethered = true;
    this.riseMark = this.trail.length;
    this.popped = m;
    this.peekAt = { x: m.x + m.nx * this.data.peek, y: m.y + m.ny * this.data.peek };
    this.world.sound('morayRise', m, { pitch: this.enemy.type.sfxPitch });
  }

  // Through a wind-up, easing out to where it looks out.
  peek(dt) {
    if (this.peekAt) this.moveTo(this.peekAt, this.data.peekSpeed, dt);
  }

  // Back along the way it came, facing out, and home.
  rewind(dt) {
    const e = this.enemy, b = e.body, T = this.trail;
    if (e.stunned) return;
    if (T.length > this.riseMark) {
      if (this.moveTo(T[T.length - 1], this.data.retractSpeed, dt) < 0.2) T.pop();
      return;
    }
    if (this.moveTo({ x: this.tile.x + 0.5, y: this.tile.y + 0.5 }, this.data.retractSpeed, dt) < 0.1) {
      b.stop();
      this.mode = 'lurk';
      this.tethered = false;
      this.routeAt = this.world.time;
    }
  }

  // Into the wall at `tile`, wherever it came from.
  enter(tile) {
    const w = this.world, b = this.enemy.body;
    this.tile = tile;
    this.mode = 'lurk';
    this.route = [];
    this.routeAt = w.time;
    this.tethered = false;
    this.setGhost(true);
    b.stop();
    const m = w.shore.mouth(tile, b.pos);
    w.stirWall(m.x, m.y, 0.8);
    w.effects.burst(m.x, m.y, Math.atan2(m.ny, m.nx), { ...this.data.surface, color: this.enemy.hitColor });
    w.sound('morayDive', m, { pitch: this.enemy.type.sfxPitch });
  }

  // Dropped on the floor where it is (a parried leap).
  strand() {
    this.mode = 'crawl';
    this.tethered = false;
    this.setGhost(false);
  }

  // Any blow reaching it in the wall, or peeking out of it. Otherwise it's just a blow.
  struck(source) {
    const peeking = this.mode === 'out' && [...this.enemy.abilities.values()].some((a) => a.phase === 'windup');
    if (this.submerged || peeking) this.pop(source);
  }

  // Flung out, on the side the blow came from, as far as the room lets it.
  pop(source) {
    const e = this.enemy, w = this.world, b = e.body, D = this.data.pop;
    for (const a of e.abilities.values()) a.interrupt();
    e.isActing = false;
    this.tile ??= w.shore.nearest(b.pos.x, b.pos.y);
    const m = this.tile ? w.shore.mouth(this.tile, source) : { x: b.pos.x, y: b.pos.y, nx: Math.cos(b.rotation), ny: Math.sin(b.rotation) };
    const free = this.physics.rayLength(m.x + m.nx * 0.05, m.y + m.ny * 0.05, m.nx, m.ny, D.distance + b.radius);
    const far = clamp(free - b.radius - 0.05, b.radius, D.distance);
    this.popped = m;
    this.tethered = false;
    this.popTo = { x: m.x + m.nx * far, y: m.y + m.ny * far };
    this.mode = 'pop';
    this.route = [];
    this.setGhost(true);
    b.rotation = b.prevRotation = Math.atan2(m.ny, m.nx);
    w.stirWall(m.x, m.y, 1);
    w.flareAt(m, D.flare, e.hitColor);
    w.camera.shakeAtLeast(D.shake);
    w.holdStill(D.hold);
    w.sound('morayPop', m, { pitch: e.type.sfxPitch });
  }

  fling(dt) {
    const e = this.enemy, b = e.body, w = this.world, D = this.data.pop;
    if (this.moveTo(this.popTo, D.speed, dt) > 0.15) return;
    this.setGhost(false);
    this.mode = 'crawl';
    b.stop();
    e.stunUntil = Math.max(e.stunUntil, w.time + D.stun);
  }

  // Straight for the nearest wall it can see, and down into it.
  crawl(dt) {
    const e = this.enemy, b = e.body, ai = e.ai, w = this.world;
    if (e.stunned || w.time < ai.movementSuppressedUntil) return;
    let best = null, bestFree = Infinity;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU, dx = Math.cos(a), dy = Math.sin(a), free = this.physics.rayLength(b.pos.x, b.pos.y, dx, dy, bestFree, 0.1);
      if (free < bestFree) { bestFree = free; best = { x: dx, y: dy }; }
    }
    if (!best) return; // nothing in reach, somehow
    if (bestFree <= b.radius + 0.15) {
      const at = bestFree + 0.3, x = Math.floor(b.pos.x + best.x * at), y = Math.floor(b.pos.y + best.y * at);
      this.tile = w.shore.has(x, y) ? { x, y } : w.shore.nearest(b.pos.x, b.pos.y);
      if (!this.tile) return;
      this.mode = 'dive';
      this.setGhost(true);
      return;
    }
    ai.turnToward(best, dt);
    ai.steer(best.x * this.data.crawlSpeed, best.y * this.data.crawlSpeed);
  }

  sink(dt) {
    if (this.moveTo({ x: this.tile.x + 0.5, y: this.tile.y + 0.5 }, this.data.diveSpeed, dt) < 0.1) this.enter(this.tile);
  }

  // Killed in the wall: it dies at the wall's edge, so what it drops can be reached.
  surface() {
    if (!this.inWall) return;
    const b = this.enemy.body, w = this.world;
    const m = this.mode === 'pop' ? this.popped : this.tile ? w.shore.mouth(this.tile, this.player ? this.player.body.pos : b.pos) : null;
    if (m) b.teleport(m.x + m.nx * b.radius, m.y + m.ny * b.radius);
  }

  afterPhysics() {
    super.afterPhysics();
    const T = this.trail, { x, y } = this.enemy.body.pos, last = T[T.length - 1];
    if (this.mode === 'rewind' || (x - last.x) ** 2 + (y - last.y) ** 2 < 0.01) return;
    T.push({ x, y });
    if (T.length > 500) {
      T.splice(0, 200);
      this.riseMark = Math.max(0, this.riseMark - 200);
    }
  }

  // Points `spacing` apart along its body, from (x, y) at its head back along its trail, `length` in all.
  walk(x, y, spacing, length) {
    const T = this.trail, out = [{ x, y }];
    let px = x, py = y, left = spacing, done = 0;
    for (let i = T.length - 1; i >= 0 && done < length; i--) {
      const q = T[i];
      let dx = q.x - px, dy = q.y - py, l = Math.hypot(dx, dy);
      while (l >= left && done < length) {
        const k = left / l;
        px += dx * k;
        py += dy * k;
        out.push({ x: px, y: py });
        done += spacing;
        dx = q.x - px;
        dy = q.y - py;
        l = Math.hypot(dx, dy);
        left = spacing;
      }
      left -= l;
      px = q.x;
      py = q.y;
    }
    return out;
  }

  // In the wall, whatever's still out on the floor is drawn in after it; otherwise its body
  // pays out to its full length as far as its trail allows.
  fitLength(dt) {
    const d = this.data, { x, y } = this.enemy.body.pos, wall = (p) => this.physics.isWall(Math.floor(p.x), Math.floor(p.y));
    const tailAt = (len) => { const pts = this.walk(x, y, 0.2, len); return pts[pts.length - 1]; };
    if (this.tethered) {
      let arc = Math.hypot(x - this.trail[this.trail.length - 1].x, y - this.trail[this.trail.length - 1].y);
      for (let i = this.trail.length - 1; i > this.riseMark; i--) arc += Math.hypot(this.trail[i].x - this.trail[i - 1].x, this.trail[i].y - this.trail[i - 1].y);
      this.length = Math.max(MORAY.length, arc + 0.6);
      return;
    }
    if (!this.submerged) {
      this.length = Math.min(MORAY.length, this.length + d.grow * dt);
      return;
    }
    if (!wall(tailAt(this.length))) {
      this.length = Math.max(d.minLength, this.length - d.draw * dt);
      this.forget();
    } else if (this.length < MORAY.length && wall(tailAt(this.length + 0.3))) this.length = Math.min(MORAY.length, this.length + d.grow * dt);
  }

  // Lets go of its trail past its tail: what's drawn in stays in, not to pay out again across the floor.
  forget() {
    const T = this.trail, { x, y } = this.enemy.body.pos;
    let px = x, py = y, arc = 0, i = T.length - 1;
    for (; i >= 0 && arc < this.length; i--) {
      arc += Math.hypot(T[i].x - px, T[i].y - py);
      px = T[i].x;
      py = T[i].y;
    }
    if (i < 0) return;
    T.splice(0, i + 1);
    this.riseMark = Math.max(0, this.riseMark - i - 1);
  }

  // Where it can be struck: all along its body, its head's whole width at the front.
  outline() {
    const w = this.world;
    if (this.outlineAt === w.time && this.points) return this.points;
    const b = this.enemy.body, pts = this.walk(b.pos.x, b.pos.y, 0.4, this.length), n = pts.length;
    const left = [], right = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], c = pts[Math.min(n - 1, i + 1)], l = Math.hypot(a.x - c.x, a.y - c.y) || 1;
      const nx = i === 0 && n < 2 ? 0 : -(a.y - c.y) / l, ny = i === 0 && n < 2 ? 1 : (a.x - c.x) / l;
      const k = (i * 0.4) / MORAY.length, r = i === 0 ? b.radius : lerp(MORAY.width.neck, MORAY.width.tail, k);
      left.push({ x: pts[i].x + nx * r, y: pts[i].y + ny * r });
      right.unshift({ x: pts[i].x - nx * r, y: pts[i].y - ny * r });
    }
    const front = fromAngle(b.rotation);
    this.points = [{ x: b.pos.x + front.x * b.radius, y: b.pos.y + front.y * b.radius }, ...left, ...right];
    this.outlineAt = w.time;
    return this.points;
  }
}

// Body: what its bite and leap share: from the wall, passing through whatever's in the way,
// its fangs doing the hurting.
class MorayStrikeAbility extends HitboxAbility {
  constructor(enemy, data) {
    super(enemy, data, { type: 'circle', r: data.hitboxRadius, forward: data.hitboxAhead }, null, { kind: 'body', parryKnockback: 0, strikeSound: data.strikeSound });
    this.bitten = false; // its fangs have snapped shut (MorayRig)
  }

  get lair() { return this.enemy.lair; }
  get burning() { return false; } // its body shows the rush

  shouldExecute() { return this.lair.canStrike(this.data.range, this.data.minRange); }

  execute() {
    this.lair.rise();
    this.bitten = false;
    super.execute();
  }

  advance() {
    super.advance();
    if (this.phase === 'active') this.phaseEndsAt = Infinity; // until it arrives (fly)
  }

  step(dt) {
    super.step(dt);
    if (this.phase === 'windup') this.lair.peek(dt);
    else if (this.phase === 'active') this.fly(dt);
  }

  // Before it could hurt them it bit shut on nothing; hurting them, on them.
  onStruck() { this.bitten = true; }
}

// Its bite: out along its locked aim, then whipping round to the side the player's on.
export class MorayBiteAbility extends MorayStrikeAbility {
  strike() {
    const b = this.enemy.body, d = this.data;
    this.from = { ...b.pos };
    this.aim = b.rotation;
    const dir = fromAngle(this.aim), free = this.lair.physics.rayLength(b.pos.x, b.pos.y, dir.x, dir.y, d.reach + b.radius, 0.1);
    this.reach = clamp(free - 0.2, 1, d.reach);
    this.tip = { x: b.pos.x + dir.x * this.reach, y: b.pos.y + dir.y * this.reach };
    this.whipAt = null;
    // Round to the side the player's on, unless a wall's too close that way.
    const to = this.dirToPlayer(), room = (side) => {
      const out = fromAngle(this.aim + side * d.whipDeg * DEG);
      return this.lair.physics.rayLength(b.pos.x, b.pos.y, out.x, out.y, this.reach, 0.1);
    };
    this.side = dir.x * to.y - dir.y * to.x >= 0 ? 1 : -1;
    if (room(this.side) < this.reach * 0.6 && room(-this.side) > room(this.side)) this.side = -this.side;
  }

  fly(dt) {
    const b = this.enemy.body, d = this.data, now = this.world.time;
    if (this.whipAt === null) {
      if (this.lair.moveTo(this.tip, d.speed, dt) > 0.12) return;
      this.whipAt = now;
      this.bitten = true;
      this.sound('morayWhip');
    }
    const k = clamp01((now - this.whipAt) / d.whipTime);
    const a = this.aim + this.side * d.whipDeg * DEG * smoothStep01(k), dir = fromAngle(a);
    const free = this.lair.physics.rayLength(this.from.x, this.from.y, dir.x, dir.y, this.reach, 0.1);
    this.lair.moveTo({ x: this.from.x + dir.x * free, y: this.from.y + dir.y * free }, Infinity, dt);
    b.rotation = a;
    if (k >= 1) { b.stop(); super.advance(); } // into the recovery
  }
}

// Its leap: from the wall, along its locked aim, on to the first wall that way and in.
export class MorayLeapAbility extends MorayStrikeAbility {
  // Going the way the player lies, the far wall far enough off.
  shouldExecute() {
    if (!super.shouldExecute()) return false;
    const b = this.enemy.body, l = this.lair, p = this.player.body.pos, m = this.world.shore.mouth(l.tile, p);
    const dir = dirTo(m, p);
    return l.physics.rayLength(m.x + m.nx * 0.05, m.y + m.ny * 0.05, dir.x, dir.y, this.data.minLeap + b.radius) >= this.data.minLeap;
  }

  strike() {
    const b = this.enemy.body, l = this.lair, w = this.world, dir = fromAngle(b.rotation);
    const free = l.physics.rayLength(b.pos.x, b.pos.y, dir.x, dir.y, 80, 0.05), hit = free + 0.3;
    const x = Math.floor(b.pos.x + dir.x * hit), y = Math.floor(b.pos.y + dir.y * hit);
    this.landing = w.shore.has(x, y) ? { x, y } : w.shore.nearest(b.pos.x + dir.x * hit, b.pos.y + dir.y * hit);
    l.tethered = false; // all of it goes
    this.sound('morayRise');
  }

  fly(dt) {
    const l = this.lair;
    if (!this.landing) { l.strand(); super.advance(); return; } // no wall that way at all
    if (l.moveTo({ x: this.landing.x + 0.5, y: this.landing.y + 0.5 }, this.data.speed, dt) > 0.2) return;
    l.enter(this.landing);
    super.advance(); // into the recovery
  }

  onParry() {
    super.onParry();
    if (!this.enemy.dead && !this.enemy.dying) this.lair.strand();
  }
}

// Projectile: its spit, from where it looks out of the wall.
export class MoraySpitAbility extends ThrowAbility {
  get lair() { return this.enemy.lair; }

  shouldExecute() { return this.lair.canStrike(this.data.range, this.data.minRange); }

  execute() {
    this.lair.rise();
    super.execute();
  }

  step(dt) {
    super.step(dt);
    if (this.phase === 'windup') this.lair.peek(dt);
    else if (this.phase === 'recovery') this.enemy.body.stop();
  }

  release() {
    const e = this.enemy, d = this.data, b = e.body;
    for (const deg of d.spreadDeg) {
      const dir = fromAngle(b.rotation + deg * DEG);
      this.world.add(new Projectile(this.world, this, b.pos.x + dir.x * d.spawnDistance, b.pos.y + dir.y * d.spawnDistance, {
        dir, speed: d.projectileSpeed, lifetime: d.projectileLifetime, damage: e.damage * d.damageMultiplier, size: d.projectileSize,
      }));
    }
    this.sound('moraySpit');
  }
}
