// Antlers: a stag's antlers on the player's brow that gore whatever they meet, a little at a
// touch and hard when dashed into. They begin as two nubs and grow with every kill of the run
// into a full crown, and once grown they whiten from the base out until they glow; the harm
// they do grows all the while.
import { Container, Graphics, Sprite } from 'pixi.js';
import { Aspect } from './aspect.js';
import { clamp01, deltaAngle, isZero, lerp, lerpColor, randRange, smoothStep01, TAU } from '../engine/math.js';
import { hurtBySegment } from '../game/hurtbox.js';
import { tex } from '../render/assets.js';
import { Plume } from '../render/fx.js';
import { antlerParts, mirrored } from '../render/antlerShape.js';

const U = 100; // the antlers are drawn this many times their size and scaled down, as Graphics keeps its detail
const pick = ([min, max]) => randRange(min, max);

export class AntlersAspect extends Aspect {
  constructor(player, data) {
    super(player, data);
    const w = player.world;
    // The kills are the run's, not the floor's: the player is rebuilt on every floor.
    this.state = (w.session.aspectState[data.id] ??= { kills: 0 });
    this.offKilled = w.events.enemyKilled.on(() => { this.state.kills++; });
    this.view = new Container();
    this.halo = new Container();
    this.gfx = new Graphics();
    this.gfx.scale.set(1 / U);
    this.view.addChild(this.halo, this.gfx);
    w.layers.player.addChild(this.view); // over the body
    this.puffs = [];
    this.glints = new Plume(w.layers.fx, tex.glint, { drag: 1.5 });
    this.glintDebt = 0;
    this.breath = Math.random() * TAU;
    const f = player.facing;
    this.angle = this.prevAngle = isZero(f) ? 0 : Math.atan2(f.y, f.x);
    this.rammed = new Set(); // struck by this dash
    this.touchedAt = new Map(); // enemy → when they last struck it
    // How far out the furthest tip is, full grown: the white has reached it once they're all white.
    this.whiteReach = Math.max(...antlerParts(data.shape, 1).flatMap((part) => part.map((pt) => pt.d)));
    this.shown = this.target; // what's drawn, easing into each new size
    this.rebuild();
  }

  get kills() { return Math.min(this.state.kills, this.data.scale.maxKills); }
  // How hard they strike: a multiple of their base damage.
  get strength() { const S = this.data.scale; return S.start + S.step * Math.floor(this.kills / S.every); }
  // Growth over the first half of the way to full strength, whiteness over the second.
  get target() {
    const k = this.kills / this.data.scale.maxKills;
    return { growth: clamp01(k * 2), white: clamp01(k * 2 - 1) };
  }

  onDash() { this.rammed.clear(); }

  // They face where the player aims.
  step() {
    const f = this.player.facing;
    this.prevAngle = this.angle;
    if (!isZero(f)) this.angle = Math.atan2(f.y, f.x);
  }

  afterPhysics() {
    const p = this.player, w = this.world;
    if (p.hidden || p.shrouded) return;
    const segs = this.segments(), { x, y } = p.body.pos, reach = this.extent * p.sizeScale * p.bodyScale;
    const struck = (t) => {
      const r = reach + t.body.radius + 1; // past their furthest point, it can't be touching
      if ((t.body.pos.x - x) ** 2 + (t.body.pos.y - y) ** 2 > r * r) return false;
      return segs.some(([ax, ay, bx, by, sr]) => hurtBySegment(t, ax, ay, bx, by, sr));
    };
    for (const e of w.enemies) {
      if (e.dead || e.dying || !struck(e)) continue;
      if (p.dashing && !this.rammed.has(e)) {
        this.rammed.add(e);
        this.gore(e, true);
      } else if (this.now - (this.touchedAt.get(e) ?? -Infinity) >= this.data.touchCooldown) {
        this.gore(e, false);
      }
    }
    if (!p.dashing) return;
    for (const prop of w.props) {
      if (prop.dead || this.rammed.has(prop) || !struck(prop)) continue;
      this.rammed.add(prop);
      this.gore(prop, true);
    }
  }

