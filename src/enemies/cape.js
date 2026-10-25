// The Corsair's cape: one sheet of white cloth hanging off the back of its shoulders,
// simulated as cloth every frame (tuning in CAPES). It is a grid of points, `columns` wide
// across its back and `rows` long, the top row pinned along the body and the rest free:
//   - Each free point moves by Verlet integration: it remembers where it was last step and
//     keeps going the same way, losing a little speed to the air (`drag`). Nothing pushes
//     it along with the body, so when the Corsair moves or turns the cloth lags behind,
//     swings through and settles on its own.
//   - Sticks join the points (down each column, across each row, and corner to corner so
//     the cloth doesn't shear flat), and are nudged back a few times a step, so it stays
//     one piece of cloth however it is flung about. They act more like threads than rods:
//     they stop the cloth stretching but let it bunch up (seen from above, cloth folding
//     over looks just like that), easing back out only gently, and the corner-to-corner
//     ones hold only loosely. Rods braced corner to corner would make it a rigid frame in
//     2D, swinging about as one stiff sheet.
//   - Each point is also pulled toward where it would hang at rest behind the body, gently
//     at the hem and firmly at the shoulders; seen from above there is no gravity to make it
//     hang, so this stands in for it. Stunned, the pull weakens and the cloth sags.
//   - A wave running down it pushes the points sideways, harder the faster the Corsair
//     goes, so it flaps in the wind it makes.
//   - Points are pushed out of the body, so it drapes round it rather than through it.
//   - Anywhere it has been flung over onto itself is drawn back toward rest to unfold it.
// It steps at its own fixed rate, the pins carried smoothly from where the body was last
// frame to where it is now. Drawn under the body a quad at a time, each shaded by how
// bunched up it is: folds darken, cloth spread flat is bright. Purely cosmetic.
import { Graphics } from 'pixi.js';
import { CAPES as C, FIXED_DT } from '../data/config.js';
import { clamp01, deltaAngle, lerp, lerpColor, TAU } from '../engine/math.js';

const STEP = 1 / 120; // the cloth's own simulation step
const ROWS = C.rows + 1; // the pinned row and the rows hanging from it
const COLS = C.columns;
const COUNT = ROWS * COLS; // points, row by row, from its right shoulder to its left
const DEG = Math.PI / 180;
const at = (i, j) => i * COLS + j;

// The cape's points at rest in the Corsair's frame (+x forward, +y to its right): row by
// row from the shoulders, each column pinned round its back and hanging straight back in
// the middle, fanning out toward the sides.
export function capeRest() {
  const pts = [];
  for (let i = 0; i < ROWS; i++) {
    for (let j = 0; j < COLS; j++) {
      const u = 1 - (2 * j) / (COLS - 1), a = (180 - u * C.pins.spread) * DEG, h = (180 - u * C.fan) * DEG, d = i * C.segment;
      pts.push({ x: Math.cos(a) * C.pins.r + Math.cos(h) * d, y: Math.sin(a) * C.pins.r + Math.sin(h) * d });
    }
  }
  return pts;
}

// The quads between the points, each [top left, top right, bottom right, bottom left]
// (indices), row by row.
const QUADS = [];
for (let i = 0; i < ROWS - 1; i++) {
  for (let j = 0; j < COLS - 1; j++) QUADS.push([at(i, j), at(i, j + 1), at(i + 1, j + 1), at(i + 1, j)]);
}

// Twice the signed area of a quad: its sign says which way round it goes, so which way up
// the cloth is there.
const signedArea = (q) => {
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const [x0, y0] = q[i], [x1, y1] = q[(i + 1) % 4];
    s += x0 * y1 - x1 * y0;
  }
  return s;
};
const quadArea = (q) => Math.abs(signedArea(q));

