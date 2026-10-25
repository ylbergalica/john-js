// The Boxer's fists: red circles it conjures out of thin air for each attack, detached from
// its body, posed every frame from the attacks' phases (tuning in FISTS). It has none at
// rest. For a hook one forms at its side and is drawn back, then swung round across the
// front; for the clap both form behind its back, charging, then come round either side to
// clap together ahead; a flurry shows none until it starts throwing, then each punch bursts
// out of its body already smeared, shoots out and is drawn back in, fading, the next out
// before the last is back: a mess of smears. They grow as they swing, smear along the way
// they have come, burn white-hot while they can hurt, and vanish once done (or the moment
// it is stunned). The clap flashes where they meet. They ride its body's pose (lean,
// twist and trembling, not its stretch), share its hit flash and pop with it on death.
// Cosmetic, except that the hook's and the flurry's hitboxes are the fists, through the
// same poses (hookFist, punchFist, fistSweep).
import { Container, Graphics, Sprite } from 'pixi.js';
import { ATTACK_FX as X, DEATH_FX, FISTS as F } from '../data/config.js';
import { clamp01, lerp, lerpColor, smoothStep01, TAU } from '../engine/math.js';
import { tex } from '../render/assets.js';
import { clearGraphics } from '../render/fx.js';
import { FIST_ART, RING_RADIUS } from '../render/sprites.js';

const SIDES = [1, -1]; // right fist, left fist
const easeOut = (t) => 1 - (1 - t) ** 2;
const progress = (a, now) => clamp01((now - a.phaseStartedAt) / Math.max(1e-3, a.phaseEndsAt - a.phaseStartedAt));
const polar = (phi, r) => ({ x: Math.cos(phi) * r, y: Math.sin(phi) * r });
// A pose ({ phi, r, size }, the right fist's) as a fist on `side`.
const place = ({ phi, r, size }, side) => ({ ...polar(phi * side, r), size });

// The hook's fist on `side` (1 its right), `k` (0 → 1) of the way through its swing.
export function hookFist(side, k) {
  const H = F.hook, e = easeOut(clamp01(k));
  const r = lerp(H.ready.r, H.through.r, e) + H.bulge * Math.sin(Math.PI * e);
  return { ...polar(lerp(H.ready.phi, H.through.phi, e) * side, r), size: lerp(H.ready.size, H.through.size, e) };
}

// A flurry's punch ({ side, angle }) `t` seconds after it is thrown: out of its body by
// that hand's shoulder to `reach` along its angle in `out` seconds, growing, then drawn
// back in over `back`, gathering speed and shrinking.
export function punchFist(punch, t, out, back) {
  const P = F.flurry, from = place(P.from, punch.side), to = polar(punch.angle, P.reach);
  const k = t < out ? easeOut(clamp01(t / out)) : 1 - clamp01((t - out) / back) ** 2;
  return { x: lerp(from.x, to.x, k), y: lerp(from.y, to.y, k), size: lerp(P.from.size, P.size, k) };
}

// The clap's fist on `side`, `k` (0 → 1) of the way round from behind its back to meet the
// other `impactAt` ahead, gathering speed.
function clapFist(side, k, impactAt) {
  const C = F.clap, e = clamp01(k) ** 2;
  const p = polar(lerp(C.ready.phi, Math.atan2(C.meet, impactAt), e), lerp(C.ready.r, Math.hypot(C.meet, impactAt), e) + C.bulge * Math.sin(Math.PI * e));
  return { x: p.x, y: p.y * side, size: lerp(C.charged, C.meet, e) };
}

// A fist's hitbox from `t0` to `t1` seconds into its swing: capsules joining it at
// `samples` + 1 points along the way, each as wide as the fist where it ends. `poseAt(t)`:
// the fist then, { x, y, size } in the Boxer's frame.
export function fistSweep(poseAt, t0, t1, samples) {
  const parts = [];
  let a = poseAt(t0);
  for (let i = 1; i <= samples; i++) {
    const b = poseAt(lerp(t0, t1, i / samples));
    parts.push({ type: 'segment', ax: a.x, ay: a.y, bx: b.x, by: b.y, r: b.size });
    a = b;
  }
  return parts;
}

