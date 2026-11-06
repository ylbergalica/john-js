// The Revenant's abilities.
import { clamp, clamp01, deltaAngle, dist, dirTo, fromAngle, lerp, randSign, smoothStep01 } from '../../engine/math.js';
import { FIXED_DT } from '../../data/config.js';
import { segmentPointDistSq } from '../../engine/physics.js';
import { EnemyHitbox } from '../hitbox.js';
import { DamageCause } from '../../game/damage.js';
import { AfterimageView, EchoTape, RecallView, crossPose, needlePose, onNeedle, mixPose } from '../revenantRig.js';
import { DEG, Ability, HitboxAbility } from './ability.js';

// ── the Revenant ───────────────────────────────────────────────────
// Its afterimage (RevenantAfterimage), never picked by its AI: every step it writes the Revenant
// down on a tape (where it is, how it holds its needle, and whatever hitbox it has live, shape
// and all, whichever attack it belongs to), and plays the tape back `delay` behind on the
// world's clock, so hit-stop and game speed hold it back along with everything else. Played
// back, a recorded hitbox is live again on its own EnemyHitbox, the same geometry where it first
// was, so no attack needs to know it's echoed. It isn't a body and it isn't an Enemy: nothing
// can hit it or aim at it, and it passes through everything. Parrying it (onParry) breaks it;
// parrying the Revenant's own needle (RevenantStrikeAbility) breaks it too, with whatever it was
// about to repeat. It comes back once the stun is over, with a blank tape.
export class AfterimageAbility extends Ability {
  constructor(enemy, data) {
    super(enemy, data);
    enemy.afterimage = this;
    this.tape = new EchoTape(Math.ceil(data.delay / FIXED_DT) + 8);
    this.hitbox = new EnemyHitbox(enemy, this, { type: 'group', parts: [] });
    this.view = new AfterimageView(this);
    this.down = false; // shattered, until it re-forms
    this.reformAt = 0;
    this.formedAt = this.world.time; // when it last started fading in
    this.echoCueAt = -Infinity; // when its parry cue last flashed
    this.echoCueUnstunned = false; // and whether in red (for a strike a parry won't stop)
    this.glanced = false; // the strike it's repeating turned aside by a parry
    this.nextSound = null; // the sound its echo makes, for the next frame recorded
    this.seenWindup = -Infinity; // the latest wind-up and cue on the tape
    this.seenCue = -Infinity;
    this.heldAt = null; // where a Recall winding up has stopped its tape
  }

  shouldExecute() { return false; }

  // Where it stands: the frame it has reached, or on a fresh tape the first.
  get pos() { return this.tape.current ?? this.tape.first; }

  // Whether it's all there, with something to blink back to.
  get settled() { return !this.down && !!this.pos && this.world.time - this.formedAt >= this.data.fadeTime; }

  // How far along its tape it has got at `now`: `delay` behind, unless a Recall is holding it there.
  playhead(now) { return this.heldAt ?? now - this.data.delay; }

  // Tells the echo of the strike under way what it sounds like.
  queueSound(name) { this.nextSound = name; }

  step() {
    if (this.down && !this.enemy.stunned && this.world.time >= this.reformAt) this.reform();
  }

  afterPhysics() {
    this.enemy.rig.tick();
    if (!this.down) {
      this.record();
      this.replay();
    }
    super.afterPhysics();
  }

  record() {
    const e = this.enemy, b = e.body, pose = e.rig.pose, f = this.tape.write();
    f.t = this.world.time;
    f.x = b.pos.x;
    f.y = b.pos.y;
    f.rot = b.rotation;
    f.px = pose.x;
    f.py = pose.y;
    f.prot = pose.rot;
    f.charge = 0;
    f.strike = null;
    f.cue = f.gather = f.unstunned = false;
    f.sound = this.nextSound;
    this.nextSound = null;
    for (const a of e.abilities.values()) {
      if (a === this || a.data.noEcho) continue;
      if (a.phase === 'windup') {
        f.charge = clamp01((f.t - a.phaseStartedAt) / Math.max(1e-3, a.phaseEndsAt - a.phaseStartedAt));
        if (a.phaseStartedAt > this.seenWindup) {
          this.seenWindup = a.phaseStartedAt;
          f.gather = true;
        }
      }
      if (a.cueAt > this.seenCue) {
        this.seenCue = a.cueAt;
        f.cue = true;
        f.unstunned = !!a.data.unstunned;
      }
      // Copied, as an attack can change its shape from step to step (not its parts: it replaces those).
      if (a.hitbox?.active) f.strike = { shape: { ...a.hitbox.shape }, anchor: a.hitbox.anchor ?? { x: f.x, y: f.y, rotation: f.rot }, unstunned: !!a.data.unstunned };
    }
  }

