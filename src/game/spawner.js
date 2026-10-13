// Spawners (PROPS.spawner, SPAWNERS): wounds in the void set into the corners of a few
// rooms, rooted to the spot, that birth the floor's foes now and then, so a floor never runs
// dry of adrenaline. A prop like any other to the player's attacks, only tougher: it
// throbs like a heart, quickening as it births, and struck down it caves in on itself
// before it bursts, spilling adrenaline or mends and always a boon, and angering the
// floor's guardians (GuardianRage.spawnerBroken).
import { Sprite } from 'pixi.js';
import { Prop, shuffle } from './props.js';
import { ENEMY_TYPES, FIXED_DT, PROPS, SPAWNERS } from '../data/config.js';
import { clamp01, dist, lerp, pickWeighted, randInsideUnitCircle, randInt, randRange, TAU } from '../engine/math.js';
import { spawnerTextures, tex } from '../render/assets.js';
import { RING_RADIUS } from '../render/sprites.js';

const BEAT = { period: 1.5, birthPeriod: 0.45, swell: 0.06, release: 0.22, releaseTime: 0.35 }; // its heartbeat (seconds, fractions of its size)

export class Spawner extends Prop {
  constructor(world, typeKey, x, y) {
    // Its own art, grown from a seed of its own so no two look alike (spawnerSprites); the
    // floor frees it once its burst can no longer be showing it (World.floorTextures).
    const textures = spawnerTextures(1 + Math.floor(Math.random() * 1e6));
    super(world, typeKey, x, y, textures);
    world.floorTextures.push(textures.white, ...textures.stages);
    this.isSpawner = true;
    // A pool of darkness it sits in, drinking the light around it.
    this.dark = new Sprite(tex.mist);
    this.dark.anchor.set(0.5);
    this.dark.tint = 0x000000;
    this.view.addChildAt(this.dark, 0);
    this.nextBirthAt = world.time + randRange(...SPAWNERS.firstAfter);
    this.birth = null; // { at, pos, key, angle } while a foe is being born
    this.bornAt = -Infinity; // when the last one tore free
    this.collapse = null; // { at, dir } while it caves in, struck down
    this.beatPhase = Math.random();
    this.home = { x, y }; // rooted here: whatever pushes on it, it stays put
  }

  afterPhysics() {
    const b = this.body;
    b.pos.x = this.home.x; b.pos.y = this.home.y;
    b.vel.x = b.vel.y = 0;
  }

  step() {
    const w = this.world;
    if (this.collapse) {
      if (w.time < this.collapse.at + this.type.collapse.time) return;
      super.shatter(this.collapse.dir);
      w.session.spawnerBroken(); // counted, and worth coins (COINS.spawnerBroken)
      // The guardians take it badly: angry at the first broken, furious at the last.
      w.rage.spawnerBroken(!w.props.some((p) => p.isSpawner && !p.dead));
      return;
    }
    if (this.birth) {
      if (w.time >= this.birth.at + SPAWNERS.telegraph) this.deliver();
      return;
    }
    if (w.time < this.nextBirthAt) return;
    this.nextBirthAt = w.time + randRange(...SPAWNERS.every);
    this.conceive();
  }

