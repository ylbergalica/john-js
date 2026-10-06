// Floor + walls. Wall outlines wobble and wall sparkles twinkle entirely in a vertex
// shader: geometry is built once per floor in 16×16-tile chunk meshes, and a frame
// only updates two uniforms and toggles chunk visibility.
import { Container, Geometry, Mesh, Shader, Sprite, Texture } from 'pixi.js';
import { COLORS, WALL_VISUAL as WV, WALL_SPARKLES as WS } from '../data/config.js';
import { lerp, seededRandom, TAU } from '../engine/math.js';

const CHUNK = 16;

const vertex = /* glsl */ `
in vec2 aPosition;
in vec2 aOffset;   // sparkle corner (unit size), zero for outline vertices
in vec4 aWave;     // xy: wobble direction, z: phase, w: twinkle speed (0 = outline)
out vec4 vColor;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform float uWaveTime;
uniform float uTime;
uniform float uAmplitude;
uniform vec3 uStrokeColor;
uniform vec3 uSparkleColor;
uniform vec3 uTwinkle; // min alpha, max alpha, scale dip

void main() {
  vec2 p;
  if (aWave.w == 0.0) {
    p = aPosition + aWave.xy * (uAmplitude * sin(uWaveTime + aWave.z));
    vColor = vec4(uStrokeColor, 1.0);
  } else {
    float t = 0.5 + 0.5 * sin(uTime * aWave.w + aWave.z);
    p = aPosition + aOffset * mix(1.0 - uTwinkle.z, 1.0, t);
    float a = mix(uTwinkle.x, uTwinkle.y, t);
    vColor = vec4(uSparkleColor * a, a); // premultiplied
  }
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(p, 1.0)).xy, 0.0, 1.0);
}`;

const fragment = /* glsl */ `
in vec4 vColor;
out vec4 finalColor;
void main() { finalColor = vColor; }`;

const rgb = (c) => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];

export class LevelView {
  constructor() {
    this.root = new Container();
    this.floor = null;
    this.chunks = [];
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
          uSparkleColor: { value: new Float32Array(rgb(WS.color)), type: 'vec3<f32>' },
          uTwinkle: {
            value: new Float32Array([Math.min(WS.minAlpha, WS.maxAlpha), Math.max(WS.minAlpha, WS.maxAlpha), WS.twinkleScaleAmount]),
            type: 'vec3<f32>',
          },
        },
      },
    });
    this.uniforms = this.shader.resources.wallUniforms.uniforms;
  }

  build(grid) {
    this.clear();
    this.floor = new Sprite(floorTexture(grid));
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
    const rand = seededRandom(WS.randomSeed); // same sparkle layout on every floor, like the original
    const pad = Math.max(0.01, 0.5 - WS.edgePadding);

    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (!isWall(x, y)) continue;
        if (!isWall(x, y - 1)) chunkOf(x, y).edge(x, y, x + 1, y, 0, -1);
        if (!isWall(x + 1, y)) chunkOf(x, y).edge(x + 1, y, x + 1, y + 1, 1, 0);
        if (!isWall(x, y + 1)) chunkOf(x, y).edge(x + 1, y + 1, x, y + 1, 0, 1);
        if (!isWall(x - 1, y)) chunkOf(x, y).edge(x, y + 1, x, y, -1, 0);

        let count = Math.floor(WS.sparklesPerTile);
        if (rand() < WS.sparklesPerTile - count) count++;
        for (let i = 0; i < count; i++) {
          chunkOf(x, y).sparkle(
            x + 0.5 + lerp(-pad, pad, rand()), y + 0.5 + lerp(-pad, pad, rand()),
            lerp(WS.sizeRange.x, WS.sizeRange.y, rand()), lerp(0, TAU, rand()),
            lerp(0, TAU, rand()), lerp(WS.twinkleSpeedRange.x, WS.twinkleSpeedRange.y, rand()),
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

  update(dt, view) {
    this.waveTime = (this.waveTime + dt * WV.squiggleSpeed) % TAU;
    this.time += dt;
    this.uniforms.uWaveTime = this.waveTime;
    this.uniforms.uTime = this.time;
    for (const c of this.chunks) {
      c.mesh.visible = c.x1 >= view.x0 && c.x0 <= view.x1 && c.y1 >= view.y0 && c.y0 <= view.y1;
    }
  }

  clear() {
    this.floor?.destroy({ texture: true, textureSource: true });
    this.floor = null;
    for (const c of this.chunks) c.mesh.destroy({ geometry: true }); // shader is shared
    this.chunks = [];
  }

  destroy() {
    this.clear();
    this.shader.destroy();
    this.root.destroy({ children: true });
  }
}

class ChunkBuilder {
  constructor(x0, y0) {
    this.x0 = x0; this.y0 = y0;
    this.positions = []; this.offsets = []; this.waves = []; this.indices = [];
  }

  vertex(px, py, ox, oy, wx, wy, phase, speed) {
    this.positions.push(px, py);
    this.offsets.push(ox, oy);
    this.waves.push(wx, wy, phase, speed);
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

  // Four-pointed twinkle star centred at (x, y).
  sparkle(x, y, size, rotation, phase, speed) {
    const ux = Math.cos(rotation) * size, uy = Math.sin(rotation) * size;
    const rx = -uy * 0.6, ry = ux * 0.6;
    const v = this.vertex(x, y, ux, uy, 0, 0, phase, speed);
    this.vertex(x, y, rx, ry, 0, 0, phase, speed);
    this.vertex(x, y, -ux, -uy, 0, 0, phase, speed);
    this.vertex(x, y, -rx, -ry, 0, 0, phase, speed);
    this.indices.push(v, v + 1, v + 2, v, v + 2, v + 3);
  }

  build() {
    return new Geometry({
      attributes: {
        aPosition: { buffer: new Float32Array(this.positions), format: 'float32x2' },
        aOffset: { buffer: new Float32Array(this.offsets), format: 'float32x2' },
        aWave: { buffer: new Float32Array(this.waves), format: 'float32x4' },
      },
      indexBuffer: new Uint32Array(this.indices),
    });
  }
}

// One pixel per tile, scaled up with nearest filtering.
function floorTexture(grid) {
  const canvas = document.createElement('canvas');
  canvas.width = grid.width; canvas.height = grid.height;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(grid.width, grid.height);
  const [r, g, b] = rgb(COLORS.floor).map((v) => Math.round(v * 255));
  for (let i = 0; i < grid.cells.length; i++) {
    if (grid.cells[i] !== 1) continue;
    img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const texture = Texture.from(canvas);
  texture.source.scaleMode = 'nearest';
  return texture;
}