  replay() {
    const now = this.world.time, pitch = this.enemy.type.sfxPitch;
    let held = false;
    for (const a of this.enemy.abilities.values()) held ||= !!a.data.holdsEcho && a.phase === 'windup';
    this.heldAt = held ? this.playhead(now) : null;
    this.tape.playTo(this.playhead(now), (f) => {
      if (f.gather) this.world.sound('revenantEchoGather', f, { pitch });
      if (f.sound) this.world.sound(f.sound, f, { pitch });
      if (f.cue) {
        this.echoCueAt = now;
        this.echoCueUnstunned = f.unstunned;
      }
    });
    let strike = held ? null : this.tape.current?.strike;
    // A strike turned aside (onParry) stays off until it's over.
    if (!strike) this.glanced = false;
    else if (this.glanced) strike = null;
    if (strike) {
      this.hitbox.shape = strike.shape;
      this.hitbox.anchor = strike.anchor;
    }
    this.hitbox.setActive(!!strike);
  }

  // Parried: it shatters and the blow comes home to the Revenant, a parry's damage and a stagger.
  // The echo of a strike a parry won't stop (`unstunned`) is only turned aside, the damage still
  // coming home, the afterimage carrying on.
  onParry() {
    const e = this.enemy, d = this.data;
    if (this.down) return;
    e.takeDamage(this.parryDamage(), null, null, DamageCause.Parry);
    if (e.dead || e.dying) return;
    if (this.tape.current?.strike?.unstunned) {
      this.glanced = true;
      this.hitbox.setActive(false);
      return;
    }
    this.shatter(true);
    e.stun(d.staggerTime);
    const k = this.awayFromPlayer();
    e.body.addImpulse(k.x * d.parryKnockback, k.y * d.parryKnockback);
  }

  // Gone, with whatever was left on its tape. `recoil`: broken on the player's parry, so harder.
  shatter(recoil = false) {
    if (this.down) return;
    const at = this.pos;
    this.view.shatter(at, recoil);
    this.down = true;
    this.reformAt = this.world.time + this.data.downTime;
    this.wipe();
    this.world.sound('revenantShatter', this.enemy.body.pos, { pitch: this.enemy.type.sfxPitch });
  }

  // Taken back into the body (a Recall): nothing left to repeat, and it fades back in to follow
  // on from there, so it never plays the blink over again.
  recall() {
    this.wipe();
    this.formedAt = this.world.time;
  }

  wipe() {
    this.tape.clear();
    this.heldAt = null;
    this.hitbox.setActive(false);
    this.nextSound = null;
  }

  reform() {
    this.down = false;
    this.formedAt = this.world.time;
    this.wipe();
    this.world.sound('revenantReform', this.enemy.body.pos, { pitch: this.enemy.type.sfxPitch });
  }
}

// Its own attacks: its needle's the weapon, and parried it takes the afterimage with it.
class RevenantStrikeAbility extends HitboxAbility {
  constructor(enemy, data, shape) {
    super(enemy, data, shape, null, { kind: 'body', parryKnockback: data.parryKnockback, strikeSound: data.strikeSound });
  }

  get burning() { return false; } // its needle shows the strike

  cuePoints() { return this.enemy.rig.cuePoints(); }

  strike() { this.enemy.afterimage.queueSound(this.data.echoSound); }

  onParry() {
    const e = this.enemy;
    super.onParry();
    if (!e.dead && !e.dying) e.afterimage.shatter();
  }

  skid(dt) {
    const b = this.enemy.body, k = Math.exp(-dt / this.data.skidEase);
    b.vel.x *= k;
    b.vel.y *= k;
  }
}

