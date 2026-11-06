// The Revenant's needle and its afterimage (tuning in REVENANT).
//   RevenantRig     its needle, posed on the simulation's steps (tick) so that the pose can go on
//                   the tape, and shown between them.
//   EchoTape        a ring of recorded steps, written and played back on the world's clock.
//   AfterimageView  the afterimage as the tape has it: the same silhouette and needle in ghostly
//                   light, the thread tying it to the body, and a pale wake lying where the strike
//                   it's about to repeat went. Cosmetic: AfterimageAbility does the hurting.
//   RecallView      the Recall's line out to the afterimage, and the cut.
import { Container, Graphics, Sprite } from 'pixi.js';
import { ATTACK_FX as X, DEATH_FX, FIXED_DT, REVENANT as R } from '../data/config.js';
import { clamp01, deltaAngle, lerp, lerpColor, smoothStep01, TAU } from '../engine/math.js';
import { tex } from '../render/assets.js';
import { clearGraphics } from '../render/fx.js';
import { REVENANT_ART as A } from '../render/sprites.js';
import { CueFlash } from './attackView.js';

const DEG = Math.PI / 180, G = R.ghost, L = R.needle.len;
const easeOut = (t) => 1 - (1 - t) ** 2;

export const mixPose = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), rot: lerp(a.rot, b.rot, t) });

// A named pose with the needle on `side` (1 its right, -1 its left).
export const needlePose = (name, side = 1) => {
  const P = R.poses[name];
  return { x: P.x, y: P.y * side, rot: P.rot * side * DEG };
};

// `t` seconds into a Cross: a slash from `side`, then drawn across to the other for the next.
export function crossPose(side, gap, swingTime, t) {
  const second = t >= gap, s = second ? -side : side, u = second ? t - gap : t;
  if (u <= swingTime) return mixPose(needlePose('slashReady', s), needlePose('slashThrough', s), easeOut(u / swingTime));
  if (second) return needlePose('slashThrough', s);
  return mixPose(needlePose('slashThrough', s), needlePose('slashReady', -s), smoothStep01((u - swingTime) / (gap - swingTime)));
}

// A point `along` the needle from its guard, in the Revenant's frame for `pose`.
export const onNeedle = (pose, along) => ({ x: pose.x + Math.cos(pose.rot) * along, y: pose.y + Math.sin(pose.rot) * along });

// The needle in the world, in a recorded frame, from `inner` of the way along it out to its point.
function needleOf(f, inner) {
  const c = Math.cos(f.rot), s = Math.sin(f.rot), x = f.x + c * f.px - s * f.py, y = f.y + s * f.px + c * f.py;
  const a = f.rot + f.prot, dx = Math.cos(a) * L, dy = Math.sin(a) * L;
  return { ax: x + dx * inner, ay: y + dy * inner, bx: x + dx, by: y + dy };
}

// Draws where the needle went over the frames from `t0` to `t1`: quads between them, and each
// one's own line, as a thrust moves along itself and sweeps out no quad at all. `style(frame)`
// gives its colour and alpha, or null to leave it out.
function drawWake(g, tape, t0, t1, inner, line, every, style) {
  let last = null, n = 0;
  tape.between(t0, t1, (f) => {
    const look = style(f);
    if (!look) { last = null; return; }
    if (n++ % every) return;
    const q = needleOf(f, inner);
    if (last) g.poly([last.ax, last.ay, last.bx, last.by, q.bx, q.by, q.ax, q.ay]).fill(look);
    g.moveTo(q.ax, q.ay).lineTo(q.bx, q.by).stroke({ width: line, ...look });
    last = q;
  });
}

