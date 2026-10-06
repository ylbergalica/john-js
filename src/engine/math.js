// Small math toolkit. Vectors are plain {x, y}; angles are radians; the world is y-down.

export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v) => clamp(v, 0, 1);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothStep01 = (t) => {
  t = clamp01(t);
  return t * t * (3 - 2 * t);
};

// Round half to even (keeps the level generator's distribution identical to the original).
export function roundHalfEven(v) {
  const f = Math.floor(v);
  const diff = v - f;
  if (diff !== 0.5) return diff > 0.5 ? f + 1 : f;
  return f % 2 === 0 ? f : f + 1;
}

// Sign that treats zero as positive.
export const signNonZero = (v) => (v >= 0 ? 1 : -1);

// ── Random ──────────────────────────────────────────────────────────
export const randRange = (min, max) => min + Math.random() * (max - min);
// Integer in [min, max); returns min for an empty range.
export const randInt = (min, max) => (max <= min ? min : min + Math.floor(Math.random() * (max - min)));
export const randSign = () => (Math.random() < 0.5 ? -1 : 1);
export function randInsideUnitCircle() {
  const a = Math.random() * TAU;
  const r = Math.sqrt(Math.random());
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
}

// entries: [{ weight, ...}] → one entry, chosen proportionally to weight (floats allowed).
export function pickWeighted(entries) {
  let total = 0;
  for (const e of entries) total += Math.max(0, e.weight);
  let roll = Math.random() * total;
  for (const e of entries) {
    roll -= Math.max(0, e.weight);
    if (roll < 0) return e;
  }
  return entries[entries.length - 1];
}

// Deterministic PRNG (mulberry32).
export function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Perlin noise, returns ~[0, 1] ───────────────────────────────────
const perm = new Uint8Array(512);
{
  const p = [151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180];
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const grad = (h, x, y) => ((h & 1) ? -x : x) + ((h & 2) ? -y : y);
export function perlinNoise(x, y) {
  const fx = Math.floor(x), fy = Math.floor(y);
  const xi = fx & 255, yi = fy & 255;
  const xf = x - fx, yf = y - fy;
  const u = fade(xf), v = fade(yf);
  const aa = perm[perm[xi] + yi], ab = perm[perm[xi] + yi + 1];
  const ba = perm[perm[xi + 1] + yi], bb = perm[perm[xi + 1] + yi + 1];
  const n = lerp(lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u),
                 lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u), v);
  return clamp01((n + 1) * 0.5);
}

// ── Vectors ─────────────────────────────────────────────────────────
export const len = (a) => Math.hypot(a.x, a.y);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const distSq = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
export const dot = (a, b) => a.x * b.x + a.y * b.y;
export const isZero = (a) => a.x === 0 && a.y === 0;
export const fromAngle = (r) => ({ x: Math.cos(r), y: Math.sin(r) });
// Unit vector, or zero for (near-)zero input.
export function norm(a) {
  const l = Math.hypot(a.x, a.y);
  return l > 1e-5 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
}
export function dirTo(from, to) { return norm({ x: to.x - from.x, y: to.y - from.y }); }
export function clampLength(a, max) {
  const l = Math.hypot(a.x, a.y);
  return l > max ? { x: (a.x / l) * max, y: (a.y / l) * max } : { x: a.x, y: a.y };
}

// Shortest signed difference between two angles (radians), in [-π, π).
export function deltaAngle(from, to) {
  let d = (to - from) % TAU;
  if (d < -Math.PI) d += TAU;
  else if (d >= Math.PI) d -= TAU;
  return d;
}

// Critically damped spring toward `target` (Game Programming Gems 4, ch. 1.10).
// `state.v` holds the velocity between calls.
export function smoothDamp(current, target, state, smoothTime, dt) {
  if (dt <= 0) return current;
  const omega = 2 / Math.max(0.0001, smoothTime);
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;
  const temp = (state.v + omega * change) * dt;
  state.v = (state.v - omega * temp) * exp;
  let out = target + (change + temp) * exp;
  if ((target - current > 0) === (out > target)) {
    out = target;
    state.v = 0;
  }
  return out;
}

export function smoothDampAngle(current, target, state, smoothTime, dt) {
  return smoothDamp(current, current + deltaAngle(current, target), state, smoothTime, dt);
}

export function lerpColor(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(lerp(ar, br, t)) << 16) | (Math.round(lerp(ag, bg, t)) << 8) | Math.round(lerp(ab, bb, t));
}