  // `t` meets the antlers: rammed (dashed into) or just touched.
  gore(t, ram) {
    const d = this.data, F = d.fx, w = this.world, p = this.player;
    const src = { ...p.body.pos }, at = t.closestPoint(src);
    const damage = (ram ? d.ramDamage : d.touchDamage) * this.strength * w.adrenaline.damageMultiplier;
    t.takeDamage(damage, at, src, d.id);
    if (!t.dead && !t.isProp) t.applyKnockback(ram ? d.ramKnockback : d.touchKnockback, src);
    this.touchedAt.set(t, this.now);
    const angle = Math.atan2(at.y - src.y, at.x - src.x), color = lerpColor(F.color, F.white, this.shown.white);
    w.effects.burst(at.x, at.y, angle, { ...(ram ? F.ram : F.touch).sparks, color });
    if (!ram) return;
    p.view.playHitImpact(at);
    const S = F.ram.shake;
    w.camera.shake(S.duration, S.strength, S.frequency);
  }

  // Where they strike, in the world: capsules [ax, ay, bx, by, radius] along each part.
  segments() {
    const p = this.player, k = p.sizeScale * p.bodyScale, { x, y } = p.body.pos;
    const c = Math.cos(this.angle) * k, s = Math.sin(this.angle) * k;
    return this.hits.map(([ax, ay, bx, by, r]) => [x + c * ax - s * ay, y + s * ax + c * ay, x + c * bx - s * by, y + s * bx + c * by, r * k]);
  }

  render(alpha, dt) {
    const p = this.player, F = this.data.fx, body = p.view.body;
    this.glints.update(dt);
    // Easing into their new size (redrawn as it goes, not for every hair of it).
    const target = this.target, k = 1 - Math.exp(-dt / F.ease), s = this.shown;
    if (s.growth !== target.growth || s.white !== target.white) {
      const near = (a, b) => Math.abs(a - b) < 1e-4;
      s.growth = near(s.growth, target.growth) ? target.growth : lerp(s.growth, target.growth, k);
      s.white = near(s.white, target.white) ? target.white : lerp(s.white, target.white, k);
      const done = s.growth === target.growth && s.white === target.white;
      if (done || Math.abs(s.growth - this.drawn.growth) + Math.abs(s.white - this.drawn.white) > 5e-4) this.rebuild();
    }

    const shown = body.visible && !p.death && !p.hidden && !p.shrouded;
    this.view.visible = shown;
    if (!shown) return;
    this.view.position.copyFrom(body.position);
    this.view.rotation = this.prevAngle + deltaAngle(this.prevAngle, this.angle) * alpha;
    this.view.scale.set(p.sizeScale * p.bodyScale);
    this.view.alpha = p.bodyAlpha;
    // The glow breathes; glints drift off the white.
    const G = F.glow, I = F.glints;
    this.breath += dt * G.pulse * TAU;
    this.halo.alpha = 1 - G.breathe * (0.5 + 0.5 * Math.sin(this.breath));
    if (!this.whitePts.length || dt <= 0) return;
    this.glintDebt += dt * I.rate * s.white;
    const c = Math.cos(this.view.rotation), sn = Math.sin(this.view.rotation), scale = this.view.scale.x;
    for (; this.glintDebt >= 1; this.glintDebt--) {
      const pt = this.whitePts[Math.floor(Math.random() * this.whitePts.length)], a = Math.random() * TAU, v = pick(I.speed);
      this.glints.spawn({
        x: body.x + (c * pt.x - sn * pt.y) * scale, y: body.y + (sn * pt.x + c * pt.y) * scale,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v, size: pick(I.size), life: pick(I.life), color: F.white, alpha: I.alpha,
      });
    }
  }

