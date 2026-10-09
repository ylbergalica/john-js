// The Seer's Omen once thrown (LobAbility): its ball of mist dissolves upward where it was
// formed, its landing spot is marked on the floor, and `flightTime` after the throw the
// ball comes down there and hangs `boomTime` as a boom, which can hurt from the moment it
// lands (once, like a projectile). Like a projectile it outlives its thrower, and parrying
// the boom punishes the thrower; it then plays out harmlessly. It flashes its own parry
// cue where it lands, since the thrower may be off screen. Looks: MIST_BALL.
import { Graphics } from 'pixi.js';
import { Entity } from '../game/entity.js';
import { circleVsCircle, circleVsCapsule } from '../engine/physics.js';
import { clamp01, lerp, lerpColor, TAU } from '../engine/math.js';
import { ATTACK_FX, MIST_BALL as M } from '../data/config.js';
import { CueFlash, MistBallLook, renderTime } from './attackView.js';

const easeOut = (t) => 1 - (1 - t) ** 2;
// The floor marks are drawn this many times larger and scaled back down, so their
// circles come out round.
const U = 32;

export class MistShell extends Entity {
  // from, to: { x, y }, where it was formed and where it lands.
  // opts: { flightTime, boomTime, radius (of the boom), size (of the ball as thrown), damage }
  constructor(world, sourceAbility, from, to, opts) {
    super(world);
    this.sourceAbility = sourceAbility;
    this.from = from;
    this.to = to;
    this.radius = opts.radius;
    this.size = opts.size;
    this.damage = opts.damage;
    this.thrownAt = world.time;
    this.landAt = world.time + opts.flightTime;
    this.endsAt = this.landAt + opts.boomTime;
    this.cueAt = this.landAt - ATTACK_FX.cue.lead;
    this.landed = false;
    this.armed = false; // can hurt: from the landing until it hits, is parried or ends
    this.marker = new Graphics();
    this.burn = new Graphics(); // the floor under the boom
    for (const g of [this.marker, this.burn]) {
      g.blendMode = 'add';
      g.scale.set(1 / U);
    }
    world.layers.telegraphs.addChild(this.marker, this.burn);
    this.launch = new MistBallLook(world.layers.projectiles, { trail: false });
    this.ball = new MistBallLook(world.layers.projectiles, { trail: false });
    this.ball.container.visible = false;
    this.cue = new CueFlash(world);
    world.effects.burst(from.x, from.y, 0, { ...M.launch.sparks, color: M.color });
  }

  step() {
    const t = this.world.time;
    if (!this.landed && t >= this.landAt) this.land();
    if (this.armed && t >= this.endsAt) this.disarm();
    if (t >= this.endsAt + M.boom.fadeTime) this.destroy();
  }

  land() {
    const w = this.world, { x, y } = this.to, B = M.boom;
    this.landed = true;
    this.armed = true;
    w.hostileAttacks.add(this);
    w.sound('mistBoom', this.to);
    w.effects.burst(x, y, 0, { ...B.sparks, color: M.color });
    w.effects.burst(x, y, 0, { ...B.sparks, count: B.sparks.count / 2, color: M.bright });
    const { volume } = w.positional(this.to);
    if (volume > 0) w.camera.shake(B.shake.duration, B.shake.strength * volume, B.shake.frequency);
  }

  disarm() {
    this.armed = false;
    this.world.hostileAttacks.delete(this);
  }

  overlapsCircle(x, y, r) { return circleVsCircle(x, y, r, this.to.x, this.to.y, this.radius); }
  overlapsCapsule(cap) { return circleVsCapsule(this.to.x, this.to.y, this.radius, cap); }

  closestPoint(cap) {
    const { x, y } = this.to, dx = cap.cx - x, dy = cap.cy - y, l = Math.hypot(dx, dy) || 1, reach = Math.min(this.radius, l);
    return { x: x + (dx / l) * reach, y: y + (dy / l) * reach };
  }