// Forming: how far it has faded in and grown, `since` seconds after it began to.
function formed(since) {
  const k = clamp01(since / F.manifest);
  return { alpha: smoothStep01(k), grow: lerp(F.from, 1, easeOut(k)) };
}

export class BoxerRig {
  constructor(enemy) {
    this.enemy = enemy;
    this.layer = new Container(); // over its body, in the world
    this.smear = new Graphics();
    this.smear.blendMode = 'add';
    this.layer.addChild(this.smear);
    enemy.world.layers.enemies.addChild(this.layer);
    this.sprites = []; // a pool, one per fist drawn: { glow, body, white }
    this.live = new Map(); // key → each fist as last drawn: { x, y, size, alpha } in the world
    this.posed = []; // the same in the Boxer's frame: { x, y, ability, cue }
    this.ghosts = []; // fists vanishing: { x, y, size, alpha, at }
    this.landedAt = -Infinity; // the last clap whose flash has gone off
    this.flashing = false;
  }

  get world() { return this.enemy.world; }

  // After EnemyAttackFx has placed and posed the enemy's view for render time `now`.
  render(now) {
    const e = this.enemy, v = e.view, c = Math.cos(v.rotation), s = Math.sin(v.rotation);
    const toWorld = (q) => ({ x: v.position.x + c * q.x - s * q.y, y: v.position.y + s * q.x + c * q.y });
    const fists = e.stunned ? [] : this.fists(now), seen = new Set(fists.map((f) => f.key));
    for (const [key, f] of this.live) if (!seen.has(key) && !f.quiet) this.ghosts.push({ ...f, at: now });
    this.live.clear();
    clearGraphics(this.smear);
    this.posed = fists;
    let n = 0;
    for (const f of fists) {
      const w = toWorld(f);
      this.live.set(f.key, { x: w.x, y: w.y, size: f.size, alpha: f.alpha, quiet: f.quiet });
      if (f.path) this.drawSmear(f.path, toWorld, f.alpha);
      this.draw(n++, w.x, w.y, f.size, f.alpha, f.heat, f.glow);
    }
    this.ghosts = this.ghosts.filter((g) => now - g.at < F.vanish.time);
    for (const g of this.ghosts) {
      const k = (now - g.at) / F.vanish.time;
      this.draw(n++, g.x, g.y, g.size * (1 + F.vanish.grow * easeOut(k)), g.alpha * (1 - k) ** 1.5, 0, 1 - k);
    }
    for (; n < this.sprites.length; n++) for (const sp of Object.values(this.sprites[n])) sp.visible = false;
    this.layer.visible = v.visible;
    this.updateClap();
  }

  // Every fist out this frame: { key, x, y, size, alpha, heat, glow, path?, ability, cue? }
  // in the Boxer's frame, `path` ({ at(t), t0, t1 }) the stretch of its swing to smear.
  // `key` follows one fist from frame to frame; once it goes, the fist vanishes (unless
  // `quiet`: it has already faded away).
  fists(now) {
    const out = [];
    for (const a of this.enemy.abilities.values()) {
      if (a.data.fists === 'hook') this.hook(a, now, out);
      else if (a.data.fists === 'clap') this.clap(a, now, out);
      else if (a.data.fists === 'flurry') this.flurry(a, now, out);
    }
    return out;
  }

  // Through a wind-up: forming `since` seconds in, glowing brighter and straining harder
  // as it goes (`t`, its progress).
  readying(key, a, pose, since, t, now, cue = true) {
    const f = formed(since), S = F.strain, shake = S.shake * t, w = now * S.freq * TAU + pose.y;
    return {
      key, ability: a, cue, x: pose.x + Math.sin(w) * shake, y: pose.y + Math.cos(w * 1.3) * shake,
      size: pose.size * f.grow, alpha: f.alpha, heat: 0, glow: lerp(0.3, 1, t),
    };
  }

  // In flight, `since` seconds into its swing (`at(t)` the fist then, its swing taking
  // `time`), white-hot while `hurting`.
  swinging(key, a, at, since, time, hurting) {
    return {
      key, ability: a, ...at(Math.min(since, time)), alpha: 1, heat: hurting ? 1 : 0, glow: 1,
      path: { at: (t) => at(Math.min(t, time)), t0: Math.max(0, since - F.trail.life), t1: Math.min(since, time) },
    };
  }

