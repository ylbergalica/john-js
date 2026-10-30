// The Bulwark's shield: its own sprite on the Bulwark's arm, posed every frame from the
// attacks' phases (tuning in SHIELD). It bobs with the Bulwark's squat waddle, is drawn in
// tight and rammed out ahead for a bash, or heaved up off the floor and slammed down
// edge-first for a plant, which throws up dust along the shockwave's front as it runs out.
// The star in its boss brightens through a wind-up and flashes on the strike; it flashes
// white when a blow glances off it (glanced), and shares the Bulwark's wind-up tint, hit
// flash and death pop. With the guard broken it flies off the arm, lies where it lands and
// flies back as the break runs out. Cosmetic: which blows it turns is the Bulwark's to say
// (Enemy.guards).
import { Container, Sprite } from 'pixi.js';
import { ATTACK_FX as X, DEATH_FX, SHIELD } from '../data/config.js';
import { clamp01, deltaAngle, lerp, randRange, randSign, smoothStep01, TAU } from '../engine/math.js';
import { tex } from '../render/assets.js';
import { SHIELD_ART } from '../render/sprites.js';

const P = SHIELD.poses;
const easeOut = (t) => 1 - (1 - t) ** 2;
const pick = ([min, max]) => randRange(min, max);
const progress = (a, now) => clamp01((now - a.phaseStartedAt) / Math.max(1e-3, a.phaseEndsAt - a.phaseStartedAt));
const mix = (a, b, t) => ({ ahead: lerp(a.ahead, b.ahead, t), rot: lerp(a.rot, b.rot, t), pitch: lerp(a.pitch, b.pitch, t), grow: lerp(a.grow, b.grow, t) });
// How big the shield looks: grown, and looming larger the more it's raised toward the camera.
const sizeOf = (pose) => (1 + pose.grow) * (1 + SHIELD.lift * Math.sin(pose.pitch));
// How long a strike's motion takes: the shield rammed out, or slammed down to the floor.
const strikeTime = (a) => (a.data.shield === 'plant' ? a.data.landTime : a.data.swingTime);
const BOSS = SHIELD_ART.r + 0.01; // its boss, out from the centre of its curve

// Where a point `along` from the centre of its curve, straight out through its boss, sits in
// the Bulwark's frame for `pose`. Pitched up, the shield foreshortens.
function onShield(pose, along) {
  const d = along * Math.cos(pose.pitch) * sizeOf(pose);
  return { x: pose.ahead + Math.cos(pose.rot) * d, y: Math.sin(pose.rot) * d };
}

export class BulwarkRig {
  constructor(enemy) {
    this.enemy = enemy;
    this.held = new Container(); // the shield, its tint and its glint: on the arm, or loose in the world
    this.shield = this.sprite(tex.bulwark_shield);
    this.tint = this.sprite(tex.bulwark_shield_white);
    this.glint = new Sprite(tex.glint);
    this.glint.anchor.set(0.5);
    this.glint.blendMode = 'add';
    this.glint.tint = SHIELD.glint.color;
    this.glint.position.set(BOSS, 0);
    this.held.addChild(this.glint);
    enemy.view.addChild(this.held);
    this.pose = { ...P.idle };
    this.from = this.pose; // where the current motion started
    this.motion = 'idle';
    this.motionAt = 0;
    this.strike = null; // the latest strike: { ability, from }
    this.landedAt = -Infinity; // the last plant landing whose dust has been thrown up
    this.owed = { dust: 0, sparks: 0 }; // puffs and sparks owed to a shockwave's front
    this.gait = 0; // radians through the stride cycle
    this.flashOn = false; // the Bulwark's hit flash
    this.glancedAt = -Infinity;
    this.loose = null; // off the arm: { at, from, to, size, landed, back } (see fling)
  }

  get world() { return this.enemy.world; }

  sprite(texture) {
    const s = new Sprite(texture);
    s.anchor.set(0, 0.5);
    s.scale.set(1 / SHIELD_ART.unit);
    this.held.addChild(s);
    return s;
  }

