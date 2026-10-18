// Tears in the picture (the Black Rose's pulses and implosions): round patches of the world
// gone black, solid at their ragged edge and thinner within, where space itself stops holding
// together: stretched out in soft bands at random angles and in wedges dragged along the radius,
// smeared toward random anchors, all of it shifting about on an unsteady clock, and warped
// (bursting out along the edge, or wrung in toward the centre). Immediate mode: whatever wants
// one shows it every frame with tear(), and they're all drawn in one pass over the world,
// attached only while there are any (see World.render).
import { Filter, GlProgram, defaultFilterVert } from 'pixi.js';

const MAX = 8; // tears drawn at once; any past this are dropped
export const TearKind = { Pulse: 0, Implode: 1 };

const fragment = /* glsl */ `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uInputClamp;
uniform vec4 uOutputFrame;
uniform vec4 uTears[${MAX}]; // centre (screen pixels), radius (pixels), progress 0 → 1
uniform vec4 uLooks[${MAX}]; // kind, seed, strength, stretch strength
uniform float uCount;
uniform float uTime;
uniform vec3 uInk;     // the black it goes
uniform vec2 uOpacity; // how black: at its edge, and within

const float TAU = 6.2831853;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec4 sampleAt(vec2 uv) { return texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw)); }
float easeOut(float t) { return 1.0 - pow(1.0 - t, 3.0); }
float easeIn(float t) { return t * t * t; }
// A band of black just inside radius c (in radii), w thick, its sides soft.
float rim(float r, float c, float w) { return smoothstep(c - w - 0.05, c - w + 0.02, r) * (1.0 - smoothstep(c - 0.02, c + 0.03, r)); }

// How space is stretched at d (off the tear's centre) for one state of its clock, tick: bands
// at a random angle, each pulled long toward its own anchor, and wedges dragged out along the
// radius, each fading in and out across its width so none has a hard edge. Pixels to sample
// from, off d.
vec2 stretches(vec2 d, float dist, vec2 dir, float R, float seed, float tick) {
  vec2 off = vec2(0.0);
  float th = hash(vec2(tick, seed + 1.0)) * TAU;
  vec2 ax = vec2(cos(th), sin(th)), ay = vec2(-ax.y, ax.x);
  float qx = dot(d, ax), qy = dot(d, ay);
  float bq = qy / (R * mix(0.08, 0.3, hash(vec2(tick, seed + 2.0)))) + hash(vec2(tick, seed + 3.0)), band = floor(bq);
  if (hash(vec2(band, tick + seed)) < 0.45) {
    float soft = pow(sin(fract(bq) * 3.14159), 2.0);
    float anchor = (hash(vec2(band, tick - 4.0)) - 0.5) * R * 1.6;
    float stretch = mix(0.05, 0.4, hash(vec2(band + 9.0, tick)));
    off += ax * (anchor + (qx - anchor) * stretch - qx) * soft;
  }
  float sectors = floor(mix(4.0, 11.0, hash(vec2(tick, seed + 5.0))));
  float sq = fract(atan(d.y, d.x) / TAU + hash(vec2(tick, seed + 6.0))) * sectors, sec = floor(sq);
  if (hash(vec2(sec, tick + 7.0)) > 0.7) {
    float soft = pow(sin(fract(sq) * 3.14159), 2.0);
    float r0 = hash(vec2(sec, tick + 8.0)) * 0.9 * R;
    off += dir * (r0 + (dist - r0) * mix(0.08, 0.35, hash(vec2(sec, tick + 9.0))) - dist) * soft;
  }
  return off;
}

void main() {
  vec2 px = vTextureCoord * uInputSize.xy + uOutputFrame.xy;
  vec2 offset = vec2(0.0); // where to sample from, pixels off this one
  float split = 0.0;       // colour split along the stretches, pixels
  float black = 0.0;

  for (int i = 0; i < ${MAX}; i++) {
    if (float(i) >= uCount) break;
    vec4 e = uTears[i], k = uLooks[i];
    float R = e.z, t = e.w, seed = k.y, S = k.z;
    vec2 d = px - e.xy;
    float dist = length(d);
    if (dist > R * 1.45) continue;
    vec2 dir = dist > 0.001 ? d / dist : vec2(1.0, 0.0);
    // Its edges are ragged, writhing like smoke.
    float r = dist / R + (vnoise(dir * 2.6 + seed + uTime * vec2(2.1, -1.4)) - 0.5) * 0.16
      + (vnoise(dir * 7.0 - seed + uTime * vec2(-3.3, 2.7)) - 0.5) * 0.06;

    float w, edge, inner;
    float u = clamp((t - 0.5) / 0.5, 0.0, 1.0), p = clamp(t / 0.5, 0.0, 1.0);
    if (k.x < 0.5) {
      // Pulse: an edge bursting out to the full radius by the strike (t = 0.5), the black thin
      // behind it; then on a little past it, thinning, as it all fades.
      float c = t < 0.5 ? easeOut(p) : 1.0 + 0.2 * easeOut(u);
      float env = t < 0.5 ? min(1.0, p * 5.0) : pow(1.0 - u, 1.5);
      edge = rim(r, c, mix(0.08, 0.18, p) * (1.0 - 0.5 * u)) * env;
      inner = (1.0 - smoothstep(c - 0.1, c, r)) * env;
      w = max(edge, inner);
      offset -= dir * edge * R * 0.08 * S; // the space at its edge pushed out
    } else {
      // Implosion: an edge rushing in from past the radius to the centre by the strike, the
      // black within it thickening and the space wrung inward and twisted, worse as it closes;
      // then a knot of black at the centre that bursts out a little and is gone.
      if (t < 0.5) {
        float c = 1.2 * (1.0 - easeIn(p)) + 0.05;
        float env = min(1.0, p * 4.0);
        edge = rim(r, c, 0.12) * env;
        inner = (1.0 - smoothstep(c - 0.1, c, r)) * mix(0.4, 1.0, p) * env;
        w = max(edge, inner);
        float pull = R * 0.3 * p * p * max(0.0, 1.0 - dist / R) * S;
        float a = 1.8 * p * p * max(0.0, 1.0 - dist / R) * S * (fract(seed) < 0.5 ? -1.0 : 1.0);
        vec2 rd = vec2(cos(a) * d.x - sin(a) * d.y, sin(a) * d.x + cos(a) * d.y);
        offset += (rd - d) + dir * pull;
      } else {
        // The knot stays solid a while, swallowing what it's dragged in, then thins away.
        float env = pow(1.0 - u, 1.6);
        float knot = 0.3 + 0.35 * easeOut(u);
        edge = (1.0 - smoothstep(knot - 0.06, knot + 0.02, r)) * (1.0 - smoothstep(0.45, 1.0, u));
        inner = 0.0;
        w = max(edge, (1.0 - smoothstep(0.6, 1.1, r)) * env * 0.6);
        offset -= dir * edge * R * 0.1 * S;
      }
    }
    black = max(black, max(edge * uOpacity.x, inner * uOpacity.y) * S);
    if (w <= 0.001) continue;
    float g = w * S * k.w;

    // A restless clock, each tear at its own unsteady pace, easing from one state of the
    // stretches into the next rather than jumping.
    float clock = uTime * mix(5.0, 9.0, hash(vec2(seed, 1.7))) + seed * 13.0 + 0.6 * sin(uTime * 3.1 + seed);
    float tick = floor(clock), f = smoothstep(0.0, 1.0, fract(clock));
    offset += mix(stretches(d, dist, dir, R, seed, tick), stretches(d, dist, dir, R, seed, tick + 1.0), f) * g;
    split = max(split, R * 0.012 * g);
  }

  vec2 uv = (px + offset - uOutputFrame.xy) * uInputSize.zw;
  vec4 c = sampleAt(uv);
  if (split > 0.5) {
    vec2 sp = vec2(split, 0.0) * uInputSize.zw;
    c.r = sampleAt(uv + sp).r;
    c.b = sampleAt(uv - sp).b;
  }
  float a = max(c.a, black);
  c.rgb = mix(c.rgb, uInk * a, black);
  c.a = a;
  finalColor = c;
}`;

