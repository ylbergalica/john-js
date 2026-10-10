// The player's death, set off by the killing blow (tuning and the look in PLAYER_DEATH):
// any adrenaline wrung out of the body first, then the body seizing and caving in before it
// bursts, or, dying Exalted, the fire roaring up and the body exploding into hellfire. The
// player stays in the world (out of the fight, then hidden) while it plays.
// step() runs on the simulation clock (spurts, the burst, what rises after, the meter);
// posed() tells PlayerView how the body looks at a render time.
import { EXALTED_FX, PLAYER, PLAYER_DEATH as D } from '../data/config.js';
import { clamp01, lerp, lerpColor, randInsideUnitCircle, randRange, TAU } from '../engine/math.js';
import { tex } from '../render/assets.js';
import { Plume } from '../render/fx.js';
import { DamageCause } from '../game/damage.js';

const R = PLAYER.blob.radius * PLAYER.scale; // the body's radius in world units
const GHOST_PAD = 1 / 0.9; // the ghost texture's ring spans 0.9 of its width
const DEG = Math.PI / 180;
const easeIn = (t) => t * t * t;
const easeOut = (t) => 1 - (1 - t) ** 3;
const easeInOut = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const pick = ([min, max]) => randRange(min, max);
// Stochastic rounding, so low rates still spawn at the right average.
const spawnCount = (rate, dt) => Math.floor(rate * dt + Math.random());

// Spurt times over `time` seconds from `start`, `every` seconds apart at its start and end.
function spurtTimes(start, time, [e0, e1]) {
  const times = [];
  for (let t = 0.08; t < time - 0.05; t += lerp(e0, e1, t / time)) times.push(start + t);
  return times;
}

export class PlayerDeath {
  constructor(player) {
    const w = player.world, a = w.adrenaline;
    this.player = player;
    this.world = w;
    this.exalted = a.isExalted;
    this.look = this.exalted ? D.exalted : D.collapse; // how the body goes
    this.at = w.time;
    this.purging = !this.exalted && a.current > 0 && a.current >= a.max * D.purge.from; // wringing the adrenaline out first (the HUD shows it)
    this.flushed = this.purging;
    this.fallAt = this.at + (this.purging ? D.purge.time : 0);
    this.burstAt = this.fallAt + this.look.time;
    this.endsAt = this.burstAt + this.look.after.time;
    this.fallen = false;
    this.burst = false;
    // Gouts of adrenaline forced out through the purge, or of fire through the Exalted throes;
    // the meter drops a share with each.
    const S = this.purging ? D.purge : this.exalted ? D.exalted : null;
    this.spurts = S ? spurtTimes(this.at, S.time, S.spurts) : [];
    this.spurtCount = this.spurts.length;
    this.meter = a.current; // where the meter is headed
    this.share = this.meter / Math.max(1, this.spurtCount);
    this.kick = { at: -Infinity, x: 0, y: 0, g: 1 }; // the latest spurt's convulsion

    const { fx, telegraphs } = w.layers;
    this.flames = new Plume(fx, tex.flame, { drag: 3.5, lift: 0.4 });
    this.smoke = new Plume(telegraphs, tex.mist, { drag: 1, lift: 1.1 });
    this.motes = new Plume(fx, tex.glint, { drag: 0.6, lift: 0.8 });
    this.plumes = [this.flames, this.smoke, this.motes];
    this.pose = { x: 0, y: 0, scale: 1, white: false, red: 0, heat: 0, writhe: 0, throes: 0, pull: 0 };

    if (this.purging) w.sound('adrenalinePurge');
  }

  // From the killing blow to the end of what rises after the burst.
  get duration() { return this.endsAt - this.at; }

  // ── simulation ───────────────────────────────────────────────────
  step(dt) {
    const w = this.world, now = w.time, a = w.adrenaline;
    while (this.spurts.length && now >= this.spurts[0]) this.spurt(this.spurts.shift());
    if (a.current !== this.meter) { // drains in gulps, following the spurts down
      a.current += (this.meter - a.current) * 0.3;
      if (Math.abs(a.current - this.meter) < 0.01) a.current = this.meter;
    }
    if (!this.fallen && now >= this.fallAt) this.fall();
    if (!this.burst && now >= this.burstAt) this.burstOut();
    if (this.burst && now < this.endsAt) this.linger(dt, (now - this.burstAt) / this.look.after.time);
  }