  // After EnemyAttackFx has placed and posed the enemy's view for render time `now`.
  render(now, dt) {
    const e = this.enemy, walk = this.walk(dt);
    e.view.rotation += Math.sin(this.gait) * SHIELD.gait.waddle * walk;
    if (this.flyLoose(now)) return;

    let ability = null;
    for (const a of e.abilities.values()) if (a.phase === 'windup' || a.phase === 'active') ability = a;
    const motion = e.stunned ? 'stunned' : ability ? `${ability.data.shield}:${ability.phase}` : 'idle';
    if (motion !== this.motion) {
      this.motion = motion;
      this.motionAt = now;
      this.from = { ...this.pose };
      if (motion.endsWith(':active')) this.strike = { ability, from: this.from };
    }
    if (e.stunned) this.pose = this.settle(now, P.stunned);
    else if (ability?.phase === 'windup') this.pose = this.windup(ability, now);
    else if (ability) this.pose = this.strikePose(this.strike, now - ability.strikeAt);
    else this.pose = this.settle(now, this.idle(walk));
    this.place(this.pose);

    const t = e.attackFx.tint;
    this.tint.visible = t.visible;
    this.tint.alpha = t.alpha;
    this.tint.tint = t.tint;
    this.shield.texture = this.flashOn || now - this.glancedAt < SHIELD.glance.flashTime ? tex.bulwark_shield_white : tex.bulwark_shield;
    this.updateGlint(now, ability);
    this.updateLanding(now, dt);
  }

  // How much the Bulwark is walking (0–1), stepping its gait along with the distance.
  walk(dt) {
    const e = this.enemy, v = e.body.vel;
    if (e.isActing || e.stunned) return 0;
    const speed = Math.hypot(v.x, v.y);
    this.gait = (this.gait + speed * dt * SHIELD.gait.stride) % TAU;
    return clamp01(speed / e.type.ai.moveSpeed);
  }

  // Poses ------------------------------------------------------------------
  // At rest it pumps a little in and out with each step.
  idle(walk) { return { ...P.idle, ahead: P.idle.ahead + Math.sin(this.gait * 2) * SHIELD.gait.bob * walk }; }

  settle(now, target) {
    return mix(this.from, target, smoothStep01(clamp01((now - this.motionAt) / SHIELD.settleTime)));
  }

  // Into the ready pose, then straining there: a bash braces in tighter, a plant heaves
  // higher, both trembling.
  windup(a, now) {
    const kind = a.data.shield, t = progress(a, now);
    const pose = mix(this.from, kind === 'plant' ? P.plantReady : P.bashReady, smoothStep01(clamp01(t / SHIELD.readyIn)));
    const S = SHIELD.strain[kind], k = smoothStep01(clamp01((t - SHIELD.readyIn) / (1 - SHIELD.readyIn)));
    const shake = Math.sin(now * SHIELD.strain.freq * TAU) * S.shake * k;
    pose.ahead += S.ahead * k + shake;
    pose.pitch += S.pitch * k + shake;
    return pose;
  }

  // A bash rams out of its wind-up; a plant gathers speed as it comes down.
  strikePose({ ability, from }, since) {
    const plant = ability.data.shield === 'plant', k = clamp01(since / strikeTime(ability));
    return mix(from, plant ? P.plantDown : P.bashThrough, plant ? k * k : easeOut(k));
  }

  place(pose) {
    const size = sizeOf(pose);
    this.held.position.set(pose.ahead, 0);
    this.held.rotation = pose.rot;
    this.held.scale.set(Math.cos(pose.pitch) * size, size);
  }

  // Effects ----------------------------------------------------------------
  // The star in the boss brightens through a wind-up and flashes on the strike.
  updateGlint(now, ability) {
    const G = SHIELD.glint, s = this.strike;
    let k = ability?.phase === 'windup' ? lerp(0.25, 1, progress(ability, now)) * (0.85 + 0.15 * Math.sin(now * 40)) : 0;
    const since = s ? now - s.ability.strikeAt : Infinity;
    if (since >= 0 && since < G.flashTime) k = Math.max(k, 1 - since / G.flashTime);
    this.glint.visible = k > 0;
    if (k <= 0) return;
    this.glint.alpha = k;
    this.glint.width = this.glint.height = G.size * (1 + G.grow * k);
  }