// ── the rig ────────────────────────────────────────────────────────
export class RevenantRig {
  constructor(enemy) {
    this.enemy = enemy;
    const v = enemy.view;
    this.needle = this.needleSprite(tex.revenant_needle, v);
    this.tint = this.needleSprite(tex.revenant_needle_white, v);
    this.tint.visible = false;
    this.smear = new Graphics();
    this.smear.blendMode = 'add';
    enemy.world.layers.zones.addChild(this.smear);
    this.pose = needlePose('idle'); // as of the latest step
    this.prev = { ...this.pose };
    this.gait = 0;
    this.flashing = false;
    this.lastTick = enemy.world.time;
  }

  get world() { return this.enemy.world; }

  needleSprite(texture, parent) {
    const s = new Sprite(texture);
    s.anchor.set(A.rootX / A.w, A.rootY / A.h);
    s.scale.set(1 / A.unit);
    parent.addChild(s);
    return s;
  }

  // Once a step, ahead of the recording (AfterimageAbility): an attack drives the needle itself,
  // or it eases toward where it wants to be.
  tick() {
    const e = this.enemy, now = this.world.time, dt = now - this.lastTick;
    this.lastTick = now;
    this.prev = this.pose;
    let driven = null, target = null, ease = R.ease.rest;
    if (e.stunned) {
      const W = R.stunWobble;
      target = needlePose('stunned');
      target.rot += Math.sin(now * W.freq * TAU) * W.deg * DEG;
    } else {
      for (const a of e.abilities.values()) {
        if (!a.data.ready) continue;
        if (a.phase === 'active') driven = a.bladePose(now);
        else if (a.phase === 'windup') {
          target = needlePose(a.data.ready, a.side ?? 1);
          ease = R.ease.windup;
        }
      }
      target ??= this.rest(dt);
    }
    this.pose = driven ?? mixPose(this.pose, target, 1 - Math.exp(-dt / ease));
  }

  // At its side, swaying with its stride.
  rest(dt) {
    const e = this.enemy, v = e.body.vel, speed = Math.hypot(v.x, v.y), pose = needlePose('idle');
    this.gait = (this.gait + speed * dt * R.stride) % TAU;
    pose.rot += Math.sin(this.gait) * clamp01(speed / e.type.ai.moveSpeed) * R.sway * DEG;
    return pose;
  }

  // Through the step under way.
  posed(now) { return mixPose(this.prev, this.pose, clamp01(1 - (this.world.time - now) / FIXED_DT)); }

  // After EnemyAttackFx has placed and posed the enemy's view for render time `now`. Whatever can
  // hurt burns, its smear after it.
  render(now) {
    const e = this.enemy, pose = this.posed(now), fx = e.attackFx.tint, striking = this.striking();
    for (const s of [this.needle, this.tint]) {
      s.position.set(pose.x, pose.y);
      s.rotation = pose.rot;
    }
    this.tint.visible = !this.flashing && (fx.visible || striking);
    this.tint.alpha = striking ? 0.8 : fx.alpha;
    this.tint.tint = striking ? X.color : fx.tint;
    clearGraphics(this.smear);
    const S = R.smear, af = e.afterimage;
    if (!af || af.down) return;
    drawWake(this.smear, af.tape, now - S.life, now, S.inner, S.line, 1, (f) => (f.strike ? { color: lerpColor(X.color, X.hot, 0.35), alpha: S.alpha * clamp01(1 - (now - f.t) / S.life) } : null));
  }

  striking() {
    for (const a of this.enemy.abilities.values()) if (a.data.ready && a.hitbox.active) return true;
    return false;
  }

  // Where the parry cue flashes: toward the needle's point, as last posed.
  cuePoints() { return [onNeedle(this.pose, L * R.needle.cue)]; }

  setFlash(on) {
    this.flashing = on;
    this.needle.texture = on ? tex.revenant_needle_white : tex.revenant_needle;
  }