// Thrust: a long fast lunge along its locked aim, through the player, stopping short at a wall.
// Then, if its echo is still to come, it may blink back along the very line (see followUp).
export class RevenantThrustAbility extends RevenantStrikeAbility {
  constructor(enemy, data) {
    super(enemy, data, { type: 'beam', ...data.hitbox });
    this.dir = { x: 1, y: 0 };
    this.from = { x: 0, y: 0 };
    this.lastPos = { x: 0, y: 0 };
    this.length = 0;
  }

  bladePose(now) {
    return mixPose(needlePose('thrustReady'), needlePose('thrustThrough'), smoothStep01(clamp01((now - this.strikeAt) / (this.data.launchTime * 2))));
  }

  strike() {
    super.strike();
    const b = this.enemy.body, p = this.player;
    this.dir = fromAngle(b.rotation);
    this.from = { ...b.pos };
    this.lastPos = { ...b.pos };
    this.length = this.data.length;
    b.ignores = new Set(p ? [p.body] : []); // it goes through them, not into them
  }

  advance() {
    const recovering = this.phase === 'recovery';
    super.advance();
    if (this.phase === 'active') this.phaseEndsAt = Infinity; // until it arrives (fly)
    if (recovering) this.follow();
  }

  // Straight into its follow-up, if it can.
  follow() {
    const F = this.data.followUp, next = this.enemy.abilities.get(F.ability);
    if (Math.random() < F.chance && next.canExecute()) next.forceExecute();
  }

  step(dt) {
    super.step(dt);
    if (this.phase === 'active') this.fly();
    else if (this.phase === 'recovery') this.skid(dt);
  }