  // Once a plant lands (PlantAbility decides when and where): a flash, sparks and a haze
  // where the shield bit, then dust thrown up along the shockwave's front as it runs out.
  updateLanding(now, dt) {
    const a = this.strike?.ability;
    if (!a?.landed) return;
    const I = SHIELD.impact, w = this.world, fx = w.deathFx, { x, y, rotation } = a.impact;
    if (a.landedAt !== this.landedAt) {
      this.landedAt = a.landedAt;
      this.owed.dust = this.owed.sparks = 0;
      const F = I.flash;
      fx.flare(tex.mist, x, y, 0, { time: F.time, w0: F.size, h0: F.size, w1: F.size * F.grow, h1: F.size * F.grow, alpha: F.alpha, color0: X.hot, color1: X.color });
      w.effects.burst(x, y, rotation, { ...I.sparks, color: X.hot });
      this.puffs(I.haze, x, y, 0.2);
    }
    if (a.parriedStunEndsAt != null || now - a.landedAt >= a.data.spreadTime) return;
    const r = a.frontAt(now), half = (a.data.arcDeg / 2) * (Math.PI / 180), o = a.wave;
    this.owed.dust += I.dust.rate * dt;
    this.owed.sparks += I.frontSparks.rate * dt;
    for (; this.owed.dust >= 1; this.owed.dust--) {
      const at = this.onFront(o, r, randRange(-half, half));
      if (at) this.puffs({ ...I.dust, count: 1 }, at.x, at.y, 0, at.angle);
    }
    for (; this.owed.sparks >= 1; this.owed.sparks--) {
      const at = this.onFront(o, r, randRange(-half, half));
      if (at) w.effects.burst(at.x, at.y, at.angle, { ...I.frontSparks, color: X.color });
    }
  }

  // A point `r` out along the shockwave from `o` at `a` off its aim, unless it's in a wall.
  onFront(o, r, a) {
    const angle = o.rotation + a, x = o.x + Math.cos(angle) * r, y = o.y + Math.sin(angle) * r;
    return this.world.physics.isWall(Math.floor(x), Math.floor(y)) ? null : { x, y, angle };
  }

  // `cfg.count` puffs of mist round (x, y), `from` out, drifting outward (along `angle` if
  // given, else all round).
  puffs(cfg, x, y, from, angle = null) {
    for (let i = 0; i < cfg.count; i++) {
      const a = angle ?? ((i + Math.random()) / cfg.count) * TAU, c = Math.cos(a), s = Math.sin(a), speed = pick(cfg.speed);
      this.world.deathFx.mist.spawn({
        x: x + c * from, y: y + s * from, vx: c * speed, vy: s * speed, size: pick(cfg.size), life: pick(cfg.life),
        color: cfg.color, fade: cfg.fade, alpha: cfg.alpha, grow: cfg.grow, sway: 0.5,
      });
    }
  }

  // A blow turned by the shield: it flashes white.
  glanced() { this.glancedAt = this.world.time; }

  // Off the arm --------------------------------------------------------------
  // The guard broken: the shield is thrown off the arm, about `away` (a direction), from
  // where it's held to a spot on the floor short of any wall, spinning as it flies.
  fling(away) {
    const F = SHIELD.fling, e = this.enemy, v = e.view, w = this.world;
    const at = e.attackFx.toWorld({ x: this.pose.ahead, y: 0 });
    const from = { x: at.x, y: at.y, rot: v.rotation + this.pose.rot };
    const a = Math.atan2(away.y, away.x) + randRange(-F.spreadDeg, F.spreadDeg) * (Math.PI / 180), c = Math.cos(a), s = Math.sin(a);
    const d = Math.max(0.3, w.physics.rayLength(from.x, from.y, c, s, pick(F.distance)) - 0.4);
    const to = { x: from.x + c * d, y: from.y + s * d, rot: from.rot + randSign() * pick(F.spin) * TAU };
    this.loose = { at: w.time, from, to, size: sizeOf(this.pose) * v.scale.y, landed: false, back: null };
    this.held.removeFromParent();
    w.layers.enemies.addChildAt(this.held, 0); // under the bodies, on the floor
    this.tint.visible = this.glint.visible = false;
    this.shield.texture = tex.bulwark_shield;
  }

