// The Collapsar's disc, worked out every frame (tuning in COLLAPSAR): a hot band and violet
// wisps turning round its body, the outer slower, easing to the look its attack names (its
// data's `pose`), so the faster it spins the nearer the blow. Inhaling it tightens and burns
// brightest, streaks rushing in. Stunned, its disc unravels into strands and goes dim, shedding
// embers, all its gravity let go. A few streaks always fall in on it, and it flares as it
// throws something. On the floor it shows what its attacks will do (COLLAPSAR.marks): its
// Maw's reach ringed and the crush filling in, its Ejecta's lanes. When it dies, it leaves a
// CollapsarImplosion, which is its death's whole look (`detonated`). Cosmetic, but for a hum
// now and then with the player near.
import { Graphics, Sprite } from 'pixi.js';
import { COLLAPSAR as C } from '../data/config.js';
import { clamp01, dist, lerp, smoothStep01, TAU } from '../engine/math.js';
import { tex } from '../render/assets.js';
import { clearGraphics } from '../render/fx.js';
import { COLLAPSAR_ART } from '../render/sprites.js';
import { CollapsarImplosion, Infall, drawLanes } from './gravity.js';

const KEYS = ['spin', 'disc', 'scale', 'glow', 'strands'];

function discSprite(texture, parent) {
  const s = new Sprite(texture);
  s.anchor.set(0.5);
  s.blendMode = 'add';
  s.width = s.height = COLLAPSAR_ART.size;
  parent.addChildAt(s, 0);
  return s;
}

export class CollapsarRig {
  constructor(enemy) {
    this.enemy = enemy;
    enemy.detonated = true;
    const v = enemy.view;
    this.disc = discSprite(tex.collapsar_disc, v);
    this.wisps = discSprite(tex.collapsar_wisps, v);
    this.strands = discSprite(tex.collapsar_strands, v);
    this.glow = new Sprite(tex.mist);
    this.glow.anchor.set(0.5);
    this.glow.blendMode = 'add';
    this.glow.tint = C.glowColor;
    this.glow.width = this.glow.height = C.glowSize;
    v.addChildAt(this.glow, 0);
    this.look = { ...C.looks.idle };
    this.angle = Math.random() * TAU;
    this.lastNow = null;
    this.wasStunned = false;
    this.sheds = 0; // embers owed
    this.infall = new Infall(enemy.world);
    this.marks = new Graphics();
    this.marks.blendMode = 'add';
    enemy.world.layers.zones.addChild(this.marks);
    this.humAt = 0;
    this.inhale = [...enemy.abilities.values()].find((a) => a.data.type === 'inhale');
    this.ejecta = [...enemy.abilities.values()].find((a) => a.data.type === 'ejecta');
  }

  get world() { return this.enemy.world; }

  target() {
    const e = this.enemy;
    if (e.stunned) return C.looks.slack;
    if (this.inhale?.phase === 'active') return C.looks.crush;
    for (const a of e.abilities.values()) if (a.phase === 'windup') return C.looks[a.data.pose] ?? C.looks.gather;
    return C.looks.idle;
  }

  // After EnemyAttackFx has placed and posed the enemy's view for render time `now`.
  render(now) {
    const e = this.enemy, step = this.lastNow === null ? 0 : Math.max(0, now - this.lastNow); // still while paused
    this.lastNow = now;
    const to = this.target(), L = this.look, k = 1 - Math.exp(-step / C.ease);
    for (const key of KEYS) L[key] = lerp(L[key], to[key], k);
    this.angle = (this.angle + L.spin * step) % TAU;

    // The flare as anything of its goes off, the crush included.
    let since = Infinity;
    for (const a of e.abilities.values()) since = Math.min(since, now - a.strikeAt);
    const flare = since >= 0 ? clamp01(1 - since / C.flare.time) : 0, size = COLLAPSAR_ART.size * L.scale * (1 + C.flare.scale * flare);
    this.disc.rotation = this.angle;
    this.wisps.rotation = this.angle * C.outerPace;
    this.strands.rotation = this.angle * 0.5;
    for (const s of [this.disc, this.wisps]) { s.width = s.height = size; s.alpha = L.disc; }
    this.strands.width = this.strands.height = size;
    this.strands.alpha = L.strands;
    this.strands.visible = L.strands > 0.01;
    this.glow.alpha = Math.min(1, L.glow + C.flare.glow * flare);

    this.unravel();
    if (step > 0 && e.view.visible) this.shed(step);
    this.fall(step);
    this.mark(now);
    this.hum();
  }

