// Full-screen shockwave, for entering the Exalted state and for a guardian's death: a
// refracting ring races out from a world point, splitting colour along its crest, with a
// fainter echo ring behind it and a wash (dark red for Exalted) over everything it has
// passed. The filter is attached to the world only while a ripple plays.
import { Filter, GlProgram, Rectangle, defaultFilterVert } from 'pixi.js';
import { EXALTED_FX } from '../data/config.js';
import { clamp01 } from '../engine/math.js';

// The Exalted look; play() takes another: { duration, strength, width, tint: [r, g, b], grade: [r, g, b] }.
const EXALTED = EXALTED_FX.ripple;

const fragment = /* glsl */ `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uInputClamp;
uniform vec4 uOutputFrame;
uniform vec2 uCenter;    // screen pixels
uniform float uRadius;   // crest distance from the centre, pixels
uniform float uWidth;    // crest half-width, pixels
uniform float uStrength; // displacement at the crest, pixels
uniform float uFade;     // 1 → 0 over the ripple
uniform vec3 uTint;
uniform vec3 uGrade;  // the scene behind the main crest is multiplied by this

vec4 sampleAt(vec2 uv) { return texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw)); }

void main() {
  vec2 d = vTextureCoord * uInputSize.xy + uOutputFrame.xy - uCenter;
  float dist = length(d);
  vec2 dir = dist > 0.0 ? d / dist : vec2(0.0);

  // Lens push either side of each crest: pixels inside pull outward, outside pull in.
  float x = (dist - uRadius) / uWidth;
  float crest = exp(-2.5 * x * x);
  float x2 = (dist - uRadius * 0.62) / (uWidth * 0.8);
  float echo = exp(-2.5 * x2 * x2);
  float push = -(x * crest + 0.45 * x2 * echo) * uStrength * uFade;

  vec2 uv = vTextureCoord + dir * push * uInputSize.zw;
  vec2 split = dir * (crest + 0.5 * echo) * uStrength * 0.3 * uFade * uInputSize.zw;
  vec4 c = sampleAt(uv);
  c.r = sampleAt(uv + split).r;
  c.b = sampleAt(uv - split).b;

  // Tinted light on the crests; behind the main crest the scene is graded.
  float inside = 1.0 - smoothstep(-1.0, 0.5, x);
  vec3 graded = c.rgb * uGrade + uTint * 0.1;
  c.rgb = mix(c.rgb, graded, inside * uFade * 0.75);
  float glow = (0.6 * crest + 0.25 * echo) * uFade;
  c.rgb += uTint * glow;
  c.a = max(c.a, glow);
  finalColor = c;
}`;

export class ScreenRipple {
  constructor() {
    this.filter = new Filter({
      glProgram: GlProgram.from({ vertex: defaultFilterVert, fragment, name: 'exalted-ripple', preferredFragmentPrecision: 'highp' }),
      resources: {
        rippleUniforms: {
          uCenter: { value: new Float32Array(2), type: 'vec2<f32>' },
          uRadius: { value: 0, type: 'f32' },
          uWidth: { value: 1, type: 'f32' },
          uStrength: { value: 0, type: 'f32' },
          uFade: { value: 0, type: 'f32' },
          uTint: { value: new Float32Array(3), type: 'vec3<f32>' },
          uGrade: { value: new Float32Array(3), type: 'vec3<f32>' },
        },
      },
      resolution: 'inherit',
    });
    this.uniforms = this.filter.resources.rippleUniforms.uniforms;
    this.area = new Rectangle();
    this.origin = null; // world point the ripple spreads from; null when idle
    this.look = EXALTED;
    this.elapsed = 0;
  }

  play(pos, look = EXALTED) {
    this.look = look;
    this.uniforms.uTint.set(look.tint);
    this.uniforms.uGrade.set(look.grade);
    this.origin = { x: pos.x, y: pos.y };
    this.elapsed = 0;
  }

  // Runs after the camera has been applied to `root` for this frame.
  update(dt, cam, root) {
    if (!this.origin) return;
    const R = this.look;
    this.elapsed += dt;
    const t = this.elapsed / R.duration;
    if (t >= 1) {
      this.origin = null;
      root.filters = null;
      return;
    }
    // The filter covers exactly the visible world rect (filterArea is in root's local units).
    const v = cam.viewRect();
    this.area.x = v.x0; this.area.y = v.y0;
    this.area.width = v.x1 - v.x0; this.area.height = v.y1 - v.y0;
    root.filterArea = this.area;
    if (!root.filters) root.filters = [this.filter];

    const u = this.uniforms, h = cam.viewH;
    const cx = (this.origin.x - cam.viewX) * cam.ppu + cam.viewW / 2;
    const cy = (this.origin.y - cam.viewY) * cam.ppu + cam.viewH / 2;
    // Far enough to clear the farthest screen corner by the end.
    const reach = Math.hypot(Math.max(cx, cam.viewW - cx), Math.max(cy, cam.viewH - cy)) + h * R.width * 3;
    u.uCenter[0] = cx; u.uCenter[1] = cy;
    u.uRadius = reach * (1 - (1 - t) ** 3);
    u.uWidth = h * R.width * (0.6 + 0.8 * t);
    u.uStrength = h * R.strength;
    u.uFade = clamp01(1 - t) ** 1.3;
  }
}
