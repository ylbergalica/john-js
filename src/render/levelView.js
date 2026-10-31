// Floor + walls. Wall outlines wobble and wall sparkles twinkle (and flare in rings from
// kills and parries, STAR_PULSE) entirely in a vertex shader: geometry is built once per
// floor in 16×16-tile chunk meshes, and a frame only updates a few uniforms and toggles
// chunk visibility. Behind it all drifts the nebula; the floor is a lit texture.
import { Container, Geometry, Mesh, Shader, Sprite } from 'pixi.js';
import { COLORS, STAR_PULSE as SP, WALL_BLAST as WB, WALL_GUSTS as WG, WALL_IMPACT as WI, WALL_VISUAL as WV, WALL_SPARKLES as WS } from '../data/config.js';
import { lerp, pickWeighted, randRange, seededRandom, TAU } from '../engine/math.js';
import { spawnableOn } from '../level/difficulty.js';
import { Nebula } from './nebula.js';
import { floorTexture } from './floorTexture.js';

const CHUNK = 16;
const PULSES = 8; // star rings alive at once; a new one replaces the oldest
const GUSTS = 24; // wall gusts alive at once; none starts while all are busy
const IMPACTS = 32; // wall dents alive at once; a new one takes the most died-down's place
const BLASTS = 12; // explosions shoving walls at once; a new one takes the soonest done's place

