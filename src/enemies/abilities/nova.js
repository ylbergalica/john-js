// The Nova's abilities.
import { dist } from '../../engine/math.js';
import { FIXED_DT, NOVA } from '../../data/config.js';
import { DamageCause } from '../../game/damage.js';
import { hurtDistance } from '../../game/hurtbox.js';
import { HitboxAbility } from './ability.js';

// Body: the Nova's flare (NovaFlare). It rushes the player (`rush`), swells up over the
// wind-up and goes critical (`active`, its blast able to hurt the player), then bursts in a
// supernova, which is its death. A hit only knocks it back (Enemy.applyKnockback), swelling
// on. Parried as it goes critical, it is launched along the parry (`launched`) and bursts
// on whatever it hits, sparing the player. Caught in another's blast, it is lit (`fuse`) and
// bursts soon after. `friendly`: lit by the player, so its burst can't hurt them.
export class FlareAbility extends HitboxAbility {
  constructor(enemy, data) {
    super(enemy, data, { type: 'circle', r: data.blastRadius }, null, { kind: 'body' });
    this.friendly = false;
    this.spent = false; // burst
    this.dir = { x: 1, y: 0 }; // launched, the way it flies
    this.lastPos = null; // launched, where it was before this step's physics
  }

  get burning() { return false; } // it never charges: its blast does the hurting

  canExecute() { return this.phase === 'ready' && super.canExecute(); }

  execute() {
    this.enemy.isActing = true;
    this.friendly = false;
    this.sound(this.data.rushSound);
    this.setPhase('rush', this.data.rushTime);
  }

  step() {
    if (this.phase === 'rush') this.rush();
    else if (this.phase === 'launched') this.fly();
    super.step();
  }

  afterPhysics() {
    super.afterPhysics();
    if (this.phase === 'launched' && (this.hitWall() || this.touchesAnything())) this.detonate();
  }

  advance() {
    switch (this.phase) {
      case 'rush': this.swell(); break;
      case 'windup': this.goCritical(); break;
      case 'active': this.detonate(); break;
      case 'launched': this.detonate(); break;
      case 'fuse': if (this.friendly) this.detonate(); else this.goCritical(); break;
      case 'recovery': this.enemy.isActing = false; this.phase = 'ready'; break;
    }
  }

  // Straight at the player along the paths round walls, until close enough to swell. Knocked
  // back, it lets the blow carry it before steering in again.
  rush() {
    const e = this.enemy, b = e.body, d = this.data, p = this.player;
    if (!p) return;
    if (dist(b.pos, p.body.pos) <= d.swellRange) { this.swell(); return; }
    if (this.world.time < e.ai.movementSuppressedUntil) return;
    const dir = e.ai.pathDirection(0) ?? this.dirToPlayer(), k = d.rushResponsiveness;
    b.vel.x += (dir.x * d.rushSpeed - b.vel.x) * k;
    b.vel.y += (dir.y * d.rushSpeed - b.vel.y) * k;
  }

  swell() {
    const b = this.enemy.body, k = this.data.swellSkid;
    b.vel.x *= k;
    b.vel.y *= k;
    this.sound(this.data.swellSound);
    this.setPhase('windup', this.data.windUpTime);
  }

  goCritical() {
    this.notifyAttackStarted();
    this.strikeAt = this.world.time;
    if (!this.friendly) this.hitbox.setActive(true);
    this.setPhase('active', this.data.duration);
  }

  // Parried: launched along the player's parry, lit. Once it has burst, a parry only spares
  // the player its blast.
  onParry() {
    if (this.spent) return;
    const e = this.enemy, b = e.body, d = this.data, p = this.world.livePlayer;
    this.hitbox.setActive(false);
    this.friendly = true;
    const f = p?.facing, l = f ? Math.hypot(f.x, f.y) : 0;
    this.dir = l > 1e-6 ? { x: f.x / l, y: f.y / l } : this.awayFromPlayer();
    b.vel.x = this.dir.x * d.launchSpeed;
    b.vel.y = this.dir.y * d.launchSpeed;
    b.rotation = Math.atan2(this.dir.y, this.dir.x);
    b.ignores = p ? new Set([p.body]) : null; // out past them, not off them
    this.lastPos = null;
    e.isActing = true;
    e.ai.suppressMovementFor(d.launchTime);
    this.sound(d.launchSound);
    this.setPhase('launched', d.launchTime);
  }

  // In flight at a steady speed.
  fly() {
    const b = this.enemy.body, d = this.data, dir = this.dir;
    b.vel.x = dir.x * d.launchSpeed;
    b.vel.y = dir.y * d.launchSpeed;
    this.lastPos = { ...b.pos };
  }

  // Anything worse than a glancing blow off a wall this step (losing over 40% of its speed).
  hitWall() {
    const b = this.enemy.body, dir = this.dir, from = this.lastPos;
    if (!from) return false;
    const moved = (b.pos.x - from.x) * dir.x + (b.pos.y - from.y) * dir.y;
    return moved < this.data.launchSpeed * FIXED_DT * 0.6;
  }

  touchesAnything() {
    const e = this.enemy, b = e.body, reach = b.radius + this.data.contactMargin;
    for (const t of [...this.world.enemies, ...this.world.props]) {
      if (t !== e && !t.dead && !t.isThread && hurtDistance(t, b.pos.x, b.pos.y) <= reach) return true;
    }
    return false;
  }

  // Caught in another's blast: it bursts `chainDelay` later, going critical first unless the
  // player lit it.
  ignite(friendly) {
    if (this.spent || this.phase === 'fuse' || this.phase === 'launched' || (this.phase === 'active' && !friendly)) return;
    this.hitbox.setActive(false);
    this.friendly = friendly;
    this.enemy.isActing = true;
    this.sound(this.data.fuseSound);
    this.setPhase('fuse', this.data.chainDelay);
  }

  // Called off by a stun: its fuse snuffed, unless it is already lit.
  interrupt() {
    if (this.phase === 'rush' || this.phase === 'windup') this.phase = 'ready';
    else if (this.phase === 'active' && !this.friendly) {
      this.endActive();
      this.phase = 'ready';
    }
  }

  // The supernova: everything in the blast is hurt and thrown back, other Novas lit, and the
  // Nova is gone (its death, drops and all, with this burst for its look).
  detonate() {
    const e = this.enemy, w = this.world, b = e.body, d = this.data, { x, y } = b.pos, src = { x, y };
    this.endActive();
    this.spent = true;
    this.phase = 'spent';
    this.phaseEndsAt = Infinity;
    b.ignores = null;
    const amount = d.blastDamage * (this.friendly ? w.adrenaline.damageMultiplier : 1);
    for (const t of [...w.enemies, ...w.props]) {
      if (t === e || t.dead || (t.isThread && !this.friendly) || hurtDistance(t, x, y) >= d.blastRadius) continue; // only the player's cuts silk
      const fuse = t.abilities && [...t.abilities.values()].find((a) => a.ignite);
      if (fuse) { fuse.ignite(this.friendly); continue; }
      t.takeDamage(amount, t.closestPoint(src), src, DamageCause.Nova);
      if (!t.dead && !t.isProp) t.applyKnockback(d.blastKnockback, src);
    }
    w.deathFx.explode(x, y, d.blastRadius / NOVA.burst.reach, e.hitColor, NOVA.burst);
    this.sound(d.burstSound);
    e.detonated = true;
    e.die(DamageCause.Nova);
  }

  cuePoints() { return [{ x: 0, y: 0 }]; }

  dispose() {
    super.dispose();
    this.enemy.body.ignores = null;
  }
}