  // A gout forced out of the body in a random direction, jolting it the other way; each
  // is bigger than the last.
  spurt() {
    const w = this.world, { x, y } = this.player.body.pos;
    const P = this.exalted ? D.exalted.spurt : D.purge.spurt;
    const k = 1 - this.spurts.length / this.spurtCount, g = lerp(1, P.grow, k);
    const last = this.spurts.length === 0;
    this.meter = last ? 0 : Math.max(0, this.meter - this.share);
    const ang = Math.random() * TAU, c = Math.cos(ang), s = Math.sin(ang);
    this.kick = { at: w.time, x: -c, y: -s, g };
    this.gout(x + c * R, y + s * R, ang, P, g);
    w.sound(P.sound, null, { volume: lerp(0.7, 1.2, k) });
    // The purge ends tearing out what's left all around.
    if (last && !this.exalted) this.gout(x, y, ang, D.purge.wrench, 1);
  }

  // Sparks, flame tongues and a puff of mist out of (x, y) along `angle`, and a shake.
  gout(x, y, angle, P, g) {
    const w = this.world, F = P.flames, M = P.mist, spread = F.spreadDeg * DEG;
    w.effects.burst(x, y, angle, { ...P.sparks, count: Math.round(P.sparks.count * g), speed: P.sparks.speed * Math.sqrt(g) });
    this.fling(this.flames, x, y, angle, spread, Math.round(F.count * g), F, Math.sqrt(g), { orient: true, sway: 2 });
    this.fling(w.deathFx.mist, x, y, angle, spread, M.count, M, Math.sqrt(g), { grow: M.grow });
    const sh = P.shake;
    w.camera.shake(sh.duration, sh.strength * g, sh.frequency);
  }

  // `count` particles of `cfg` flung from (x, y) within ±spread of `angle`.
  fling(plume, x, y, angle, spread, count, cfg, g, extra) {
    for (let i = 0; i < count; i++) {
      const a = angle + randRange(-spread, spread), v = pick(cfg.speed) * g;
      plume.spawn({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, size: pick(cfg.size) * g, life: pick(cfg.life),
        color: cfg.color, fade: cfg.fade ?? 0x000000, alpha: cfg.alpha, ...extra,
      });
    }
  }

  // The body gives out: it seizes and starts to cave in, or, Exalted, the wings tear open.
  fall() {
    this.fallen = true;
    this.purging = false;
    const w = this.world;
    if (!this.exalted) {
      if (this.flushed) w.adrenaline.current = this.meter = 0;
      w.sound('death');
      return;
    }
    this.player.view.exalted.flareWings();
    const sh = D.exalted.wings.shake;
    w.camera.shake(sh.duration, sh.strength, sh.frequency);
    w.sound('exaltedDeath');
  }

  burstOut() {
    this.burst = true;
    const w = this.world, L = this.look, B = L.burst, { x, y } = this.player.body.pos;
    this.player.hidden = true;
    if (this.exalted) w.adrenaline.burnOut();
    // The outline, caved in, pops white and swells away.
    const d0 = 2 * R * L.shrink * GHOST_PAD, d1 = 2 * R * B.pop.scale * GHOST_PAD;
    w.deathFx.flare(tex.dash_ghost, x, y, 0, { time: B.pop.time, w0: d0, h0: d0, w1: d1, h1: d1, color0: 0xffffff, color1: L.color, fade: 1.5 });
    w.deathFx.explode(x, y, R, L.color, B);
    if (B.flames) this.fling(this.flames, x, y, 0, Math.PI, B.flames.count, B.flames, 1, { orient: true, sway: 2 });
    if (B.blast) this.blast(x, y, B.blast);
    if (B.push) w.shove({ x, y }, B.push);
    w.playerBurst();
    w.sound(B.sound);
  }

  // Damages every enemy within `radius` of (x, y) alike, more on deeper floors.
  blast(x, y, { radius, damage, perFloor }) {
    const src = { x, y }, w = this.world, amount = damage + perFloor * w.session.floor;
    for (const e of [...w.enemies]) { // a guardian struck down leaves the list
      if (e.dead || Math.hypot(e.body.pos.x - x, e.body.pos.y - y) - e.body.radius >= radius) continue;
      e.takeDamage(amount, e.closestPoint(src), src, DamageCause.Death);
    }
  }