  // Redraws them as shown: bone, whitening from the base out, its glow, and where they strike.
  rebuild() {
    const D = this.data, S = D.shape, F = D.fx, { growth, white } = this.shown;
    this.drawn = { growth, white };
    const right = antlerParts(S, growth), parts = [...right, ...mirrored(right)];
    const whiteness = (d) => smoothStep01(clamp01((white * (1 + F.band) - d / this.whiteReach) / F.band));
    // They grow out of the body: black at the root, where it's black, coming into colour
    // before they cross its outline.
    const R = F.root, rooted = (pt) => smoothStep01(clamp01((Math.hypot(pt.x, pt.y) - R.from) / (R.to - R.from)));
    const O = F.outline, color = (pt) => lerpColor(R.color, lerpColor(F.color, F.white, whiteness(pt.d)), rooted(pt));
    const edge = (pt) => lerpColor(R.color, lerpColor(O.color, O.white, whiteness(pt.d)), rooted(pt));

    // One silhouette: the outline of every part, drawn out to a point past each tip, then every
    // part filled in over it, the stroke eating into the fill as much as it stands outside it.
    const g = this.gfx.clear();
    for (const part of parts) ribbon(g, part, (pt) => pt.w + O.outer, edge, O.outer * O.point);
    for (const part of parts) ribbon(g, part, (pt) => Math.max(0, pt.w - Math.min(O.inner, pt.w * O.keep)), color);

    // Soft light along the white, and where glints come off it.
    const G = F.glow;
    let used = 0;
    this.whitePts = [];
    for (const part of parts) {
      for (const pt of part) {
        const k = whiteness(pt.d) * rooted(pt);
        if (k > 0.6) this.whitePts.push(pt);
        if (k <= 0.02) continue;
        const puff = this.puffs[used++] ??= this.halo.addChild(Object.assign(new Sprite(tex.mist), { blendMode: 'add' }));
        puff.anchor.set(0.5);
        puff.position.set(pt.x, pt.y);
        puff.width = puff.height = G.size * (pt.w + 0.02);
        puff.tint = F.white;
        puff.alpha = k * G.alpha;
        puff.visible = true;
      }
    }
    for (let i = used; i < this.puffs.length; i++) this.puffs[i].visible = false;

    // Capsules along each part, every other point, as wide as it is there and a little more.
    this.hits = [];
    this.extent = 0;
    for (const part of parts) {
      for (let i = 0; i < part.length - 1; i += 2) {
        const a = part[i], b = part[Math.min(part.length - 1, i + 2)];
        this.hits.push([a.x, a.y, b.x, b.y, Math.max(a.w, b.w) + S.reach]);
        this.extent = Math.max(this.extent, Math.hypot(b.x, b.y));
      }
    }
  }

  dispose() {
    this.offKilled();
    this.view.destroy({ children: true });
    this.glints.destroy();
  }
}

// A tapered strip along `pts`, `widthOf` each point wide (a half-width), coloured along its
// length, carried on to a point `tip` past the last.
function ribbon(g, pts, widthOf, colorOf, tip = 0) {
  if (pts.length < 2) return;
  if (tip > 0) {
    const a = pts[pts.length - 2], b = pts[pts.length - 1], l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    pts = [...pts, { ...b, x: b.x + ((b.x - a.x) / l) * tip, y: b.y + ((b.y - a.y) / l) * tip, w: 0, end: true }];
  }
  const n = pts.length;
  const sides = pts.map((pt, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const tx = b.x - a.x, ty = b.y - a.y, w = (pt.end ? 0 : widthOf(pt)) / (Math.hypot(tx, ty) || 1);
    return [(pt.x - ty * w) * U, (pt.y + tx * w) * U, (pt.x + ty * w) * U, (pt.y - tx * w) * U];
  });
  const colors = pts.map(colorOf);
  for (let i = 0; i < n - 1; i++) {
    const [lx0, ly0, rx0, ry0] = sides[i], [lx1, ly1, rx1, ry1] = sides[i + 1];
    g.poly([lx0, ly0, lx1, ly1, rx1, ry1, rx0, ry0]).fill({ color: lerpColor(colors[i], colors[i + 1], 0.5) });
  }
}