  // Flies the loose shield: out to where it lands, lying there, and back to the arm over
  // the last `returnTime` of the break. False once it's back on the arm (or never left).
  flyLoose(now) {
    const L = this.loose, F = SHIELD.fling, e = this.enemy, h = this.held;
    if (!L) return false;
    if (L.back || now >= e.guard.brokenUntil - F.returnTime) {
      if (!L.back) {
        L.back = { at: now, x: h.position.x, y: h.position.y, rot: h.rotation, size: h.scale.y };
        this.world.sound('shieldReturn', h.position, { pitch: e.type.sfxPitch });
      }
      const k = clamp01((now - L.back.at) / F.returnTime), kk = k * k;
      if (k >= 1) { this.reattach(now); return false; }
      const B = L.back, to = e.attackFx.toWorld({ x: P.idle.ahead, y: 0 }), size = lerp(B.size, e.view.scale.y, kk);
      h.position.set(lerp(B.x, to.x, kk), lerp(B.y, to.y, kk));
      h.rotation = B.rot + deltaAngle(B.rot, e.view.rotation) * kk;
      h.scale.set(size);
      h.alpha = lerp(F.lieAlpha, 1, k);
      return true;
    }
    const k = clamp01((now - L.at) / F.time), ease = easeOut(k);
    h.position.set(lerp(L.from.x, L.to.x, ease), lerp(L.from.y, L.to.y, ease));
    h.rotation = lerp(L.from.rot, L.to.rot, ease);
    h.scale.set(L.size * (1 + F.height * Math.sin(Math.PI * k)));
    h.alpha = k < 1 ? 1 : F.lieAlpha;
    if (k >= 1 && !L.landed) this.land(L);
    return true;
  }

  // Coming down: a puff of dust, a few sparks and a clatter.
  land(L) {
    const F = SHIELD.fling, { x, y } = L.to;
    L.landed = true;
    this.puffs(F.dust, x, y, 0.2);
    this.world.effects.burst(x, y, 0, F.sparks);
    this.world.sound('shieldLand', L.to, { pitch: this.enemy.type.sfxPitch });
  }

  // Back on the arm, at rest.
  reattach(now) {
    const h = this.held;
    this.loose = null;
    h.removeFromParent();
    this.enemy.view.addChild(h);
    h.alpha = 1;
    this.pose = { ...P.idle };
    this.from = this.pose;
    this.motion = 'idle';
    this.motionAt = now;
    this.place(this.pose);
  }

  // Where the parry cue flashes: the shield's boss, as last posed.
  cuePoints() { return [onShield(this.pose, BOSS)]; }

  setFlash(on) {
    this.flashOn = on;
    if (!this.loose) this.shield.texture = on ? tex.bulwark_shield_white : tex.bulwark_shield;
  }

  // The shield pops white and swells away along with the body, wherever it is.
  onDeath() {
    const e = this.enemy, h = this.held, D = DEATH_FX.enemy.pop;
    let x, y, rot, sx, sy;
    if (this.loose) {
      ({ x, y } = h.position);
      rot = h.rotation;
      sx = h.scale.x;
      sy = h.scale.y;
    } else {
      ({ x, y } = e.attackFx.toWorld({ x: this.pose.ahead, y: 0 }));
      rot = e.view.rotation + this.pose.rot;
      sx = h.scale.x * e.view.scale.x;
      sy = h.scale.y * e.view.scale.y;
    }
    const w = SHIELD_ART.w * sx, hh = SHIELD_ART.h * sy;
    this.world.deathFx.flare(tex.bulwark_shield_white, x, y, rot, {
      time: D.time, w0: w, h0: hh, w1: w * D.scale, h1: hh * D.scale, color0: 0xffffff, color1: e.type.hitColor, fade: 1.5, anchorX: 0,
    });
    h.visible = false;
  }

  // Loose in the world, the shield isn't the view's to destroy.
  destroy() { if (this.held.parent !== this.enemy.view) this.held.destroy({ children: true }); }
}
