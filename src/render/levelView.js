// Floor + walls. Wall outlines wobble and wall sparkles twinkle (and flare in rings from
// kills and parries, STAR_PULSE) entirely in a vertex shader: geometry is built once per
// floor in 16×16-tile chunk meshes, and a frame only updates a few uniforms and toggles
// chunk visibility. Behind it all drifts the nebula; the floor is a lit texture.
import { Container, Geometry, Mesh, Shader, Sprite } from 'pixi.js';
import { COLORS, STAR_PULSE as SP, WALL_VISUAL as WV, WALL_SPARKLES as WS } from '../data/config.js';
import { lerp, pickWeighted, seededRandom, TAU } from '../engine/math.js';
import { spawnableOn } from '../level/difficulty.js';
import { Nebula } from './nebula.js';
import { floorTexture } from './floorTexture.js';

const CHUNK = 16;
const PULSES = 8; // star rings alive at once; a new one replaces the oldest

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
    p = aPosition + aWave.xy * (uAmplitude * sin(uWaveTime + aWave.z));
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
    // Outlines only where wall meets floor (the map border isn't outlined).
    const isWall = (x, y) => !grid.isFloor(x, y);
    const rand = seededRandom((Math.random() * 2 ** 32) >>> 0);
    const pad = Math.max(0.01, 0.5 - WS.edgePadding);
    const perTile = Math.min(WS.sparklesPerTile + WS.sparklesPerFloor * (floor - 1), WS.maxSparklesPerTile);
    const colors = spawnableOn(WS.colors, floor).map((e) => ({ ...e, rgb: rgb(e.color) }));

    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (!isWall(x, y)) continue;
        if (!isWall(x, y - 1)) chunkOf(x, y).edge(x, y, x + 1, y, 0, -1);
        if (!isWall(x + 1, y)) chunkOf(x, y).edge(x + 1, y, x + 1, y + 1, 1, 0);
        if (!isWall(x, y + 1)) chunkOf(x, y).edge(x + 1, y + 1, x, y + 1, 0, 1);
        if (!isWall(x - 1, y)) chunkOf(x, y).edge(x, y + 1, x, y, -1, 0);

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

  update(dt, view) {
    this.waveTime = (this.waveTime + dt * WV.squiggleSpeed) % TAU;
    this.time += dt;
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

  // One exposed wall edge from (ax, ay) to (bx, by); (nx, ny) points out of the wall.
  // Stroked as a strip inset half a stroke into the wall cell, with square caps.
  // Interior points wobble along the inward normal; endpoints stay put so corners meet.
  edge(ax, ay, bx, by, nx, ny) {
    const res = Math.max(1, WV.squiggleResolution);
    const half = WV.strokeWidth / 2;
    const tx = bx - ax, ty = by - ay; // unit length: edges are one tile long
    const first = this.positions.length / 2;
    for (let i = 0; i <= res; i++) {
      const t = i / res;
      const ex = ax + tx * t, ey = ay + ty * t;
      const cap = i === 0 ? -half : i === res ? half : 0;
      const cx = ex - nx * half + tx * cap, cy = ey - ny * half + ty * cap;
      const endpoint = i === 0 || i === res;
      const wx = endpoint ? 0 : -nx, wy = endpoint ? 0 : -ny;
      const phase = (ex + ey) * Math.max(0.01, WV.squiggleFrequency) * TAU;
      this.vertex(cx + nx * half, cy + ny * half, 0, 0, wx, wy, phase, 0);
      this.vertex(cx - nx * half, cy - ny * half, 0, 0, wx, wy, phase, 0);
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
