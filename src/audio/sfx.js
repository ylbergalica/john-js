// Procedural sound effects. Like the sprites, nothing is loaded from files: each sound
// is a short recipe of oscillators and filtered noise, synthesized with Web Audio when
// played. Browsers start audio suspended, so the context is created/resumed on the
// first key or mouse press (`sfx.unlock`). Looping beds (`sfx.loop`) run until stopped.

const MUTE_KEY = 'john.muted';
const MASTER_VOLUME = 0.5;
const MAX_VOICES = 32;
const MIN_REPEAT = 0.03; // seconds; the same sound retriggering faster than this is dropped
const PITCH_JITTER = 0.04; // random ± pitch so repeats don't sound stamped
const SILENT = 0.0001; // exponential ramps can't reach 0

let ctx = null, master = null, noiseBuffer = null, crackleBuffer = null, driveCurve = null;
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

// Rises over `attack`, holds until `hold`, then decays to silence at `dur`.
function envelope(v, t, dur, vol, attack, hold = 0, out = v.out) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(SILENT, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  if (hold > attack) g.gain.setValueAtTime(vol, t + hold);
  g.gain.exponentialRampToValueAtTime(SILENT, t + dur);
  g.connect(out);
  return g;
}

function schedule(v, node, t, dur) {
  node.stop(t + dur + 0.02);
  if (t + dur >= v.end) { v.end = t + dur; v.last = node; }
}

// Oscillator gliding exponentially from `freq` to `to` over `dur`. `out` routes it through
// a recipe's own node chain instead of straight to the voice.
function tone(v, { type = 'sine', freq, to = freq, at = 0, dur, vol = 0.2, attack = 0.004, hold = 0, out }) {
  const t = v.t + at;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq * v.pitch, t);
  if (to !== freq) osc.frequency.exponentialRampToValueAtTime(to * v.pitch, t + dur);
  osc.connect(envelope(v, t, dur, vol, attack, hold, out));
  osc.start(t);
  schedule(v, osc, t, dur);
  return osc;
}

// White noise through a filter whose cutoff sweeps from `freq` to `to`.
function noise(v, { filter = 'bandpass', freq = 1000, to = freq, q = 1, at = 0, dur, vol = 0.2, attack = 0.004, hold = 0, out }) {
  const t = v.t + at;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq * v.pitch, t);
  if (to !== freq) f.frequency.exponentialRampToValueAtTime(to * v.pitch, t + dur);
  src.connect(f).connect(envelope(v, t, dur, vol, attack, hold, out));
  src.start(t, Math.random() * Math.max(0, noiseBuffer.duration - dur - 0.05));
  schedule(v, src, t, dur);
}

// LFO wobbling `param` by ±`depth` at `rate` Hz for the voice's first `dur` seconds.
function lfo(v, param, { rate, depth, dur, type = 'sine' }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = rate;
  const g = ctx.createGain();
  g.gain.value = depth;
  osc.connect(g).connect(param);
  osc.start(v.t);
  schedule(v, osc, v.t, dur);
}