  // Picks a foe of the floor's mix and a spot for it, unless the floor is done, the player
  // is gone or it already has company enough around it.
  conceive() {
    const w = this.world, S = SPAWNERS, p = w.livePlayer, { x, y } = this.body.pos;
    if (!p || !w.spawnTable.length || !w.spawnersActive) return;
    let near = 0;
    for (const e of w.enemies) if (!e.type.isChaser && (e.body.pos.x - x) ** 2 + (e.body.pos.y - y) ** 2 < S.radius ** 2) near++;
    if (near >= S.crowd) return;
    const key = pickWeighted(w.spawnTable).type, r = ENEMY_TYPES[key].radius;
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * TAU, d = randRange(...S.distance), c = Math.cos(a), s = Math.sin(a);
      const pos = { x: x + c * d, y: y + s * d };
      if (w.physics.rayLength(x, y, c, s, d + r) < d + r) continue; // out of its sight
      if (!w.physics.isCircleFree(pos.x, pos.y, r * 1.2)) continue;
      if (dist(pos, p.body.pos) < S.clearOfPlayer) continue;
      this.birth = { at: w.time, pos, key, angle: a };
      this.telegraph(pos);
      w.sound('spawnerBirth', this.body.pos);
      return;
    }
  }

  // Where it will come: a red swirl gathering on the spot as a ring closes in on it.
  telegraph({ x, y }) {
    const S = SPAWNERS, G = S.gather, fx = this.world.deathFx, color = this.type.color;
    const [from, to] = G.size;
    fx.flare(tex.mist, x, y, 0, { time: S.telegraph, w0: to, h0: to, w1: from, h1: from, alpha: G.alpha, fade: 0.35, color0: 0x300000, color1: color });
    const r0 = from / RING_RADIUS / 2, r1 = to / RING_RADIUS / 4;
    fx.flare(tex.ring, x, y, 0, { time: S.telegraph, w0: r0, h0: r0, w1: r1, h1: r1, alpha: 0.6, fade: 0.5, color0: 0x5a0008, color1: color });
  }

  // The foe tears free, facing the player, a moment before it can move.
  deliver() {
    const w = this.world, { pos, key, angle } = this.birth, color = this.type.color;
    this.birth = null;
    this.bornAt = w.time;
    const e = w.spawnEnemy(key, pos);
    const p = w.livePlayer;
    e.body.rotation = e.body.prevRotation = p ? Math.atan2(p.body.pos.y - pos.y, p.body.pos.x - pos.x) : angle;
    e.ai.suppressMovementFor(0.35);
    // Its silhouette closing in out of red light, as it takes shape.
    const sil = e.silhouette;
    w.deathFx.flare(sil.texture, pos.x, pos.y, e.body.rotation, {
      time: 0.4, w0: sil.width * 1.8, h0: sil.height * 1.8, w1: sil.width, h1: sil.height, alpha: 0.9, color0: color, color1: 0xffffff,
    });
    w.flareAt(pos, SPAWNERS.flare, color);
  }

  takeDamage(damage, hitPoint, source) {
    if (this.collapse) return;
    super.takeDamage(damage, hitPoint, source);
  }

  sap(damage, source) {
    if (this.collapse) return;
    super.sap(damage, source);
  }

  // Struck down: it caves in first (step bursts it once that's done).
  shatter(dir) {
    if (this.collapse) return;
    this.collapse = { at: this.world.time, dir };
    this.birth = null;
    this.world.sound('spawnerCollapse', this.body.pos);
  }

  render(alpha, dt, view) {
    super.render(alpha, dt, view);
    const S = SPAWNERS, T = this.type, w = this.world;
    const now = w.time - (1 - alpha) * FIXED_DT;
    // The birth stream: red mist pouring out of it toward the spot and gathering there.
    if (this.birth && dt > 0) this.stream(dt, clamp01((now - this.birth.at) / S.telegraph));
    if (!this.view.visible) return;

    // Its heartbeat: a double thump, quickening while it births, and a heave as one tears free.
    const birthing = this.birth ? clamp01((now - this.birth.at) / S.telegraph) : 0;
    this.beatPhase += dt / lerp(BEAT.period, BEAT.birthPeriod, birthing);
    const ph = this.beatPhase % 1, thump = (x) => (x >= 0 && x < 0.16 ? (1 - x / 0.16) ** 2 : 0);
    const beat = thump(ph) + 0.6 * thump(ph - 0.22);
    const release = Math.max(0, 1 - (now - this.bornAt) / BEAT.releaseTime);
    let scale = 1 + BEAT.swell * beat - 0.1 * birthing * birthing + BEAT.release * release * release;

    // Caving in: shrinking and shaking harder and harder, its darkness closing in.
    let dark = 1;
    if (this.collapse) {
      const C = T.collapse, k = clamp01((now - this.collapse.at) / C.time), j = randInsideUnitCircle(), shake = C.tremble * T.radius * k;
      scale *= 1 - C.shrink * k * k;
      dark = 1 + 0.8 * k;
      this.view.position.x += j.x * shake;
      this.view.position.y += j.y * shake;
      this.glow.alpha += 0.5 * k;
    }
    this.inner.scale.set(scale);
    this.glow.alpha *= 0.85 + 0.3 * beat;
    this.dark.width = this.dark.height = T.size * (2.5 - 0.6 * (dark - 1)) * (1 + 0.05 * beat);
    this.dark.alpha = Math.min(1, 0.7 * dark);
  }

  stream(dt, k) {
    const S = SPAWNERS, M = S.stream, { x, y } = this.body.pos, to = this.birth.pos, plume = this.world.deathFx.mist;
    const dx = to.x - x, dy = to.y - y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, r = this.type.radius;
    for (let n = randInt(0, 2) + (Math.random() < S.gather.rate * dt * 0.5 ? 1 : 0); n > 0; n--) {
      const f = Math.random(), along = r + (d - r) * f * lerp(0.6, 1, k), speed = randRange(2.5, 4.5);
      plume.spawn({ x: x + ux * along, y: y + uy * along, vx: ux * speed, vy: uy * speed, size: randRange(...M.size), life: randRange(...M.life), alpha: M.alpha * 0.6, color: M.color, fade: M.fade, grow: 1.3, sway: 1 });
    }
    // Gathering in on the spot.
    if (Math.random() < S.gather.rate * dt) {
      const a = Math.random() * TAU, rr = randRange(0.7, 1.5), speed = rr * 2.2;
      plume.spawn({ x: to.x + Math.cos(a) * rr, y: to.y + Math.sin(a) * rr, vx: -Math.cos(a) * speed, vy: -Math.sin(a) * speed, size: randRange(...M.size), life: randRange(...M.life), alpha: M.alpha, color: M.color, fade: M.fade, grow: 0.5 });
    }
  }
}

