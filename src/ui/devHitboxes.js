// Dev-only hitbox view, switched on from the dev menu (B): every enemy attack that can hurt
// the player right now filled green, lingering a moment as an outline after it stops so a
// quick strike can be seen at full speed; the player's swing and parry outlined in pale
// green while they're out; every enemy's and prop's hurtbox (game/hurtbox.js) and the
// player's body faintly in white. Shapes are drawn where the
// simulation has them, which a moving body's sprite (drawn between steps) can trail by up
// to a step.
import { Graphics } from 'pixi.js';
import { devFlags } from '../game/devFlags.js';
import { hurtShape } from '../game/hurtbox.js';

const ATTACK = 0x33ff66, OWN = 0xb8ffc8, BODY = 0xffffff;
const LINE = 0.04, LINGER = 0.4; // seconds an attack's last shape stays after it stops hurting

export class DevHitboxes {
  constructor(world) {
    this.world = world;
    this.g = new Graphics();
    world.layers.fx.addChild(this.g);
    this.recent = new Map(); // attack → { shape, at }: its shape when it could last hurt
  }

  update() {
    const g = this.g, w = this.world, on = devFlags.hitboxes;
    g.clear();
    g.visible = on;
    if (!on) { this.recent.clear(); return; }
    for (const a of w.hostileAttacks) this.recent.set(a, { shape: a.worldShape(), at: w.time });

    for (const e of w.enemies) this.draw(hurtShape(e), BODY, 0, 0.5);
    for (const p of w.props) if (!p.dead && p.body) this.draw(hurtShape(p), BODY, 0, 0.3);
    const p = w.livePlayer;
    if (p) {
      this.draw({ type: 'circle', x: p.body.pos.x, y: p.body.pos.y, r: p.body.radius }, BODY, 0, 0.6);
      if (p.attacking) this.draw({ type: 'capsule', ...p.attackCapsule() }, OWN, 0.15, 0.9);
      if (p.parrying) this.draw({ type: 'capsule', ...p.parryCapsule() }, OWN, 0.25, 1);
    }

    for (const [a, { shape, at }] of this.recent) {
      const k = (w.time - at) / LINGER;
      if (k >= 1) this.recent.delete(a);
      else if (k <= 0) this.draw(shape, ATTACK, 0.3, 1);
      else this.draw(shape, ATTACK, 0, 0.8 * (1 - k));
    }
  }

  // One world shape (EnemyHitbox.worldShape's forms, or a capsule) filled at `fill` and
  // outlined at `line` alpha.
  draw(s, color, fill, line) {
    if (s.type === 'group') { for (const part of s.parts) this.draw(part, color, fill, line); return; }
    const g = this.g;
    const path = () => {
      if (s.type === 'circle' && s.minCos !== undefined) {
        const dir = Math.atan2(s.fy, s.fx), half = Math.acos(s.minCos);
        return g.moveTo(s.x, s.y).arc(s.x, s.y, s.r, dir - half, dir + half).closePath();
      }
      if (s.type === 'circle') return g.circle(s.x, s.y, s.r);
      if (s.type === 'poly') return g.poly(s.points.flatMap((q) => [q.x, q.y]));
      if (s.type === 'box') {
        const c = Math.cos(s.angle), sn = Math.sin(s.angle);
        const at = (u, v) => [s.x + c * u - sn * v, s.y + sn * u + c * v];
        return g.poly([...at(-s.hw, -s.hh), ...at(s.hw, -s.hh), ...at(s.hw, s.hh), ...at(-s.hw, s.hh)]);
      }
      // A capsule: its spine from a to b, rounded r at both ends. Started with a moveTo, or the
      // first arc would be joined on from wherever the last path ended.
      const a = Math.atan2(s.by - s.ay, s.bx - s.ax), up = a + Math.PI / 2;
      return g.moveTo(s.ax + Math.cos(up) * s.r, s.ay + Math.sin(up) * s.r)
        .arc(s.ax, s.ay, s.r, up, a + (3 * Math.PI) / 2).arc(s.bx, s.by, s.r, a - Math.PI / 2, up).closePath();
    };
    if (fill > 0) path().fill({ color, alpha: fill });
    if (line > 0) path().stroke({ width: LINE, color, alpha: line });
  }

  destroy() { this.g.destroy(); }
}