// Soft-clipping curve: adds grit without harsh distortion.
function drive() {
  if (!driveCurve) {
    driveCurve = new Float32Array(1024);
    for (let i = 0; i < driveCurve.length; i++) driveCurve[i] = Math.tanh(3 * ((i / (driveCurve.length - 1)) * 2 - 1));
  }
  return driveCurve;
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
  heave(v) { // a heavy weapon swung through the air
    noise(v, { freq: 220, to: 900, q: 0.9, dur: 0.26, vol: 0.32, attack: 0.05 });
    tone(v, { type: 'triangle', freq: 120, to: 60, dur: 0.2, vol: 0.12 });
  },
  slash(v) { // a steel blade whipping through the air, ringing
    noise(v, { filter: 'highpass', freq: 1800, to: 5200, q: 0.8, dur: 0.14, vol: 0.28, attack: 0.02 });
    noise(v, { freq: 700, to: 2400, q: 1.2, dur: 0.12, vol: 0.18, attack: 0.015 });
    tone(v, { type: 'triangle', freq: 2650, to: 2500, at: 0.03, dur: 0.3, vol: 0.045 });
    tone(v, { freq: 3970, to: 3800, at: 0.03, dur: 0.22, vol: 0.03 });
  },
  throw(v) {
    tone(v, { type: 'square', freq: 520, to: 1100, dur: 0.08, vol: 0.06 });
    noise(v, { freq: 1200, to: 2400, q: 2, dur: 0.1, vol: 0.12 });
  },
  fizzle(v) {
    noise(v, { filter: 'highpass', freq: 2000, to: 800, dur: 0.1, vol: 0.12 });
  },
  // the Seer
  mistThrow(v) { // a ball of mist flung up out of sight
    noise(v, { freq: 300, to: 2600, q: 0.8, dur: 0.4, vol: 0.26, attack: 0.03 });
    tone(v, { type: 'triangle', freq: 180, to: 520, dur: 0.3, vol: 0.08 });
  },
  mistBoom(v) { // and coming down
    tone(v, { freq: 120, to: 38, dur: 0.5, vol: 0.45 });
    noise(v, { filter: 'lowpass', freq: 1400, to: 120, dur: 0.5, vol: 0.45, attack: 0.01 });
    noise(v, { freq: 900, to: 300, q: 1.4, dur: 0.35, vol: 0.12, attack: 0.02 });
  },
  // the Seraph
  boost(v) { // a jet lighting up for the ram
    noise(v, { freq: 200, to: 1600, q: 0.9, dur: 0.5, vol: 0.32, attack: 0.04 });
    tone(v, { type: 'sawtooth', freq: 70, to: 140, dur: 0.45, vol: 0.12, attack: 0.03 });
  },
  crash(v) {
    tone(v, { freq: 85, to: 28, dur: 0.5, vol: 0.55 });
    noise(v, { filter: 'lowpass', freq: 1800, to: 100, dur: 0.45, vol: 0.55 });
    tone(v, { type: 'square', freq: 300, to: 90, dur: 0.12, vol: 0.12 });
  },
  missile(v) {
    noise(v, { freq: 400, to: 2200, q: 1.2, dur: 0.35, vol: 0.22, attack: 0.02 });
    tone(v, { type: 'triangle', freq: 300, to: 700, dur: 0.2, vol: 0.06 });
  },
  laserCharge(v) { // swells over about as long as the laser's wind-up
    tone(v, { type: 'sawtooth', freq: 140, to: 880, dur: 1.8, vol: 0.05, attack: 1.4, hold: 1.65 });
    tone(v, { freq: 420, to: 1760, dur: 1.8, vol: 0.05, attack: 1.5, hold: 1.7 });
    noise(v, { freq: 600, to: 4000, q: 2, dur: 1.8, vol: 0.06, attack: 1.5, hold: 1.7 });
  },
  laserLock(v) { // two quick blips: the aim is fixed
    arp(v, [1760, 1760], 0.09, { type: 'square', dur: 0.06, vol: 0.06 });
  },
  laserFire(v) {
    tone(v, { type: 'sawtooth', freq: 900, to: 120, dur: 0.35, vol: 0.18 });
    noise(v, { filter: 'highpass', freq: 1500, to: 600, dur: 0.3, vol: 0.3 });
    tone(v, { freq: 60, to: 40, dur: 0.4, vol: 0.4 });
  },

  // pickups and progression
  orb(v) {
    tone(v, { freq: 660, to: 990, dur: 0.09, vol: 0.12 });
  },
  // Exalted is ready: a heartbeat double-thump, then fire catches with a dark whoosh, a
  // burst of crackles and a low growl swelling under it.
  adrenalineFull(v) {
    for (const [at, vol] of [[0, 0.5], [0.26, 0.4]]) {
      tone(v, { freq: 78, to: 40, at, dur: 0.24, vol, attack: 0.005 });
      noise(v, { filter: 'lowpass', freq: 280, to: 90, at, dur: 0.16, vol: vol * 0.6 });
    }
    noise(v, { filter: 'lowpass', freq: 180, to: 2400, at: 0.32, dur: 0.95, vol: 0.32, attack: 0.28 });
    noise(v, { freq: 650, to: 280, q: 0.8, at: 0.4, dur: 1.2, vol: 0.16, attack: 0.3, hold: 0.55 });
    tone(v, { type: 'sawtooth', freq: 55, to: 48, at: 0.32, dur: 1.3, vol: 0.05, attack: 0.35 });
    tone(v, { type: 'triangle', freq: 110, to: 98, at: 0.32, dur: 1.3, vol: 0.07, attack: 0.35 });
    for (let i = 0; i < 9; i++) {
      noise(v, { filter: 'highpass', freq: 2500 + Math.random() * 2500, at: 0.42 + Math.random() * 0.7, dur: 0.02 + Math.random() * 0.03, vol: 0.06 + Math.random() * 0.1 });
    }
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
  astralHeal(v) { // starlight pouring into the health bar: an airy shimmer under a slow, rising chime
    noise(v, { filter: 'highpass', freq: 3000, to: 7000, dur: 1.8, vol: 0.05, attack: 0.6 });
    tone(v, { freq: 523, to: 784, at: 0.3, dur: 1.6, vol: 0.06, attack: 0.5 });
    arp(v, [1047, 1319, 1568, 2093], 0.16, { type: 'triangle', at: 0.45, dur: 0.9, vol: 0.05, attack: 0.02 });
  },
  guardian(v) { // the camera finds the floor's guardian: a sub hit under a low, uneasy swell
    tone(v, { freq: 72, to: 36, dur: 1.8, vol: 0.4, attack: 0.01 });
    noise(v, { filter: 'lowpass', freq: 700, to: 70, dur: 1.4, vol: 0.3 });
    noise(v, { filter: 'bandpass', freq: 180, to: 420, q: 4, at: 0.2, dur: 2, vol: 0.12, attack: 0.9 });
    tone(v, { type: 'triangle', freq: 110, to: 104, at: 0.1, dur: 2.2, vol: 0.09, attack: 0.6, hold: 1.2 });
    tone(v, { type: 'triangle', freq: 156, to: 147, at: 0.1, dur: 2.2, vol: 0.06, attack: 0.6, hold: 1.2 });
  },
  // A muffled demonic roar: low detuned saws a fifth apart and a breathy throat, rasped by a
  // fast tremolo, driven for grit and smothered by a lowpass that opens then closes, over the
  // whoomp of the fire catching and a sub hit.
  exalted(v) {
    const dur = 1.7;
    const throat = ctx.createGain();
    throat.gain.value = 0.55;
    lfo(v, throat.gain, { rate: 31, depth: 0.45, dur, type: 'triangle' });
    const grit = ctx.createWaveShaper();
    grit.curve = drive();
    const muffle = ctx.createBiquadFilter();
    muffle.type = 'lowpass';
    muffle.Q.value = 3;
    muffle.frequency.setValueAtTime(260, v.t);
    muffle.frequency.exponentialRampToValueAtTime(950, v.t + 0.3);
    muffle.frequency.exponentialRampToValueAtTime(200, v.t + dur);
    const trim = ctx.createGain();
    trim.gain.value = 0.6;
    throat.connect(grit).connect(muffle).connect(trim).connect(v.out);
    for (const [freq, to] of [[96, 62], [97.4, 63], [64, 41]]) {
      const osc = tone(v, { type: 'sawtooth', freq, to, dur, vol: 0.22, attack: 0.14, hold: 0.75, out: throat });
      lfo(v, osc.frequency, { rate: 5.5, depth: freq * 0.03, dur });
    }
    noise(v, { freq: 420, to: 180, q: 0.9, dur: dur - 0.2, vol: 0.6, attack: 0.1, hold: 0.6, out: throat });
    noise(v, { filter: 'lowpass', freq: 120, to: 900, dur: 0.5, vol: 0.4, attack: 0.16 });
    tone(v, { freq: 62, to: 26, dur: 1, vol: 0.5, attack: 0.02 });
  },
  // The fire gutters out: a falling exhale and a low sigh.
  exaltedEnd(v) {
    noise(v, { filter: 'lowpass', freq: 1600, to: 160, dur: 0.75, vol: 0.32, attack: 0.04 });
    tone(v, { freq: 120, to: 50, dur: 0.6, vol: 0.18, attack: 0.03 });
    noise(v, { filter: 'highpass', freq: 3500, to: 2000, dur: 0.35, vol: 0.05 });
  },

  // aspects
  // Flash: an airy fwip swelling in, a bright crack as you vanish, and a quick glassy
  // shimmer tumbling down where you land.
  flash(v) {
    noise(v, { freq: 900, to: 6500, q: 1.4, dur: 0.1, vol: 0.2, attack: 0.08 });
    noise(v, { filter: 'highpass', freq: 5000, at: 0.08, dur: 0.035, vol: 0.28 });
    tone(v, { type: 'square', freq: 3200, to: 1400, at: 0.08, dur: 0.03, vol: 0.03 });
    arp(v, [4186, 3520, 2794, 2349], 0.022, { at: 0.09, dur: 0.22, vol: 0.045 });
    tone(v, { type: 'triangle', freq: 1175, to: 1245, at: 0.09, dur: 0.3, vol: 0.05, attack: 0.01 });
  },
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

  // run summary
  summary(v) { // the title lands: a sub boom under a dark, slowly falling chord
    tone(v, { freq: 90, to: 40, dur: 1.6, vol: 0.35, attack: 0.01 });
    noise(v, { filter: 'lowpass', freq: 900, to: 70, dur: 1.3, vol: 0.35 });
    tone(v, { type: 'triangle', freq: 220, to: 196, at: 0.05, dur: 2, vol: 0.07, attack: 0.25 });
    tone(v, { type: 'triangle', freq: 262, to: 233, at: 0.05, dur: 2, vol: 0.05, attack: 0.25 });
  },
  reveal(v) {
    tone(v, { type: 'triangle', freq: 300, to: 190, dur: 0.12, vol: 0.12 });
    noise(v, { filter: 'lowpass', freq: 1400, to: 250, dur: 0.1, vol: 0.18 });
  },
  tally(v) {
    tone(v, { type: 'square', freq: 1300, dur: 0.025, vol: 0.022 });
  },
  coin(v) {
    arp(v, [1568, 2349], 0.04, { type: 'triangle', dur: 0.14, vol: 0.05 });
  },
  bank(v) {
    arp(v, [784, 988, 1175, 1568, 1976], 0.06, { type: 'triangle', dur: 0.55, vol: 0.11 });
    tone(v, { freq: 392, at: 0.2, dur: 1, vol: 0.1, attack: 0.03 });
    noise(v, { filter: 'highpass', freq: 6000, at: 0.2, dur: 0.5, vol: 0.06 });
  },
};

// ── loops ──────────────────────────────────────────────────────────
// Beds that play until stopped (`sfx.loop`). A recipe wires its sources into `out` and
// returns every source it started, so they can be stopped together.

// A looping buffer through a filter and a gain; the gain and cutoff params are returned for LFOs.
function bed(buffer, out, { filter, freq, q = 0.7, vol }) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(out);
  src.start(ctx.currentTime, Math.random() * buffer.duration);
  return { src, gain: g.gain, freq: f.frequency };
}

