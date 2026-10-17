// Bloodthirst: every hit on an enemy draws a little life out of it into the player.
// It comes over as faint red mist: lines of it wander out of the enemy struck and curl in to
// the player, who's healed as the first of them reaches them.
import { Container } from 'pixi.js';
import { Aspect } from './aspect.js';
import { clamp01, deltaAngle, lerp, randRange, TAU } from '../engine/math.js';
import { tex } from '../render/assets.js';
import { Plume, Strand } from '../render/fx.js';

const DEG = Math.PI / 180;
const pick = ([min, max]) => randRange(min, max);
const alive = (t) => !t.dead && !t.dying;

export class BloodthirstAspect extends Aspect {
  constructor(player, data) {
    super(player, data);
    this.layer = new Container();
    player.world.layers.fx.addChild(this.layer);
    this.motes = new Plume(player.world.layers.fx, tex.glint, { drag: 1.5 });
    this.drains = [];
  }

  // Any hit at all (a burn's isn't one) heals, over the mist.
  onEnemyDamaged(enemy) {
    const d = this.data, heal = d.heal;
    const F = d.fx, from = { ...enemy.body.pos };
    const L = F.lines, room = Math.max(0, L.max - this.drains.reduce((n, dr) => n + dr.wisps.length, 0));
    const wisps = this.wispsFor(enemy, Math.min(room, Math.round(pick(L.count))));
    // Healed as the first line's head reaches the player.
    const first = wisps.reduce((t, w) => Math.min(t, w.delay), Infinity), arrive = L.time * (1 + L.trail) ** (-1 / L.rush);
    this.drains.push({ enemy, from, heal, healAt: this.now + (first === Infinity ? 0 : first) + arrive, age: 0, wisps });
    const P = F.puff;
    this.world.deathFx.flare(tex.mist, from.x, from.y, 0, { time: P.time, w0: P.size, h0: P.size, w1: P.size * P.grow, h1: P.size * P.grow, alpha: P.alpha, color0: F.bright, color1: F.deep });
    this.world.deathFx.scatter(this.motes, F.motes, from.x, from.y, enemy.body.radius * 0.6, F.red, { fade: F.deep, alpha: F.motes.alpha });
  }

  step() {
    const p = this.player;
    for (const d of this.drains) {
      if (d.heal <= 0 || this.now < d.healAt) continue;
      if (!p.dead && p.health < p.maxHealth) {
        p.heal(d.heal);
        this.used();
      }
      d.heal = 0;
    }
  }

