// The Weaver's abilities.
import { dist, dirTo, fromAngle } from '../../engine/math.js';
import { ATTACK_FX, FIXED_DT, WEB } from '../../data/config.js';
import { segmentPointDistSq } from '../../engine/physics.js';
import { EnemyHitbox } from '../hitbox.js';
import { DamageCause } from '../../game/damage.js';
import { ReelView, Silk, Thread, WebBall, segmentsDist } from '../web.js';
import { AIState } from '../ai.js';
import { Ability } from './ability.js';
import { ThrowAbility } from './throw.js';

// Whether thread `t` lies along the line a–b: near it (within `apart`) and close to parallel.
function alongside(t, a, b, apart) {
  const ux = b.x - a.x, uy = b.y - a.y, vx = t.b.x - t.a.x, vy = t.b.y - t.a.y;
  const sin = Math.abs(ux * vy - uy * vx) / (Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1);
  return sin < 0.35 && segmentsDist(a, b, t.a, t.b) < apart;
}

// Passive: a projectile, then a walk. The Weaver strings a thread from wall to wall through
// where it stands (the Weaver's weave), not as an attack but of its own accord, in the fight
// or out of it, whatever else is attacking (consider). It picks its line (chooseLine),
// turns to its far end over the wind-up and spits an anchor of silk into it (Silk,
// web.js); stuck, it spins a Thread from there out of its spinnerets as it walks across to
// the near end, and fastens it there, or wherever it is if it gets stuck, is stunned or
// slain, takes too long or the player comes too close. Its threads stay strung until cut,
// through its death too; it stops weaving once it has `max` of them. A parried thread hurts
// it, without a stun. Its AI stands back meanwhile (enemy.passive).
// Phases: windup → cast → walk → recovery.
const WEAVE_FROM = new Set([AIState.Idle, AIState.Reposition, AIState.Chase]); // AI states it can leave off to weave

export class WeaveAbility extends ThrowAbility {
  constructor(enemy, data) {
    super(enemy, data);
    this.threads = []; // strung and being spun, oldest first
    this.line = null; // { a, b }: the line it is stringing, `a` the end it spits at, `b` the one it walks to
    this.silk = null; // its anchor in flight
    this.thread = null; // the thread it is spinning
    this.walkCheck = null; // { at, pos }: where it was when it last checked it was getting anywhere
    this.lastUseTime = this.world.time - Math.random() * data.cooldown; // so Weavers don't all start at once
  }

  // Its threads still strung (or being spun).
  get strung() { return (this.threads = this.threads.filter((t) => !t.dead && t.taut)); }

  // Whether the player is about: its AI is after them.
  get present() { return !!this.player && this.enemy.ai.state !== AIState.Idle; }

  // Never picked by its AI: it goes off on its own (consider).
  shouldExecute() { return false; }

  // It aims at its line, not the player.
  tracking() { return false; }

  // Free to (not acting, stunned or dying, its AI not mid-attack), every `cooldown` seconds,
  // `absent` times as long while the player isn't about, it starts on another thread, unless
  // it has `max` or the player is within `minPlayerDist`. With no line to string from
  // where it is, it tries again `retry` later (`absent` times as long, likewise).
  consider() {
    const e = this.enemy, d = this.data, now = this.world.time;
    if (e.isActing || e.stunned || e.dying || !WEAVE_FROM.has(e.ai.state)) return;
    const slow = this.present ? 1 : d.absent;
    if (now < this.lastUseTime + d.cooldown * slow || this.strung.length >= d.max) return;
    const p = this.player;
    if (p && dist(e.body.pos, p.body.pos) < d.minPlayerDist) return;
    this.line = this.chooseLine();
    if (!this.line) { this.lastUseTime = now - (d.cooldown - d.retry) * slow; return; }
    this.lastUseTime = now;
    e.passive = this;
    this.execute();
  }

