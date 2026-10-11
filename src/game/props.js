// Destroyable props (PROPS): odds and ends of the void lying about the floors, smashed by
// anything of the player's that deals damage (attacks, aspects, the death blast) for what's
// sealed inside. Each is a heavy body that can be nudged; every hit flashes it, jolts and
// wobbles it and cracks it further, until it bursts into light and shards of its shell,
// popping out its loot. Also places them on a floor (scatterProps).
import { Container, Sprite } from 'pixi.js';
import { Entity } from './entity.js';
import { Body } from '../engine/physics.js';
import { lerp, norm, pickWeighted, randInt, randRange, TAU } from '../engine/math.js';
import { FIXED_DT, LOOT, PICKUPS, PROPS, PROP_SPAWN } from '../data/config.js';
import { tex } from '../render/assets.js';
import { propStageCount } from '../render/sprites.js';
import { rectContainsCircle } from '../render/camera.js';
import { AdrenalineOrb, BuffPickup, MendOrb } from './pickups.js';

const LOOT_DAMPING = 6; // flung loot slows at this rate (PICKUPS.launch)
const FLASH_TIME = 0.08;

export class Prop extends Entity {
  constructor(world, typeKey, x, y) {
    super(world);
    const T = this.type = PROPS[typeKey];
    this.typeKey = typeKey;
    this.isProp = true;
    this.body = world.physics.add(new Body({ x, y, radius: T.radius, mass: T.mass, damping: T.damping }));
    this.body.rotation = this.body.prevRotation = Math.random() * TAU;
    this.health = T.health;
    this.stages = propStageCount(typeKey);
    this.stage = 0;
    this.hit = null; // { at, dir }: the latest hit, for its jolt and wobble
    this.flashUntil = -Infinity;
    this.flashing = false;
    this.t = Math.random() * 10; // its own clock for breathing and drifting

    // view (at the body) → squash (turned to the latest blow, squashed along it) →
    // inner (turned back to the prop's own angle) → its sprite and mote.
    this.view = new Container();
    this.glow = new Sprite(tex.mist);
    this.glow.anchor.set(0.5);
    this.glow.blendMode = 'add';
    this.glow.tint = T.color;
    this.glow.width = this.glow.height = T.glow.size;
    this.squash = new Container();
    this.inner = new Container();
    this.sprite = new Sprite(tex[`${typeKey}_0`]);
    this.sprite.anchor.set(0.5);
    this.sprite.width = this.sprite.height = T.size;
    this.inner.addChild(this.sprite);
    if (T.mote) {
      this.mote = new Sprite(tex.glint);
      this.mote.anchor.set(0.5);
      this.mote.blendMode = 'add';
      this.inner.addChild(this.mote);
    }
    this.squash.addChild(this.inner);
    this.view.addChild(this.glow, this.squash);
    world.layers.props.addChild(this.view);
  }

  closestPoint(p) {
    const b = this.body;
    const d = norm({ x: p.x - b.pos.x, y: p.y - b.pos.y });
    return { x: b.pos.x + d.x * b.radius, y: b.pos.y + d.y * b.radius };
  }

  takeDamage(damage, hitPoint, source) {
    if (this.dead || damage <= 0) return;
    const w = this.world, b = this.body, T = this.type, H = T.hit;
    let dir = norm({ x: b.pos.x - source.x, y: b.pos.y - source.y });
    if (dir.x === 0 && dir.y === 0) dir = { x: 1, y: 0 };
    this.health -= damage;
    if (this.health <= 0) { this.shatter(dir); return; }

    this.stage = Math.min(this.stages - 1, Math.floor(((T.health - this.health) / T.health) * this.stages + 1e-6));
    this.hit = { at: w.time, dir };
    this.flashUntil = w.time + FLASH_TIME;
    b.vel.x += dir.x * H.push; b.vel.y += dir.y * H.push;
    // Chips fly back off the struck face; light sprays out through the far side.
    const angle = Math.atan2(dir.y, dir.x), r = b.radius;
    w.debris.burst(hitPoint.x, hitPoint.y, angle + Math.PI, 1.1, { ...H.chips, spin: 12, colors: T.break.shards.colors });
    w.effects.burst(hitPoint.x, hitPoint.y, angle + Math.PI, { count: 6, speed: 6, lifetime: 0.2, size: 0.25, coneDeg: 50, color: 0xffffff });
    w.effects.burst(b.pos.x + dir.x * r, b.pos.y + dir.y * r, angle, { ...H.sparks, color: T.color });
    w.camera.shakeAtLeast(H.shake);
    w.sound(T.sounds.hit, b.pos, { pitch: 1 + 0.08 * this.stage });
  }