  // The needle pops white and swells away with the body; the afterimage goes in the same moment.
  onDeath() {
    const e = this.enemy, D = DEATH_FX.enemy.pop, b = e.body, pose = this.pose, root = e.attackFx.toWorld(pose);
    this.world.deathFx.flare(tex.revenant_needle_white, root.x, root.y, e.view.rotation + pose.rot, {
      time: D.time, w0: A.w, h0: A.h, w1: A.w * D.scale, h1: A.h * D.scale, color0: 0xffffff, color1: e.type.hitColor, fade: 1.5, anchorX: A.rootX / A.w, anchorY: A.rootY / A.h,
    });
    this.world.effects.burst(b.pos.x, b.pos.y, Math.random() * TAU, R.deathSparks);
    this.world.sound('revenantDeath', b.pos, { pitch: e.type.sfxPitch });
    e.afterimage?.view.vanish();
  }

  destroy() { this.smear.destroy(); }
}

// ── the tape ───────────────────────────────────────────────────────
// A fixed ring of frames, reused, so recording costs nothing. Frames are numbered from the last
// clear; `cursor` is the next one to be played. A frame: { t, x, y, rot (the body), px, py, prot
// (its needle's pose), charge (through a wind-up), strike (a live hitbox's { shape, anchor }), cue,
// gather, sound (what happens as it's played) }.
export class EchoTape {
  constructor(capacity) {
    this.capacity = capacity;
    this.frames = Array.from({ length: capacity }, () => ({ t: 0, x: 0, y: 0, rot: 0, px: 0, py: 0, prot: 0, charge: 0, strike: null, cue: false, gather: false, sound: null }));
    this.clear();
  }

  clear() { this.start = this.end = this.cursor = 0; }

  at(i) { return this.frames[i % this.capacity]; }

  // The next frame to fill in; the oldest falls off the end.
  write() {
    const f = this.at(this.end++);
    this.start = Math.max(this.start, this.end - this.capacity);
    this.cursor = Math.max(this.cursor, this.start);
    return f;
  }

  get first() { return this.end > this.start ? this.at(this.start) : null; }

  // The last frame played.
  get current() { return this.cursor > this.start ? this.at(this.cursor - 1) : null; }

  // Plays every frame up to `t`.
  playTo(t, play) {
    while (this.cursor < this.end && this.at(this.cursor).t <= t) play(this.at(this.cursor++));
  }

  between(t0, t1, fn) {
    for (let i = this.start; i < this.end; i++) {
      const f = this.at(i);
      if (f.t >= t0 && f.t <= t1) fn(f);
    }
  }

  // The tape at `t`, between frames, into `out`; before its first frame, that frame. Whether it
  // has one at all.
  sample(t, out) {
    const { start, end } = this;
    if (end <= start) return false;
    let i = Math.max(start, this.cursor - 1);
    while (i > start && this.at(i).t > t) i--;
    while (i + 1 < end && this.at(i + 1).t <= t) i++;
    const a = this.at(i), b = i + 1 < end ? this.at(i + 1) : a, k = b === a ? 0 : clamp01((t - a.t) / (b.t - a.t));
    out.x = lerp(a.x, b.x, k);
    out.y = lerp(a.y, b.y, k);
    out.rot = a.rot + deltaAngle(a.rot, b.rot) * k;
    out.px = lerp(a.px, b.px, k);
    out.py = lerp(a.py, b.py, k);
    out.prot = lerp(a.prot, b.prot, k);
    out.charge = lerp(a.charge, b.charge, k);
    out.hot = a.strike || b.strike ? 1 : 0;
    return true;
  }
}

// ── the afterimage ─────────────────────────────────────────────────
function ghostPart(texture, parent, blendMode = 'add') {
  const s = new Sprite(texture);
  s.anchor.set(0.5);
  s.blendMode = blendMode;
  parent.addChild(s);
  return s;
}

