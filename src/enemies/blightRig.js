// The Blight's heads: ten ringing its rim, more sunk into its body (BLIGHT), each its own
// sprite laid over the body and posed every frame. At rest the whole mass breathes and each
// head bobs, lolls, twitches and moans at its own pace, goo oozing off the rim and a groan
// rolling out of it now and then. The attacks gape their mouths, jerk them out as they spit,
// push the heads about to tear free out until they tremble, and hide those gone until they
// grow back (each ability's `heads` says how). Dying, it has its heads torn off one by one,
// each straining and screaming before it rips free and flies off in a spray of goo, the rest
// writhing harder meanwhile. The heads are grown into its rotten flesh and each other
// (B.flesh), strung to their neighbours by twisted sinews that move with them, and a head
// torn out leaves a dark ragged wound until it grows back. They share the body's
// wind-up pose and hit flash. Each head is its own deformed shape (blightHeads). Cosmetic: the attacks fire from the heads' places at rest (blightHeads, blightMouth).
import { Container, Graphics, Sprite } from 'pixi.js';
import { BLIGHT as B, DEATH_FX } from '../data/config.js';
import { clamp01, lerp, lerpColor, randRange, randInsideUnitCircle, smoothStep01, TAU } from '../engine/math.js';
import { tex } from '../render/assets.js';
import { HEAD_ART, blightFlesh, blightHeads } from '../render/sprites.js';

const easeOut = (t) => 1 - (1 - t) ** 2;
// The flesh is drawn this many times larger and scaled back down, so its curves come out round.
const U = 32;
const progress = (a, now) => clamp01((now - a.phaseStartedAt) / Math.max(1e-3, a.phaseEndsAt - a.phaseStartedAt));