  // Bursts like an enemy dying (DeathFx.explode) and flings its shell's shards out, a
  // share along the blow, then pops out its loot.
  shatter(dir) {
    const w = this.world, T = this.type, B = T.break, b = this.body, { x, y } = b.pos, r = b.radius;
    const angle = Math.atan2(dir.y, dir.x);
    w.deathFx.flare(tex[`${this.typeKey}_white`], x, y, b.rotation, {
      time: B.pop.time, w0: T.size, h0: T.size, w1: T.size * B.pop.scale, h1: T.size * B.pop.scale,
      color0: 0xffffff, color1: T.color, fade: 1.5,
    });
    w.deathFx.explode(x, y, r, T.color, B);
    w.effects.burst(x + dir.x * r, y + dir.y * r, angle, { ...B.blow, color: B.blow.color ?? T.color });
    const S = B.shards, along = Math.round(S.count * S.along);
    w.debris.burst(x, y, angle, 0.45, { ...S, count: along, spread: r });
    w.debris.burst(x, y, angle, Math.PI, { ...S, count: S.count - along, spread: r });
    w.sound(T.sounds.break, b.pos);
    this.dropLoot();
    this.destroy();
  }

  // Each of its loot's rolls may drop something, all of it flung out evenly around it.
  dropLoot() {
    const L = this.type.loot, w = this.world, { x, y } = this.body.pos;
    const drops = [];
    for (let i = 0; i < L.rolls; i++) {
      if (Math.random() >= L.chance) continue;
      const e = pickWeighted(LOOT[L.table]);
      const n = e.count ? randInt(e.count[0], e.count[1] + 1) : 1;
      for (let k = 0; k < n; k++) drops.push(e.drop);
    }
    if (!drops.length) return;
    w.sound('lootPop', this.body.pos);
    const offset = Math.random() * TAU;
    drops.forEach((drop, i) => {
      const a = offset + ((i + randRange(-0.3, 0.3)) / drops.length) * TAU;
      const c = Math.cos(a), s = Math.sin(a);
      // Short of any wall in the way, since loot doesn't collide with walls.
      const d = Math.max(0, Math.min(randRange(...PICKUPS.launch.distance), w.physics.rayLength(x, y, c, s, 3) - 0.35));
      w.add(makeDrop(w, drop, x, y)).launch(c * d * LOOT_DAMPING, s * d * LOOT_DAMPING, LOOT_DAMPING);
    });
  }

  render(alpha, dt, view) {
    const T = this.type, b = this.body, p = b.lerpPos(alpha);
    const visible = rectContainsCircle(view, p.x, p.y, T.glow.size / 2);
    this.view.visible = visible;
    if (!visible) return;
    const now = this.world.time - (1 - alpha) * FIXED_DT, t = (this.t += dt);

    // A hit jolts it away from the blow and sets it wobbling, squashed along the blow.
    let ox = 0, oy = 0, squash = 0, struck = 0;
    if (this.hit) {
      const H = T.hit, e = now - this.hit.at;
      if (e < H.wobbleTime) {
        const k = 1 - e / H.wobbleTime;
        struck = k * k;
        const jolt = H.jolt * Math.sin(Math.min(1, e / 0.05) * Math.PI * 0.5) * struck;
        ox = this.hit.dir.x * jolt; oy = this.hit.dir.y * jolt;
        squash = H.wobble * struck * Math.cos(e * H.wobbleHz * TAU);
      }
    }
    const blow = this.hit ? Math.atan2(this.hit.dir.y, this.hit.dir.x) : 0;
    this.view.position.set(p.x + ox, p.y + oy);
    this.squash.rotation = blow;
    this.squash.scale.set(1 - squash, 1 + squash * 0.6);
    const turn = b.rotation + t * (T.spin ?? 0); // the art's own slow turn, if it has one
    this.inner.rotation = turn - blow;

    const G = T.glow, beat = 0.5 + 0.5 * Math.sin(t * G.pulse * TAU);
    const cracked = this.stages > 1 ? this.stage / (this.stages - 1) : 0; // 0 whole … 1 about to burst
    this.glow.alpha = lerp(G.alpha[0], G.alpha[1], beat) + G.crackGlow * cracked + 0.35 * struck;

    if (this.mote) {
      const M = T.mote, size = M.size * (1 + 0.4 * cracked) * (0.85 + 0.15 * beat);
      this.mote.position.set(M.at[0] * T.size + Math.sin(t * 0.9) * M.drift, M.at[1] * T.size + Math.sin(t * 0.63 + 1.7) * M.drift);
      this.mote.rotation = t * M.spin - turn; // turns on its own, whichever way the prop lies
      this.mote.width = this.mote.height = size;
      this.mote.alpha = 0.65 + 0.35 * beat;
    }
    this.setFlash(this.world.time < this.flashUntil);
  }