  parry() {
    if (!this.armed) return false;
    this.disarm();
    this.sourceAbility.onParry();
    return true;
  }

  afterPhysics() {
    const p = this.world.livePlayer;
    if (!this.armed || !p || !this.overlapsCircle(p.body.pos.x, p.body.pos.y, p.body.radius)) return;
    if (p.tryParryIncoming(this) || !this.armed) return;
    const { x, y } = this.to, b = p.body.pos, dx = x - b.x, dy = y - b.y, l = Math.hypot(dx, dy) || 1;
    p.takeDamage(this.damage, { x: b.x + (dx / l) * p.body.radius, y: b.y + (dy / l) * p.body.radius }, { x, y });
    this.disarm();
  }

  render(alpha) {
    const now = renderTime(this.world, alpha);
    const k = (now - this.thrownAt) / M.launch.time, rising = k >= 0 && k < 1;
    this.launch.container.visible = rising;
    if (rising) this.launch.render(now, this.from.x, this.from.y, 0, this.size * (1 + M.launch.grow * easeOut(k)), { alpha: 1 - k });
    this.drawMarker(now);
    this.drawBoom(now);
    this.cue.render(this.to, (now - this.cueAt) / ATTACK_FX.cue.time, 1);
  }

  // Until it lands: the ring it will fill and a fill swelling to meet it, pulsing faster as
  // it nears.
  drawMarker(now) {
    const g = this.marker, K = M.marker, R = this.radius * U, line = K.lineWidth * U;
    const flight = this.landAt - this.thrownAt, elapsed = now - this.thrownAt, t = clamp01(elapsed / flight);
    g.clear();
    if (elapsed < 0 || now >= this.landAt) return;
    g.position.set(this.to.x, this.to.y);
    const [r0, r1] = K.pulse;
    const pulse = 0.5 + 0.5 * Math.sin(TAU * (r0 * elapsed + ((r1 - r0) * elapsed * elapsed) / (2 * flight)));
    const fade = clamp01(elapsed / 0.15), a = fade * lerp(0.55, 1, pulse);
    if (t > 0.01) g.circle(0, 0, R * t).fill({ color: M.color, alpha: K.fillAlpha * a });
    g.circle(0, 0, R).stroke({ width: line * 3, color: M.color, alpha: K.ringAlpha * 0.35 * a });
    g.circle(0, 0, R).stroke({ width: line, color: M.bright, alpha: K.ringAlpha * a });
  }

  // Once it lands: the ball pops back in, the size it was thrown, holding there while it
  // can hurt, over a flickering burn on the floor, then puffs away.
  drawBoom(now) {
    const g = this.burn, B = M.boom, R = this.radius, { x, y } = this.to;
    const since = now - this.landAt, hold = this.endsAt - this.landAt;
    const on = this.landed && since >= 0 && since < hold + B.fadeTime;
    this.ball.container.visible = on;
    g.clear();
    if (!on) return;
    const gone = clamp01((since - hold) / B.fadeTime), flash = Math.max(0, 1 - since / B.popTime);
    const grow = 1 + B.pop * flash * flash + B.fadeGrow * easeOut(gone);
    this.ball.render(now, x, y, 0, this.size * grow, { alpha: 1 - gone, glow: 1 + flash });
    g.position.set(x, y);
    g.circle(0, 0, R * U).fill({ color: lerpColor(M.color, M.bright, flash), alpha: clamp01(B.burnAlpha + B.flicker * Math.sin(now * 55) + 0.4 * flash) * (1 - gone) });
    g.circle(0, 0, R * U).stroke({ width: M.marker.lineWidth * U, color: M.bright, alpha: 0.7 * (1 - gone) });
  }

  dispose() {
    this.world.hostileAttacks.delete(this);
    this.marker.destroy();
    this.burn.destroy();
    this.launch.destroy();
    this.ball.destroy();
    this.cue.destroy();
  }
}