  // After the burst, rising from the spot and thinning out (`k`: 0 → 1 over after.time):
  // motes of light, or smoke and embers.
  linger(dt, k) {
    const A = this.look.after, { x, y } = this.player.body.pos, left = 1 - k;
    const rise = (plume, cfg, spread, extra) => {
      for (let n = spawnCount(cfg.rate * left, dt); n > 0; n--) {
        plume.spawn({
          x: x + randRange(-spread, spread), y: y + randRange(-spread, spread) * 0.6,
          vx: randRange(-0.3, 0.3), vy: -pick(cfg.speed), size: pick(cfg.size), life: pick(cfg.life),
          color: cfg.color, fade: cfg.fade, alpha: cfg.alpha ?? 1, grow: cfg.grow ?? 1, ...extra,
        });
      }
    };
    if (A.motes) rise(this.motes, A.motes, 0.4, { sway: 2 });
    if (A.smoke) rise(this.smoke, A.smoke, 0.5, { sway: 1 });
    if (A.embers) rise(this.world.deathFx.embers, A.embers, 0.6, { orient: true, sway: 4 });
  }

  // ── view ─────────────────────────────────────────────────────────
  // The camera's zoom: pushing in on the body up to the burst, then holding.
  zoom(now) {
    return lerp(1, D.zoom, easeInOut(clamp01((now - this.at) / (this.burstAt - this.at))));
  }

  // How the body looks at render time `now`: { x, y } off its place, scale, white (solid),
  // red (0…1 toward crimson), heat (0…1 toward white-hot), writhe (extra wobble of the
  // outline, world units), throes (0…1, how hard the Exalted fire roars) and pull (0…1, how
  // far the tail has been drawn into the body).
  posed(now) {
    const o = this.pose;
    let tremble;
    if (now < this.fallAt) {
      const P = D.purge, k = clamp01((now - this.at) / P.time);
      tremble = lerp(P.tremble[0], P.tremble[1], k);
      o.writhe = lerp(P.writhe[0], P.writhe[1], k);
      o.red = P.flush * clamp01(k * 5);
      o.scale = 1; o.white = false; o.heat = 0; o.throes = 0; o.pull = 0;
    } else {
      const L = this.look, e = Math.max(0, now - this.fallAt), k = clamp01(e / L.time);
      tremble = lerp(L.tremble[0], L.tremble[1], k * k);
      o.writhe = lerp(L.writhe[0], L.writhe[1], k);
      // Swells, then caves in over the last `cave` seconds.
      const grown = 1 + L.swell * easeOut(clamp01(e / (L.time - L.cave)));
      o.scale = lerp(grown, L.shrink, easeIn(clamp01((e - (L.time - L.cave)) / L.cave)));
      // Blinking white, faster and faster (the blink phase integrates a rising rate).
      const [b0, b1] = L.blink, phase = b0 * e + ((b1 - b0) * e * e) / (2 * L.time);
      o.white = phase % 1 < L.blinkOn || e > L.time - L.whiteOut;
      o.red = this.flushed ? D.purge.flush * (1 - k) : 0;
      o.heat = L.heat * k;
      o.throes = this.exalted && !this.burst ? k : 0;
      o.pull = k * k;
    }
    // A spurt's convulsion.
    const K = D.kick, kk = this.kick, kick = clamp01(1 - (now - kk.at) / K.time) ** 2 * kk.g;
    const j = randInsideUnitCircle();
    o.x = j.x * tremble + kk.x * K.jolt * kick;
    o.y = j.y * tremble + kk.y * K.jolt * kick;
    o.scale *= 1 - K.squash * Math.min(1, kick);
    return o;
  }

  // The outline's colour: `base` flushed crimson, then heating toward white-hot.
  outline(base) {
    const o = this.pose;
    return lerpColor(lerpColor(base, EXALTED_FX.tint, o.red), D.exalted.heatColor, o.heat);
  }

  render(dt) {
    for (const p of this.plumes) p.update(dt);
  }

  destroy() {
    for (const p of this.plumes) p.destroy();
  }
}