  setFlash(on) {
    this.flashing = on;
    this.sprite.texture = tex[on ? `${this.typeKey}_white` : `${this.typeKey}_${this.stage}`];
  }

  dispose() {
    this.world.physics.remove(this.body);
    this.view.destroy({ children: true });
  }
}

function makeDrop(world, drop, x, y) {
  if (drop === 'adrenaline') return new AdrenalineOrb(world, x, y);
  if (drop === 'mend') return new MendOrb(world, x, y);
  return new BuffPickup(world, x, y, drop);
}

// ── placement ────────────────────────────────────────────────────────
// Props gather in nooks (PROP_SPAWN): the corners of rooms, and the corners and sides of
// corridors. Each room gets a few clusters, mostly in its corners, and the corridors a
// few smaller ones; the rest of a cluster lines up along the walls beside the first, or
// (some of the time, in rooms) heaps up around it in a tight pile. Each nook's prop is
// tucked in against its wall(s), never where it would narrow the way, and clear of the
// start and the exit.
export function scatterProps(world, { rooms, grid, start, exit }) {
  const S = PROP_SPAWN, placed = {};
  const nooks = findNooks(grid, rooms);
  const avoid = [start, exit].filter(Boolean);
  const allowed = (type) => (placed[type] ?? 0) < (PROPS[type].maxPerFloor ?? Infinity);

  const pickType = () => {
    const types = S.types.filter((e) => allowed(e.type));
    return types.length ? pickWeighted(types).type : null;
  };
  const cluster = (area, { clusterSize, cornerBias, pile, mixed }) => {
    const type = pickType();
    if (!type) return;
    const first = pickNook(world, area, PROPS[type].radius, avoid, cornerBias);
    if (!first) return;
    // A mixed patch picks each prop's type afresh; otherwise they're all the first's.
    const mix = Math.random() < mixed;
    const nextType = () => (mix ? pickType() : allowed(type) ? type : null);
    const spawn = (t, pos) => { world.spawnProp(t, pos); placed[t] = (placed[t] ?? 0) + 1; };
    spawn(type, first.pos);
    // A pile: each one pressed up against one already down, heaped out of the nook.
    if (pile && Math.random() < pile.chance) {
      const size = randInt(pile.size[0], pile.size[1] + 1), heap = [{ ...first.pos, r: PROPS[type].radius }];
      for (let tries = 0, t = nextType(); t && heap.length < size && tries < size * 15; tries++) {
        const r = PROPS[t].radius, base = heap[randInt(0, heap.length)], a = Math.random() * TAU, d = base.r + r + randRange(0.02, 0.08);
        const pos = { x: base.x + Math.cos(a) * d, y: base.y + Math.sin(a) * d };
        if (Math.hypot(pos.x - first.pos.x, pos.y - first.pos.y) > pile.reach) continue;
        if (!world.physics.isCircleFree(pos.x, pos.y, r + 0.01)) continue;
        spawn(t, pos);
        heap.push({ ...pos, r });
        t = nextType();
      }
      return;
    }
    // Otherwise the rest line up in the nooks beside the first, or huddle round it if there are none.
    const size = randInt(clusterSize[0], clusterSize[1] + 1);
    const near = shuffle([...area.corners, ...area.sides].filter((n) => n !== first.nook && Math.abs(n.cx - first.nook.cx) <= 2 && Math.abs(n.cy - first.nook.cy) <= 2));
    for (let n = 1, i = 0, t = nextType(); t && n < size && i < near.length + 8; i++) {
      const r = PROPS[t].radius;
      let pos = null;
      if (i < near.length) {
        pos = tuck(near[i], r);
      } else {
        const a = Math.random() * TAU, d = S.spread * randRange(0.7, 1);
        pos = { x: first.pos.x + Math.cos(a) * d, y: first.pos.y + Math.sin(a) * d };
      }
      if (!world.physics.isCircleFree(pos.x, pos.y, r + 0.04)) continue;
      spawn(t, pos);
      n++;
      t = nextType();
    }
  };

  nooks.rooms.forEach((area) => {
    const count = randInt(S.room.clusters[0], S.room.clusters[1] + 1);
    for (let c = 0; c < count; c++) cluster(area, S.room);
  });
  const count = randInt(S.corridor.clusters[0], S.corridor.clusters[1] + 1);
  for (let c = 0; c < count; c++) cluster(nooks.corridors, S.corridor);
}