export class AfterimageView {
  constructor(ability) {
    this.ability = ability;
    const { enemy, world } = ability, v = enemy.visual, floor = world.layers.telegraphs;
    this.scar = new Graphics();
    this.scar.blendMode = 'add';
    floor.addChild(this.scar);
    this.thread = new Graphics();
    this.thread.blendMode = 'add';
    floor.addChild(this.thread);
    this.root = new Container();
    this.root.visible = false;
    floor.addChild(this.root);
    this.glow = ghostPart(tex.mist, this.root);
    this.glow.width = this.glow.height = G.glow.size * enemy.body.radius * 2;
    this.fill = ghostPart(tex[`${v.void}_white`], this.root);
    this.edge = ghostPart(tex[`${v.outline}_white`], this.root);
    for (const s of [this.fill, this.edge]) s.width = s.height = v.size;
    this.needle = ghostPart(tex.revenant_needle_white, this.root);
    this.needle.anchor.set(A.rootX / A.w, A.rootY / A.h);
    this.needle.scale.set(1 / A.unit);
    this.smear = new Graphics();
    this.smear.blendMode = 'add';
    world.layers.zones.addChild(this.smear);
    this.cue = new CueFlash(world);
    this.shownCue = -Infinity;
    this.at = { x: 0, y: 0, rot: 0, px: 0, py: 0, prot: 0, charge: 0, hot: 0 };
    this.snap = null; // the thread's last flash: { at, x, y, recoil }
    this.motes = 0; // motes owed
  }

  get world() { return this.ability.world; }

  render(now, alpha, dt) {
    const a = this.ability, s = this.at, body = a.enemy.body.lerpPos(alpha);
    for (const g of [this.scar, this.thread, this.smear]) clearGraphics(g);
    this.renderSnap(now, body);
    const on = !a.down && a.tape.sample(a.playhead(now), s);
    this.root.visible = on;
    if (!on) { this.cue.render(null, 0, 1); return; }
    const fade = smoothStep01(clamp01((now - a.formedAt) / a.data.fadeTime));
    this.renderGhost(now, s, fade);
    this.renderThread(now, s, body, fade);
    this.renderWakes(now);
    this.renderCue(now, s);
    this.shed(s, fade, dt);
  }

  renderGhost(now, s, fade) {
    const F = G.flicker, flicker = 1 + F.amount * Math.sin(now * F.freq * TAU) * Math.sin(now * F.freq * 2.3), lift = fade * flicker;
    const up = s.hot ? 1 : s.charge, color = lerpColor(G.color, G.hot, up * G.charge);
    this.root.position.set(s.x, s.y);
    this.root.rotation = s.rot;
    this.fill.tint = this.edge.tint = this.glow.tint = color;
    this.fill.alpha = G.fill * lift;
    this.edge.alpha = Math.min(1, G.edge * (1 + 0.5 * up)) * lift;
    this.glow.alpha = lerp(G.glow.alpha, G.glow.charge, up) * lift;
    this.needle.position.set(s.px, s.py);
    this.needle.rotation = s.prot;
    this.needle.tint = lerpColor(G.color, X.color, s.hot ? 1 : s.charge * s.charge * 0.7);
    this.needle.alpha = Math.min(1, G.needle * (1 + 0.3 * up)) * lift;
  }

  // The thread: wavering, pinned at both ends, with beads of light running along it toward the body.
  renderThread(now, s, body, fade) {
    const T = G.tether, g = this.thread, dx = body.x - s.x, dy = body.y - s.y, l = Math.hypot(dx, dy);
    if (l < T.minGap) return;
    const nx = -dy / l, ny = dx / l, at = (u) => {
      const w = Math.sin(Math.PI * u) * T.wave * (Math.sin(TAU * (u * T.waves - now * T.waveFreq)) + 0.4 * Math.sin(TAU * (u * T.waves * 2.3 + now * T.waveFreq * 1.7)));
      return { x: s.x + dx * u + nx * w, y: s.y + dy * u + ny * w };
    };
    const alpha = T.alpha * fade * clamp01((l - T.minGap) / T.minGap);
    let q = at(0);
    g.moveTo(q.x, q.y);
    for (let i = 1; i <= T.segments; i++) {
      q = at(i / T.segments);
      g.lineTo(q.x, q.y);
    }
    g.stroke({ width: T.line, color: G.color, alpha });
    for (let i = 0; i < T.beads; i++) {
      const u = (now * T.beadSpeed + i / T.beads) % 1, p = at(u);
      g.circle(p.x, p.y, T.beadSize).fill({ color: G.hot, alpha: alpha * 2 * Math.sin(Math.PI * u) });
    }
  }

