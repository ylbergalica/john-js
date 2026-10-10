// How the player's buffs show (BUFF_FX): a flare of the buff's colour as it's taken, a
// ward's bubble around the body (bursting into shards when it stops a hit), wisps and motes
// streaming off a swift body, embers and crackles off a furious one, lightning off a
// hasted one (and its swings), and a puff of motes as a buff wears off.
import { Container, Sprite } from 'pixi.js';
import { BUFF_FX, BUFFS, PLAYER } from '../data/config.js';
import { clamp01, lerp, randRange, TAU } from '../engine/math.js';
import { tex } from '../render/assets.js';
import { Plume } from '../render/fx.js';
import { RING_RADIUS } from '../render/sprites.js';

const pick = ([min, max]) => randRange(min, max);
const easeOut = (t) => 1 - (1 - t) ** 3;

function glowSprite(texture, tint) {
  const s = new Sprite(texture);
  s.anchor.set(0.5);
  s.blendMode = 'add';
  s.tint = tint;
  return s;
}

export class BuffView {
  constructor(player, buffs) {
    this.player = player;
    this.buffs = buffs;
    const L = player.world.layers, W = BUFF_FX.ward, color = BUFFS.ward.color;
    this.bubble = new Container();
    this.bubbleFill = glowSprite(tex.mist, color);
    this.bubbleRim = glowSprite(tex.ring, color);
    this.bubbleGlints = Array.from({ length: W.glints }, () => glowSprite(tex.glint, 0xffffff));
    this.bubble.addChild(this.bubbleFill, this.bubbleRim, ...this.bubbleGlints);
    this.bubble.visible = false;
    L.player.addChild(this.bubble);
    this.wardAge = Infinity; // seconds since the ward was taken, for its appearing
    this.motes = new Plume(L.playerBack, tex.glint, { drag: 3 });
    this.embers = new Plume(L.player, tex.spark, { drag: 1.6, lift: BUFF_FX.fury.embers.lift });
    this.swiftDebt = 0;
    this.furyDebt = 0;
    this.hasteDebt = 0;
    this.nextCrackle = 0;
    this.t = 0;
  }

  get world() { return this.player.world; }
  get pos() { return this.player.body.pos; }

  // A flash, a ring and sparks of `color` at the player (also a mend orb's).
  flare(color) {
    this.world.flareAt(this.pos, BUFF_FX.gain, color);
  }

  gained(kind) {
    this.flare(BUFFS[kind].color);
    if (kind === 'ward') this.wardAge = 0;
  }

  // Worn off: its colour puffs away off the body in a few motes.
  ended(kind) {
    const E = BUFF_FX.end, color = BUFFS[kind].color, { x, y } = this.pos;
    for (let i = 0; i < E.count; i++) {
      const a = ((i + Math.random()) / E.count) * TAU, v = pick(E.speed);
      this.motes.spawn({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, size: pick(E.size), life: pick(E.life), color, fade: 0x000000 });
    }
  }

  // The ward stops a hit from `source`: the bubble bursts, its shards flung away from the blow.
  wardBroken(source) {
    const B = BUFF_FX.ward.burst, color = BUFFS.ward.color, w = this.world, { x, y } = this.pos;
    const angle = Math.atan2(y - source.y, x - source.x);
    w.flareAt(this.pos, B, color);
    w.debris.burst(x, y, angle, Math.PI, { ...B.shards, colors: [0xffffff, color, 0x8d9ff0], spread: BUFF_FX.ward.radius });
    w.camera.shakeAtLeast(B.shake);
  }

  render(alpha, dt) {
    this.motes.update(dt);
    this.embers.update(dt);
    const p = this.player, b = this.buffs;
    const show = !p.hidden && !p.death;
    const pos = p.body.lerpPos(alpha);
    this.t += dt;
    this.renderWard(pos, dt, show && b.ward);
    if (!show || dt <= 0) return;
    if (b.has('swift')) this.renderSwift(pos, dt);
    if (b.has('fury')) this.renderFury(pos, dt);
    if (b.has('haste')) this.renderHaste(pos, dt);
  }

  // A swing at `point` heading `angle`: hasted, lightning snaps along it.
  swung(point, angle) {
    if (!this.buffs.has('haste')) return;
    this.world.effects.burst(point.x, point.y, angle, { ...BUFF_FX.haste.swing, color: BUFFS.haste.color });
  }

