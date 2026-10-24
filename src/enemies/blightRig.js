// The Alembic's parts (BLIGHT, blightParts): ten iris valves round its rim, canisters of
// toxin set into the conduits out to every other one, and a star of poison in a glass
// sphere at its core, each drawn on its own over its body and posed every frame. Idle it
// pumps, its gear ring and the ring round its core turn opposite ways, toxin runs out along
// its conduits, its canisters slide in and out of their sockets one after another, now and
// then a valve vents a puff of gas, vapour drifts off its rim and a creak rolls out of it.
// The attacks open its irises, kick its valves back as they fire, push the canisters about
// to launch out until they tremble, and leave their sockets empty until new ones slide up
// (each ability's `parts` says how). Dying, it races, and its valves and canisters blow off
// one by one, each straining first, in jets of gas and sparks. They share the body's
// wind-up pose and hit flash. Cosmetic: the attacks fire from the parts' places at rest
// (blightParts, blightMuzzle).
import { Container, Graphics, Sprite } from 'pixi.js';
import { BLIGHT as B, DEATH_FX } from '../data/config.js';
import { clamp01, lerp, lerpColor, randRange, randInsideUnitCircle, smoothStep01, TAU } from '../engine/math.js';
import { tex } from '../render/assets.js';
import { PART_ART, POD_FLASK, blightParts } from '../render/sprites.js';

const easeOut = (t) => 1 - (1 - t) ** 2;
// Its drawings are drawn this many times larger and scaled back down, so circles come out round.
const U = 32;
const C = B.colors;
const progress = (a, now) => clamp01((now - a.phaseStartedAt) / Math.max(1e-3, a.phaseEndsAt - a.phaseStartedAt));