  // Its own smear as it strikes, and the wake of what it's about to repeat, brighter as it nears.
  renderWakes(now) {
    const a = this.ability, delay = a.data.delay, t = a.playhead(now), S = R.smear, C = G.scar;
    drawWake(this.smear, a.tape, t - S.life, t, S.inner, S.line, 1, (f) => (f.strike ? { color: lerpColor(X.color, X.hot, 0.2), alpha: S.alpha * clamp01(1 - (t - f.t) / S.life) } : null));
    drawWake(this.scar, a.tape, t, now, C.inner, C.line, C.every, (f) => (f.strike ? { color: G.color, alpha: lerp(C.alpha[0], C.alpha[1], clamp01(1 - (f.t - t) / delay) ** 2) } : null));
  }

  // On its needle, just as on the body's: the same star, for the same parry.
  renderCue(now, s) {
    const a = this.ability, k = (now - a.echoCueAt) / X.cue.time;
    if (a.echoCueAt !== this.shownCue && k >= 0) {
      this.shownCue = a.echoCueAt;
      this.cue.sparked = false;
    }
    if (!(k >= 0 && k < 1)) { this.cue.render(null, 0, 1); return; }
    const q = needleOf(s, R.needle.cue);
    this.cue.render({ x: q.ax, y: q.ay }, k, Math.sqrt(a.enemy.body.radius / 0.5), a.echoCueUnstunned ? X.cue.unstunned : X.cue);
  }

  // Motes of light drifting off it.
  shed(s, fade, dt) {
    if (dt <= 0) return;
    const M = G.motes, r = this.ability.enemy.body.radius;
    for (this.motes += M.rate * fade * dt; this.motes >= 1; this.motes--) {
      const a = Math.random() * TAU;
      this.world.effects.burst(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r, a, M);
    }
  }

  // Broken at `at`: its silhouette bursts outward in a flash of shards, spilling along the thread
  // back to the body, which flashes the once.
  shatter(at, recoil) {
    const w = this.world, S = G.shatter, b = this.ability.enemy.body.pos, size = this.ability.enemy.visual.size;
    this.root.visible = false;
    if (!at) return;
    w.flareAt(at, S.flare, G.color);
    w.deathFx.flare(this.edge.texture, at.x, at.y, at.rot, { time: S.time, w0: size, h0: size, w1: size * S.swell, h1: size * S.swell, color0: 0xffffff, color1: G.color, fade: 1.5 });
    const l = Math.hypot(b.x - at.x, b.y - at.y), n = Math.floor(l / S.spill.spacing), back = Math.atan2(b.y - at.y, b.x - at.x);
    for (let i = 1; i < n; i++) w.effects.burst(at.x + ((b.x - at.x) * i) / n, at.y + ((b.y - at.y) * i) / n, back, S.spill);
    this.snap = { at: w.time, x: at.x, y: at.y };
    if (recoil) {
      w.camera.shakeAtLeast(S.shake);
      w.holdStill(S.hold);
    }
  }

  renderSnap(now, body) {
    const S = G.shatter.snap, snap = this.snap;
    if (!snap) return;
    const k = (now - snap.at) / S.time;
    if (k >= 1) { this.snap = null; return; }
    if (k < 0) return;
    const front = easeOut(k), x = lerp(snap.x, body.x, front), y = lerp(snap.y, body.y, front); // running home along it
    this.thread.moveTo(snap.x, snap.y).lineTo(body.x, body.y).stroke({ width: S.line * (1 - k), color: G.color, alpha: 0.7 * (1 - k) });
    this.thread.circle(x, y, S.line * 1.2).fill({ color: G.hot, alpha: 1 - k });
  }