const vertex = /* glsl */ `
in vec2 aPosition;
in vec2 aOffset;   // sparkle corner (unit size), zero for outline vertices
in vec4 aWave;     // xy: wobble direction, z: phase, w: twinkle speed (0 = outline)
in vec3 aColor;    // sparkle colour (unused by outlines)
out vec4 vColor;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform float uWaveTime;
uniform float uTime;
uniform float uAmplitude;
uniform vec3 uStrokeColor;
uniform vec3 uTwinkle; // min alpha, max alpha, scale dip
uniform vec4 uPulses[${PULSES}]; // x, y, start time, reach (0 = unused)
uniform vec3 uPulse; // ring speed, ring width, swell
uniform vec4 uGusts[${GUSTS}]; // x, y, start time, run time (0 = unused)
uniform vec4 uGustShapes[${GUSTS}]; // radius, phase gained over the run, ease time, settle time
uniform vec2 uGustSwell; // how much taller a fast gust's waves grow, how much lower a slow one's
uniform vec4 uImpacts[${IMPACTS}]; // x, y, start time, strength (0 = unused)
uniform vec4 uImpactWave; // depth, decay time, frequency, wavenumber
uniform vec3 uImpactSpread; // radius, widening speed, rise time

// How far in the outline at p is dented by things striking the wall (WALL_IMPACT): each
// a dip that springs back and forth, rippling out and widening as it dies away.
float dent(vec2 p) {
  float o = 0.0;
  for (int i = 0; i < ${IMPACTS}; i++) {
    vec4 q = uImpacts[i];
    float t = uTime - q.z;
    if (q.w <= 0.0 || t < 0.0 || t > uImpactWave.y * 6.0) continue;
    float r = uImpactSpread.x + uImpactSpread.y * t;
    float d = distance(p, q.xy);
    if (d > r * 3.0) continue;
    float reach = exp(-(d * d) / (r * r)) * uImpactSpread.x / r;
    float life = smoothstep(0.0, uImpactSpread.z, t) * exp(-t / uImpactWave.y);
    o += q.w * life * reach * cos(uImpactWave.z * t - uImpactWave.w * d);
  }
  return o * uImpactWave.x;
}

uniform vec4 uBlasts[${BLASTS}]; // x, y, start time, reach (negative pulls; 0 = unused)
uniform vec4 uBlast; // shockwave speed, rise time, frequency
uniform vec4 uBlastSize; // full reach, depth, curve, facing
uniform vec2 uBlastDecay; // decay time of the smallest, of the biggest

// How far in the outline at p (wobbling along dir) is shoved by explosions (WALL_BLAST):
// each a shockwave running out that dents the walls in as it passes, those facing it the
// most, and lets them spring back. A negative reach pulls them out instead.
float shove(vec2 p, vec2 dir) {
  float o = 0.0;
  for (int i = 0; i < ${BLASTS}; i++) {
    vec4 b = uBlasts[i];
    float reach = abs(b.w);
    if (reach <= 0.0) continue;
    vec2 off = p - b.xy;
    float d = length(off);
    if (d >= reach) continue;
    float size = min(reach / uBlastSize.x, 1.0);
    float decay = mix(uBlastDecay.x, uBlastDecay.y, size);
    float t = uTime - b.z - d / uBlast.x;
    if (t <= 0.0 || t > decay * 6.0) continue;
    float face = d > 0.001 ? max(dot(off / d, normalize(dir)), 0.0) : 1.0;
    float power = uBlastSize.y * pow(size, uBlastSize.z) * sign(b.w);
    float spring = smoothstep(0.0, uBlast.y, t) * exp(-t / decay) * cos(uBlast.z * t);
    o += power * (1.0 - smoothstep(0.0, reach, d)) * mix(uBlastSize.w, 1.0, face) * spring;
  }
  return o;
}

const float GUST_PI = 3.14159265;
const float SETTLE_EASE = 0.25; // of the settle time, spent easing into and out of the drift

// 0…1 over len seconds: 1 between, easing up from 0 and back down over e at either end.
float plateau(float t, float len, float e) {
  e = min(e, len * 0.5);
  float r = min(t, len - t);
  return r < e ? 0.5 - 0.5 * cos(GUST_PI * r / e) : 1.0;
}

// 0…1 over len seconds, climbing at the rate plateau() gives (so smoothly, both ways).
float ramp(float t, float len, float e) {
  e = min(e, len * 0.5);
  float area = len - e;
  if (t <= e) return 0.5 * (t - e / GUST_PI * sin(GUST_PI * t / e)) / area;
  if (t < len - e) return (0.5 * e + t - e) / area;
  float r = len - t;
  return 1.0 - 0.5 * (r - e / GUST_PI * sin(GUST_PI * r / e)) / area;
}

// About -2…2: the outline's sway at p. A gust pushes the sway's phase ahead of (or
// behind) the usual over its run, its waves swelling (or lowering) as they race (or
// crawl); over its settle the push eases back out, so it leaves the wave as it found it.
float sway(vec2 p, float phase) {
  float push = 0.0, amp = 1.0;
  for (int i = 0; i < ${GUSTS}; i++) {
    vec4 g = uGusts[i];
    vec4 h = uGustShapes[i];
    float t = uTime - g.z;
    if (g.w <= 0.0 || t <= 0.0 || t >= g.w + h.w) continue;
    float d = distance(p, g.xy) / h.x;
    if (d >= 1.0) continue;
    float fall = (1.0 - d * d) * (1.0 - d * d);
    if (t < g.w) {
      push += fall * h.y * ramp(t, g.w, h.z);
      amp += fall * plateau(t, g.w, h.z) * (h.y > 0.0 ? uGustSwell.x : -uGustSwell.y);
    } else {
      push += fall * h.y * (1.0 - ramp(t - g.w, h.w, h.w * SETTLE_EASE));
    }
  }
  return clamp(amp, 0.25, 2.2) * sin(uWaveTime + phase + push);
}

// 0…1: how lit a star at p is by the rings passing it.
float flare(vec2 p) {
  float f = 0.0;
  for (int i = 0; i < ${PULSES}; i++) {
    vec4 q = uPulses[i];
    float front = (uTime - q.z) * uPulse.x;
    if (q.w <= 0.0 || front < 0.0 || front > q.w) continue;
    float k = (distance(p, q.xy) - front) / uPulse.y;
    f += exp(-k * k) * (1.0 - front / q.w);
  }
  return min(f, 1.0);
}

void main() {
  vec2 p;
  if (aWave.w == 0.0) {
    p = aPosition + aWave.xy * (uAmplitude * sway(aPosition, aWave.z) + dent(aPosition) + shove(aPosition, aWave.xy));
    vColor = vec4(uStrokeColor, 1.0);
  } else {
    float t = 0.5 + 0.5 * sin(uTime * aWave.w + aWave.z);
    float f = flare(aPosition);
    p = aPosition + aOffset * mix(1.0 - uTwinkle.z, 1.0, t) * (1.0 + f * uPulse.z);
    float a = mix(uTwinkle.x, uTwinkle.y, t);
    a += (1.0 - a) * f;
    vColor = vec4(aColor * a, a); // premultiplied
  }
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(p, 1.0)).xy, 0.0, 1.0);
}`;