function wobble(param, rate, depth) {
  const osc = ctx.createOscillator();
  osc.frequency.value = rate;
  const g = ctx.createGain();
  g.gain.value = depth;
  osc.connect(g).connect(param);
  osc.start();
  return osc;
}

// A few seconds of sparse crackle: short decaying noise ticks, mostly faint with the odd
// louder pop, sometimes in quick clusters.
function crackles() {
  if (crackleBuffer) return crackleBuffer;
  const sr = ctx.sampleRate, len = Math.floor(sr * 4.3);
  crackleBuffer = ctx.createBuffer(1, len, sr);
  const d = crackleBuffer.getChannelData(0);
  for (let i = Math.floor(sr * 0.05); i < len;) {
    const cluster = Math.random() < 0.2 ? 2 + Math.floor(Math.random() * 3) : 1;
    for (let c = 0; c < cluster && i < len; c++) {
      const amp = 0.15 + 0.85 * Math.random() ** 3, n = Math.floor(sr * (0.001 + Math.random() * 0.004));
      for (let k = 0; k < n && i + k < len; k++) d[i + k] += (Math.random() * 2 - 1) * amp * Math.exp((-6 * k) / n);
      i += Math.floor(sr * (0.005 + Math.random() * 0.012));
    }
    i += Math.floor(sr * (0.03 + Math.random() * 0.17));
  }
  return crackleBuffer;
}

