// Procedural sound effects. Like the sprites, nothing is loaded from files: each sound
// is a short recipe of oscillators and filtered noise, synthesized with Web Audio when
// played. Browsers start audio suspended, so the context is created/resumed on the
// first key or mouse press (`sfx.unlock`).

const MUTE_KEY = 'john.muted';
const MASTER_VOLUME = 0.5;
const MAX_VOICES = 32;
const MIN_REPEAT = 0.03; // seconds; the same sound retriggering faster than this is dropped
const PITCH_JITTER = 0.04; // random ± pitch so repeats don't sound stamped
const SILENT = 0.0001; // exponential ramps can't reach 0

let ctx = null, master = null, noiseBuffer = null;
let voices = 0;
let muted = readMuted();
const lastPlayed = new Map();

function readMuted() {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}

function ensureContext() {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 12;
  comp.ratio.value = 4;
  master = ctx.createGain();
  master.gain.value = muted ? 0 : MASTER_VOLUME;
  master.connect(comp).connect(ctx.destination);
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuffer.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

// ── synthesis helpers ──────────────────────────────────────────────
// A voice `v` is { t: start time, out: its output node, pitch }; every node a recipe
// creates feeds v.out, and the last one to stop releases the voice.

function envelope(v, t, dur, vol, attack) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(SILENT, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(SILENT, t + dur);
  g.connect(v.out);
  return g;
}

function schedule(v, node, t, dur) {
  node.stop(t + dur + 0.02);
  if (t + dur >= v.end) { v.end = t + dur; v.last = node; }
}

// Oscillator gliding exponentially from `freq` to `to` over `dur`.
function tone(v, { type = 'sine', freq, to = freq, at = 0, dur, vol = 0.2, attack = 0.004 }) {
  const t = v.t + at;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq * v.pitch, t);
  if (to !== freq) osc.frequency.exponentialRampToValueAtTime(to * v.pitch, t + dur);
  osc.connect(envelope(v, t, dur, vol, attack));
  osc.start(t);
  schedule(v, osc, t, dur);
}

// White noise through a filter whose cutoff sweeps from `freq` to `to`.
function noise(v, { filter = 'bandpass', freq = 1000, to = freq, q = 1, at = 0, dur, vol = 0.2, attack = 0.004 }) {
  const t = v.t + at;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq * v.pitch, t);
  if (to !== freq) f.frequency.exponentialRampToValueAtTime(to * v.pitch, t + dur);
  src.connect(f).connect(envelope(v, t, dur, vol, attack));
  src.start(t, Math.random() * Math.max(0, noiseBuffer.duration - dur - 0.05));
  schedule(v, src, t, dur);
}

// Notes one after another, `step` seconds apart.
function arp(v, freqs, step, opts) {
  freqs.forEach((freq, i) => tone(v, { ...opts, freq, at: (opts.at ?? 0) + i * step }));
}