const fragment = /* glsl */ `
in vec4 vColor;
out vec4 finalColor;
void main() { finalColor = vColor; }`;

const BLACK = [0, 0, 0];
const rgb = (c) => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];

export class LevelView {
  constructor() {
    this.root = new Container();
    this.floor = null;
    this.chunks = [];
    this.nebula = new Nebula();
    this.pulses = new Float32Array(PULSES * 4);
    this.nextPulse = 0;
    this.gusts = new Float32Array(GUSTS * 4);
    this.gustShapes = new Float32Array(GUSTS * 4);
    this.nextGust = randRange(WG.everyRange.x, WG.everyRange.y);
    this.impacts = new Float32Array(IMPACTS * 4);
    this.blasts = new Float32Array(BLASTS * 4);
    this.waveTime = 0;
    this.time = 0;
    this.shader = Shader.from({
      gl: { vertex, fragment, name: 'wall-shader' },
      resources: {
        wallUniforms: {
          uWaveTime: { value: 0, type: 'f32' },
          uTime: { value: 0, type: 'f32' },
          uAmplitude: { value: Math.max(0, WV.squiggleAmplitude), type: 'f32' },
          uStrokeColor: { value: new Float32Array(rgb(COLORS.wallStroke)), type: 'vec3<f32>' },
          uTwinkle: {
            value: new Float32Array([Math.min(WS.minAlpha, WS.maxAlpha), Math.max(WS.minAlpha, WS.maxAlpha), WS.twinkleScaleAmount]),
            type: 'vec3<f32>',
          },
          uPulses: { value: this.pulses, type: 'vec4<f32>', size: PULSES },
          uPulse: { value: new Float32Array([SP.speed, SP.width, SP.swell]), type: 'vec3<f32>' },
          uGusts: { value: this.gusts, type: 'vec4<f32>', size: GUSTS },
          uGustShapes: { value: this.gustShapes, type: 'vec4<f32>', size: GUSTS },
          uGustSwell: { value: new Float32Array([WG.swell, Math.min(WG.shrink, 1)]), type: 'vec2<f32>' },
          uImpacts: { value: this.impacts, type: 'vec4<f32>', size: IMPACTS },
          uImpactWave: { value: new Float32Array([WI.depth, Math.max(0.01, WI.decay), WI.frequency, WI.wavenumber]), type: 'vec4<f32>' },
          uImpactSpread: { value: new Float32Array([Math.max(0.01, WI.radius), WI.spread, Math.max(0.001, WI.rise)]), type: 'vec3<f32>' },
          uBlasts: { value: this.blasts, type: 'vec4<f32>', size: BLASTS },
          uBlast: { value: new Float32Array([Math.max(0.01, WB.speed), Math.max(0.001, WB.rise), WB.frequency, 0]), type: 'vec4<f32>' },
          uBlastSize: { value: new Float32Array([Math.max(0.01, WB.fullReach), WB.depth, WB.curve, WB.facing]), type: 'vec4<f32>' },
          uBlastDecay: { value: new Float32Array([Math.max(0.01, WB.decayRange.x), Math.max(0.01, WB.decayRange.y)]), type: 'vec2<f32>' },
        },
      },
    });
    this.uniforms = this.shader.resources.wallUniforms.uniforms;
  }

