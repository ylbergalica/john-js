// The Collapsar's disc, worked out every frame (tuning in COLLAPSAR): a hot band and violet
// wisps turning round its body, the outer slower, easing to the look its attack names (its
// data's `pose`), so the faster it spins the nearer the blow. Inhaling it tightens and burns
// brightest, streaks rushing in. Stunned, its disc unravels into strands and goes dim, shedding
// embers, all its gravity let go. Streaks fall in on it as long as its gravity has hold, and it
// flares as it throws something. When it dies, it leaves a CollapsarImplosion, which is its
// death's whole look (`detonated`). Cosmetic.
import { Sprite } from 'pixi.js';
import { COLLAPSAR as C } from '../data/config.js';
import { clamp01, lerp, TAU } from '../engine/math.js';
import { tex } from '../render/assets.js';
import { COLLAPSAR_ART } from '../render/sprites.js';
import { CollapsarImplosion, Infall } from './gravity.js';

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
    this.gravity = [...enemy.abilities.values()].find((a) => a.data.type === 'gravity');
    this.inhale = [...enemy.abilities.values()].find((a) => a.data.type === 'inhale');
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

  // Dust falling in on it, a rush of it as it inhales, none once it has let go.
  fall(step) {
    const I = C.infall, a = this.inhale, p = this.enemy.view.position;
    if (!this.enemy.view.visible) { this.infall.clear(); return; }
    const t = a?.phase === 'windup' ? clamp01((a.world.time - a.phaseStartedAt) / a.data.windUpTime) : 0, h = t > 0 ? lerp(0.35, 1, t) : 0;
    const S = {};
    for (const key of Object.keys(I.calm)) S[key] = lerp(I.calm[key], I.hard[key], h);
    const reach = lerp(this.gravity.data.reach, a.data.pull.reach, h);
    this.infall.render(p.x, p.y, step, S, this.gravity.pull, reach, I.inner);
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

  destroy() { this.infall.destroy(); }
}
