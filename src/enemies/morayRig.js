// The Moray worked out every frame (tuning in MORAY): its long body along the path its head
// has taken (WallLurkAbility), waving as it goes, and two fangs that spread through a wind-up
// and snap shut as it strikes. It's drawn twice, so it can really be in the wall: once over
// the floor, cut to the floor tiles (a mask), and once dim under the floor (LevelView.under),
// where only the walls show it, the wall's stars over it. Passing under the outline it swells
// it out (LevelView.swell). Cosmetic; where it can be struck is the lair's (outline).
import { Container, Graphics, Sprite } from 'pixi.js';
import { MORAY as M } from '../data/config.js';
import { clamp01, lerp, lerpColor, smoothStep01, TAU } from '../engine/math.js';
import { tex } from '../render/assets.js';
import { clearGraphics } from '../render/fx.js';
import { MORAY_ART } from '../render/sprites.js';

const MARGIN = 1.5; // tiles round it that the mask covers
const progress = (a, now) => clamp01((now - a.phaseStartedAt) / Math.max(1e-3, a.phaseEndsAt - a.phaseStartedAt));

export class MorayRig {
  constructor(enemy) {
    this.enemy = enemy;
    const w = enemy.world, v = enemy.view;
    this.mask = new Graphics();
    this.clip = new Container();
    this.spine = new Graphics();
    w.layers.enemies.addChild(this.mask, this.clip);
    this.clip.addChild(this.spine, v);
    this.clip.mask = this.mask;
    this.maskKey = null;
    this.fangs = [-1, 1].map((side) => {
      const s = new Sprite(tex.moray_fang);
      s.anchor.set(MORAY_ART.fang.root / MORAY_ART.fang.w, 0.5);
      s.position.set(M.fang.x, side * M.fang.y);
      s.scale.set(1 / MORAY_ART.fang.unit, side === 1 ? -1 / MORAY_ART.fang.unit : 1 / MORAY_ART.fang.unit); // both curl in
      v.addChildAt(s, 1);
      s.side = side;
      return s;
    });
    // In the wall.
    this.ghost = new Container();
    this.ghost.alpha = M.ghostAlpha;
    this.ghostSpine = new Graphics(this.spine.context);
    this.ghostVoid = this.ghostSprite(enemy.visual.void);
    this.ghostOutline = this.ghostSprite(enemy.visual.outline);
    this.ghost.addChild(this.ghostSpine, this.ghostVoid, this.ghostOutline);
    w.levelView.under.addChild(this.ghost);
    this.gape = 0;
    this.phase = Math.random() * TAU; // through the body's wave
    this.amp = M.wave.inWall;
    this.flashing = false;
  }

  get world() { return this.enemy.world; }

  ghostSprite(name) {
    const s = new Sprite(tex[name]);
    s.anchor.set(0.5);
    s.width = s.height = this.enemy.visual.size;
    return s;
  }

  // How far its fangs should spread, 0…1.
  wantGape(now) {
    const e = this.enemy;
    if (e.stunned) return M.fang.slack;
    for (const a of e.abilities.values()) {
      if (a.phase === 'windup') return smoothStep01(progress(a, now));
      if (a.phase === 'active') return a.bitten ? 0 : 1;
    }
    return 0;
  }

  // After EnemyAttackFx has placed and posed the enemy's view for render time `now`.
  render(now, dt) {
    const e = this.enemy, lair = e.lair, b = e.body, v = e.view, W = M.wave;
    this.gape += (this.wantGape(now) - this.gape) * (1 - Math.exp(-dt / M.fang.ease));
    for (const f of this.fangs) f.rotation = f.side * lerp(M.fang.restDeg, M.fang.openDeg, this.gape) * (Math.PI / 180);

    const thrashing = e.stunned || lair.mode === 'pop', speed = Math.hypot(b.vel.x, b.vel.y);
    const want = thrashing ? W.thrash : lair.submerged ? W.inWall : W.out;
    this.amp += (want - this.amp) * (1 - Math.exp(-dt / W.ease));
    const pace = thrashing ? W.thrashPace : lerp(W.restPace, 1, clamp01(speed / e.type.ai.moveSpeed));
    this.phase = (this.phase + dt * W.speed * pace) % TAU;

    const pts = lair.walk(v.position.x, v.position.y, M.step, lair.length);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) {
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
    const view = this.world.camera.viewRect(2), seen = x1 + MARGIN >= view.x0 && x0 - MARGIN <= view.x1 && y1 + MARGIN >= view.y0 && y0 - MARGIN <= view.y1;
    this.clip.visible = this.ghost.visible = seen;
    if (!seen) return;
    v.visible = true; // its head may be just off screen with its body on it
    this.drawBody(pts);
    this.placeGhost();
    this.fitMask(x0, y0, x1, y1);
    this.swell(pts);
  }