  // rooms: the layout's; floor: the floor number, which the sky and the ground grow with.
  build(grid, rooms, floor) {
    this.clear();
    const palette = this.nebula.build(grid, floor, this.root);
    const { texture, scale } = floorTexture(grid, rooms, floor, palette);
    this.floor = new Sprite(texture);
    this.floor.scale.set(scale);
    this.root.addChild(this.floor);

    const builders = new Map();
    const chunkOf = (x, y) => {
      const key = Math.floor(x / CHUNK) + Math.floor(y / CHUNK) * 65536;
      let b = builders.get(key);
      if (!b) builders.set(key, (b = new ChunkBuilder(Math.floor(x / CHUNK) * CHUNK, Math.floor(y / CHUNK) * CHUNK)));
      return b;
    };
    // Outlines only where wall meets floor (the map border isn't outlined). Each exposed
    // edge runs clockwise round its wall cell; they're chained into whole outlines below.
    const isWall = (x, y) => !grid.isFloor(x, y);
    const edges = [];
    const rand = seededRandom((Math.random() * 2 ** 32) >>> 0);
    const pad = Math.max(0.01, 0.5 - WS.edgePadding);
    const perTile = Math.min(WS.sparklesPerTile + WS.sparklesPerFloor * (floor - 1), WS.maxSparklesPerTile);
    const colors = spawnableOn(WS.colors, floor).map((e) => ({ ...e, rgb: rgb(e.color) }));

    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (!isWall(x, y)) continue;
        if (!isWall(x, y - 1)) edges.push({ ax: x, ay: y, bx: x + 1, by: y, nx: 0, ny: -1, x, y });
        if (!isWall(x + 1, y)) edges.push({ ax: x + 1, ay: y, bx: x + 1, by: y + 1, nx: 1, ny: 0, x, y });
        if (!isWall(x, y + 1)) edges.push({ ax: x + 1, ay: y + 1, bx: x, by: y + 1, nx: 0, ny: 1, x, y });
        if (!isWall(x - 1, y)) edges.push({ ax: x, ay: y + 1, bx: x, by: y, nx: -1, ny: 0, x, y });

        let count = Math.floor(perTile);
        if (rand() < perTile - count) count++;
        for (let i = 0; i < count; i++) {
          chunkOf(x, y).sparkle(
            x + 0.5 + lerp(-pad, pad, rand()), y + 0.5 + lerp(-pad, pad, rand()),
            lerp(WS.sizeRange.x, WS.sizeRange.y, rand()), lerp(0, TAU, rand()),
            lerp(0, TAU, rand()), lerp(WS.twinkleSpeedRange.x, WS.twinkleSpeedRange.y, rand()),
            pickWeighted(colors, rand).rgb,
          );
        }
      }
    }

    // Each edge's ends are mitred to its neighbours' in the outline, so corners meet square
    // (no overhang outside, no notch inside) and the wobble carries on across them.
    for (const line of outlines(edges)) {
      const n = line.length;
      line.forEach((e, i) => {
        const prev = i > 0 || line.closed ? line[(i + n - 1) % n] : null;
        const next = i < n - 1 || line.closed ? line[(i + 1) % n] : null;
        const [sx, sy] = inset(prev ?? e, e), [ex, ey] = inset(e, next ?? e);
        chunkOf(e.x, e.y).edge(e.ax, e.ay, e.bx, e.by, e.nx, e.ny, sx, sy, ex, ey);
      });
    }

    for (const b of builders.values()) {
      if (b.indices.length === 0) continue;
      const mesh = new Mesh({ geometry: b.build(), shader: this.shader });
      this.root.addChild(mesh);
      this.chunks.push({ mesh, x0: b.x0 - 1, y0: b.y0 - 1, x1: b.x0 + CHUNK + 1, y1: b.y0 + CHUNK + 1 });
    }
  }

  // A ring of flaring wall stars spreading from (x, y) for `reach` tiles (STAR_PULSE).
  pulse(x, y, reach) {
    this.pulses.set([x, y, this.time, reach], this.nextPulse * 4);
    this.nextPulse = (this.nextPulse + 1) % PULSES;
  }

  // The wall struck at (x, y): its outline dents in there and ripples (WALL_IMPACT).
  // strength: 0…1.
  impact(x, y, strength) {
    let slot = 0, least = Infinity;
    for (let i = 0; i < IMPACTS; i++) {
      const left = this.impacts[i * 4 + 3] * Math.exp(-(this.time - this.impacts[i * 4 + 2]) / WI.decay);
      if (left < least) { least = left; slot = i; }
    }
    this.impacts.set([x, y, this.time, strength], slot * 4);
  }

  // An explosion at (x, y) reaching `size` tiles shoves the walls round it back
  // (WALL_BLAST); `pull` (one caving in) draws them out instead. Returns how far it carries.
  blast(x, y, size, pull = false) {
    const reach = Math.max(WB.minReach, size * WB.reachScale);
    let slot = 0, soonest = Infinity;
    for (let i = 0; i < BLASTS; i++) {
      const done = this.blasts[i * 4 + 2] + Math.abs(this.blasts[i * 4 + 3]) / WB.speed + WB.decayRange.y * 6;
      if (done < soonest) { soonest = done; slot = i; }
    }
    this.blasts.set([x, y, this.time, pull ? -reach : reach], slot * 4);
    return reach;
  }

  // A patch of outline somewhere in view swaying faster or slower for a while (WALL_GUSTS),
  // in a slot whose last gust is over: cutting one short would jolt its waves.
  gust(view) {
    let slot = -1;
    for (let i = 0; i < GUSTS; i++) {
      if (this.time >= this.gusts[i * 4 + 2] + this.gusts[i * 4 + 3] + this.gustShapes[i * 4 + 3]) { slot = i; break; }
    }
    if (slot < 0) return;
    const ease = Math.max(0.01, WG.ease);
    const run = ease * 2 + randRange(WG.holdRange.x, WG.holdRange.y);
    const settle = randRange(WG.settleRange.x, WG.settleRange.y);
    const boost = Math.random() < WG.slowerChance
      ? -randRange(WG.slowerRange.x, WG.slowerRange.y)
      : randRange(WG.fasterRange.x, WG.fasterRange.y);
    // The phase gained over the run: the extra speed, over the run less its easing (ramp).
    const push = boost * WV.squiggleSpeed * (run - ease);
    this.gusts.set([randRange(view.x0, view.x1), randRange(view.y0, view.y1), this.time, run], slot * 4);
    this.gustShapes.set([randRange(WG.radiusRange.x, WG.radiusRange.y), push, ease, settle], slot * 4);
  }

  update(dt, view) {
    this.waveTime = (this.waveTime + dt * WV.squiggleSpeed) % TAU;
    this.time += dt;
    this.nextGust -= dt;
    if (this.nextGust <= 0) {
      this.gust(view);
      this.nextGust = randRange(WG.everyRange.x, WG.everyRange.y);
    }
    this.uniforms.uWaveTime = this.waveTime;
    this.uniforms.uTime = this.time;
    this.nebula.update(this.time);
    for (const c of this.chunks) {
      c.mesh.visible = c.x1 >= view.x0 && c.x0 <= view.x1 && c.y1 >= view.y0 && c.y0 <= view.y1;
    }
  }

  clear() {
    this.floor?.destroy({ texture: true, textureSource: true });
    this.floor = null;
    this.nebula.clear();
    this.pulses.fill(0);
    this.gusts.fill(0);
    this.impacts.fill(0);
    this.blasts.fill(0);
    for (const c of this.chunks) c.mesh.destroy({ geometry: true }); // shader is shared
    this.chunks = [];
  }

  destroy() {
    this.clear();
    this.shader.destroy();
    this.nebula.destroy();
    this.root.destroy({ children: true });
  }
}