  // Of `line.tries` lines through it at random, wall to wall, the best to string (see
  // WeaverWeave.line), its far end first; null if none will do. With the player about, it
  // keeps clear of them and favours lines near them.
  chooseLine() {
    const o = this.enemy.body.pos, L = this.data.line, physics = this.world.physics, p = this.present ? this.player.body.pos : null, [min, max] = L.length;
    let best = null, bestScore = -Infinity;
    for (let i = 0; i < L.tries; i++) {
      const angle = Math.random() * Math.PI, dx = Math.cos(angle), dy = Math.sin(angle);
      const ra = physics.rayLength(o.x, o.y, dx, dy, max), rb = physics.rayLength(o.x, o.y, -dx, -dy, max);
      if (ra >= max || rb >= max || ra + rb < min || ra + rb > max) continue;
      const a = { x: o.x + dx * (ra - 0.05), y: o.y + dy * (ra - 0.05) }, b = { x: o.x - dx * (rb - 0.05), y: o.y - dy * (rb - 0.05) };
      const off = p ? Math.sqrt(segmentPointDistSq(a.x, a.y, b.x, b.y, p.x, p.y)) : L.near;
      if (off < L.clear || this.strung.some((t) => alongside(t, a, b, L.apart))) continue;
      const score = -Math.max(0, off - L.near) - (ra + rb) * 0.15 + Math.random();
      if (score > bestScore) { bestScore = score; best = ra >= rb ? { a, b } : { a: b, b: a }; }
    }
    return best;
  }

  step(dt) {
    super.step(dt);
    const e = this.enemy;
    if (this.phase === 'ready') this.consider();
    if (this.phase === 'windup' && this.line) e.ai.turnToward(dirTo(e.body.pos, this.line.a), dt);
    if (this.phase === 'cast' && (!this.silk || this.silk.dead)) { // its anchor hit the player, or was parried
      this.silk = null;
      this.setPhase('recovery', this.data.recoveryTime);
    }
    if (this.phase === 'walk') this.walk(dt);
  }

  advance() {
    switch (this.phase) {
      case 'windup':
        this.strikeAt = this.world.time;
        this.spit();
        this.setPhase('cast', Infinity);
        return;
      case 'walk': // taking too long
        this.fasten();
        return;
    }
    super.advance();
    if (this.phase === 'ready') this.done();
  }

  // Done weaving: its AI takes over again.
  done() {
    const e = this.enemy;
    e.isActing = false;
    if (e.passive === this) e.passive = null;
  }

  // An anchor of silk spat from its mouth into the line's far end.
  spit() {
    const e = this.enemy, d = this.data, from = this.chargePoints(1)[0], to = this.line.a;
    this.silk = this.world.add(new Silk(this.world, this, from, {
      dir: dirTo(from, to), speed: d.projectileSpeed, lifetime: dist(from, to) / d.projectileSpeed + 0.15,
      damage: e.damage * d.damageMultiplier, size: d.projectileSize,
    }));
    this.sound('silkSpit');
  }

  // Its anchor stuck at `at`: it spins its thread from there, walking to the line's near end.
  anchored(at) {
    const e = this.enemy, d = this.data;
    this.silk = null;
    if (this.phase !== 'cast' || e.dead || e.dying) return; // given up on since
    this.thread = this.world.add(new Thread(this.world, this, at, this.spinneret(), {
      width: d.thread.width, damage: e.damage * d.thread.damage, rehit: d.thread.rehit,
    }, { spinning: true }));
    this.threads.push(this.thread);
    this.world.sound('threadStrung', at);
    this.walkCheck = { at: this.world.time, pos: { ...e.body.pos } };
    this.setPhase('walk', d.walkTime);
  }

  spinneret() {
    const b = this.enemy.body, s = this.data.spinneret;
    return { x: b.pos.x - Math.cos(b.rotation) * s, y: b.pos.y - Math.sin(b.rotation) * s };
  }