// ── recipes ────────────────────────────────────────────────────────
const SOUNDS = {
  // player
  swing(v) {
    noise(v, { freq: 900, to: 2800, q: 1.2, dur: 0.13, vol: 0.28, attack: 0.02 });
  },
  dash(v) {
    noise(v, { freq: 350, to: 1800, q: 0.8, dur: 0.18, vol: 0.3, attack: 0.02 });
    tone(v, { type: 'sine', freq: 160, to: 320, dur: 0.12, vol: 0.06 });
  },
  parryStart(v) {
    noise(v, { filter: 'highpass', freq: 2500, to: 5000, dur: 0.08, vol: 0.08, attack: 0.01 });
  },
  parry(v) {
    noise(v, { filter: 'highpass', freq: 3500, dur: 0.05, vol: 0.35 });
    tone(v, { freq: 1568, dur: 0.6, vol: 0.22 });
    tone(v, { freq: 2100, dur: 0.45, vol: 0.12 });
    tone(v, { type: 'triangle', freq: 3136, dur: 0.22, vol: 0.08 });
    tone(v, { type: 'square', freq: 220, to: 110, dur: 0.1, vol: 0.08 });
  },
  // Layered over `parry` at the top of a parry streak: a heavier body, a ringing fifth and
  // a tiny trailing chime.
  parryCrown(v) {
    tone(v, { freq: 130, to: 55, dur: 0.35, vol: 0.32 });
    noise(v, { filter: 'lowpass', freq: 2200, to: 300, dur: 0.25, vol: 0.25 });
    tone(v, { type: 'triangle', freq: 1175, dur: 0.9, vol: 0.07, attack: 0.02 });
    arp(v, [3136, 4186], 0.07, { type: 'triangle', at: 0.2, dur: 0.25, vol: 0.06 });
  },
  hurt(v) {
    tone(v, { type: 'sawtooth', freq: 180, to: 55, dur: 0.25, vol: 0.25 });
    noise(v, { filter: 'lowpass', freq: 1400, to: 200, dur: 0.22, vol: 0.5 });
  },
  death(v) {
    tone(v, { type: 'sawtooth', freq: 320, to: 40, dur: 1.3, vol: 0.25 });
    tone(v, { type: 'sine', freq: 160, to: 30, dur: 1.4, vol: 0.3 });
    noise(v, { filter: 'lowpass', freq: 2000, to: 80, dur: 1.1, vol: 0.45 });
  },

  // enemies
  hit(v) {
    tone(v, { type: 'square', freq: 240, to: 80, dur: 0.09, vol: 0.18 });
    noise(v, { filter: 'lowpass', freq: 4000, to: 500, dur: 0.08, vol: 0.45 });
    tone(v, { freq: 1500, to: 900, dur: 0.035, vol: 0.1 });
  },
  kill(v) {
    tone(v, { type: 'triangle', freq: 460, to: 110, dur: 0.28, vol: 0.28 });
    noise(v, { freq: 1500, to: 200, q: 0.7, dur: 0.32, vol: 0.35 });
    tone(v, { freq: 990, to: 1980, at: 0.03, dur: 0.15, vol: 0.06 });
  },
  bossKill(v) {
    tone(v, { type: 'sawtooth', freq: 220, to: 30, dur: 1.4, vol: 0.25 });
    tone(v, { type: 'sine', freq: 110, to: 25, dur: 1.6, vol: 0.4 });
    noise(v, { filter: 'lowpass', freq: 3000, to: 60, dur: 1.5, vol: 0.5 });
    arp(v, [523, 784, 1047, 1568], 0.09, { type: 'triangle', at: 0.25, dur: 0.6, vol: 0.08 });
  },
  windup(v) {
    tone(v, { type: 'triangle', freq: 300, to: 620, dur: 0.14, vol: 0.09, attack: 0.03 });
  },
  enemyDash(v) {
    noise(v, { freq: 250, to: 1100, q: 1, dur: 0.22, vol: 0.25, attack: 0.03 });
  },
  punch(v) {
    tone(v, { type: 'square', freq: 160, to: 60, dur: 0.12, vol: 0.14 });
    noise(v, { freq: 600, to: 1500, dur: 0.12, vol: 0.25, attack: 0.02 });
  },
  slam(v) {
    tone(v, { freq: 95, to: 32, dur: 0.45, vol: 0.55 });
    noise(v, { filter: 'lowpass', freq: 700, to: 80, dur: 0.4, vol: 0.5 });
  },
  throw(v) {
    tone(v, { type: 'square', freq: 520, to: 1100, dur: 0.08, vol: 0.06 });
    noise(v, { freq: 1200, to: 2400, q: 2, dur: 0.1, vol: 0.12 });
  },
  fizzle(v) {
    noise(v, { filter: 'highpass', freq: 2000, to: 800, dur: 0.1, vol: 0.12 });
  },

  // pickups and progression
  orb(v) {
    tone(v, { freq: 660, to: 990, dur: 0.09, vol: 0.12 });
  },
  adrenalineFull(v) {
    arp(v, [880, 1320, 1760], 0.07, { type: 'triangle', dur: 0.3, vol: 0.12 });
  },
  core(v) {
    arp(v, [784, 1175, 1568], 0.06, { type: 'triangle', dur: 0.35, vol: 0.15 });
  },
  exitOpen(v) {
    arp(v, [523, 659, 784, 1047, 1319], 0.07, { type: 'triangle', dur: 0.5, vol: 0.13 });
    tone(v, { freq: 262, at: 0.28, dur: 0.8, vol: 0.12, attack: 0.05 });
  },
  floor(v) {
    noise(v, { freq: 200, to: 3000, q: 1.5, dur: 0.6, vol: 0.18, attack: 0.3 });
    tone(v, { freq: 130, to: 260, dur: 0.7, vol: 0.18, attack: 0.2 });
    arp(v, [392, 523, 784], 0.08, { type: 'triangle', at: 0.45, dur: 0.6, vol: 0.1 });
  },
  exalted(v) {
    tone(v, { type: 'sawtooth', freq: 110, to: 440, dur: 0.7, vol: 0.12, attack: 0.05 });
    tone(v, { type: 'sawtooth', freq: 111.5, to: 446, dur: 0.7, vol: 0.12, attack: 0.05 });
    noise(v, { freq: 200, to: 4000, q: 1, dur: 0.6, vol: 0.25, attack: 0.1 });
    tone(v, { freq: 55, to: 110, dur: 0.9, vol: 0.35 });
  },
  exaltedEnd(v) {
    tone(v, { type: 'triangle', freq: 660, to: 200, dur: 0.5, vol: 0.14 });
    noise(v, { freq: 3000, to: 300, dur: 0.45, vol: 0.12 });
  },

  // aspects
  blink(v) {
    tone(v, { freq: 2000, to: 300, dur: 0.14, vol: 0.14 });
    noise(v, { filter: 'highpass', freq: 4000, to: 1500, dur: 0.1, vol: 0.15 });
  },
  crescent(v) {
    noise(v, { freq: 2600, to: 700, q: 3, dur: 0.22, vol: 0.22, attack: 0.01 });
    tone(v, { freq: 1300, to: 600, dur: 0.16, vol: 0.05 });
  },
  rift(v) {
    noise(v, { filter: 'highpass', freq: 1500, to: 6000, dur: 0.3, vol: 0.18, attack: 0.02 });
    arp(v, [659, 988], 0.04, { type: 'triangle', dur: 0.35, vol: 0.09 });
  },
  anchorThrow(v) {
    noise(v, { freq: 700, to: 300, q: 1.2, dur: 0.25, vol: 0.22, attack: 0.02 });
    tone(v, { type: 'triangle', freq: 320, to: 200, dur: 0.15, vol: 0.08 });
  },
  anchorLand(v) {
    tone(v, { type: 'triangle', freq: 1100, dur: 0.15, vol: 0.1 });
    tone(v, { freq: 160, to: 90, dur: 0.1, vol: 0.2 });
  },
  anchorPickup(v) {
    arp(v, [880, 1320], 0.05, { type: 'triangle', dur: 0.12, vol: 0.1 });
  },
  warp(v) {
    tone(v, { freq: 200, to: 1600, dur: 0.3, vol: 0.12, attack: 0.05 });
    noise(v, { filter: 'highpass', freq: 800, to: 5000, dur: 0.3, vol: 0.1, attack: 0.1 });
  },
  shockwave(v) {
    tone(v, { freq: 130, to: 40, dur: 0.45, vol: 0.5 });
    noise(v, { filter: 'lowpass', freq: 1800, to: 150, dur: 0.4, vol: 0.45 });
  },

  // UI
  hover(v) {
    tone(v, { freq: 1200, dur: 0.03, vol: 0.03 });
  },
  click(v) {
    tone(v, { type: 'triangle', freq: 700, to: 900, dur: 0.06, vol: 0.12 });
  },
  deny(v) {
    tone(v, { type: 'square', freq: 150, dur: 0.14, vol: 0.08 });
  },
  pause(v) {
    tone(v, { type: 'triangle', freq: 520, to: 340, dur: 0.1, vol: 0.1 });
  },
  unlock(v) {
    noise(v, { freq: 400, to: 5000, q: 1, dur: 0.5, vol: 0.15, attack: 0.3 });
    arp(v, [523, 659, 784, 1047], 0.09, { type: 'triangle', at: 0.3, dur: 0.7, vol: 0.13 });
    tone(v, { freq: 262, at: 0.3, dur: 1.2, vol: 0.12, attack: 0.05 });
  },
};