// Chains wall edges end to end into outlines: arrays of edges, `closed` when they loop
// (open only where floor runs to the map border). Where two wall cells touch only at a
// corner, the outline turns toward the wall, so each keeps its own corner.
function outlines(edges) {
  const key = (x, y) => x + y * 65536;
  const from = new Map();
  for (const e of edges) {
    const k = key(e.ax, e.ay);
    if (!from.has(k)) from.set(k, []);
    from.get(k).push(e);
  }
  const turn = (a, b) => (a.bx - a.ax) * (b.by - b.ay) - (a.by - a.ay) * (b.bx - b.ax); // 1: toward the wall
  const hasPrev = new Set();
  for (const e of edges) {
    let best = null;
    for (const c of from.get(key(e.bx, e.by)) ?? []) if (!best || turn(e, c) > turn(e, best)) best = c;
    e.next = best;
    if (best) hasPrev.add(best);
  }
  const lines = [];
  const trace = (start) => {
    const line = [];
    let e = start;
    while (e && !e.used) { e.used = true; line.push(e); e = e.next; }
    line.closed = e === start;
    lines.push(line);
  };
  for (const e of edges) if (!hasPrev.has(e)) trace(e); // open ones first, from their ends
  for (const e of edges) if (!e.used) trace(e);
  return lines;
}