  // Across to the line's near end, paying out the thread, until it gets there or gives up.
  walk(dt) {
    const e = this.enemy, b = e.body, d = this.data, t = this.thread, to = this.line.b, p = this.player, now = this.world.time;
    if (!t || !t.taut) { // cut or parried
      this.thread = null;
      this.setPhase('recovery', d.recoveryTime);
      return;
    }
    t.spinTo(this.spinneret());
    if (dist(b.pos, to) <= b.radius + 0.15 || (p && dist(b.pos, p.body.pos) < d.minPlayerDist)) { this.fasten(); return; }
    if (now - this.walkCheck.at >= 0.4) {
      if (dist(b.pos, this.walkCheck.pos) < 0.15) { this.fasten(); return; } // stuck
      this.walkCheck = { at: now, pos: { ...b.pos } };
    }
    const dir = dirTo(b.pos, to);
    if (now >= e.ai.movementSuppressedUntil) e.ai.steer(dir.x * d.walkSpeed, dir.y * d.walkSpeed);
    e.ai.turnToward(dir, dt);
  }

  // Fastens the thread it is spinning: at the line's near end if it got near enough, or
  // where it is; one too short to keep falls.
  fasten() {
    const t = this.thread, d = this.data;
    this.thread = null;
    if (t && !t.dead && t.taut) {
      const end = this.spinneret(), at = dist(end, this.line.b) <= d.reach ? this.line.b : end;
      if (dist(t.a, at) < d.minThread) t.slacken();
      else t.fasten(at);
    }
    if (this.phase === 'walk') this.setPhase('recovery', d.recoveryTime);
  }

  // One of its threads parried: it is hurt as by any parry, but not stunned.
  threadParried() {
    const e = this.enemy;
    if (!e.dead && !e.dying) e.takeDamage(this.parryDamage(), null, null, DamageCause.Parry);
  }

  // Stunned from outside, it fastens what it has spun; an anchor in flight comes to nothing.
  interrupt() {
    if (this.phase === 'walk') this.fasten();
    if (this.phase === 'cast') this.phase = 'ready';
    super.interrupt();
    if (this.phase === 'ready') this.done();
  }

  legPose() { return this.phase === 'windup' || this.phase === 'cast' ? this.data.legs : null; }

  dispose() {
    this.fasten();
    super.dispose();
  }
}

// A ball of web thrown on a line from the mouth (the Weaver's reel), formed over the
// wind-up, flying straight along the facing (WebBall, web.js). Catching the player, it winds
// them in web and reels them in (Player is dragged along at its pullOn) at a steady pace,
// braced and turning after them, until they are close, holds them there through a second
// wind-up, the bite's, then bites: a hitbox lunging along its facing (a charge, parried like
// one), and lets go. Caught, the player can't attack or dash: trying struggles against the
// web instead, tearing a strand off, and the `struggles`th tears them free; the line breaks
// too if they get out of reach or out of the fight. Its
// threads and its bite land on them caught however recently they were hurt
// (ignoresInvincibility). Missing, the ball is drawn back in its recovery. Parried, the line
// drags the Weaver to the player (`yank`), where it lies stunned.
// Phases: windup → cast → (reel → windup → active) → recovery.
export class ReelAbility extends Ability {
  constructor(enemy, data) {
    super(enemy, data);
    this.kind = 'body';
    this.hitbox = new EnemyHitbox(enemy, this, { type: 'circle', r: data.biteRadius, forward: data.biteForward });
    this.view = new ReelView(this);
    this.ball = null; // the ball of web in flight
    this.held = null; // the player on the line: caught and reeled in, or the Weaver yanked to them
    this.caughtAt = -Infinity; // when it last caught them
    this.retract = null; // { from, at }: the ball drawn back from where it missed
    this.loose = null; // { from, at, snap, player }: the line let go (falling slack, its web falling off `player`) or broken (springing back)
    this.struggles = 0; // how many times the player caught has struggled
    this.struggledAt = -Infinity; // when they last did
    this.dir = { x: 1, y: 0 }; // the bite's lunge
  }

  // Whether it has the player caught: reeling them in, or biting.
  get snared() { return this.held !== null && (this.phase === 'reel' || this.phase === 'windup' || this.phase === 'active'); }
  // A charge burns only while the bite can hurt.
  get burning() { return this.phase === 'active'; }

  mouth() {
    const b = this.enemy.body, d = this.data;
    return { x: b.pos.x + Math.cos(b.rotation) * d.muzzle, y: b.pos.y + Math.sin(b.rotation) * d.muzzle };
  }

  execute() {
    this.enemy.isActing = true;
    this.enemy.body.stop();
    this.held = this.retract = null;
    this.sound('windup');
    this.setPhase('windup', this.data.windUpTime);
  }