  // Each line's path, worked out once in a frame of its own: the enemy at (0, 0), the player
  // `length` out along +x. It sets off from somewhere in the enemy's body, a good way off the
  // straight line, and turns this way and that at random (two wavering turns laid over each
  // other) while steered ever harder toward the player, so it curls in to them. Later the frame
  // is stretched to wherever the two are by then.
  wispsFor(enemy, count) {
    const L = this.data.fx.lines, Wd = L.wander, STEP = 0.03, p = this.player.body.pos, e = enemy.body.pos;
    const length = Math.max(0.3, Math.hypot(p.x - e.x, p.y - e.y)), turn0 = randRange(-1, 1);
    return Array.from({ length: count }, (_, i) => {
      const side = count > 1 ? lerp(-1, 1, i / (count - 1)) : turn0;
      const waves = [0, 1].map(() => ({ amp: pick(Wd.amp) * (Math.random() < 0.5 ? -1 : 1), freq: pick(Wd.freq), phase: Math.random() * TAU }));
      const r = enemy.body.radius * 0.5;
      let x = randRange(-r, r) * 0.5, y = randRange(-r, r), heading = (side * Wd.spreadDeg + randRange(-Wd.jitterDeg, Wd.jitterDeg)) * DEG;
      const pts = [[x, y]];
      for (let s = 0; s < length * 4 && Math.hypot(length - x, y) > STEP * 2; s += STEP) {
        const k = clamp01(x / length), off = deltaAngle(heading, Math.atan2(-y, length - x));
        heading += (waves.reduce((t, w) => t + w.amp * Math.sin(w.freq * s + w.phase), 0) * (1 - k) + off * Wd.pull * (1 + Wd.tighten * k)) * STEP;
        x += Math.cos(heading) * STEP;
        y += Math.sin(heading) * STEP;
        pts.push([x, y]);
      }
      pts.push([length, 0]);
      const lens = [0];
      for (let j = 1; j < pts.length; j++) lens.push(lens[j - 1] + Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]));
      const layers = L.layers.map((layer) => ({ strand: new Strand(this.layer, L.points, 0, 1, layer.color, 0, { texture: tex.bloom_wisp }), ...layer }));
      return { pts, lens, length, layers, delay: pick(L.delay), alpha: randRange(0.6, 1) };
    });
  }

  // The point `d` along a line's path, in its own frame.
  along({ pts, lens }, d) {
    let j = 1;
    while (j < lens.length - 1 && lens[j] < d) j++;
    const k = clamp01((d - lens[j - 1]) / (lens[j] - lens[j - 1] || 1));
    return [lerp(pts[j - 1][0], pts[j][0], k), lerp(pts[j - 1][1], pts[j][1], k)];
  }

  render(alpha, dt) {
    this.motes.update(dt);
    const F = this.data.fx, L = F.lines, p = this.player.body.lerpPos(alpha);
    for (const d of this.drains) {
      d.age += dt;
      if (alive(d.enemy)) d.from = d.enemy.body.lerpPos(alpha);
      // The frame from the enemy to the player, stretched along to fit and turned to face them.
      const dx = p.x - d.from.x, dy = p.y - d.from.y;
      const angle = Math.atan2(dy, dx), cos = Math.cos(angle), sin = Math.sin(angle);
      for (const wisp of d.wisps) {
        if (!wisp.layers) continue;
        const k = (d.age - wisp.delay) / L.time;
        if (k >= 1) { this.arrive(wisp, p); continue; }
        if (k < 0) continue;
        // Its trail runs along its path, speeding up into the player, `trail` of its length
        // long, drawn into them at the end.
        const stretch = Math.hypot(dx, dy) / wisp.length;
        const total = wisp.lens[wisp.lens.length - 1], h = k ** L.rush * (1 + L.trail);
        const head = Math.min(1, h) * total, tail = Math.max(0, h - L.trail) * total;
        for (const layer of wisp.layers) {
          const s = layer.strand, n = s.n;
          for (let i = 0; i < n; i++) {
            const [u, v] = this.along(wisp, lerp(tail, head, i / (n - 1))), x = u * stretch;
            s.pts[2 * i] = d.from.x + x * cos - v * sin;
            s.pts[2 * i + 1] = d.from.y + x * sin + v * cos;
            s.widths[i] = layer.width * lerp(0.4, 1, i / (n - 1));
          }
          s.build();
          s.mesh.alpha = layer.alpha * wisp.alpha * Math.min(1, k * 5);
          s.mesh.visible = head - tail > 1e-3;
        }
      }
      d.wisps = d.wisps.filter((w) => w.layers);
    }
    this.drains = this.drains.filter((d) => d.wisps.length || d.heal > 0);
  }

  // A line sinks into the player in a faint red bloom.
  arrive(wisp, p) {
    for (const layer of wisp.layers) layer.strand.destroy();
    wisp.layers = null;
    const F = this.data.fx, A = F.absorb, s = A.size * this.player.sizeScale;
    this.world.deathFx.flare(tex.mist, p.x, p.y, Math.random() * TAU, { time: A.time, w0: s, h0: s, w1: s * A.grow, h1: s * A.grow, alpha: A.alpha, color0: F.bright, color1: F.red });
  }

  dispose() {
    this.layer.destroy({ children: true });
    this.motes.destroy();
    this.drains = [];
  }
}