  // Little arcs of lightning jump off the body's edge, skating along it.
  renderHaste(pos, dt) {
    const H = BUFF_FX.haste, color = BUFFS.haste.color, r = PLAYER.radius;
    this.hasteDebt += dt * H.rate;
    for (; this.hasteDebt >= 1; this.hasteDebt--) {
      const a = Math.random() * TAU;
      this.world.effects.burst(pos.x + Math.cos(a) * r, pos.y + Math.sin(a) * r, a + (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2, { ...H.arcs, color });
    }
  }

  // The bubble pops into place, its rim breathing and glints circling it.
  renderWard(pos, dt, on) {
    this.bubble.visible = on;
    if (!on) return;
    const W = BUFF_FX.ward, t = this.t, scale = this.player.sizeScale;
    const k = easeOut(clamp01((this.wardAge += dt) / W.appear));
    const r = W.radius * lerp(1.7, 1, k) * scale, beat = 0.5 + 0.5 * Math.sin(t * W.pulse * TAU);
    this.bubble.position.set(pos.x, pos.y);
    this.bubble.alpha = k;
    this.bubbleRim.width = this.bubbleRim.height = r / RING_RADIUS;
    this.bubbleRim.alpha = lerp(W.alpha[0], W.alpha[1], beat);
    this.bubbleFill.width = this.bubbleFill.height = r * 2.4;
    this.bubbleFill.alpha = W.fill * (0.8 + 0.4 * beat);
    this.bubbleGlints.forEach((g, i) => {
      const a = t * W.orbit + (i / this.bubbleGlints.length) * TAU;
      g.position.set(Math.cos(a) * r, Math.sin(a) * r * 0.92);
      g.width = g.height = W.glintSize * scale * (0.7 + 0.3 * Math.sin(t * 3 + i * 2));
      g.rotation = t * 1.3 + i;
    });
  }

  // Wisps peel off the body's trailing edge and motes hang in its wake, more the faster it goes.
  renderSwift(pos, dt) {
    const S = BUFF_FX.swift, v = this.player.body.vel, speed = Math.hypot(v.x, v.y);
    if (speed < S.minSpeed) { this.swiftDebt = 0; return; }
    const color = BUFFS.swift.color, back = Math.atan2(-v.y, -v.x), r = PLAYER.radius;
    this.swiftDebt += dt * S.rate * Math.min(1, speed / PLAYER.moveSpeed);
    for (; this.swiftDebt >= 1; this.swiftDebt--) {
      const side = randRange(-1, 1) * 0.9, a = back + side;
      const x = pos.x + Math.cos(a) * r, y = pos.y + Math.sin(a) * r;
      this.world.effects.burst(x, y, back, { ...S.wisps, color });
      const M = S.motes, o = randRange(-M.spread, M.spread);
      this.motes.spawn({
        x: x - Math.sin(back) * o, y: y + Math.cos(back) * o, vx: -v.x * 0.08, vy: -v.y * 0.08,
        size: pick(M.size), life: pick(M.life), color: 0xffffff, fade: color,
      });
    }
  }

  // Embers rise off the body, and now and then it crackles.
  renderFury(pos, dt) {
    const F = BUFF_FX.fury, E = F.embers, color = BUFFS.fury.color;
    this.furyDebt += dt * F.rate;
    for (; this.furyDebt >= 1; this.furyDebt--) {
      const a = Math.random() * TAU, d = pick(F.rim) * PLAYER.radius, v = pick(E.speed);
      this.embers.spawn({
        x: pos.x + Math.cos(a) * d, y: pos.y + Math.sin(a) * d, vx: Math.cos(a) * v * 0.4, vy: -v,
        size: pick(E.size), life: pick(E.life), color, fade: E.fade, orient: true, sway: 2,
      });
    }
    if (this.t >= this.nextCrackle) {
      this.nextCrackle = this.t + pick(F.crackleEvery);
      this.world.effects.burst(pos.x, pos.y, 0, { ...F.crackle, color });
    }
  }

  destroy() {
    this.bubble.destroy({ children: true });
    this.motes.destroy();
    this.embers.destroy();
  }
}