  advance() {
    const e = this.enemy, d = this.data;
    switch (this.phase) {
      case 'windup':
        if (this.held) { this.bite(); return; }
        this.notifyAttackStarted();
        this.strikeAt = this.world.time;
        this.cast();
        return;
      case 'reel': // reeling too long: it bites anyway
        this.readyBite();
        return;
      case 'active':
        this.endActive();
        this.letGo(false);
        this.setPhase('recovery', d.recoveryTime);
        return;
      case 'yank':
        this.land();
        return;
      case 'recovery':
      case 'stunned':
        if (this.phase === 'stunned') e.stunned = false;
        e.isActing = false;
        this.phase = 'ready';
        return;
    }
  }

  step(dt) {
    super.step(dt);
    const e = this.enemy, b = e.body, d = this.data;
    if (this.ball && this.phase !== 'cast') this.dropBall();
    if (this.held && !this.snared && this.phase !== 'yank') this.letGo(false);
    if (this.phase === 'cast') b.stop();
    if (this.snared) {
      const p = this.held;
      if (this.phase !== 'active') b.stop();
      if (p !== this.world.hittablePlayer || p.teleporting || dist(b.pos, p.body.pos) > d.ballReach + d.snapRange) this.letGo(true);
      else {
        if (this.phase === 'reel' || (this.phase === 'windup' && this.tracking())) e.ai.turnToward(this.dirToPlayer(), dt);
        if (this.phase === 'reel' && dist(b.pos, p.body.pos) <= d.biteRange + 0.05) this.readyBite();
      }
    }
    if (this.phase === 'active' && this.world.time - this.strikeAt < d.duration) {
      const speed = d.biteStep / d.duration;
      b.vel.x = this.dir.x * speed; b.vel.y = this.dir.y * speed;
    }
    if (this.phase === 'yank') this.yank();
  }

  cast() {
    const e = this.enemy, d = this.data;
    this.ball = this.world.add(new WebBall(this.world, this, this.mouth(), {
      dir: fromAngle(e.body.rotation), speed: d.ballSpeed, reach: d.ballReach, size: d.projectileSize,
    }));
    this.sound('webThrow');
    this.setPhase('cast', Infinity);
  }

  // Called by its ball of web. Missing, it is drawn back from where it was.
  missed(at) {
    this.ball = null;
    this.retract = { from: at, at: this.world.time };
    this.setPhase('recovery', this.data.retractTime + this.data.recoveryTime);
  }

  // Catching the player, it winds them in web and starts reeling them in.
  caught(player) {
    this.ball = null;
    this.held = player;
    this.caughtAt = this.world.time;
    this.struggles = 0;
    player.reeledBy = this;
    this.sound('webCatch');
    this.sound('reel');
    this.setPhase('reel', this.data.reelTime);
  }

  // Reeled in close, held there through the bite's wind-up (cued again).
  readyBite() {
    this.sound('windup');
    this.setPhase('windup', this.data.biteWindup);
  }

  // How the player it has caught is dragged this step (Player.step), or null if it isn't
  // dragging them: straight at it at a steady pace, stopping at biteRange, then held still.
  pullOn(player) {
    if (this.held !== player || !this.snared) return null;
    if (this.phase !== 'reel') return { x: 0, y: 0 };
    const d = this.data, e = this.enemy.body.pos, p = player.body.pos, dx = e.x - p.x, dy = e.y - p.y, l = Math.hypot(dx, dy) || 1;
    const v = Math.max(0, Math.min(d.pullSpeed, (l - d.biteRange) / FIXED_DT));
    return { x: (dx / l) * v, y: (dy / l) * v };
  }

  // The player caught trying to attack or dash: instead they struggle, shaking the web and
  // tearing a strand off, and at the last tear free.
  struggle(player) {
    if (this.held !== player || !this.snared) return;
    this.struggles++;
    this.struggledAt = this.world.time;
    const p = player.body.pos;
    this.world.effects.burst(p.x, p.y, 0, { ...WEB.snare.strain, color: WEB.color });
    if (this.struggles >= this.data.struggles) this.letGo(true);
    else this.world.sound('strain', p);
  }

