// Coloured clouds drifting in the space behind the walls (NEBULA). One quad over the whole
// map, below the floor sprite, so they only show where there's no floor: fractal noise in
// the fragment shader, rolling slowly on a uniform clock. Hidden (not drawn) with the nebula
// setting off.
import { Geometry, Mesh, Shader } from 'pixi.js';
import { NEBULA as N } from '../data/config.js';
import { clamp01, lerp } from '../engine/math.js';
import { settings } from '../meta/settings.js';

const MARGIN = 40; // tiles past the map's edge, so the camera never sees the quad end

const vertex = /* glsl */ `
in vec2 aPosition;
out vec2 vPos;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  vPos = aPosition;
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
}`;

const fragment = /* glsl */ `
in vec2 vPos;
out vec4 finalColor;
uniform float uTime;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec4 uCloud; // alpha, coverage, scale, drift
uniform vec2 uSeed;

float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
// Each octave turned against the last, so the noise's square lattice never lines up into a grid.
const mat2 TURN = mat2(1.6, 1.2, -1.2, 1.6); // ×2, rotated ~37°
float fbm(vec2 p, int octaves) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    if (i >= octaves) break;
    v += a * noise(p);
    p = TURN * p + vec2(17.0, 9.0);
    a *= 0.5;
  }
  return v;
}

void main() {
  float t = uTime * uCloud.w;
  vec2 p = vPos * uCloud.z + uSeed;
  // Warp the domain by a second field for wispy, swirling edges.
  vec2 w = vec2(fbm(p + vec2(t, 0.0), 3), fbm(p + vec2(5.2, 1.3) - vec2(0.0, t), 3));
  float n = fbm(p + 1.6 * w + vec2(-t * 0.5, t * 0.3), 5);
  float cloud = smoothstep(1.0 - uCloud.y - 0.25, 1.0 - uCloud.y + 0.35, n);
  float a = cloud * cloud * uCloud.x;
  vec3 c = mix(uColorA, uColorB, smoothstep(0.3, 0.7, w.x));
  finalColor = vec4(c * a, a); // premultiplied
}`;

const rgb = (c) => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];

export class Nebula {
  constructor() {
    this.shader = Shader.from({
      gl: { vertex, fragment, name: 'nebula-shader' },
      resources: {
        nebulaUniforms: {
          uTime: { value: 0, type: 'f32' },
          uColorA: { value: new Float32Array(3), type: 'vec3<f32>' },
          uColorB: { value: new Float32Array(3), type: 'vec3<f32>' },
          uCloud: { value: new Float32Array(4), type: 'vec4<f32>' },
          uSeed: { value: new Float32Array(2), type: 'vec2<f32>' },
        },
      },
    });
    this.uniforms = this.shader.resources.nebulaUniforms.uniforms;
    this.mesh = null;
    this.palette = -1;
  }

  // → the floor's palette, [colorA, colorB], for the ground to borrow from.
  build(grid, floor, parent) {
    this.clear();
    let i = Math.floor(Math.random() * N.palettes.length);
    if (N.palettes.length > 1 && i === this.palette) i = (i + 1) % N.palettes.length;
    this.palette = i;
    const [a, b] = N.palettes[i];
    const k = clamp01((floor - 1) / Math.max(1, N.fullFloor - 1));
    const u = this.uniforms;
    u.uColorA = new Float32Array(rgb(a));
    u.uColorB = new Float32Array(rgb(b));
    u.uCloud = new Float32Array([lerp(N.alpha.min, N.alpha.max, k), lerp(N.coverage.min, N.coverage.max, k), N.scale, N.drift]);
    u.uSeed = new Float32Array([Math.random() * 200, Math.random() * 200]);

    const x0 = -MARGIN, y0 = -MARGIN, x1 = grid.width + MARGIN, y1 = grid.height + MARGIN;
    const geometry = new Geometry({
      attributes: { aPosition: { buffer: new Float32Array([x0, y0, x1, y0, x1, y1, x0, y1]), format: 'float32x2' } },
      indexBuffer: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    this.mesh = new Mesh({ geometry, shader: this.shader });
    parent.addChild(this.mesh);
    return [a, b];
  }

  update(time) {
    this.uniforms.uTime = time;
    if (this.mesh) this.mesh.visible = settings.nebula;
  }

  clear() {
    this.mesh?.destroy({ geometry: true }); // shader is shared
    this.mesh = null;
  }

  destroy() {
    this.clear();
    this.shader.destroy();
  }
}