  // The Revenant's dead: it goes with it, at once.
  vanish() {
    const a = this.ability, at = a.pos;
    if (a.down || !at) return;
    this.world.effects.burst(at.x, at.y, Math.random() * TAU, G.vanish);
    this.world.deathFx.flare(tex.mist, at.x, at.y, 0, { time: 0.2, w0: 1, h0: 1, w1: 2.4, h1: 2.4, alpha: 0.7, color0: 0xffffff, color1: G.color });
  }

  destroy() {
    this.root.destroy({ children: true });
    for (const g of [this.scar, this.thread, this.smear]) g.destroy();
    this.cue.destroy();
  }
}

// ── the Recall ─────────────────────────────────────────────────────
export class RecallView {
  constructor(ability) {
    this.ability = ability;
    this.gfx = new Graphics();
    this.gfx.blendMode = 'add';
    ability.world.layers.zones.addChild(this.gfx);
  }

  // The cut goes through: a flash at either end and sparks shed along the line.
  strike() {
    const a = this.ability, w = a.world, F = R.recall.flare, K = R.recall.streak, { from, tip, target } = a;
    w.flareAt(from, F, G.color);
    w.flareAt(target, F, X.color);
    const dx = tip.x - from.x, dy = tip.y - from.y, l = Math.hypot(dx, dy), n = Math.floor(l / K.spacing), along = Math.atan2(dy, dx);
    for (let i = 0; i <= n; i++) w.effects.burst(from.x + (dx * i) / n, from.y + (dy * i) / n, along, { ...K.sparks, color: i % 2 ? X.hot : G.color });
  }

  render(now, alpha) {
    const a = this.ability, g = this.gfx;
    clearGraphics(g);
    if (a.phase === 'windup') this.windup(now, a.enemy.body.lerpPos(alpha));
    else this.cut(now);
  }

  // A line out to where it'll be, tightening, with marks running along it the way it'll go.
  windup(now, p) {
    const a = this.ability, g = this.gfx, C = R.recall, q = a.target, dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy);
    if (l < 0.01) return;
    const t = clamp01((now - a.phaseStartedAt) / Math.max(1e-3, a.phaseEndsAt - a.phaseStartedAt)), ux = dx / l, uy = dy / l;
    const color = lerpColor(X.color, X.hot, 0.3 * t), line = () => g.moveTo(p.x, p.y).lineTo(q.x, q.y);
    line().stroke({ width: C.line * 3, color, alpha: 0.25 * t });
    line().stroke({ width: C.line, color: lerpColor(color, X.hot, 0.35), alpha: lerp(0.3, 1, t) });
    for (let i = 0; i < C.marks; i++) {
      const u = ((now * C.flow * (1 + t) + i / C.marks) % 1), x = p.x + dx * u, y = p.y + dy * u, s = C.size;
      g.moveTo(x - ux * s - uy * s, y - uy * s + ux * s).lineTo(x, y).lineTo(x - ux * s + uy * s, y - uy * s - ux * s).stroke({ width: C.line, color, alpha: Math.sin(Math.PI * u) * lerp(0.4, 1, t) });
    }
    g.circle(q.x, q.y, lerp(C.ring * 1.6, C.ring * 0.7, t)).stroke({ width: C.line, color, alpha: lerp(0.3, 1, t) });
  }

  // The streak where it cut, thinning away.
  cut(now) {
    const a = this.ability, K = R.recall.streak, k = (now - a.strikeAt) / K.time;
    if (!(k >= 0 && k < 1)) return;
    const { from, tip } = a, line = () => this.gfx.moveTo(from.x, from.y).lineTo(tip.x, tip.y);
    line().stroke({ width: K.line * (1 - k) * 2.2, color: X.color, alpha: 0.35 * (1 - k) });
    line().stroke({ width: K.line * (1 - k), color: lerpColor(X.hot, X.color, k), alpha: 1 - k * k });
  }

  destroy() { this.gfx.destroy(); }
}