const hexRgb = (n) => [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];

export class Distortion {
  constructor() {
    this.filter = new Filter({
      glProgram: GlProgram.from({ vertex: defaultFilterVert, fragment, name: 'tear', preferredFragmentPrecision: 'highp' }),
      resources: {
        tearUniforms: {
          uTears: { value: new Float32Array(MAX * 4), type: 'vec4<f32>', size: MAX },
          uLooks: { value: new Float32Array(MAX * 4), type: 'vec4<f32>', size: MAX },
          uCount: { value: 0, type: 'f32' },
          uTime: { value: 0, type: 'f32' },
          uInk: { value: new Float32Array(3), type: 'vec3<f32>' },
          uOpacity: { value: new Float32Array(2), type: 'vec2<f32>' },
        },
      },
      resolution: 'inherit',
    });
    this.uniforms = this.filter.resources.tearUniforms.uniforms;
    this.tears = []; // this frame's
    this.time = 0;
  }

  // Shows a tear this frame at world point (x, y), `radius` world units, `t` of the way
  // through (0 → 1, the strike at 0.5). look: { kind (TearKind), seed, strength, stretch, ink,
  // opacity: [at its edge, within] }.
  tear(x, y, radius, t, look) {
    if (this.tears.length < MAX) this.tears.push({ x, y, radius, t, look });
  }

  // Runs after the camera has been applied for this frame: whether there's any to draw.
  update(dt, cam) {
    this.time += dt;
    const u = this.uniforms, n = this.tears.length;
    u.uCount = n;
    if (n === 0) return false;
    u.uTime = this.time;
    this.tears.forEach(({ x, y, radius, t, look }, i) => {
      u.uTears.set([(x - cam.viewX) * cam.ppu + cam.viewW / 2, (y - cam.viewY) * cam.ppu + cam.viewH / 2, radius * cam.ppu, t], i * 4);
      u.uLooks.set([look.kind, look.seed, look.strength ?? 1, look.stretch ?? 1], i * 4);
    });
    const { ink, opacity } = this.tears[0].look;
    u.uInk.set(hexRgb(ink));
    u.uOpacity.set(opacity);
    this.tears.length = 0;
    return true;
  }
}