const LOOPS = {
  // Exalted: a low, slowly breathing rumble of fire with soft crackles, kept dark and quiet
  // so it sits under everything else.
  burning(out) {
    const rumble = bed(noiseBuffer, out, { filter: 'lowpass', freq: 380, vol: 0.2 });
    const flame = bed(noiseBuffer, out, { filter: 'bandpass', freq: 750, q: 0.8, vol: 0.045 });
    const crackle = bed(crackles(), out, { filter: 'highpass', freq: 1200, vol: 0.1 });
    return [
      rumble.src, flame.src, crackle.src,
      wobble(rumble.gain, 0.21, 0.07),
      wobble(flame.freq, 0.33, 250),
      wobble(flame.gain, 0.47, 0.02),
    ];
  },
  // The Seraph's laser: a buzzing low hum under a fizzing sizzle.
  laser(out) {
    const hum = ctx.createOscillator();
    hum.type = 'sawtooth';
    hum.frequency.value = 92;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 700;
    const g = ctx.createGain();
    g.gain.value = 0.12;
    hum.connect(f).connect(g).connect(out);
    hum.start();
    const sizzle = bed(noiseBuffer, out, { filter: 'bandpass', freq: 2600, q: 1.5, vol: 0.06 });
    return [hum, sizzle.src, wobble(g.gain, 13, 0.04), wobble(sizzle.freq, 7, 600)];
  },
};