  // What its attack will do, on the floor: the Maw's reach ringed and its crush filling in to
  // the edge it'll reach as the wind-up runs out; the Ejecta's lanes for the wave to come.
  mark(now) {
    const g = this.marks, M = C.marks, p = this.enemy.view.position, a = this.inhale, j = this.ejecta;
    clearGraphics(g);
    if (!this.enemy.view.visible || this.enemy.stunned) return;
    if (a?.phase === 'windup') {
      const t = clamp01((now - a.phaseStartedAt) / a.data.windUpTime), shown = smoothStep01(clamp01(t / M.fadeIn)), R = a.data.hitboxRadius;
      g.circle(p.x, p.y, a.data.pull.reach).stroke({ width: M.pull.width, color: M.pull.color, alpha: M.pull.alpha * shown });
      g.circle(p.x, p.y, R).stroke({ width: M.crush.width, color: M.crush.color, alpha: M.crush.alpha * shown });
      g.circle(p.x, p.y, R * smoothStep01(t)).fill({ color: M.crush.color, alpha: M.crush.fill * shown });
    }
    const lanes = j?.lanes(now);
    if (lanes) drawLanes(g, this.world.physics, p.x, p.y, lanes.angles, lanes.t, C.disc.outer * 0.7, M.lanes, M.laneColor);
  }

  // Its weight: a deep hum now and then with the player near.
  hum() {
    const e = this.enemy, p = this.world.livePlayer, H = C.hum;
    if (this.world.time < this.humAt || e.stunned || !p || dist(e.body.pos, p.body.pos) > H.reach) return;
    this.humAt = this.world.time + H.every;
    this.world.sound('collapsarHum', e.body.pos, { pitch: e.type.sfxPitch });
  }

  // Its gravity let go: its disc comes apart, once, all at once.
  unravel() {
    const e = this.enemy, stunned = e.stunned;
    if (stunned === this.wasStunned) return;
    this.wasStunned = stunned;
    if (!stunned) return;
    const b = e.body;
    this.world.effects.burst(b.pos.x, b.pos.y, 0, C.unravel);
    this.world.sound('collapsarUnravel', b.pos, { pitch: e.type.sfxPitch });
  }

  // Embers off its loose strands, flung round the way they turn.
  shed(step) {
    if (!this.enemy.stunned) { this.sheds = 0; return; }
    const b = this.enemy.body, R = C.disc.band;
    for (this.sheds += C.shed.rate * step; this.sheds >= 1; this.sheds--) {
      const a = Math.random() * TAU;
      this.world.effects.burst(b.pos.x + Math.cos(a) * R, b.pos.y + Math.sin(a) * R, a + 0.9, C.shed);
    }
  }

  // Dust falling in on it, close by, a rush of it from as far as it pulls as it inhales, none
  // once it has let go.
  fall(step) {
    const I = C.infall, a = this.inhale, p = this.enemy.view.position;
    if (!this.enemy.view.visible) { this.infall.clear(); return; }
    const t = a?.phase === 'windup' ? clamp01((a.world.time - a.phaseStartedAt) / a.data.windUpTime) : 0, h = t > 0 ? lerp(0.35, 1, t) : 0;
    const S = {};
    for (const key of Object.keys(I.calm)) S[key] = lerp(I.calm[key], I.hard[key], h);
    this.infall.render(p.x, p.y, step, S, this.enemy.stunned ? 0 : 1, lerp(I.reach, a.data.pull.reach, h), I.inner);
  }

  // Struck: its disc flashes white with the rest of it.
  setFlash(on) {
    this.disc.texture = on ? tex.collapsar_disc_white : tex.collapsar_disc;
    this.wisps.texture = on ? tex.collapsar_wisps_white : tex.collapsar_wisps;
    this.strands.texture = on ? tex.collapsar_strands_white : tex.collapsar_strands;
  }

  onDeath() {
    this.world.add(new CollapsarImplosion(this.world, this.enemy, this.angle));
  }

  destroy() {
    this.infall.destroy();
    this.marks.destroy();
  }
}