  // Its threads and its bite land on the player it has caught however recently they were hurt.
  ignoresInvincibility(player) { return player.reeledBy === this; }

  // Lets go of the player: after the bite, the line falling slack, or broken, springing back.
  letGo(snap) {
    const p = this.held;
    if (!p) return;
    if (p.reeledBy === this) p.reeledBy = null;
    this.held = null;
    this.loose = { from: { ...p.body.pos }, at: this.world.time, snap, player: p };
    if (!snap) return;
    this.world.effects.burst(p.body.pos.x, p.body.pos.y, 0, { ...WEB.snap.sparks, color: WEB.color });
    this.sound('threadSnap');
    if (this.phase === 'active') this.endActive();
    this.setPhase('recovery', this.data.recoveryTime);
  }

  dropBall() {
    if (!this.ball) return;
    this.retract = { from: { ...this.ball.body.pos }, at: this.world.time };
    this.ball.destroy();
    this.ball = null;
  }

  bite() {
    this.strikeAt = this.world.time;
    this.dir = fromAngle(this.enemy.body.rotation);
    this.hitbox.setActive(true);
    this.sound('bite');
    this.setPhase('active', this.data.duration);
  }

  endActive() {
    this.hitbox.setActive(false);
    this.activeEndedAt = this.world.time;
  }

  // Its ball parried, the line drags it to the player (unstunned on the way, so nothing caps
  // its speed); its bite parried, it reels back stunned, even a late parry once it's over.
  onParry() {
    const e = this.enemy, d = this.data;
    if (this.phase === 'cast') {
      this.ball = null;
      e.takeDamage(this.parryDamage(), null, null, DamageCause.Parry);
      if (e.dead || e.dying) return;
      this.takeOverStun();
      this.held = this.player;
      this.sound('yank');
      this.setPhase('yank', d.yankTime);
      return;
    }
    if (this.phase === 'active') this.endActive();
    e.body.stop();
    const k = this.awayFromPlayer();
    e.body.addImpulse(k.x * d.parryKnockback, k.y * d.parryKnockback);
    e.takeDamage(this.parryDamage(), null, null, DamageCause.Parry);
    if (e.dead || e.dying) return;
    e.stunned = true;
    this.takeOverStun();
    this.setPhase('stunned', d.parryStunTime);
  }

  // Dragged along the line to the player, until it is close enough (or out of time).
  yank() {
    const b = this.enemy.body, p = this.held, d = this.data;
    if (!p || p.dead || dist(b.pos, p.body.pos) <= d.yankStop) { this.land(); return; }
    const dir = dirTo(b.pos, p.body.pos);
    b.vel.x = dir.x * d.yankSpeed; b.vel.y = dir.y * d.yankSpeed;
  }

  // Fetched up at the player's feet, stunned.
  land() {
    const e = this.enemy, b = e.body;
    this.loose = this.held ? { from: { ...this.held.body.pos }, at: this.world.time, snap: false } : null;
    this.held = null;
    b.stop();
    e.stunned = true;
    this.world.effects.burst(b.pos.x, b.pos.y, 0, { ...ATTACK_FX.crash, count: 8, color: e.type.hitColor });
    this.sound('thud');
    this.setPhase('stunned', this.data.parryStunTime);
  }

  // A stun from outside drops whatever it has on the line.
  interrupt() {
    this.dropBall();
    if (this.snared) this.letGo(true);
    this.held = null;
    if (this.phase === 'cast' || this.phase === 'yank' || this.phase === 'reel') this.phase = 'ready';
    else super.interrupt();
  }

  legPose() {
    switch (this.phase) {
      case 'windup': return this.held ? 'reel' : this.data.legs;
      case 'reel': return 'reel';
      case 'cast': return this.data.legs;
      case 'active': return 'bite';
      case 'yank': return 'yank';
    }
    return null;
  }

  cuePoints() { return [{ x: this.data.muzzle, y: 0 }]; }

  dispose() {
    if (this.held?.reeledBy === this) this.held.reeledBy = null;
    this.ball?.destroy();
    super.dispose();
  }
}