  hook(a, now, out) {
    const H = F.hook, d = a.data, key = `hook:${a.lastUseTime}`;
    if (a.phase === 'windup') {
      const t = progress(a, now), pose = place({ ...H.ready, phi: H.ready.phi - H.drawIn * (1 - smoothStep01(t)) }, a.side);
      out.push(this.readying(key, a, pose, now - a.phaseStartedAt, t, now));
      return;
    }
    const since = Math.max(0, now - a.strikeAt); // a frame can show a moment before the strike
    if ((a.phase === 'active' || a.phase === 'recovery') && since < d.swingTime + H.hold) {
      out.push(this.swinging(key, a, (t) => hookFist(a.side, t / d.swingTime), since, d.swingTime, a.hitbox.active));
    }
  }

  clap(a, now, out) {
    const C = F.clap, d = a.data;
    if (a.phase === 'windup') {
      const t = progress(a, now), k = smoothStep01(t);
      for (const side of SIDES) {
        const pose = place({ phi: C.ready.phi - C.drawIn * (1 - k), r: C.ready.r, size: lerp(C.ready.size, C.charged, k) }, side);
        out.push(this.readying(`clap:${a.lastUseTime}:${side}`, a, pose, now - a.phaseStartedAt, t, now));
      }
      return;
    }
    const since = Math.max(0, now - a.strikeAt);
    if ((a.phase !== 'active' && a.phase !== 'recovery') || since >= d.landTime + C.hold) return;
    for (const side of SIDES) {
      out.push(this.swinging(`clap:${a.lastUseTime}:${side}`, a, (t) => clapFist(side, t / d.landTime, d.impactAt), since, d.landTime, true));
    }
  }

  // Nothing through the wind-up. Then each punch bursts out of the body already smeared,
  // white-hot on its way out, and is drawn back in, fading out as it nears the body, the
  // next thrown before it is back. Cut short, whatever is out vanishes.
  flurry(a, now, out) {
    const P = F.flurry, d = a.data, life = d.punchTime + d.returnTime;
    if (a.phase !== 'active' && a.phase !== 'recovery') return;
    const since = Math.max(0, now - a.strikeAt), cut = a.phase === 'recovery' && a.activeEndedAt - a.strikeAt < a.data.duration - 1e-3;
    a.punches.forEach((punch, i) => {
      const t = since - punch.at;
      if (t < 0 || t >= life || (cut && a.strikeAt + punch.at + t >= a.activeEndedAt)) return;
      const at = (u) => punchFist(punch, Math.min(u, life), d.punchTime, d.returnTime);
      const fade = clamp01((t - d.punchTime) / d.returnTime);
      out.push({
        key: `flurry:${a.lastUseTime}:${i}`, ability: a, ...at(t), alpha: 1 - smoothStep01((fade - P.fadeFrom) / (1 - P.fadeFrom)),
        heat: t < d.punchTime && a.phase === 'active' ? 1 : 0, glow: 1, quiet: fade > P.fadeFrom,
        // Drawn back, the smear of the way out shrinks away over `turn` and it trails only the
        // way back (doubled over the way out, it would burn twice as bright).
        path: { at, t0: Math.max(t - P.trail.life, d.punchTime - P.trail.life * (1 - clamp01((t - d.punchTime) / P.turn))), t1: t, trail: P.trail },
      });
    });
  }
  // Drawing ----------------------------------------------------------------
  draw(i, x, y, size, alpha, heat, glow) {
    const s = this.sprites[i] ?? this.addSprite(), G = F.glow;
    for (const sp of Object.values(s)) {
      sp.visible = alpha > 0;
      sp.position.set(x, y);
    }
    s.glow.width = s.glow.height = size * G.size;
    s.glow.alpha = lerp(G.alpha * glow, G.hot, heat) * alpha;
    s.body.width = s.body.height = s.white.width = s.white.height = size / FIST_ART.body;
    s.body.alpha = alpha;
    s.body.texture = this.flashing ? tex.boxer_fist_white : tex.boxer_fist;
    s.white.alpha = F.heat * heat * alpha;
  }