// Where the stroke's inner side sits, from the corner edge a meets edge b at: the inward
// normal along a straight run, the mitre (out to the diagonal) at a corner.
function inset(a, b) {
  const k = 1 + a.nx * b.nx + a.ny * b.ny;
  return [-(a.nx + b.nx) / k, -(a.ny + b.ny) / k];
}

class ChunkBuilder {
  constructor(x0, y0) {
    this.x0 = x0; this.y0 = y0;
    this.positions = []; this.offsets = []; this.waves = []; this.colors = []; this.indices = [];
  }

  vertex(px, py, ox, oy, wx, wy, phase, speed, color = BLACK) {
    this.positions.push(px, py);
    this.offsets.push(ox, oy);
    this.waves.push(wx, wy, phase, speed);
    this.colors.push(color[0], color[1], color[2]);
    return this.positions.length / 2 - 1;
  }

  // One exposed wall edge from (ax, ay) to (bx, by), a tile long; (nx, ny) points out of
  // the wall. Stroked as a strip from the edge a stroke's width into the wall cell, its
  // inner side at (sx, sy) and (ex, ey) from its ends (inset). The strip wobbles along
  // those, and the inward normal between, with a phase set by position, so neighbouring
  // edges sway as one line, round corners too.
  edge(ax, ay, bx, by, nx, ny, sx, sy, ex, ey) {
    const res = Math.max(1, WV.squiggleResolution);
    const w = WV.strokeWidth;
    const freq = Math.max(0.01, WV.squiggleFrequency);
    const first = this.positions.length / 2;
    for (let i = 0; i <= res; i++) {
      const t = i / res;
      const px = lerp(ax, bx, t), py = lerp(ay, by, t);
      const ox = i === 0 ? sx : i === res ? ex : -nx, oy = i === 0 ? sy : i === res ? ey : -ny;
      const phase = (((px + py) * freq) % 1) * TAU;
      this.vertex(px, py, 0, 0, ox, oy, phase, 0);
      this.vertex(px + ox * w, py + oy * w, 0, 0, ox, oy, phase, 0);
    }
    for (let i = 0; i < res; i++) {
      const v = first + i * 2;
      this.indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
  }

  // Four-pointed twinkle star centred at (x, y); color: [r, g, b], 0…1.
  sparkle(x, y, size, rotation, phase, speed, color) {
    const ux = Math.cos(rotation) * size, uy = Math.sin(rotation) * size;
    const rx = -uy * 0.6, ry = ux * 0.6;
    const v = this.vertex(x, y, ux, uy, 0, 0, phase, speed, color);
    this.vertex(x, y, rx, ry, 0, 0, phase, speed, color);
    this.vertex(x, y, -ux, -uy, 0, 0, phase, speed, color);
    this.vertex(x, y, -rx, -ry, 0, 0, phase, speed, color);
    this.indices.push(v, v + 1, v + 2, v, v + 2, v + 3);
  }

  build() {
    return new Geometry({
      attributes: {
        aPosition: { buffer: new Float32Array(this.positions), format: 'float32x2' },
        aOffset: { buffer: new Float32Array(this.offsets), format: 'float32x2' },
        aWave: { buffer: new Float32Array(this.waves), format: 'float32x4' },
        aColor: { buffer: new Float32Array(this.colors), format: 'float32x3' },
      },
      indexBuffer: new Uint32Array(this.indices),
    });
  }
}