export class Cape {
  constructor(enemy, parent, index) {
    this.enemy = enemy;
    this.rest = capeRest();
    this.x = new Float64Array(COUNT);
    this.y = new Float64Array(COUNT);
    this.ox = new Float64Array(COUNT); // where each point was last step
    this.oy = new Float64Array(COUNT);
    this.sticks = []; // [a, b, rest length, how much of the overstretch it takes back a pass]
    const stick = (a, b, strength = 1) => this.sticks.push([a, b, Math.hypot(this.rest[a].x - this.rest[b].x, this.rest[a].y - this.rest[b].y), strength]);
    for (let i = 0; i < ROWS; i++) {
      for (let j = 0; j < COLS; j++) {
        if (i < ROWS - 1) stick(at(i, j), at(i + 1, j)); // down
        if (i > 0 && j < COLS - 1) stick(at(i, j), at(i, j + 1)); // across (the pinned row can't stretch)
      }
    }
    for (const [a, b, c, d] of QUADS) { stick(a, c, C.shear); stick(b, d, C.shear); } // corner to corner
    const rest = this.rest.map((p) => [p.x, p.y]);
    this.restArea = QUADS.map((q) => quadArea(q.map((k) => rest[k])));
    this.restSign = QUADS.map((q) => Math.sign(signedArea(q.map((k) => rest[k]))));
    // The way each column hangs at rest, in the Corsair's frame (radians).
    this.hang = Array.from({ length: COLS }, (_, j) => Math.atan2(this.rest[at(1, j)].y - this.rest[j].y, this.rest[at(1, j)].x - this.rest[j].x));
    this.tx = new Float64Array(COUNT); // where each point would hang at rest, this step
    this.ty = new Float64Array(COUNT);
    this.frame = null; // the body as last stepped: { x, y, rot }
    this.facing = 0; // the body's facing, eased (see render)
    this.carry = 0; // time not yet simulated
    this.wave = 0; // radians through the flutter's wave
    this.g = new Graphics();
    parent.addChildAt(this.g, index);
  }

  // A point in the Corsair's frame → the world, for the body placed at `f`.
  toWorld(f, p) {
    const c = Math.cos(f.rot), s = Math.sin(f.rot);
    return { x: f.x + c * p.x - s * p.y, y: f.y + s * p.x + c * p.y };
  }

  // Laid out at rest, still.
  reset(f) {
    this.rest.forEach((p, k) => {
      const w = this.toWorld(f, p);
      this.x[k] = this.ox[k] = w.x;
      this.y[k] = this.oy[k] = w.y;
    });
  }

  // After the rig has posed the enemy's view for render time `now`. `stunned`: it sags.
  // Pinned to the body itself, where it is at `now`, not to its view, whose wind-up
  // trembles, strike pops and twists would shake the cloth; and turned with its facing
  // eased over `turnEase`, as the AI's steering twitches it back and forth a little.
  render(now, dt, stunned, tint, flashing) {
    const b = this.enemy.body, alpha = clamp01(1 - (this.enemy.world.time - now) / FIXED_DT), at = b.lerpPos(alpha);
    const facing = b.lerpRotation(alpha), ease = dt > 0 ? 1 - Math.exp(-dt / C.turnEase) : 0;
    this.facing = this.frame ? this.facing + deltaAngle(this.facing, facing) * ease : facing;
    const f1 = { x: at.x, y: at.y, rot: this.facing }, f0 = this.frame ?? f1;
    if (!this.frame || Math.hypot(f1.x - f0.x, f1.y - f0.y) > 3) this.reset(f1); // first frame, or teleported
    this.frame = f1;
    const vel = this.enemy.body.vel, pace = clamp01(Math.hypot(vel.x, vel.y) / C.flutter.top);
    this.carry = Math.min(this.carry + dt, 0.1);
    const steps = Math.floor(this.carry / STEP), turn = deltaAngle(f0.rot, f1.rot);
    for (let s = 1; s <= steps; s++) {
      const k = s / steps;
      this.simulate({ x: lerp(f0.x, f1.x, k), y: lerp(f0.y, f1.y, k), rot: f0.rot + turn * k }, pace, stunned);
    }
    this.carry -= steps * STEP;
    if (this.enemy.view.visible) this.draw(tint, flashing); // out of sight, it flutters on undrawn
  }

