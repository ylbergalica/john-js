// How the player's buffs show (BUFF_FX): a flare of the buff's colour as it's taken, a
// ward's bubble around the body, a ring for each held (the outermost shattering when it
// stops a hit), wisps and motes
// streaming off a swift body, embers and crackles off a furious one, lightning off a
// hasted one (and its swings), and a puff of motes as a buff wears off.
import { Container, Graphics, Sprite } from 'pixi.js';
import { BUFF_FX, BUFFS, PLAYER } from '../data/config.js';
import { clamp01, deltaAngle, lerp, lerpColor, randRange, TAU } from '../engine/math.js';
import { tex } from '../render/assets.js';
import { Plume } from '../render/fx.js';
import { RING_RADIUS } from '../render/sprites.js';

const pick = ([min, max]) => randRange(min, max);
const easeOut = (t) => 1 - (1 - t) ** 3;
const U = 32; // shattered rims are drawn at this many units to the world unit, then scaled back down

// Where the ring of ward `i` of `n` sits, unscaled: `gap` apart until there are `spread`,
// then closing in under the outermost instead.
function wardRadius(i, n) {
  const W = BUFF_FX.ward, gap = n > W.spread ? (W.gap * (W.spread - 1)) / (n - 1) : W.gap;
  return W.radius + i * gap;
}

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
    const L = player.world.layers, color = BUFFS.ward.color;
    this.bubble = new Container();
    this.bubbleFill = glowSprite(tex.mist, color);
    this.bubble.addChild(this.bubbleFill);
    this.bubble.visible = false;
    L.player.addChild(this.bubble);
    this.rings = []; // one per ward held, innermost first: { view, rim, glints, r (unscaled), age, spin }
    this.jolt = 0; // 1 as a ward breaks, the rings left flinching, fading to 0
    this.shatter = []; // arcs of broken rims flying off
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

  // quiet: an aspect's ward, coming in without the flare, motes drifting in with it instead.
  gained(kind, quiet = false) {
    if (!quiet) this.flare(BUFFS[kind].color);
    if (kind !== 'ward') return;
    this.addRing();
    if (quiet) this.wardMotes();
  }

  // The newest ward's ring, outermost, coming in from a little further out.
  addRing(settled = false) {
    const W = BUFF_FX.ward, view = new Container();
    const rim = glowSprite(tex.ward_ring, BUFFS.ward.color);
    const glints = Array.from({ length: W.glints }, () => glowSprite(tex.glint, 0xffffff));
    view.addChild(rim, ...glints);
    this.bubble.addChild(view);
    const i = this.rings.length, r = wardRadius(i, i + 1);
    this.rings.push({ view, rim, glints, r: settled ? r : r * W.appear.from, age: settled ? Infinity : 0, spin: Math.random() * TAU });
  }

  // A few motes drift in onto the newest ring.
  wardMotes() {
    const W = BUFF_FX.ward, M = W.appear.motes, { x, y } = this.pos, n = this.buffs.wards;
    const r = wardRadius(n - 1, n) * W.appear.from * this.player.sizeScale;
    for (let i = 0; i < M.count; i++) {
      const a = ((i + Math.random()) / M.count) * TAU, v = pick(M.speed);
      this.motes.spawn({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, vx: -Math.cos(a) * v, vy: -Math.sin(a) * v, size: pick(M.size), life: pick(M.life), color: 0xffffff, fade: BUFFS.ward.color });
    }
  }

  // Wards carried onto a new floor are there already, at their places.
  settleWards() {
    while (this.rings.length > this.buffs.wards) this.rings.pop().view.destroy({ children: true });
    while (this.rings.length < this.buffs.wards) this.addRing(true);
  }

  // Worn off: its colour puffs away off the body in a few motes.
  ended(kind) {
    const E = BUFF_FX.end, color = BUFFS[kind].color, { x, y } = this.pos;
    for (let i = 0; i < E.count; i++) {
      const a = ((i + Math.random()) / E.count) * TAU, v = pick(E.speed);
      this.motes.spawn({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, size: pick(E.size), life: pick(E.life), color, fade: 0x000000 });
    }
  }

  // A ward stops a hit from `source`: the outermost ring shatters, its pieces and shards
  // flung away from the blow, and the rings left flinch.
  wardBroken(source) {
    const W = BUFF_FX.ward, B = W.burst, color = BUFFS.ward.color, w = this.world, { x, y } = this.pos;
    const angle = Math.atan2(y - source.y, x - source.x);
    const ring = this.rings.pop(), r = (ring?.r ?? W.radius) * this.player.sizeScale;
    ring?.view.destroy({ children: true });
    this.shatterRim(x, y, r, angle);
    w.flareAt(this.pos, B, color);
    w.debris.burst(x, y, angle, Math.PI, { ...B.shards, colors: [0xffffff, color, 0x8d9ff0], spread: r });
    w.camera.shakeAtLeast(B.shake);
    for (const g of this.rings) g.r *= W.jolt.pull;
    this.jolt = 1;
  }

  // The rim at (x, y), radius `r`, breaks into arcs of uneven length that fly out from the
  // centre, faster away from the blow (heading `angle`), slowing, turning and fading.
  shatterRim(x, y, r, angle) {
    const S = BUFF_FX.ward.burst.shatter, color = BUFFS.ward.color;
    const n = Math.round(pick(S.pieces)), start = Math.random() * TAU;
    const cuts = Array.from({ length: n }, (_, i) => start + ((i + (i ? randRange(-0.3, 0.3) : 0)) / n) * TAU);
    for (let i = 0; i < n; i++) {
      const a0 = cuts[i], a1 = i + 1 < n ? cuts[i + 1] : cuts[0] + TAU;
      const half = Math.max(0.05, (a1 - a0 - S.gap) / 2), mid = (a0 + a1) / 2;
      // Drawn about the middle of the arc, along +x, so it turns about itself as it goes.
      const g = new Graphics()
        .arc(-r * U, 0, r * U, -half, half).stroke({ width: S.width * S.glow * U, color, alpha: S.glowAlpha })
        .arc(-r * U, 0, r * U, -half, half).stroke({ width: S.width * U, color: 0xffffff });
      g.blendMode = 'add';
      g.scale.set(1 / U);
      this.world.layers.fx.addChild(g);
      const v = pick(S.speed) * (1 + S.away * Math.max(0, Math.cos(deltaAngle(angle, mid))));
      this.shatter.push({ g, x, y, r, mid, v, spin: randRange(-S.spin, S.spin), age: 0, life: pick(S.life) });
    }
  }

  renderShatter(dt) {
    const S = BUFF_FX.ward.burst.shatter;
    this.shatter = this.shatter.filter((p) => {
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) { p.g.destroy(); return false; }
      const d = p.r + (p.v * (1 - Math.exp(-S.drag * p.age))) / S.drag;
      p.g.position.set(p.x + Math.cos(p.mid) * d, p.y + Math.sin(p.mid) * d);
      p.g.rotation = p.mid + p.spin * p.age;
      p.g.scale.set((1 - S.shrink * k) / U);
      p.g.alpha = (1 - k) ** 1.5;
      p.g.tint = lerpColor(0xffffff, BUFFS.ward.color, Math.min(1, k * 2));
      return true;
    });
  }

  render(alpha, dt) {
    this.motes.update(dt);
    this.embers.update(dt);
    const p = this.player, b = this.buffs;
    const show = !p.hidden && !p.death;
    const pos = p.body.lerpPos(alpha);
    this.t += dt;
    this.renderShatter(dt);
    this.renderWard(pos, dt, show && b.wards > 0);
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

  // A ring per ward, each easing to its place (a new one sliding in from outside and fading
  // in), its rim breathing and glints circling it, over a soft fill.
  renderWard(pos, dt, on) {
    this.bubble.visible = on;
    if (!on) return;
    const W = BUFF_FX.ward, t = this.t, scale = this.player.sizeScale, n = this.rings.length;
    const settle = 1 - Math.exp(-W.ease * dt);
    this.jolt = Math.max(0, this.jolt - W.jolt.fade * dt);
    this.bubble.position.set(pos.x, pos.y);
    let outer = 0, shown = 0;
    this.rings.forEach((g, i) => {
      g.r += (wardRadius(i, n) - g.r) * settle;
      const k = easeOut(clamp01((g.age += dt) / W.appear.time)), r = g.r * scale;
      const beat = 0.5 + 0.5 * Math.sin(t * W.pulse * TAU - i * W.ripple);
      const layer = Math.max(W.minLayer, W.layerFade ** (n - 1 - i));
      g.rim.width = g.rim.height = r / RING_RADIUS;
      g.rim.alpha = k * Math.min(1, lerp(W.alpha[0], W.alpha[1], beat) * layer + this.jolt * W.jolt.bright);
      const dir = i % 2 ? -1 : 1;
      g.glints.forEach((s, j) => {
        const a = g.spin + dir * t * W.orbit * (W.radius / g.r) + (j / g.glints.length) * TAU;
        s.position.set(Math.cos(a) * r, Math.sin(a) * r * 0.92);
        s.width = s.height = W.glintSize * scale * (0.7 + 0.3 * Math.sin(t * 3 + j * 2 + i));
        s.rotation = t * 1.3 + j;
        s.alpha = k * layer;
      });
      outer = Math.max(outer, r);
      shown += k;
    });
    const beat = 0.5 + 0.5 * Math.sin(t * W.pulse * TAU);
    this.bubbleFill.width = this.bubbleFill.height = outer * 2.4;
    this.bubbleFill.alpha = W.fill * (0.8 + 0.4 * beat) * Math.min(1, shown) * (1 + W.fillPerLayer * Math.max(0, shown - 1));
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
    for (const p of this.shatter) p.g.destroy();
    this.motes.destroy();
    this.embers.destroy();
  }
}