// ── placement ────────────────────────────────────────────────────────
// A few spawners (SPAWNERS.count), one room each at most, never the first or last (where
// the player starts and the guardians wait): each tucked into one of its room's corners as
// far as it fits (SPAWNERS.margin off the walls), or now and then (SPAWNERS.center) in its
// dead centre, and no nearer the start than the floor keeps its foes (World.startClearance).
export function placeSpawners(world, { rooms, start }) {
  const S = SPAWNERS, r = PROPS.spawner.radius + S.margin;
  const clear = (c) => dist(c, start) >= world.startClearance;
  let left = randInt(S.count[0], S.count[1] + 1);
  for (const room of shuffle(rooms.slice(1, -1))) {
    if (left <= 0) break;
    const corners = shuffle([[room.x, room.y], [room.xMax, room.y], [room.x, room.yMax], [room.xMax, room.yMax]]);
    const middle = [room.x + room.width / 2, room.y + room.height / 2];
    const spot = (Math.random() < S.center && nearestSpot(world, room, [middle], r, clear)) || nearestSpot(world, room, corners, r, clear);
    if (!spot) continue;
    world.spawnProp('spawner', spot);
    left--;
  }
}

// The free spot (on a quarter-tile grid) nearest the first of `targets` that has one
// within half the room of it, with a circle `r` around it clear of walls and bodies, that
// `allowed` lets through. → { x, y } or null.
function nearestSpot(world, room, targets, r, allowed) {
  const pts = [];
  for (let y = room.y; y <= room.yMax; y += 0.25) for (let x = room.x; x <= room.xMax; x += 0.25) pts.push({ x, y });
  const reach = Math.min(room.width, room.height) / 2;
  for (const [tx, ty] of targets) {
    const d2 = (c) => (c.x - tx) ** 2 + (c.y - ty) ** 2;
    pts.sort((a, b) => d2(a) - d2(b));
    for (const c of pts) {
      if (d2(c) > reach * reach) break;
      if (allowed(c) && world.physics.isCircleFree(c.x, c.y, r)) return c;
    }
  }
  return null;
}