// ── public API ─────────────────────────────────────────────────────
export const sfx = {
  get muted() { return muted; },

  // Must run inside a user gesture before anything is audible.
  unlock() {
    if (ensureContext()?.state === 'suspended') ctx.resume();
  },

  // opts: { volume = 1, pan = 0 (-1 left … 1 right), pitch = 1, jitter = PITCH_JITTER }
  play(name, { volume = 1, pan = 0, pitch = 1, jitter = PITCH_JITTER } = {}) {
    if (muted || !ctx || ctx.state !== 'running' || voices >= MAX_VOICES || volume <= 0) return;
    const recipe = SOUNDS[name];
    if (!recipe) return;
    const now = ctx.currentTime;
    if (now - (lastPlayed.get(name) ?? -Infinity) < MIN_REPEAT) return;
    lastPlayed.set(name, now);

    const out = ctx.createGain();
    out.gain.value = volume;
    if (pan) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      out.connect(panner).connect(master);
    } else {
      out.connect(master);
    }
    const v = { t: now + 0.005, out, pitch: pitch * (1 + (Math.random() * 2 - 1) * jitter), end: 0, last: null };
    recipe(v);
    voices++;
    v.last.onended = () => { voices--; out.disconnect(); };
  },

  toggleMute() {
    muted = !muted;
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* storage unavailable */ }
    if (master) master.gain.setTargetAtTime(muted ? 0 : MASTER_VOLUME, ctx.currentTime, 0.02);
    return muted;
  },
};