  // One step: the pins follow the body, the free points carry on, pulled toward rest and
  // pushed by the flutter, then the sticks and the body put them back in shape.
  simulate(f, pace, stunned) {
    const F = C.flutter, keep = 1 - C.drag, pull = stunned ? C.stunned : 1;
    this.wave += STEP * TAU * lerp(F.freq[0], F.freq[1], pace);
    const flap = F.amount * lerp(F.idle, 1, pace);
    for (let k = 0; k < COUNT; k++) {
      const to = this.toWorld(f, this.rest[k]), row = Math.floor(k / COLS), col = k % COLS;
      this.tx[k] = to.x;
      this.ty[k] = to.y;
      if (row === 0) { // pinned
        this.x[k] = this.ox[k] = to.x;
        this.y[k] = this.oy[k] = to.y;
        continue;
      }
      const along = row / (ROWS - 1), stiff = lerp(C.stiffness[0], C.stiffness[1], along) * pull;
      // Sideways to the way its column hangs at rest, turned with the body (not the cloth's
      // own shape, which would feed its shaking back into the push).
      const hang = this.hang[col] + f.rot, push = flap * along * Math.sin(this.wave - row * F.lag + col * F.across);
      const ax = (to.x - this.x[k]) * stiff - Math.sin(hang) * push, ay = (to.y - this.y[k]) * stiff + Math.cos(hang) * push;
      const vx = (this.x[k] - this.ox[k]) * keep, vy = (this.y[k] - this.oy[k]) * keep;
      this.ox[k] = this.x[k];
      this.oy[k] = this.y[k];
      this.x[k] += vx + ax * STEP * STEP;
      this.y[k] += vy + ay * STEP * STEP;
    }
    const clear = C.clear;
    for (let n = 0; n < C.iterations; n++) {
      for (const [a, b, rest, strength] of this.sticks) {
        const dx = this.x[b] - this.x[a], dy = this.y[b] - this.y[a], d = Math.hypot(dx, dy) || 1e-6;
        // Bunched up, it only eases back out (or it would pile up, every flap shortening it).
        const give = d < rest ? C.bunch : 1;
        // A pinned point doesn't give: the free one takes it all.
        const wa = a < COLS ? 0 : 1, wb = b < COLS ? 0 : 1, share = ((d - rest) / d / (wa + wb)) * strength * give;
        this.x[a] += dx * share * wa; this.y[a] += dy * share * wa;
        this.x[b] -= dx * share * wb; this.y[b] -= dy * share * wb;
      }
      for (let k = COLS; k < COUNT; k++) {
        const dx = this.x[k] - f.x, dy = this.y[k] - f.y, d = Math.hypot(dx, dy);
        if (d < clear && d > 1e-6) { this.x[k] = f.x + (dx / d) * clear; this.y[k] = f.y + (dy / d) * clear; }
      }
    }
    // A cloth folded over itself fits its sticks just as well as one lying flat (a mirrored
    // quad has the same sides and diagonals), so nothing above would undo it: wherever a
    // quad has turned well over (not just squashed flat, flickering either way), its lower
    // corners are drawn back toward rest until it flips back.
    QUADS.forEach((q, n) => {
      if (signedArea(q.map((k) => [this.x[k], this.y[k]])) * this.restSign[n] >= -C.flipped * this.restArea[n]) return;
      for (const k of [q[2], q[3]]) {
        this.x[k] += (this.tx[k] - this.x[k]) * C.unfold;
        this.y[k] += (this.ty[k] - this.y[k]) * C.unfold;
      }
    });
  }

  // Drawn in the view's frame (under its pose), so it sits under the body. Flashing it all
  // goes white; winding up only its outline warms, as the body's does.
  draw(tint, flashing) {
    const v = this.enemy.view, c = Math.cos(-v.rotation), s = Math.sin(-v.rotation), col = C.color;
    const pts = [];
    for (let k = 0; k < COUNT; k++) {
      const dx = this.x[k] - v.position.x, dy = this.y[k] - v.position.y;
      pts.push([(c * dx - s * dy) / v.scale.x, (s * dx + c * dy) / v.scale.y]);
    }
    // Round the edge: along the shoulders, down its left side, back along the hem, up its right.
    const hem = Array.from({ length: COLS }, (_, j) => pts[at(ROWS - 1, j)]);
    const outline = [
      ...pts.slice(0, COLS), ...Array.from({ length: ROWS - 1 }, (_, i) => pts[at(i + 1, COLS - 1)]),
      ...[...hem].reverse().slice(1), ...Array.from({ length: ROWS - 2 }, (_, i) => pts[at(ROWS - 2 - i, 0)]),
    ].flat();
    const heat = tint.visible ? tint.alpha * 0.85 : 0, rim = (base) => (flashing ? 0xffffff : lerpColor(base, tint.tint, heat));
    const g = this.g;
    g.clear();
    g.poly(outline).stroke({ width: C.glowLine, color: rim(col.glow), alpha: C.glowAlpha, join: 'round' });
    g.poly(outline).stroke({ width: C.line * 2, color: rim(col.outline), join: 'round' });
    const [f0, f1] = C.fold;
    QUADS.forEach((q, n) => {
      const corners = q.map((k) => pts[k]), row = Math.floor(n / (COLS - 1));
      const spread = clamp01((quadArea(corners) / this.restArea[n] - f0) / (f1 - f0));
      const light = spread * lerp(0.8, 1, (row + 1) / (ROWS - 1)); // a touch darker up under the body
      g.poly(corners.flat()).fill({ color: flashing ? 0xffffff : lerpColor(col.shadow, col.light, light) });
    });
    g.poly(hem.flat(), false).stroke({ width: C.hem, color: flashing ? 0xffffff : col.hem, cap: 'round', join: 'round' });
  }

  // Where its points are in the world (sparks fly off them as the Corsair dies).
  points() { return Array.from({ length: COUNT }, (_, k) => ({ x: this.x[k], y: this.y[k] })); }
}