  fly() {
    const b = this.enemy.body, d = this.data, { dir, from, lastPos } = this, t = this.world.time - this.strikeAt;
    const left = this.length - ((b.pos.x - from.x) * dir.x + (b.pos.y - from.y) * dir.y);
    const stuck = t > d.launchTime + FIXED_DT && (b.pos.x - lastPos.x) * dir.x + (b.pos.y - lastPos.y) * dir.y < d.speed * FIXED_DT * 0.2;
    if (left <= 0.02 || stuck) {
      b.vel.x = dir.x * d.speed * d.carry;
      b.vel.y = dir.y * d.speed * d.carry;
      this.advance(); // into the recovery
      return;
    }
    const v = Math.min(d.speed * Math.min(1, (t + FIXED_DT) / d.launchTime), left / FIXED_DT);
    b.vel.x = dir.x * v;
    b.vel.y = dir.y * v;
    this.lastPos = { ...b.pos };
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

// Cross: two slashes, the second back the other way, stepping in with each. The hitbox is the
// needle wherever it has swept since the last step, and only while it's swinging, so each slash
// can hit afresh, and is parried on its own.
export class RevenantCrossAbility extends RevenantStrikeAbility {
  constructor(enemy, data) {
    super(enemy, data, { type: 'group', parts: [] });
    this.side = 1; // the side its first slash comes from
    this.slash = 0; // the slash under way
    this.dir = { x: 1, y: 0 };
    this.sweptTo = 0; // seconds into the strike its hitbox last reached
  }

  bladePose(now) {
    const d = this.data;
    return crossPose(this.side, d.gap, d.swingTime, now - this.strikeAt);
  }

  execute() {
    this.side = randSign();
    super.execute();
  }

  strike() {
    super.strike();
    this.slash = 0;
    this.sweptTo = 0;
    this.dir = fromAngle(this.enemy.body.rotation);
    this.sweep(0);
  }

  step(dt) {
    super.step(dt);
    if (this.phase === 'active') this.swing(dt);
    else if (this.phase === 'recovery') this.skid(dt);
  }

  swing(dt) {
    const d = this.data, t = this.world.time - this.strikeAt, b = this.enemy.body;
    if (t >= d.gap - d.cueLead && this.cueAt < this.strikeAt) this.cueAt = this.world.time;
    if (this.slash === 0 && t >= d.gap) this.nextSlash();
    const u = t - this.slash * d.gap;
    if (u < d.swingTime) {
      this.sweep(t);
      const speed = d.stepDistance[this.slash] / d.swingTime;
      b.vel.x = this.dir.x * speed;
      b.vel.y = this.dir.y * speed;
    } else {
      this.hitbox.setActive(false);
      this.skid(dt);
    }
  }

  // A parry turns the slash aside, its damage and all, but it carries on: no stun, no knockback,
  // and its afterimage left to repeat it.
  onParry() {
    const e = this.enemy;
    this.hitbox.setActive(false);
    e.takeDamage(this.parryDamage(), null, null, DamageCause.Parry);
  }

  // Turned after the player, within reason.
  nextSlash() {
    const b = this.enemy.body, { x, y } = this.dirToPlayer(), max = this.data.turnDeg * DEG;
    this.slash = 1;
    this.sweptTo = this.data.gap;
    b.rotation += clamp(deltaAngle(b.rotation, Math.atan2(y, x)), -max, max);
    this.dir = fromAngle(b.rotation);
    this.sound(this.data.strikeSound);
    this.enemy.afterimage.queueSound(this.data.echoSound);
    this.sweep(this.sweptTo);
    this.hitbox.setActive(true);
  }

  // The needle from `sweptTo` to `t` seconds into the strike, in its frame.
  sweep(t) {
    const d = this.data, M = d.bladeHit, [r0, r1] = M.reach, parts = [];
    for (let i = 0; i < M.samples; i++) {
      const pose = crossPose(this.side, d.gap, d.swingTime, lerp(this.sweptTo, t, i / (M.samples - 1)));
      const a = onNeedle(pose, r0), b = onNeedle(pose, r1);
      parts.push({ type: 'segment', ax: a.x, ay: a.y, bx: b.x, by: b.y, r: M.radius });
    }
    this.hitbox.shape = { type: 'group', parts };
    this.sweptTo = t;
  }
}

// Recall: its afterimage stops where it stands and it turns to face it, a line of light drawn out
// between them (RecallView), then it's there, the whole line cut behind it. Whatever its
// afterimage had still to repeat never comes.
export class RevenantRecallAbility extends RevenantStrikeAbility {
  constructor(enemy, data) {
    super(enemy, data, { type: 'segment', ax: 0, ay: 0, bx: 0, by: 0, r: data.hitboxRadius });
    this.hitbox.anchor = { x: 0, y: 0, rotation: 0 }; // its line's in the world
    this.view = new RecallView(this);
    this.from = { x: 0, y: 0 };
    this.target = { x: 0, y: 0 };
    this.tip = { x: 0, y: 0 };
  }

  bladePose() { return needlePose('thrustThrough'); }

  // Whether it can see `q`.
  clear(q) {
    const b = this.enemy.body.pos, l = dist(b, q);
    return this.world.physics.rayLength(b.x, b.y, (q.x - b.x) / l, (q.y - b.y) / l, l) >= l;
  }

  shouldExecute() {
    const af = this.enemy.afterimage, d = this.data, p = this.player, b = this.enemy.body.pos;
    if (!p || !af.settled || dist(b, p.body.pos) > d.range) return false;
    const q = af.pos;
    if (dist(b, q) < d.minGap || !this.clear(q)) return false;
    return segmentPointDistSq(b.x, b.y, q.x, q.y, p.body.pos.x, p.body.pos.y) <= d.lineReach ** 2;
  }

  execute() {
    const { x, y } = this.enemy.afterimage.pos;
    this.target = { x, y };
    super.execute();
    this.sound('revenantRecallRise');
  }

  // It turns itself (step), not its AI.
  tracking() { return false; }

  step(dt) {
    super.step(dt);
    if (this.phase === 'windup') this.enemy.ai.turnToward(dirTo(this.enemy.body.pos, this.target), dt);
  }

  strike() {
    const e = this.enemy, b = e.body, d = this.data, { target } = this, w = this.world;
    this.from = { ...b.pos };
    const dir = dirTo(this.from, target), past = Math.max(0, w.physics.rayLength(target.x, target.y, dir.x, dir.y, d.past) - 0.1);
    this.tip = { x: target.x + dir.x * past, y: target.y + dir.y * past };
    this.hitbox.shape = { ...this.hitbox.shape, ax: this.from.x, ay: this.from.y, bx: this.tip.x, by: this.tip.y };
    b.teleport(target.x, target.y);
    b.stop();
    b.rotation = b.prevRotation = Math.atan2(dir.y, dir.x);
    e.afterimage.recall();
    w.camera.shakeAtLeast(d.shake);
  }
}