// Every floor cell against a wall, as { cx, cy, hx, hy } (hx/hy: which way its wall lies,
// -1/1, or 0), sorted into corners (a wall on two adjacent sides) and sides (on one),
// by room (the first whose rect holds it) or as corridors (outside every room). A cell
// is left out when there isn't open floor `PROP_SPAWN.open` tiles out from its walls,
// so a prop there never narrows the way.
function findNooks(grid, rooms) {
  const open = PROP_SPAWN.open;
  const area = () => ({ corners: [], sides: [] });
  const out = { rooms: rooms.map(area), corridors: area() };
  const wall = (x, y) => !grid.isFloor(x, y);
  const clear = (x, y, dx, dy) => {
    for (let k = 1; k <= open; k++) if (wall(x + dx * k, y + dy * k)) return false;
    return true;
  };
  for (let cy = 1; cy < grid.height - 1; cy++) {
    for (let cx = 1; cx < grid.width - 1; cx++) {
      if (!grid.isFloor(cx, cy)) continue;
      const l = wall(cx - 1, cy), r = wall(cx + 1, cy), u = wall(cx, cy - 1), d = wall(cx, cy + 1);
      if ((l && r) || (u && d)) continue; // squeezed between walls
      const hx = l ? -1 : r ? 1 : 0, hy = u ? -1 : d ? 1 : 0;
      if (!hx && !hy) continue;
      if (hx && !clear(cx, cy, -hx, 0)) continue;
      if (hy && !clear(cx, cy, 0, -hy)) continue;
      if (hx && hy && wall(cx - hx, cy - hy)) continue;
      const i = rooms.findIndex((rm) => cx >= rm.x && cx < rm.xMax && cy >= rm.y && cy < rm.yMax);
      const a = i >= 0 ? out.rooms[i] : out.corridors;
      (hx && hy ? a.corners : a.sides).push({ cx, cy, hx, hy });
    }
  }
  return out;
}

// A nook in `area` with room for a prop of radius `r`, at least PROP_SPAWN.clearOfStart
// from each of `avoid`: a corner `cornerBias` of the time (when there are any), else a side.
// → { nook, pos } or null.
function pickNook(world, area, r, avoid, cornerBias) {
  for (let i = 0; i < 16; i++) {
    const list = area.corners.length && (Math.random() < cornerBias || !area.sides.length) ? area.corners : area.sides;
    if (!list.length) return null;
    const nook = list[randInt(0, list.length)], pos = tuck(nook, r);
    if (avoid.some((p) => Math.hypot(p.x - pos.x, p.y - pos.y) < PROP_SPAWN.clearOfStart)) continue;
    if (world.physics.isCircleFree(pos.x, pos.y, r + 0.04)) return { nook, pos };
  }
  return null;
}

// Where a prop of radius `r` sits in a nook: pressed in against its wall(s), anywhere
// along a lone wall.
function tuck({ cx, cy, hx, hy }, r) {
  const inset = Math.max(0, 0.5 - r - 0.06);
  return {
    x: cx + 0.5 + (hx ? hx * inset : randRange(-0.2, 0.2)),
    y: cy + 0.5 + (hy ? hy * inset : randRange(-0.2, 0.2)),
  };
}

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = randInt(0, i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