function shuffled(list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// A sprite of `name` the size of a part `size` 1 at scale 1.
function partSprite(name, parent, blendMode = 'normal') {
  const s = new Sprite(tex[name]);
  s.anchor.set(0.5);
  s.width = s.height = 1 / PART_ART.body;
  s.blendMode = blendMode;
  parent.addChild(s);
  return s;
}

// A soft additive glow, `tint`ed, its width set as it is drawn.
function glowSprite(parent, tint) {
  const s = new Sprite(tex.mist);
  s.anchor.set(0.5);
  s.blendMode = 'add';
  s.tint = tint;
  parent.addChild(s);
  return s;
}

export class BlightRig {
  constructor(enemy) {
    this.enemy = enemy;
    this.parts = blightParts().map((h, index) => ({
      ...h, index, view: new Container(),
      pace: randRange(...B.pace), phase: Math.random() * TAU,
      ventAt: null, ventFrom: -Infinity, ventFor: 1, // venting a puff of gas, its iris half open
      open: 0, // how far its iris is open this frame
      shown: 1, // how far a new canister has slid up, if one launched, as it died
      lastShown: 1, // the same, this frame
      torn: false, // blown off as it dies
    }));
    for (const h of this.parts) {
      h.body = partSprite(`blight_part_${h.index}`, h.view);
      h.warm = partSprite(`blight_part_${h.index}_white`, h.view);
      h.warm.visible = false;
    }
    const valves = this.parts.filter((h) => h.kind === 'valve'), pods = this.parts.filter((h) => h.kind === 'pod');
    this.core = this.parts.find((h) => h.kind === 'core');
    // In its view, over the body and its wind-up tint, from the bottom: its conduits, gear
    // ring and empty sockets; its canisters, glowing; its core, its star and the ring round
    // it; its valves, and their irises and the glow through them.
    this.layer = new Container();
    this.under = new Graphics();
    this.under.scale.set(1 / U);
    this.layer.addChild(this.under);
    for (const h of pods) {
      this.layer.addChild(h.view);
      h.glow = glowSprite(this.layer, C.toxin);
    }
    this.layer.addChild(this.core.view);
    this.star = [glowSprite(this.layer, C.toxin), glowSprite(this.layer, 0xffffff)];
    this.glint = new Sprite(tex.glint);
    this.glint.anchor.set(0.5);
    this.glint.blendMode = 'add';
    this.glint.tint = C.hot;
    this.layer.addChild(this.glint);
    this.orbit = new Graphics();
    this.orbit.scale.set(1 / U);
    this.layer.addChild(this.orbit);
    for (const h of valves) this.layer.addChild(h.view);
    this.irises = new Graphics();
    this.irises.scale.set(1 / U);
    this.layer.addChild(this.irises);
    for (const h of valves) h.glow = glowSprite(this.layer, C.glow);
    enemy.view.addChild(this.layer);
    this.flying = new Container(); // parts blown off, flying, in the world
    enemy.world.layers.enemies.addChild(this.flying);
    this.loose = []; // those: { sprite, x, y, vx, vy, rot, spin, size, at }
    this.bursts = null; // when each part blows off, set once it starts dying
    this.gearTurn = 0; // how far its gear ring has turned (and the ring round its core the other way)
    this.flowAt = 0; // how far its toxin has run along its conduits
    this.creakAt = null;
    this.flashing = false;
  }

  get world() { return this.enemy.world; }

  // After EnemyAttackFx (and the dying pose) has placed and posed the enemy's view for
  // render time `now`.
  render(now, dt) {
    const e = this.enemy, v = e.view, dying = !!e.dying, tint = e.attackFx.tint;
    const beat = (0.5 + 0.5 * Math.sin(now * B.pump.rate * TAU)) ** B.pump.beat;
    v.scale.x *= 1 - B.pump.along * beat;
    v.scale.y *= 1 + B.pump.across * beat;
    if (dying && !this.bursts) this.scheduleBursts();
    const mods = this.mods(now), busy = this.busy(), race = dying ? B.race : 1;
    this.gearTurn += dt * B.gear.spin * TAU * race * (busy ? 2 : 1);
    this.flowAt += dt * B.flow.speed * race * (busy ? B.flow.rush : 1);
    for (const h of this.parts) {
      this.pose(h, now, mods[h.index], beat);
      h.warm.visible = tint.visible && !this.flashing;
      h.warm.alpha = tint.alpha * B.warm;
      h.warm.tint = tint.tint;
    }
    const shade = (color) => (this.flashing ? 0xffffff : tint.visible ? lerpColor(color, tint.tint, tint.alpha * B.warm) : color);
    this.drawUnder(shade);
    this.drawCore(now, mods[this.core.index], beat, shade, dying);
    this.drawIrises(shade);
    this.renderLoose(now, dt);
    if (dt > 0 && v.visible && !dying) this.idleNoises(now, dt);
  }

  // Whether it is winding up or striking with anything (its toxin rushing meanwhile).
  busy() {
    for (const a of this.enemy.abilities.values()) if (a.phase === 'windup' || a.phase === 'active') return true;
    return false;
  }

  // What the attacks are doing to each part: { open (0–1), push (out along its facing),
  // shake, grow, shown (0 gone, 1 there), heat (0–1, glowing hotter) }.
  mods(now) {
    const m = this.parts.map(() => ({ open: 0, push: 0, shake: 0, grow: 1, shown: 1, heat: 0 }));
    const valves = this.parts.filter((h) => h.kind === 'valve');
    const open = (h, level) => { m[h.index].open = Math.max(m[h.index].open, level); };
    const kick = (h, at) => {
      const k = (now - at) / B.kickTime;
      if (k >= 0 && k < 1) { m[h.index].push -= B.kick * h.size * Math.sin(Math.PI * k); open(h, 1); }
    };
    const core = m[this.core.index];
    for (const a of this.enemy.abilities.values()) {
      const level = this.openLevel(a, now);
      if (a.phase === 'windup') core.heat = Math.max(core.heat, progress(a, now));
      else if (a.phase === 'active') core.heat = 1;
      switch (a.data.parts) {
        case 'gape': // the ring: every valve, all of them kicking at each salvo
          for (const h of valves) { open(h, level); if (a.phase === 'active' || a.phase === 'recovery') kick(h, a.strikeAt); }
          break;
        case 'spew': // every valve opening wider through the wind-up, rattling, held most of the way open after
          for (const h of valves) open(h, a.phase === 'windup' ? progress(a, now) : level * 0.7);
          if (a.phase === 'windup') for (const h of valves) m[h.index].shake = Math.max(m[h.index].shake, 0.05 * h.size * progress(a, now));
          break;
        case 'lob': // the valves lobbing globs
          for (const i of a.data.from) open(this.parts[i], level);
          break;
        case 'loose': { // the canisters about to launch strain out, glowing hotter
          if (a.phase === 'windup') {
            const t = progress(a, now);
            for (const i of a.chosen) {
              const h = this.parts[i], s = m[i];
              s.push += a.data.pushOut * smoothStep01(t);
              s.shake = Math.max(s.shake, B.strain.shake * h.size * t);
              s.grow *= 1 + B.strain.grow * t;
              s.heat = Math.max(s.heat, t);
            }
          }
          for (const [i, at] of a.launched) {
            const since = now - at - a.data.regrowDelay;
            if (now - at < 0) continue;
            m[i].shown = Math.min(m[i].shown, since < 0 ? 0 : easeOut(clamp01(since / a.data.regrowTime)));
          }
          break;
        }
      }
      for (const [i, at] of a.spatAt ?? []) kick(this.parts[i], at);
    }
    return m;
  }

  // How far an attack's irises are open: opening over B.open from when it began, through
  // its wind-up and strikes, and closing over B.close as it recovers.
  openLevel(a, now) {
    if (a.phase === 'windup' || a.phase === 'active') return clamp01((now - a.lastUseTime) / B.open);
    if (a.phase === 'recovery') return 1 - clamp01((now - a.phaseStartedAt) / B.close);
    return 0;
  }

  pose(h, now, mod, beat) {
    if (h.torn) { h.view.visible = false; if (h.glow) h.glow.visible = false; return; }
    let out = mod.push, shake = mod.shake, open = mod.open;
    if (h.kind === 'valve') { // now and then it vents, its iris opening a little
      h.ventAt ??= now + randRange(0, B.vent.every[1]);
      if (now >= h.ventAt) {
        h.ventFrom = now;
        h.ventFor = randRange(...B.vent.time);
        h.ventAt = now + h.ventFor + randRange(...B.vent.every);
        if (!this.enemy.dying) this.vent(h);
      }
      const k = (now - h.ventFrom) / h.ventFor;
      if (k >= 0 && k < 1) open = Math.max(open, B.vent.open * Math.sin(Math.PI * k));
    } else if (h.kind === 'pod') { // sliding out of its socket and back, one after another round it
      out += B.bob * h.size * (0.5 + 0.5 * Math.sin(now * B.bobRate * TAU - Math.atan2(h.y, h.x)));
    }
    // Dying: it strains, pushed out, trembling, its iris flung wide, and blows off.
    if (this.bursts && this.bursts[h.index] != null) {
      const T = B.burst, at = this.bursts[h.index], k = clamp01(1 - (at - now) / T.strain), kk = k * k;
      out += T.pull * h.size * kk;
      shake = Math.max(shake, T.shake * h.size * k);
      if (k > 0) open = 1;
      mod.heat = Math.max(mod.heat, k);
      if (now >= at) { this.blowOff(h, out, mod.grow * mod.shown, now); return; }
    }
    const j = shake > 0 ? randInsideUnitCircle() : { x: 0, y: 0 };
    if (!this.bursts) h.shown = mod.shown; // as it was when it died (its abilities go with it)
    h.lastShown = this.bursts ? h.shown : mod.shown;
    const c = Math.cos(h.rot), s = Math.sin(h.rot), size = h.size * mod.grow * h.lastShown * (h.kind === 'core' ? 1 + 0.06 * beat : 1);
    h.view.visible = size > 0.01;
    h.view.position.set(h.x + c * out + j.x * shake, h.y + s * out + j.y * shake);
    h.view.rotation = h.rot;
    h.view.scale.set(size);
    h.open = clamp01(open);
    h.heat = mod.heat;
    if (h.kind === 'pod') { // its toxin brightening and fading at its own pace, hotter as it strains
      const pulse = 0.5 + 0.5 * Math.sin(now * B.glowRate * h.pace * TAU + h.phase);
      h.glow.visible = h.view.visible;
      h.glow.position.copyFrom(h.view.position);
      h.glow.width = h.glow.height = size * lerp(4, 5.5, h.heat);
      h.glow.alpha = lerp(0.18, 0.35, pulse) + 0.45 * h.heat;
    }
  }

  // Under its parts: the conduits from its core out to each valve, toxin running along them
  // (cut where a valve or canister is gone), its gear ring, and the sockets of parts gone.
  drawUnder(shade) {
    const g = this.under, I = B.iris, F = B.flow, G = B.gear, from = this.core.size * B.orbit.r;
    g.clear();
    const pods = this.parts.filter((h) => h.kind === 'pod');
    for (const h of this.parts) {
      if (h.kind !== 'valve') continue;
      const c = Math.cos(h.rot), s = Math.sin(h.rot), to = h.x * c + h.y * s - h.size * I.recess;
      g.moveTo(c * from * U, s * from * U).lineTo(c * to * U, s * to * U).stroke({ width: 0.05 * U, color: shade(C.conduit), cap: 'round' });
      g.moveTo(c * from * U, s * from * U).lineTo(c * to * U, s * to * U).stroke({ width: 0.018 * U, color: shade(C.toxin), alpha: 0.4, cap: 'round' });
      const pod = pods.find((p) => Math.abs(Math.atan2(Math.sin(p.rot - h.rot), Math.cos(p.rot - h.rot))) < 0.01);
      const cut = h.torn || !h.view.visible || (pod && (pod.torn || pod.lastShown < 1));
      if (cut) continue;
      for (let k = 0; k < F.pulses; k++) {
        const u = (this.flowAt + k / F.pulses + h.index * 0.137) % 1, r = lerp(from, to, u), fade = Math.sin(Math.PI * u);
        g.circle(c * r * U, s * r * U, 0.022 * U).fill({ color: shade(C.hot), alpha: 0.85 * fade });
      }
    }
    g.circle(0, 0, G.r * U).stroke({ width: 0.014 * U, color: shade(C.gear), alpha: 0.55 });
    for (let k = 0; k < G.ticks; k++) {
      const a = this.gearTurn + (TAU * k) / G.ticks, len = k % G.major ? 0.035 : 0.07, c = Math.cos(a), s = Math.sin(a);
      g.moveTo(c * G.r * U, s * G.r * U).lineTo(c * (G.r - len) * U, s * (G.r - len) * U);
    }
    g.stroke({ width: 0.016 * U, color: shade(C.gear), alpha: 0.6 });
    for (const h of this.parts) { // the sockets of those blown off or launched, until a new one slides up
      const gone = h.torn ? 1 : 1 - h.lastShown;
      if (gone <= 0.02 || h.kind === 'core') continue;
      const c = Math.cos(h.rot), s = Math.sin(h.rot), x = h.x * U, y = h.y * U;
      if (h.kind === 'valve') {
        g.circle(x, y, h.size * I.recess * U).fill({ color: shade(C.socket), alpha: gone }).stroke({ width: 0.02 * U, color: shade(C.socketRim), alpha: gone });
        continue;
      }
      const F = POD_FLASK, S = h.size, L = S * PART_ART.pod, N = S * F.neck * 1.35, b = S * F.bulb; // its flask's shape: bulb and neck
      const pts = [[b, -N], [L, -N], [L, N], [b, N]].flatMap(([u, v]) => [x + (c * u - s * v) * U, y + (s * u + c * v) * U]);
      for (const draw of [() => g.poly(pts), () => g.circle(x + c * b * U, y + s * b * U, S * U)]) { // the bulb over the neck's end
        draw().fill({ color: shade(C.socket), alpha: gone }).stroke({ width: 0.02 * U, color: shade(C.socketRim), alpha: gone });
      }
    }
  }

  // Its star of poison, pulsing with its beat and burning hotter as it winds up (and
  // flickering as it dies), and the ring round it, nodes riding it.
  drawCore(now, mod, beat, shade, dying) {
    const h = this.core, O = B.orbit, size = h.size, p = h.view.position;
    const heat = Math.max(mod.heat, dying ? 0.6 + 0.4 * Math.random() : 0), k = lerp(1, 1.5, heat) * (1 + 0.15 * beat);
    const [halo, heart] = this.star;
    for (const s of [...this.star, this.glint]) { s.visible = h.view.visible; s.position.copyFrom(p); }
    halo.width = halo.height = size * 4.2 * k;
    halo.alpha = lerp(0.5, 0.9, heat);
    heart.width = heart.height = size * 1.5 * k;
    heart.alpha = lerp(0.65, 1, heat);
    this.glint.rotation = -this.gearTurn * 3;
    this.glint.width = this.glint.height = size * 2.6 * k;
    this.glint.alpha = lerp(0.6, 1, heat);
    const g = this.orbit, R = size * O.r, turn = (this.gearTurn * O.spin) / B.gear.spin;
    g.clear();
    g.circle(p.x * U, p.y * U, R * U).stroke({ width: 0.014 * U, color: shade(C.gear), alpha: 0.6 });
    for (let n = 0; n < O.nodes; n++) {
      const a = turn + (TAU * n) / O.nodes;
      g.circle((p.x + Math.cos(a) * R) * U, (p.y + Math.sin(a) * R) * U, 0.028 * U).fill({ color: shade(C.hot), alpha: 0.9 });
    }
  }

  // Each valve's iris over its housing: its blades closing over the recess round an
  // aperture, wider and turned further the more it's open, a seam where each blade meets
  // the next; and the toxin glowing up through it.
  drawIrises(shade) {
    const g = this.irises, I = B.iris, N = I.blades;
    g.clear();
    for (const h of this.parts) {
      if (h.kind !== 'valve') continue;
      h.glow.visible = h.view.visible;
      if (!h.view.visible) continue;
      const p = h.view.position, R = h.view.scale.x * I.recess, a = R * lerp(I.shut, I.wide, h.open), turn = h.rot + h.phase + I.turn * h.open;
      const v = Array.from({ length: N }, (_, k) => {
        const t = turn + (TAU * k) / N;
        return { x: Math.cos(t) * a, y: Math.sin(t) * a };
      });
      g.circle(p.x * U, p.y * U, R * U).fill({ color: shade(C.blade) });
      g.poly(v.flatMap((q) => [(p.x + q.x) * U, (p.y + q.y) * U])).fill({ color: shade(C.aperture) });
      v.forEach((q, k) => { // on along the edge before it, out to the recess's rim
        const prev = v[(k + N - 1) % N], dx = q.x - prev.x, dy = q.y - prev.y, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
        const b = q.x * ux + q.y * uy, t = -b + Math.sqrt(Math.max(0, b * b - (q.x * q.x + q.y * q.y - R * R)));
        g.moveTo((p.x + q.x) * U, (p.y + q.y) * U).lineTo((p.x + q.x + ux * t) * U, (p.y + q.y + uy * t) * U);
      });
      g.stroke({ width: 0.012 * U, color: shade(C.seam), alpha: 0.75 });
      h.glow.position.copyFrom(p);
      h.glow.width = h.glow.height = Math.max(a, 0.01) * 2.6;
      h.glow.alpha = clamp01(h.open * 1.2) * 0.8;
    }
  }

  // Blown off: it flies on from where it was, out the way it faced, spinning, in a jet of
  // gas and sparks.
  blowOff(h, out, grow, now) {
    h.torn = true;
    h.view.visible = false;
    if (h.glow) h.glow.visible = false;
    if (grow < 0.3) return; // gone already, its socket still empty
    const e = this.enemy, w = this.world, T = B.burst;
    const p = e.attackFx.toWorld({ x: h.x + Math.cos(h.rot) * out, y: h.y + Math.sin(h.rot) * out });
    const a = e.view.rotation + h.rot, speed = randRange(...T.speed);
    const sprite = partSprite(h.kind === 'pod' ? `blight_part_${h.index}_loose` : `blight_part_${h.index}`, this.flying);
    this.loose.push({ sprite, x: p.x, y: p.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, rot: a, spin: randRange(-T.spin, T.spin), size: h.size * grow * e.view.scale.y, at: now });
    w.effects.burst(p.x, p.y, a, T.gas);
    w.effects.burst(p.x, p.y, a, T.sparks);
    w.sound('partBlown', p, { pitch: randRange(0.85, 1.25) });
  }

  renderLoose(now, dt) {
    const T = B.burst, drag = Math.exp(-T.drag * dt);
    this.loose = this.loose.filter((f) => {
      const k = (now - f.at) / T.fly;
      if (k >= 1) { f.sprite.destroy(); return false; }
      f.vx *= drag; f.vy *= drag;
      f.x += f.vx * dt; f.y += f.vy * dt;
      f.rot += f.spin * dt;
      f.sprite.position.set(f.x, f.y);
      f.sprite.rotation = f.rot;
      f.sprite.scale.set((f.size / PART_ART.body / f.sprite.texture.width) * lerp(1, T.shrink, k));
      f.sprite.alpha = 1 - k * k;
      return true;
    });
  }

  // Its valves and canisters, one by one in a random order, crowding together toward the end
  // (B.burst); its core stays for the burst. Those launched whose sockets are still empty
  // stay gone.
  scheduleBursts() {
    for (const h of this.parts) if (h.shown < 0.3) h.torn = true;
    const e = this.enemy, T = B.burst, time = e.dyingFx.time, order = shuffled(this.parts.filter((h) => !h.torn && h.kind !== 'core').map((h) => h.index));
    this.bursts = [];
    order.forEach((i, n) => {
      const u = order.length > 1 ? n / (order.length - 1) : 1;
      this.bursts[i] = e.dying.at + time * lerp(T.from, T.to, u ** T.ease);
    });
  }

  // Valve `h` venting: a puff of gas out of it, and a hiss.
  vent(h) {
    const e = this.enemy;
    if (!e.view.visible) return;
    const p = e.attackFx.toWorld(h.view.position);
    this.world.effects.burst(p.x, p.y, e.view.rotation + h.rot, B.vent.puff);
    this.world.sound('vent', p, { pitch: randRange(0.85, 1.2), volume: 0.6 });
  }

  // Vapour drifting off its rim, and a creak now and then.
  idleNoises(now, dt) {
    const e = this.enemy, V = B.vapour;
    if (Math.random() < V.rate * dt) {
      const a = Math.random() * TAU, r = B.valves.r * 0.95, p = e.attackFx.toWorld({ x: Math.cos(a) * r, y: Math.sin(a) * r });
      this.world.effects.burst(p.x, p.y, e.view.rotation + a, V);
    }
    this.creakAt ??= now + randRange(...B.creak);
    if (now >= this.creakAt) {
      this.creakAt = now + randRange(...B.creak);
      this.world.sound('creak', e.body.pos, { pitch: randRange(0.85, 1.15) });
    }
  }

  setFlash(on) {
    if (on === this.flashing) return;
    this.flashing = on;
    for (const h of this.parts) h.body.texture = tex[on ? `blight_part_${h.index}_white` : `blight_part_${h.index}`];
  }

  // Any parts still on it pop white and swell away along with the body.
  onDeath() {
    const D = DEATH_FX.enemy.pop, e = this.enemy;
    for (const h of this.parts) {
      if (h.torn || !h.view.visible) continue;
      const p = e.attackFx.toWorld(h.view.position), w = (h.view.scale.y / PART_ART.body) * e.view.scale.y;
      this.world.deathFx.flare(tex[`blight_part_${h.index}_white`], p.x, p.y, e.view.rotation + h.view.rotation, {
        time: D.time, w0: w, h0: w, w1: w * D.scale, h1: w * D.scale, color0: 0xffffff, color1: e.type.hitColor, fade: 1.5,
      });
    }
    for (const s of [...this.star, this.glint]) s.visible = false;
  }

  destroy() { this.flying.destroy({ children: true }); }
}