function shuffled(list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Head `i`'s sprites: its scream, gaping wider over it (faded in as it opens), and its
// silhouette over both, warmed like the body's as it winds up. At scale 1 its size is 1.
function headSprites(i) {
  const view = new Container(), shut = new Sprite(tex[`blight_head_${i}`]), open = new Sprite(tex[`blight_head_${i}_open`]);
  const warm = new Sprite(tex[`blight_head_${i}_white`]);
  for (const s of [shut, open, warm]) {
    s.anchor.set(0.5);
    s.width = s.height = 1 / HEAD_ART.body;
    view.addChild(s);
  }
  open.alpha = 0;
  warm.visible = false;
  return { view, shut, open, warm };
}

// Head `i` torn loose: gaping, outlined like any projectile. At scale 1 its size is 1.
function looseHead(i) {
  const s = new Sprite(tex[`blight_head_${i}_loose`]);
  s.anchor.set(0.5);
  s.width = s.height = 1 / HEAD_ART.body;
  const view = new Container();
  view.addChild(s);
  return view;
}

export class BlightRig {
  constructor(enemy) {
    this.enemy = enemy;
    this.heads = blightHeads().map((h, index) => ({
      ...h, index, ...headSprites(index),
      pace: randRange(...B.pace), bobPhase: Math.random() * TAU, lollPhase: Math.random() * TAU,
      twitchAt: null, twitchFrom: -Infinity, twitchTurn: 0, // jerking round
      moanAt: null, moanFrom: -Infinity, moanFor: 1, // its mouth falling open
      shown: 1, // how far it has grown back, if torn free by an attack, as it died
      lastShown: 1, // the same, this frame
      torn: false, // torn off as it dies
    }));
    // In its view, over the body and its wind-up tint: the flesh, and the heads over it (the
    // rim's over the rest); each warms with the body (see headSprites).
    this.layer = new Container();
    this.flesh = new Graphics();
    this.flesh.scale.set(1 / U);
    this.layer.addChild(this.flesh);
    this.buildFlesh();
    for (const h of [...this.heads.filter((h) => !h.rim), ...this.heads.filter((h) => h.rim)]) this.layer.addChild(h.view);
    enemy.view.addChild(this.layer);
    this.flying = new Container(); // heads torn off, flying, in the world
    enemy.world.layers.enemies.addChild(this.flying);
    this.loose = []; // those: { head, x, y, vx, vy, rot, spin, size, at }
    this.tears = null; // when each head tears off, set once it starts dying
    this.groanAt = null;
    this.flashing = false;
  }

  get world() { return this.enemy.world; }

  // After EnemyAttackFx (and the dying pose) has placed and posed the enemy's view for
  // render time `now`.
  render(now, dt) {
    const e = this.enemy, v = e.view, dying = !!e.dying;
    const breath = Math.sin(now * B.breath.rate * TAU);
    v.scale.x *= 1 - B.breath.along * breath;
    v.scale.y *= 1 + B.breath.across * breath;
    if (dying && !this.tears) this.scheduleTears();
    const mods = this.mods(now), writhe = dying ? B.writhe : 1, tint = e.attackFx.tint;
    for (const h of this.heads) {
      this.pose(h, now, mods[h.index], writhe);
      h.warm.visible = tint.visible && !this.flashing;
      h.warm.alpha = tint.alpha * B.warm;
      h.warm.tint = tint.tint;
    }
    this.drawFlesh(tint);
    this.renderLoose(now, dt);
    if (dt > 0 && v.visible && !dying) this.idleNoises(now, dt);
  }

  // What the attacks are doing to each head: { open (0–1), push (out along its facing),
  // shake, grow, shown (0 gone, 1 there) }.
  mods(now) {
    const m = this.heads.map(() => ({ open: 0, push: 0, shake: 0, grow: 1, shown: 1 }));
    const rim = this.heads.filter((h) => h.rim);
    const gape = (h, level) => { m[h.index].open = Math.max(m[h.index].open, level); };
    const jerk = (h, at) => {
      const k = (now - at) / B.retchTime;
      if (k >= 0 && k < 1) { m[h.index].push += B.retch * h.size * Math.sin(Math.PI * k); gape(h, 1); }
    };
    for (const a of this.enemy.abilities.values()) {
      const open = this.gapeLevel(a, now);
      switch (a.data.heads) {
        case 'gape': // the ring: every rim head, all of them spitting at each salvo
          for (const h of rim) { gape(h, open); if (a.phase === 'active' || a.phase === 'recovery') jerk(h, a.strikeAt); }
          break;
        case 'spew': // every rim head opening wider through the wind-up, held half open after
          for (const h of rim) gape(h, a.phase === 'windup' ? progress(a, now) : open * 0.55);
          if (a.phase === 'windup') for (const h of rim) m[h.index].shake = Math.max(m[h.index].shake, 0.05 * h.size * progress(a, now));
          break;
        case 'retch': // the heads hurling globs
          for (const i of a.data.from) gape(this.heads[i], open);
          break;
        case 'loose': { // the heads about to tear free strain out, screaming
          if (a.phase === 'windup') {
            const t = progress(a, now);
            for (const i of a.chosen) {
              const h = this.heads[i], s = m[i];
              gape(h, open);
              s.push += a.data.pushOut * smoothStep01(t);
              s.shake = Math.max(s.shake, B.strain.shake * h.size * t);
              s.grow *= 1 + B.strain.grow * t;
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
      for (const [i, at] of a.spatAt ?? []) jerk(this.heads[i], at);
    }
    return m;
  }

  // How far an attack's heads gape: opening over B.open from when it began, through its
  // wind-up and strikes, and closing over B.close as it recovers.
  gapeLevel(a, now) {
    if (a.phase === 'windup' || a.phase === 'active') return clamp01((now - a.lastUseTime) / B.open);
    if (a.phase === 'recovery') return 1 - clamp01((now - a.phaseStartedAt) / B.close);
    return 0;
  }

  pose(h, now, mod, writhe) {
    if (h.torn) { h.view.visible = false; return; }
    // Now and then it jerks round, springing back, and moans, its mouth falling open.
    h.twitchAt ??= now + randRange(0, B.twitch.every[1]);
    if (now >= h.twitchAt) {
      h.twitchFrom = now;
      h.twitchTurn = randRange(-1, 1) * B.twitch.turn;
      h.twitchAt = now + randRange(...B.twitch.every) / writhe;
    }
    const tk = (now - h.twitchFrom) / B.twitch.time;
    const twitch = tk >= 0 && tk < 1 ? h.twitchTurn * writhe ** 0.5 * (1 - tk) ** 2 * Math.cos(tk * Math.PI * 2.5) : 0;
    h.moanAt ??= now + randRange(0, B.moan.every[1]);
    if (now >= h.moanAt) {
      h.moanFrom = now;
      h.moanFor = randRange(...B.moan.time);
      h.moanAt = now + h.moanFor + randRange(...B.moan.every);
    }
    const mk = (now - h.moanFrom) / h.moanFor, moan = mk >= 0 && mk < 1 ? 0.8 * Math.sin(Math.PI * mk) : 0;

    const S = h.size;
    let out = B.bob * S * Math.sin(now * B.bobRate * h.pace * TAU + h.bobPhase) + mod.push;
    let shake = mod.shake, open = Math.max(mod.open, moan), stretch = 1;
    const loll = B.loll * writhe * Math.sin(now * B.lollRate * h.pace * TAU + h.lollPhase);
    // Dying: it strains, dragged out and stretched, screaming, and rips free.
    if (this.tears) {
      const T = B.tear, at = this.tears[h.index], k = clamp01(1 - (at - now) / T.strain), kk = k * k;
      out += T.pull * S * kk;
      stretch += T.stretch * kk;
      shake = Math.max(shake, T.shake * S * k);
      open = Math.max(open, k > 0 ? 1 : 0, 0.5);
      if (now >= at) { this.tear(h, out, mod.grow * mod.shown, now); return; }
    }
    const j = shake > 0 ? randInsideUnitCircle() : { x: 0, y: 0 };
    if (!this.tears) h.shown = mod.shown; // as it was when it died (its abilities go with it)
    h.lastShown = this.tears ? 1 : mod.shown;
    const c = Math.cos(h.rot), s = Math.sin(h.rot), size = S * mod.grow * mod.shown;
    h.view.visible = size > 0.01;
    h.view.position.set(h.x + c * out + j.x * shake, h.y + s * out + j.y * shake);
    h.view.rotation = h.rot + loll + twitch;
    h.view.scale.set(size * stretch, size);
    h.open.alpha = clamp01(open);
  }

  // Its flesh's ragged parts, its own: the shape of the wound each head leaves (radii round
  // it) and the strands of sinew between each pair joined (how far and which way each bows,
  // how thick it is, its colour, and where across each head it ends).
  buildFlesh() {
    const F = B.flesh, pick = (list) => list[Math.floor(Math.random() * list.length)];
    for (const h of this.heads) h.jag = Array.from({ length: F.jagPoints }, () => randRange(...F.jag));
    this.sinews = blightFlesh().flatMap(([i, j]) => Array.from({ length: Math.round(randRange(F.sinews[0] - 0.49, F.sinews[1] + 0.49)) }, () => ({
      i, j, bow: randRange(-F.bow, F.bow), width: randRange(...F.sinew), color: pick(F.colors), ends: [randRange(-0.5, 0.5), randRange(-0.5, 0.5)],
    })));
  }

  // The flesh the heads grow out of, where they are this frame: wounds where heads have torn
  // out (closing as they grow back), and the sinews strung between them. White in a hit
  // flash, warming with the body.
  drawFlesh(tint) {
    const F = B.flesh, g = this.flesh, heads = this.heads;
    const on = (h) => h.view.visible && !h.torn;
    const shade = (color) => (this.flashing ? 0xffffff : tint.visible ? lerpColor(color, tint.tint, tint.alpha * B.warm) : color);
    g.clear();
    for (const h of heads) {
      const open = h.torn ? 1 : 1 - h.lastShown;
      if (open <= 0.02) continue;
      this.ragged(h, h.x, h.y, h.size * F.wound, h.rot, shade(F.woundRim), open);
      this.ragged(h, h.x, h.y, h.size * F.wound * 0.7, h.rot, shade(F.woundColor), open);
    }
    for (const s of this.sinews) {
      const a = heads[s.i], b = heads[s.j];
      if (!on(a) || !on(b)) continue;
      const pa = a.view.position, pb = b.view.position, ra = a.view.scale.y, rb = b.view.scale.y;
      const dx = pb.x - pa.x, dy = pb.y - pa.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
      const sx = pa.x + nx * s.ends[0] * ra, sy = pa.y + ny * s.ends[0] * ra, ex = pb.x + nx * s.ends[1] * rb, ey = pb.y + ny * s.ends[1] * rb;
      const cx = (sx + ex) / 2 + nx * s.bow * len, cy = (sy + ey) / 2 + ny * s.bow * len, w = Math.min(ra, rb) * s.width * 2;
      for (const [k, color] of [[1, s.color], [0.4, lerpColor(s.color, 0x9a9a70, 0.3)]]) {
        g.moveTo(sx * U, sy * U).quadraticCurveTo(cx * U, cy * U, ex * U, ey * U).stroke({ width: w * k * U, color: shade(color), cap: 'round' });
      }
    }
  }

  // Head `h`'s wound, its ragged shape round (x, y), `r` across, turned `rot`.
  ragged(h, x, y, r, rot, color, alpha) {
    const pts = h.jag.flatMap((k, n) => {
      const a = rot + (TAU * n) / h.jag.length;
      return [(x + Math.cos(a) * r * k) * U, (y + Math.sin(a) * r * k) * U];
    });
    this.flesh.poly(pts).fill({ color, alpha });
  }

  // Torn off: it flies on from where it was, out the way it faced, spinning, in a spray of goo.
  tear(h, out, grow, now) {
    h.torn = true;
    h.view.visible = false;
    if (grow < 0.3) return; // gone already, still growing back
    const e = this.enemy, w = this.world, T = B.tear;
    const p = e.attackFx.toWorld({ x: h.x + Math.cos(h.rot) * out, y: h.y + Math.sin(h.rot) * out });
    const a = e.view.rotation + h.rot, speed = randRange(...T.speed);
    const head = looseHead(h.index);
    this.flying.addChild(head);
    this.loose.push({ head, x: p.x, y: p.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, rot: a, spin: randRange(-T.spin, T.spin), size: h.size * grow * e.view.scale.y, at: now });
    w.effects.burst(p.x, p.y, a, T.gore);
    w.effects.burst(p.x, p.y, a, T.spray);
    w.sound('headRip', p, { pitch: randRange(0.85, 1.25) });
  }

  renderLoose(now, dt) {
    const T = B.tear, drag = Math.exp(-T.drag * dt);
    this.loose = this.loose.filter((f) => {
      const k = (now - f.at) / T.fly;
      if (k >= 1) { f.head.destroy({ children: true }); return false; }
      f.vx *= drag; f.vy *= drag;
      f.x += f.vx * dt; f.y += f.vy * dt;
      f.rot += f.spin * dt;
      f.head.position.set(f.x, f.y);
      f.head.rotation = f.rot;
      f.head.scale.set(f.size * lerp(1, T.shrink, k));
      f.head.alpha = 1 - k * k;
      return true;
    });
  }

  // One by one in a random order, crowding together toward the end (B.tear). Those torn
  // free by an attack and not grown back yet stay gone.
  scheduleTears() {
    for (const h of this.heads) if (h.shown < 0.3) h.torn = true;
    const e = this.enemy, T = B.tear, time = e.dyingFx.time, order = shuffled(this.heads.filter((h) => !h.torn).map((h) => h.index));
    this.tears = [];
    order.forEach((i, n) => {
      const u = order.length > 1 ? n / (order.length - 1) : 1;
      this.tears[i] = e.dying.at + time * lerp(T.from, T.to, u ** T.ease);
    });
  }

  // Goo oozing off its rim, and a groan now and then.
  idleNoises(now, dt) {
    const e = this.enemy, O = B.ooze;
    if (Math.random() < O.rate * dt) {
      const a = Math.random() * TAU, r = B.rim.r * 0.95, p = e.attackFx.toWorld({ x: Math.cos(a) * r, y: Math.sin(a) * r });
      this.world.effects.burst(p.x, p.y, e.view.rotation + a, O);
    }
    this.groanAt ??= now + randRange(...B.groan);
    if (now >= this.groanAt) {
      this.groanAt = now + randRange(...B.groan);
      this.world.sound('moan', e.body.pos, { pitch: randRange(0.85, 1.15) });
    }
  }

  setFlash(on) {
    if (on === this.flashing) return;
    this.flashing = on;
    for (const h of this.heads) {
      const name = `blight_head_${h.index}`;
      h.shut.texture = tex[on ? `${name}_white` : name];
      h.open.texture = tex[on ? `${name}_white` : `${name}_open`];
    }
  }

  // Any heads still on it pop white and swell away along with the body.
  onDeath() {
    const D = DEATH_FX.enemy.pop, e = this.enemy;
    for (const h of this.heads) {
      if (h.torn || !h.view.visible) continue;
      const p = e.attackFx.toWorld(h.view.position), w = (h.view.scale.y / HEAD_ART.body) * e.view.scale.y;
      this.world.deathFx.flare(tex[`blight_head_${h.index}_white`], p.x, p.y, e.view.rotation + h.view.rotation, {
        time: D.time, w0: w, h0: w, w1: w * D.scale, h1: w * D.scale, color0: 0xffffff, color1: e.type.hitColor, fade: 1.5,
      });
    }
  }

  destroy() { this.flying.destroy({ children: true }); }
}