  // Its width at `arc` along it from the head.
  widthAt(arc, whole) {
    const k = clamp01(arc / Math.max(whole, 1e-3)), { neck, tail, belly, bellyAt } = M.width;
    const swell = k < bellyAt ? lerp(1, belly, smoothStep01(k / bellyAt)) : lerp(belly, 1, smoothStep01((k - bellyAt) / (1 - bellyAt)));
    return lerp(neck, tail, k * k) * swell;
  }

  drawBody(pts) {
    const W = M.wave, n = pts.length, left = [], right = [], mid = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], c = pts[Math.min(n - 1, i + 1)];
      let tx = a.x - c.x, ty = a.y - c.y;
      const l = Math.hypot(tx, ty) || 1;
      tx /= l; ty /= l;
      const arc = i * M.step, grow = smoothStep01(arc / W.settleIn);
      const off = this.amp * grow * Math.sin(this.phase - arc * W.number), nx = -ty, ny = tx;
      const x = pts[i].x + nx * off, y = pts[i].y + ny * off, w = this.widthAt(arc, (n - 1) * M.step);
      mid.push({ x, y, nx, ny, w });
      left.push(x + nx * w, y + ny * w);
      right.push(x - nx * w, y - ny * w);
    }
    const outline = [...left];
    for (let i = n - 1; i >= 0; i--) outline.push(right[i * 2], right[i * 2 + 1]);
    const t = this.enemy.attackFx.tint, heat = t.visible ? t.alpha * 0.85 : 0, g = this.spine;
    const rim = (base) => (this.flashing ? 0xffffff : lerpColor(base, t.tint, heat));
    const fill = (base) => (this.flashing ? 0xffffff : base);
    clearGraphics(g);
    if (n < 2) return;
    g.poly(outline).stroke({ width: M.body.glowLine, color: rim(M.body.glow), alpha: M.body.glowAlpha, join: 'round' });
    g.poly(outline).stroke({ width: M.body.line, color: rim(M.body.outline), join: 'round' });
    g.poly(outline).fill({ color: fill(M.body.fill) });
    if (this.flashing) return;
    // Mottled down its back.
    for (let i = M.spots.from; i < n - 1; i += M.spots.every) {
      const m = mid[i], side = (i % (M.spots.every * 2) === M.spots.from ? 1 : -1) * M.spots.off;
      g.circle(m.x + m.nx * m.w * side, m.y + m.ny * m.w * side, m.w * M.spots.size).fill({ color: M.spots.color, alpha: M.spots.alpha });
    }
  }

  // Its head in the wall, where its head is.
  placeGhost() {
    const v = this.enemy.view;
    for (const s of [this.ghostVoid, this.ghostOutline]) {
      s.position.copyFrom(v.position);
      s.rotation = v.rotation;
    }
  }

  // The floor tiles round it, as a mask: remade only when those change.
  fitMask(x0, y0, x1, y1) {
    const ax = Math.floor(x0 - MARGIN), ay = Math.floor(y0 - MARGIN), bx = Math.ceil(x1 + MARGIN), by = Math.ceil(y1 + MARGIN);
    const key = `${ax},${ay},${bx},${by}`;
    if (key === this.maskKey) return;
    this.maskKey = key;
    const g = this.mask, physics = this.world.physics;
    g.clear();
    g.rect(ax, ay, 0.001, 0.001); // never empty: an empty mask hides nothing
    for (let y = ay; y < by; y++) {
      let run = null;
      for (let x = ax; x <= bx; x++) {
        const floor = x < bx && !physics.isWall(x, y);
        if (floor && run === null) run = x;
        else if (!floor && run !== null) { g.rect(run, y, x - run, 1); run = null; }
      }
    }
    g.fill(0xffffff);
  }

  // Where it runs under the outline, the outline swells out.
  swell(pts) {
    const physics = this.world.physics, S = M.swell;
    for (const [arc, depth] of S.along) {
      const p = pts[Math.round(arc / M.step)];
      if (p && physics.isWall(Math.floor(p.x), Math.floor(p.y))) this.world.levelView.swell(p.x, p.y, depth);
    }
  }

  setFlash(on) {
    this.flashing = on;
    for (const f of this.fangs) f.texture = on ? tex.moray_fang_white : tex.moray_fang;
    const v = this.enemy.visual;
    this.ghostVoid.texture = tex[on ? `${v.void}_white` : v.void];
    this.ghostOutline.texture = tex[on ? `${v.outline}_white` : v.outline];
  }

  // Sparks along its length, with the usual burst at its head (Enemy.burst).
  onDeath() {
    const e = this.enemy, b = e.body, color = e.hitColor;
    for (const p of e.lair.walk(b.pos.x, b.pos.y, M.deathEvery, e.lair.length)) {
      if (!this.world.physics.isWall(Math.floor(p.x), Math.floor(p.y))) this.world.effects.burst(p.x, p.y, Math.random() * TAU, { ...M.deathSparks, color });
    }
  }

  destroy() {
    this.clip.mask = null;
    this.ghost.destroy({ children: true });
    this.clip.destroy(); // not its children: the view is the enemy's to destroy
    this.spine.destroy();
    this.mask.destroy();
  }
}