const NO_LOOP = { setLevel() {}, stop() {} };

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

  // Starts a looping bed and returns { setLevel(0…1), stop(fade seconds) }. Loops sit
  // outside the voice cap and keep running silently while muted.
  loop(name, { volume = 1, fadeIn = 0.6 } = {}) {
    const recipe = LOOPS[name];
    if (!ctx || !recipe) return NO_LOOP;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(master);
    const sources = recipe(out);
    let level = 0, stopped = false;
    const handle = {
      setLevel(x, time = 0.12) {
        if (stopped || x === level) return;
        level = x;
        out.gain.setTargetAtTime(x * volume, ctx.currentTime, time);
      },
      stop(fade = 0.5) {
        if (stopped) return;
        stopped = true;
        const t = ctx.currentTime;
        out.gain.cancelScheduledValues(t);
        out.gain.setValueAtTime(out.gain.value, t);
        out.gain.linearRampToValueAtTime(0, t + fade);
        for (const src of sources) src.stop(t + fade + 0.05);
        sources[0].onended = () => out.disconnect();
      },
    };
    handle.setLevel(1, fadeIn / 3);
    return handle;
  },

  toggleMute() {
    muted = !muted;
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* storage unavailable */ }
    if (master) master.gain.setTargetAtTime(muted ? 0 : MASTER_VOLUME, ctx.currentTime, 0.02);
    return muted;
  },
};