  addSprite() {
    const make = (texture, blendMode, tint) => {
      const sp = new Sprite(texture);
      sp.anchor.set(0.5);
      sp.blendMode = blendMode;
      sp.tint = tint;
      this.layer.addChild(sp);
      return sp;
    };
    const s = { glow: make(tex.mist, 'add', X.color), body: make(tex.boxer_fist, 'normal', 0xffffff), white: make(tex.boxer_fist_white, 'normal', X.hot) };
    this.sprites.push(s);
    return s;
  }

  // A smear back along the way a fist has just come ({ at(t), t0, t1, trail? }, sampled in
  // the Boxer's frame and taken to the world by `toWorld`; `trail` its own FISTS.trail), as
  // wide as the fist where it was, tapering and fading to nothing, and fading with the fist
  // (`alpha`): a band in the attack's colour round a white-hot core.
  drawSmear({ at, t0, t1, trail }, toWorld, alpha = 1) {
    const T = trail ?? F.trail, g = this.smear;
    t0 = Math.max(t0, 0); // nothing before it was thrown
    if (t1 - t0 < 1e-3) return;
    const pts = [];
    for (let i = 0; i <= T.samples; i++) {
      const q = at(lerp(t0, t1, i / T.samples));
      pts.push({ ...toWorld(q), size: q.size, k: i / T.samples });
    }
    const across = pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
      return { x: -dy / l, y: dx / l };
    });
    for (const [width, core] of [[T.width, false], [T.width * 0.35, true]]) {
      for (let i = 0; i < T.samples; i++) {
        const p = pts[i], q = pts[i + 1], n = across[i], m = across[i + 1];
        const taper = (pt) => pt.size * width * lerp(T.root ?? 0, 1, pt.k), wp = taper(p), wq = taper(q);
        g.poly([p.x + n.x * wp, p.y + n.y * wp, q.x + m.x * wq, q.y + m.y * wq, q.x - m.x * wq, q.y - m.y * wq, p.x - n.x * wp, p.y - n.y * wp])
          .fill({ color: core ? X.hot : lerpColor(X.color, X.hot, 0.3 * q.k), alpha: T.alpha * q.k * alpha });
      }
    }
  }

  // Once a clap lands (SmashAbility decides when and where): a flash where the fists meet,
  // sparks squeezed out ahead, and a ring racing out to the struck circle's edge.
  updateClap() {
    for (const a of this.enemy.abilities.values()) {
      if (a.data.fists !== 'clap' || !a.landed || a.landedAt === this.landedAt) continue;
      this.landedAt = a.landedAt;
      const I = F.impact, fx = this.world.deathFx, { x, y, rotation } = a.impact, Fl = I.flash, R = I.ring;
      const r0 = a.data.radius[0] / RING_RADIUS, r1 = a.data.radius[1] / RING_RADIUS;
      fx.flare(tex.mist, x, y, 0, { time: Fl.time, w0: Fl.size, h0: Fl.size, w1: Fl.size * Fl.grow, h1: Fl.size * Fl.grow, alpha: Fl.alpha, color0: X.hot, color1: X.color });
      fx.flare(tex.ring, x, y, 0, { time: R.time, w0: r0, h0: r0, w1: r1, h1: r1, alpha: R.alpha, color0: X.hot, color1: X.color });
      this.world.effects.burst(x, y, rotation, { ...I.sparks, color: X.hot });
      this.world.effects.burst(x, y, rotation + Math.PI, { ...I.sparks, count: I.sparks.count / 2, color: X.color });
    }
  }

  // Where the parry cue flashes: on each fist the coming strike swings, as last posed (in
  // the view's frame, so through its scale).
  cuePoints(a) {
    const v = this.enemy.view;
    return this.posed.filter((f) => f.ability === a && f.cue).map((f) => ({ x: f.x / v.scale.x, y: f.y / v.scale.y }));
  }

  setFlash(on) { this.flashing = on; }

  // Whatever fists are out pop white and swell away along with the body.
  onDeath() {
    const D = DEATH_FX.enemy.pop;
    for (const { x, y, size } of this.live.values()) {
      const w = size / FIST_ART.body;
      this.world.deathFx.flare(tex.boxer_fist_white, x, y, 0, {
        time: D.time, w0: w, h0: w, w1: w * D.scale, h1: w * D.scale, color0: 0xffffff, color1: this.enemy.type.hitColor, fade: 1.5,
      });
    }
    this.live.clear();
  }

  destroy() { this.layer.destroy({ children: true }); }
}
