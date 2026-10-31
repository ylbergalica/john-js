// Procedural sound effects. Like the sprites, nothing is loaded from files: each sound
// is a short recipe of oscillators and filtered noise, synthesized with Web Audio when
// played. Browsers start audio suspended, so the context is created/resumed on the
// first key or mouse press (`sfx.unlock`). Looping beds (`sfx.loop`) run until stopped.
// Levels come from settings: the master bus feeds effects (and loops) and music.

import { PLAYER_DEATH, PROPS, SPAWNERS } from '../data/config.js';
import { settings, onSettingsChange } from '../meta/settings.js';

const MASTER_VOLUME = 0.5;
const MAX_VOICES = 32;
const MIN_REPEAT = 0.03; // seconds; the same sound retriggering faster than this is dropped
const PITCH_JITTER = 0.04; // random ± pitch so repeats don't sound stamped
const SILENT = 0.0001; // exponential ramps can't reach 0

let ctx = null, master = null, effects = null, music = null, noiseBuffer = null, crackleBuffer = null, gooBuffer = null, driveCurve = null;
let voices = 0;
let background = false; // the window is out of focus
const lastPlayed = new Map();

// Sliders feel even when the gain goes as their square.
const level = (x) => Math.max(0, Math.min(1, x)) ** 2;
const silenced = () => background && settings.muteInBackground;
const masterLevel = () => (silenced() ? 0 : MASTER_VOLUME * level(settings.masterVolume));

// Eases the buses to the levels in settings.
function applyLevels() {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(masterLevel(), t, 0.02);
  effects.gain.setTargetAtTime(level(settings.sfxVolume), t, 0.02);
  music.gain.setTargetAtTime(level(settings.musicVolume), t, 0.02);
}

onSettingsChange(applyLevels);
const setBackground = (on) => { background = on; applyLevels(); };
window.addEventListener('blur', () => setBackground(true));
window.addEventListener('focus', () => setBackground(false));
document.addEventListener('visibilitychange', () => setBackground(document.hidden || !document.hasFocus()));

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
  master.gain.value = masterLevel();
  master.connect(comp).connect(ctx.destination);
  effects = ctx.createGain();
  effects.gain.value = level(settings.sfxVolume);
  effects.connect(master);
  music = ctx.createGain();
  music.gain.value = level(settings.musicVolume);
  music.connect(master);
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate); // longer than any one noise layer
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

// White noise (or `buffer`) through a filter whose cutoff sweeps from `freq` to `to`.
function noise(v, { filter = 'bandpass', freq = 1000, to = freq, q = 1, at = 0, dur, vol = 0.2, attack = 0.004, hold = 0, out, buffer = noiseBuffer }) {
  const t = v.t + at;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq * v.pitch, t);
  if (to !== freq) f.frequency.exponentialRampToValueAtTime(to * v.pitch, t + dur);
  src.connect(f).connect(envelope(v, t, dur, vol, attack, hold, out));
  src.start(t, Math.random() * Math.max(0, buffer.duration - dur - 0.05));
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

// `n` tiny glassy pings scattered over `spread` seconds from `at`: fragments landing.
function tinkles(v, n, { at = 0, spread = 0.4, vol = 0.05, lo = 2400, hi = 6000 } = {}) {
  for (let i = 0; i < n; i++) {
    const t = at + spread * Math.random() ** 1.6; // thickest at the start
    tone(v, { type: 'triangle', freq: lo + Math.random() * (hi - lo), at: t, dur: 0.06 + Math.random() * 0.12, vol: vol * (0.4 + 0.6 * Math.random()) });
  }
}

// A soft clipper feeding the voice: what's sent in comes out thick and crunchy. `push` drives
// it harder, `trim` brings the level back down.
function grit(v, push, trim) {
  const inGain = ctx.createGain(), shaper = ctx.createWaveShaper(), outGain = ctx.createGain();
  inGain.gain.value = push;
  shaper.curve = drive();
  outGain.gain.value = trim;
  inGain.connect(shaper).connect(outGain).connect(v.out);
  return inGain;
}

// `stages` lowpasses at `freq` stacked in front of the voice (two: steep; one: gentle);
// returns the node to feed. Not moved by the voice's pitch, so a higher-pitched voice is
// cut just as hard.
function dull(v, freq, stages = 2) {
  const filters = Array.from({ length: stages }, () => {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = freq; f.Q.value = 0.6;
    return f;
  });
  filters.reduce((a, b) => a.connect(b)).connect(v.out);
  return filters[0];
}

// Something wet giving way: the goo texture (see goo()) through a broad band swept down,
// a squelchy, crackling splat rather than a hiss.
function splat(v, { freq, to, q = 0.9, at = 0, dur, vol }) {
  noise(v, { freq, to, q, at, dur, vol, attack: 0.002, buffer: goo() });
}

// Muffles everything a Black Rose voice plays after it, as if heard through a wall: two
// lowpasses stacked (steep, so little gets through above them), a little louder to make up.
function roseMuffle(v) {
  const lo = ctx.createBiquadFilter(), lo2 = ctx.createBiquadFilter(), lift = ctx.createGain();
  for (const f of [lo, lo2]) { f.type = 'lowpass'; f.frequency.value = 620; f.Q.value = 0.6; }
  lift.gain.value = 1.4;
  lo.connect(lo2).connect(lift).connect(v.out);
  v.out = lo;
}

// The Black Rose's soft clipper, for its strikes: what's sent into it comes out thick and gritty.
function roseGrit(v) {
  const push = ctx.createGain();
  push.gain.value = 1.4;
  const grit = ctx.createWaveShaper();
  grit.curve = drive();
  const trim = ctx.createGain();
  trim.gain.value = 0.7;
  push.connect(grit).connect(trim).connect(v.out);
  return push;
}

// A low hiss chopped on and off `rate` times a second, the whole length of a Black Rose event.
function roseStutter(v, rate) {
  const chop = ctx.createGain();
  chop.gain.value = 0.5;
  chop.connect(v.out);
  lfo(v, chop.gain, { rate, depth: 0.5, dur: 0.4, type: 'square' });
  noise(v, { freq: 380, to: 520, q: 0.8, dur: 0.4, vol: 0.09, attack: 0.05, out: chop });
  tone(v, { type: 'square', freq: 160, to: 110, dur: 0.38, vol: 0.02, attack: 0.04, out: chop });
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
  // The player's death (src/player/death.js). The body gives out: a hard crack, a choked cry
  // falling away, and a sucking rush swelling as it caves in, cut off as deathBurst lands
  // (PLAYER_DEATH.collapse.time later).
  death(v) {
    const dur = PLAYER_DEATH.collapse.time;
    tone(v, { type: 'square', freq: 150, to: 50, dur: 0.18, vol: 0.18 });
    noise(v, { filter: 'lowpass', freq: 3200, to: 300, dur: 0.22, vol: 0.5 });
    tone(v, { type: 'sawtooth', freq: 310, to: 95, dur, vol: 0.1, attack: 0.03, hold: dur * 0.4 });
    tone(v, { type: 'triangle', freq: 466, to: 140, dur, vol: 0.05, attack: 0.03, hold: dur * 0.4 });
    noise(v, { freq: 200, to: 2600, q: 1.2, dur: dur + 0.02, vol: 0.22, attack: dur * 0.85, hold: dur - 0.03 });
    tone(v, { freq: 55, to: 150, dur: dur + 0.02, vol: 0.2, attack: dur * 0.75, hold: dur - 0.03 });
  },
  // ...and bursts: a deep boom, a glassy shatter, a slowly falling minor chime and a long
  // breath dying away.
  deathBurst(v) {
    tone(v, { freq: 70, to: 26, dur: 1.8, vol: 0.5 });
    noise(v, { filter: 'lowpass', freq: 2600, to: 60, dur: 1.6, vol: 0.45 });
    noise(v, { filter: 'highpass', freq: 4200, to: 2200, dur: 0.5, vol: 0.18 });
    arp(v, [2489, 2093, 1568, 1245, 1047, 784], 0.1, { type: 'triangle', dur: 0.9, vol: 0.05 });
    noise(v, { freq: 1100, to: 280, q: 0.6, at: 0.2, dur: 1.9, vol: 0.08, attack: 0.4 });
  },
  // Adrenaline wrung out of the dying player (PLAYER_DEATH.purge.time long): a heart
  // pounding faster and faster under a strangled groan straining upward, until it gives out.
  adrenalinePurge(v) {
    const dur = PLAYER_DEATH.purge.time;
    for (let t = 0, gap = 0.55; t < dur - 0.08; t += gap, gap = Math.max(0.12, gap * 0.82)) {
      tone(v, { freq: 78, to: 38, at: t, dur: 0.17, vol: 0.45, attack: 0.005 });
      tone(v, { freq: 72, to: 36, at: t + gap * 0.32, dur: 0.14, vol: 0.28, attack: 0.005 });
    }
    const throat = ctx.createGain();
    throat.gain.value = 0.5;
    lfo(v, throat.gain, { rate: 9, depth: 0.35, dur });
    const muffle = ctx.createBiquadFilter();
    muffle.type = 'lowpass';
    muffle.Q.value = 4;
    muffle.frequency.setValueAtTime(380, v.t);
    muffle.frequency.exponentialRampToValueAtTime(1500, v.t + dur);
    throat.connect(muffle).connect(v.out);
    for (const freq of [128, 129.6]) tone(v, { type: 'sawtooth', freq, to: freq * 1.9, dur, vol: 0.1, attack: 0.25, hold: dur - 0.12, out: throat });
    noise(v, { freq: 600, to: 1900, q: 2, dur, vol: 0.14, attack: 0.4, hold: dur - 0.12, out: throat });
  },
  // A gout of adrenaline forced out: a wet, hissing gush over a soft thump.
  adrenalineSpurt(v) {
    noise(v, { freq: 1800, to: 450, q: 1.1, dur: 0.22, vol: 0.28, attack: 0.008 });
    noise(v, { filter: 'highpass', freq: 3000, to: 1500, dur: 0.12, vol: 0.07 });
    tone(v, { freq: 110, to: 50, dur: 0.12, vol: 0.25 });
  },
  // Dying Exalted (PLAYER_DEATH.exalted.time long): the demon's roar climbing into a tearing
  // scream, driven hard, over fire swelling and a sub rising, all cut off as the body bursts.
  exaltedDeath(v) {
    const dur = PLAYER_DEATH.exalted.time + 0.02;
    const throat = ctx.createGain();
    throat.gain.value = 0.6;
    lfo(v, throat.gain, { rate: 23, depth: 0.4, dur, type: 'triangle' });
    const grit = ctx.createWaveShaper();
    grit.curve = drive();
    const muffle = ctx.createBiquadFilter();
    muffle.type = 'lowpass';
    muffle.Q.value = 2;
    muffle.frequency.setValueAtTime(300, v.t);
    muffle.frequency.exponentialRampToValueAtTime(2600, v.t + dur);
    const trim = ctx.createGain();
    trim.gain.value = 0.55;
    throat.connect(grit).connect(muffle).connect(trim).connect(v.out);
    for (const [freq, to] of [[70, 150], [71.2, 153], [105, 228]]) {
      const osc = tone(v, { type: 'sawtooth', freq, to, dur, vol: 0.2, attack: 0.1, hold: dur - 0.04, out: throat });
      lfo(v, osc.frequency, { rate: 6, depth: freq * 0.04, dur });
    }
    noise(v, { freq: 300, to: 1800, q: 0.9, dur, vol: 0.5, attack: 0.2, hold: dur - 0.04, out: throat });
    noise(v, { filter: 'lowpass', freq: 200, to: 3200, dur, vol: 0.3, attack: dur * 0.8, hold: dur - 0.03 });
    tone(v, { freq: 38, to: 95, dur, vol: 0.35, attack: 0.6, hold: dur - 0.03 });
  },
  // A jet of hellfire bursting out of the body: a short roaring whoosh and a few crackles.
  fireJet(v) {
    noise(v, { filter: 'lowpass', freq: 400, to: 2400, dur: 0.28, vol: 0.3, attack: 0.03 });
    noise(v, { freq: 900, to: 300, q: 0.8, dur: 0.3, vol: 0.14, attack: 0.02 });
    for (let i = 0; i < 3; i++) noise(v, { filter: 'highpass', freq: 3000 + Math.random() * 2000, at: 0.03 + Math.random() * 0.2, dur: 0.02, vol: 0.07 });
  },
  // ...and the burst: an explosion of hellfire over a sub drop, a dying growl falling away
  // beneath it and embers crackling as it clears.
  exaltedDeathBurst(v) {
    const growlTime = 2.4;
    tone(v, { freq: 55, to: 18, dur: 2.8, vol: 0.6 });
    noise(v, { filter: 'lowpass', freq: 4000, to: 50, dur: 1.9, vol: 0.6 });
    noise(v, { freq: 900, to: 150, q: 0.7, dur: 1.5, vol: 0.3 });
    const growl = ctx.createGain();
    growl.gain.value = 0.6;
    lfo(v, growl.gain, { rate: 17, depth: 0.4, dur: growlTime, type: 'triangle' });
    const grit = ctx.createWaveShaper();
    grit.curve = drive();
    const muffle = ctx.createBiquadFilter();
    muffle.type = 'lowpass';
    muffle.frequency.setValueAtTime(900, v.t);
    muffle.frequency.exponentialRampToValueAtTime(150, v.t + growlTime);
    const trim = ctx.createGain();
    trim.gain.value = 0.5;
    growl.connect(grit).connect(muffle).connect(trim).connect(v.out);
    for (const freq of [92, 93.5]) tone(v, { type: 'sawtooth', freq, to: 28, dur: growlTime, vol: 0.2, attack: 0.02, out: growl });
    for (let i = 0; i < 20; i++) {
      noise(v, { filter: 'highpass', freq: 2500 + Math.random() * 3000, at: 0.2 + Math.random() * 2.6, dur: 0.02 + Math.random() * 0.03, vol: 0.04 + Math.random() * 0.08 });
    }
  },

  // enemies
  // A heavy, wet blow: a soft knock, a round kick of low end and a slap of flesh that gives a
  // little, under a steep high cut so nothing rings bright, then a gooey splat trailing after,
  // cut only gently so its wet crackle comes through.
  hit(v) {
    const out = v.out, steep = dull(v, 1800), gentle = dull(v, 3000, 1);
    v.out = steep;
    noise(v, { freq: 1300, q: 0.7, dur: 0.03, vol: 0.3, attack: 0.005 });
    tone(v, { freq: 94, to: 34, dur: 0.09, vol: 0.4, attack: 0.001, out: grit(v, 1.1, 0.27) });
    noise(v, { freq: 595, to: 375, q: 1.3, dur: 0.08, vol: 0.52, attack: 0.008 });
    v.out = gentle;
    splat(v, { freq: 1230, to: 470, dur: 0.14, vol: 0.42 });
    splat(v, { freq: 325, to: 190, q: 0.8, at: 0.012, dur: 0.16, vol: 0.8 });
    v.out = out;
  },
  // The same blow struck Exalted, with a little demonic exhale after it: a held breath and
  // two detuned saws sinking under it, rasped by a fast tremolo, driven, and muffled as it
  // dies away, with a thin airy hiss over the top (a short, quiet cousin of the Exalted
  // roar). Deep, but driven hard enough that its overtones still reach small speakers.
  hitExalted(v) {
    SOUNDS.hit(v);
    const at = 0.04, dur = 0.45, hold = 0.18;
    const throat = ctx.createGain();
    throat.gain.value = 0.6;
    lfo(v, throat.gain, { rate: 19, depth: 0.4, dur: at + dur, type: 'triangle' });
    const muffle = ctx.createBiquadFilter();
    muffle.type = 'lowpass';
    muffle.Q.value = 1.5;
    muffle.frequency.setValueAtTime(1100, v.t + at);
    muffle.frequency.exponentialRampToValueAtTime(300, v.t + at + dur);
    muffle.connect(v.out);
    throat.connect(grit({ out: muffle }, 2, 0.18));
    noise(v, { freq: 650, to: 300, q: 0.8, at, dur, vol: 0.6, attack: 0.05, hold, out: throat });
    for (const freq of [49, 49.8]) tone(v, { type: 'sawtooth', freq, to: freq * 0.72, at, dur: dur * 0.9, vol: 0.14, attack: 0.06, hold, out: throat });
    noise(v, { freq: 1300, to: 700, q: 1.2, at, dur: dur * 0.8, vol: 0.04, attack: 0.05, hold: hold * 0.8 });
  },
  kill(v) { // bursting: the same blow, deeper and messier, with a second splat and a bright chime
    tone(v, { type: 'triangle', freq: 460, to: 110, dur: 0.28, vol: 0.2 });
    noise(v, { filter: 'highpass', freq: 2200, dur: 0.025, vol: 0.3, attack: 0.001 });
    tone(v, { freq: 120, to: 38, dur: 0.18, vol: 0.35, attack: 0.001, out: grit(v, 1.8, 0.3) });
    noise(v, { freq: 800, to: 450, q: 1.2, dur: 0.1, vol: 0.6, attack: 0.002 });
    splat(v, { freq: 2000, to: 500, dur: 0.2, vol: 0.5 });
    splat(v, { freq: 450, to: 220, q: 0.8, at: 0.015, dur: 0.22, vol: 0.8 });
    splat(v, { freq: 1500, to: 600, at: 0.07, dur: 0.14, vol: 0.35 });
    tone(v, { freq: 990, to: 1980, at: 0.03, dur: 0.15, vol: 0.05 });
  },
  bossKill(v) {
    tone(v, { type: 'sawtooth', freq: 220, to: 30, dur: 1.4, vol: 0.25 });
    tone(v, { type: 'sine', freq: 110, to: 25, dur: 1.6, vol: 0.4 });
    noise(v, { filter: 'lowpass', freq: 3000, to: 60, dur: 1.5, vol: 0.5 });
    arp(v, [523, 784, 1047, 1568], 0.09, { type: 'triangle', at: 0.25, dur: 0.6, vol: 0.08 });
  },
  // A slain guardian going critical, about as long as DEATH_FX.guardian.dying: a low throb
  // and a whine climbing under a hiss, ticking faster, cut off by bossKill as it bursts.
  bossDying(v) {
    tone(v, { freq: 90, to: 140, dur: 1.85, vol: 0.3, attack: 0.05, hold: 1.75 });
    tone(v, { type: 'sawtooth', freq: 220, to: 1320, dur: 1.85, vol: 0.06, attack: 1.4, hold: 1.78 });
    tone(v, { type: 'triangle', freq: 660, to: 2640, dur: 1.85, vol: 0.05, attack: 1.5, hold: 1.78 });
    noise(v, { freq: 500, to: 5000, q: 1.5, dur: 1.85, vol: 0.12, attack: 1.6, hold: 1.78 });
    // Ticks quickening like the blinks (DEATH_FX.guardian.dying.blink).
    for (let i = 0, t = 0; t < 1.75; i++) {
      t = (-2.5 + Math.sqrt(2.5 * 2.5 + 2 * (11.5 / 1.8) * i)) / (11.5 / 1.8);
      if (t < 1.75) tone(v, { type: 'square', freq: 1400 + t * 500, at: t, dur: 0.04, vol: 0.025 + t * 0.02 });
    }
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
  // the Lemur
  spin(v) { // whirling round on the spot, its tail whipping after it
    noise(v, { freq: 260, to: 1300, q: 0.9, dur: 0.34, vol: 0.22, attack: 0.1 });
    noise(v, { filter: 'highpass', freq: 1500, to: 3400, q: 0.7, at: 0.14, dur: 0.16, vol: 0.1, attack: 0.03 });
  },
  crescent(v) { // a crescent flung out, whirring like a boomerang
    tone(v, { type: 'square', freq: 480, to: 980, dur: 0.07, vol: 0.05 });
    const whirr = ctx.createGain();
    whirr.gain.value = 0.5;
    whirr.connect(v.out);
    lfo(v, whirr.gain, { rate: 24, depth: 0.5, dur: 0.32 });
    noise(v, { freq: 1500, to: 2700, q: 2, dur: 0.32, vol: 0.18, attack: 0.01, out: whirr });
  },
  // the Boxer
  hook(v) { // a fist swung round, heavy, through the air
    noise(v, { freq: 300, to: 1300, q: 1, dur: 0.18, vol: 0.3, attack: 0.03 });
    tone(v, { type: 'triangle', freq: 150, to: 70, dur: 0.14, vol: 0.12 });
  },
  jab(v) { // one punch of a flurry: short and snappy
    noise(v, { freq: 700, to: 2000, q: 1.2, dur: 0.07, vol: 0.18, attack: 0.008 });
    tone(v, { type: 'square', freq: 210, to: 90, dur: 0.05, vol: 0.05 });
  },
  clap(v) { // two fists slammed together: a sharp crack over a deep boom
    noise(v, { filter: 'highpass', freq: 1800, to: 900, q: 0.7, dur: 0.08, vol: 0.4, attack: 0.002 });
    noise(v, { freq: 900, to: 300, q: 1.1, dur: 0.18, vol: 0.3, attack: 0.004 });
    tone(v, { freq: 110, to: 38, dur: 0.4, vol: 0.5 });
    noise(v, { filter: 'lowpass', freq: 800, to: 90, dur: 0.35, vol: 0.4 });
  },
  // the Gunner
  cannon(v) { // one cannon going off: a hard pop over a thump
    noise(v, { freq: 900, to: 260, q: 1, dur: 0.12, vol: 0.3, attack: 0.003 });
    tone(v, { type: 'square', freq: 240, to: 70, dur: 0.1, vol: 0.08 });
    tone(v, { freq: 120, to: 45, dur: 0.18, vol: 0.3 });
  },
  broadside(v) { // all three at once: heavier, with a ringing crack
    noise(v, { filter: 'highpass', freq: 1500, to: 600, q: 0.7, dur: 0.07, vol: 0.28, attack: 0.002 });
    noise(v, { freq: 700, to: 180, q: 0.9, dur: 0.2, vol: 0.38, attack: 0.003 });
    tone(v, { type: 'square', freq: 200, to: 60, dur: 0.12, vol: 0.1 });
    tone(v, { freq: 95, to: 35, dur: 0.3, vol: 0.45 });
  },
  // the Corsair
  rush(v) { // setting off: a rising rush of air and cloth
    noise(v, { freq: 240, to: 1400, q: 0.8, dur: 0.4, vol: 0.28, attack: 0.06 });
    tone(v, { type: 'triangle', freq: 140, to: 260, dur: 0.3, vol: 0.08, attack: 0.04 });
  },
  swish(v) { // one swing of the rush: a quick, light whip of steel
    noise(v, { filter: 'highpass', freq: 2200, to: 4800, q: 0.8, dur: 0.08, vol: 0.18, attack: 0.012 });
    noise(v, { freq: 900, to: 2200, q: 1.2, dur: 0.07, vol: 0.1, attack: 0.01 });
  },
  clang(v) { // crashing: steel ringing off stone over a heavy thud
    tone(v, { freq: 80, to: 28, dur: 0.45, vol: 0.5 });
    noise(v, { filter: 'lowpass', freq: 1600, to: 100, dur: 0.4, vol: 0.45 });
    noise(v, { filter: 'highpass', freq: 3000, to: 1800, q: 0.7, dur: 0.06, vol: 0.3, attack: 0.002 });
    tone(v, { type: 'triangle', freq: 1870, to: 1820, at: 0.01, dur: 0.6, vol: 0.06 });
    tone(v, { freq: 2950, to: 2900, at: 0.01, dur: 0.45, vol: 0.04 });
  },
  // the Weaver
  silkSpit(v) { // an anchor of silk spat out: a wet pthew, then silk zipping out after it
    splat(v, { freq: 2200, to: 800, dur: 0.07, vol: 0.32 });
    tone(v, { type: 'triangle', freq: 620, to: 1500, dur: 0.1, vol: 0.05 });
    noise(v, { filter: 'highpass', freq: 2600, to: 6200, q: 0.8, at: 0.02, dur: 0.26, vol: 0.12, attack: 0.03 });
  },
  threadStrung(v) { // its thread pulled taut: a click and a low, wiry twang ringing off
    noise(v, { filter: 'highpass', freq: 3200, dur: 0.012, vol: 0.22, attack: 0.001 });
    const string = tone(v, { type: 'triangle', freq: 196, to: 188, dur: 0.75, vol: 0.12, attack: 0.002 });
    lfo(v, string.frequency, { rate: 7, depth: 3, dur: 0.75 });
    tone(v, { type: 'sawtooth', freq: 392, to: 378, dur: 0.35, vol: 0.025, attack: 0.002, out: dull(v, 2400) });
    tone(v, { freq: 588, to: 570, dur: 0.25, vol: 0.03, attack: 0.002 });
  },
  threadSnap(v) { // cut: a sharp snap and the twang falling away as its halves spring back
    noise(v, { filter: 'highpass', freq: 3600, to: 1800, q: 0.7, dur: 0.04, vol: 0.32, attack: 0.001 });
    tone(v, { type: 'triangle', freq: 520, to: 150, dur: 0.22, vol: 0.09, attack: 0.002 });
    tone(v, { freq: 1040, to: 310, dur: 0.12, vol: 0.03, attack: 0.002 });
  },
  strain(v) { // the player caught struggling in the web: it jerks taut with a creak and a twang
    noise(v, { freq: 950, to: 700, q: 7, dur: 0.2, vol: 0.1, attack: 0.01 });
    tone(v, { type: 'sawtooth', freq: 118, to: 92, dur: 0.2, vol: 0.04, attack: 0.01, out: dull(v, 900) });
    tone(v, { type: 'triangle', freq: 300, to: 250, dur: 0.3, vol: 0.07, attack: 0.002 });
    noise(v, { filter: 'highpass', freq: 3200, to: 2200, q: 0.7, at: 0.02, dur: 0.12, vol: 0.06, attack: 0.005 });
  },
  webThrow(v) { // a ball of web flung out: a soft wet whoosh and the line zipping out after it
    noise(v, { freq: 400, to: 1800, q: 0.8, dur: 0.2, vol: 0.24, attack: 0.02 });
    splat(v, { freq: 1600, to: 700, dur: 0.06, vol: 0.18 });
    noise(v, { filter: 'highpass', freq: 2600, to: 6000, q: 0.8, at: 0.04, dur: 0.24, vol: 0.09, attack: 0.03 });
  },
  webCatch(v) { // bursting round the player: a wet slap, strands rustling as they wind on, the line going taut
    splat(v, { freq: 1700, to: 500, dur: 0.1, vol: 0.4 });
    tone(v, { freq: 130, to: 60, dur: 0.12, vol: 0.25, attack: 0.002 });
    noise(v, { filter: 'highpass', freq: 3000, to: 5200, q: 0.8, at: 0.03, dur: 0.18, vol: 0.08, attack: 0.02 });
    tone(v, { type: 'triangle', freq: 240, to: 228, at: 0.06, dur: 0.4, vol: 0.07, attack: 0.002 });
  },
  webSplat(v) { // splatting on stone
    splat(v, { freq: 1500, to: 450, dur: 0.12, vol: 0.32 });
    tone(v, { freq: 120, to: 55, dur: 0.1, vol: 0.15 });
  },
  reel(v) { // reeling in: a ratchet clicking faster and faster under a straining creak
    for (let t = 0, gap = 0.07; t < 0.5; t += gap, gap = Math.max(0.03, gap * 0.85)) tone(v, { type: 'square', freq: 1700 + t * 900, at: t, dur: 0.012, vol: 0.035 });
    noise(v, { freq: 700, to: 1100, q: 6, dur: 0.5, vol: 0.06, attack: 0.1 });
  },
  bite(v) { // fangs snapping shut: two clicks and a wet crunch
    noise(v, { filter: 'highpass', freq: 3800, dur: 0.012, vol: 0.3, attack: 0.001 });
    noise(v, { filter: 'highpass', freq: 3400, at: 0.035, dur: 0.012, vol: 0.26, attack: 0.001 });
    tone(v, { freq: 190, to: 70, at: 0.03, dur: 0.1, vol: 0.25, attack: 0.002 });
    splat(v, { freq: 1100, to: 380, at: 0.035, dur: 0.12, vol: 0.45 });
  },
  yank(v) { // parried, dragged off its feet along its own line: a rush and the line twanging
    noise(v, { freq: 300, to: 1700, q: 0.9, dur: 0.32, vol: 0.28, attack: 0.03 });
    tone(v, { type: 'triangle', freq: 420, to: 160, dur: 0.32, vol: 0.08, attack: 0.002 });
  },
  thud(v) { // landing in a heap
    tone(v, { freq: 110, to: 40, dur: 0.22, vol: 0.4 });
    noise(v, { filter: 'lowpass', freq: 900, to: 120, dur: 0.2, vol: 0.35 });
  },
  // the Nova
  novaRush(v) { // setting off at the player: a bright rush of air with a shimmer climbing through it
    noise(v, { freq: 500, to: 2600, q: 0.9, dur: 0.32, vol: 0.2, attack: 0.04 });
    tone(v, { type: 'triangle', freq: 660, to: 1320, dur: 0.28, vol: 0.05, attack: 0.02 });
    tinkles(v, 4, { spread: 0.25, vol: 0.025, lo: 3000, hi: 6500 });
  },
  novaSwell(v) { // swelling up: a whine climbing over a hum that throbs faster and faster, as long as its swell
    const throb = ctx.createGain(), wobble = ctx.createOscillator(), depth = ctx.createGain();
    throb.gain.value = 0.5;
    throb.connect(v.out);
    wobble.frequency.setValueAtTime(5, v.t);
    wobble.frequency.exponentialRampToValueAtTime(26, v.t + 0.95);
    depth.gain.value = 0.5;
    wobble.connect(depth).connect(throb.gain);
    wobble.start(v.t);
    schedule(v, wobble, v.t, 0.95);
    tone(v, { type: 'sawtooth', freq: 110, to: 230, dur: 0.95, vol: 0.09, attack: 0.25, hold: 0.9, out: throb });
    tone(v, { freq: 320, to: 1500, dur: 0.95, vol: 0.07, attack: 0.3, hold: 0.9, out: throb });
    noise(v, { filter: 'highpass', freq: 2500, to: 6000, q: 0.7, dur: 0.95, vol: 0.05, attack: 0.5, hold: 0.9 });
  },
  supernova(v) { // bursting: a deep boom and a crack, light roaring out, a bright chord shimmering down after
    tone(v, { freq: 72, to: 24, dur: 0.9, vol: 0.6 });
    noise(v, { filter: 'lowpass', freq: 3200, to: 90, dur: 0.9, vol: 0.5, attack: 0.002 });
    noise(v, { filter: 'highpass', freq: 3800, to: 1600, q: 0.7, dur: 0.08, vol: 0.32, attack: 0.001 });
    noise(v, { freq: 1800, to: 500, q: 0.6, at: 0.02, dur: 0.6, vol: 0.18, attack: 0.01 });
    for (const [i, freq] of [1568, 1976, 2349, 2794].entries()) tone(v, { type: 'triangle', freq, to: freq * 0.94, at: 0.02 + i * 0.03, dur: 1.1, vol: 0.035 });
    tinkles(v, 12, { at: 0.05, spread: 0.8, vol: 0.03 });
  },
  novaLaunch(v) { // parried and lit: a hard ping and a fuse fizzing as it streaks off, its whistle climbing
    tone(v, { type: 'triangle', freq: 1900, to: 2500, dur: 0.06, vol: 0.08, attack: 0.001 });
    noise(v, { filter: 'highpass', freq: 4000, to: 7500, q: 0.7, dur: 0.6, vol: 0.1, attack: 0.02 });
    tone(v, { freq: 700, to: 1800, dur: 0.55, vol: 0.05, attack: 0.02 });
  },
  novaFuse(v) { // caught in a blast and lit: a quick crackle and a rising zip
    noise(v, { filter: 'highpass', freq: 3000, to: 5000, q: 0.8, dur: 0.1, vol: 0.16, attack: 0.002 });
    tone(v, { type: 'square', freq: 900, to: 2200, dur: 0.1, vol: 0.03 });
  },
  // the Bulwark
  glance(v) { // a blow turned by its shield: a bright metallic ping off a hard tick, a dull knock under it
    noise(v, { filter: 'highpass', freq: 4500, dur: 0.03, vol: 0.2, attack: 0.001 });
    tone(v, { type: 'triangle', freq: 2650, to: 2600, dur: 0.38, vol: 0.09, attack: 0.002 });
    tone(v, { freq: 3980, to: 3940, dur: 0.22, vol: 0.04, attack: 0.002 });
    tone(v, { type: 'square', freq: 420, to: 220, dur: 0.06, vol: 0.05 });
  },
  bash(v) { // lunging shield-first: a heavy shove of air and a grunt of metal
    noise(v, { freq: 180, to: 760, q: 0.9, dur: 0.24, vol: 0.32, attack: 0.04 });
    tone(v, { type: 'triangle', freq: 110, to: 52, dur: 0.22, vol: 0.16 });
    tone(v, { type: 'triangle', freq: 980, to: 940, at: 0.02, dur: 0.18, vol: 0.025 });
  },
  plant(v) { // the shield slammed edge-first into the floor: a deep boom, metal ringing, the ground rumbling off
    tone(v, { freq: 88, to: 30, dur: 0.5, vol: 0.55 });
    noise(v, { filter: 'lowpass', freq: 900, to: 70, dur: 0.45, vol: 0.5 });
    noise(v, { filter: 'highpass', freq: 2600, to: 1600, q: 0.7, dur: 0.05, vol: 0.25, attack: 0.002 });
    tone(v, { type: 'triangle', freq: 1240, to: 1200, at: 0.01, dur: 0.4, vol: 0.045 });
    noise(v, { filter: 'lowpass', freq: 320, to: 120, at: 0.04, dur: 0.6, vol: 0.22, attack: 0.05 });
  },
  guardBreak(v) { // parried, its shield ripped off its arm: a great clang ringing, a lurch of air
    noise(v, { filter: 'highpass', freq: 3200, to: 2000, q: 0.7, dur: 0.06, vol: 0.35, attack: 0.001 });
    tone(v, { freq: 140, to: 55, dur: 0.3, vol: 0.32 });
    tone(v, { type: 'triangle', freq: 1520, to: 1400, at: 0.005, dur: 0.6, vol: 0.09 });
    tone(v, { freq: 2290, to: 2210, at: 0.005, dur: 0.42, vol: 0.05 });
    noise(v, { freq: 300, to: 1400, q: 0.8, at: 0.03, dur: 0.3, vol: 0.14, attack: 0.05 });
  },
  shieldLand(v) { // coming down: a clatter of metal on stone, bouncing once
    tone(v, { freq: 320, to: 120, dur: 0.12, vol: 0.16 });
    noise(v, { filter: 'lowpass', freq: 1600, to: 220, dur: 0.18, vol: 0.28 });
    tone(v, { type: 'triangle', freq: 1150, to: 1110, dur: 0.26, vol: 0.04 });
    noise(v, { filter: 'lowpass', freq: 1200, to: 200, at: 0.1, dur: 0.12, vol: 0.14 });
    tone(v, { type: 'triangle', freq: 1150, to: 1110, at: 0.1, dur: 0.18, vol: 0.02 });
  },
  shieldReturn(v) { // flying back to its arm: a rising whoosh, caught with a clack
    noise(v, { freq: 400, to: 2400, q: 0.9, dur: 0.28, vol: 0.16, attack: 0.18 });
    tone(v, { type: 'triangle', freq: 520, to: 1300, dur: 0.28, vol: 0.035, attack: 0.15 });
    noise(v, { filter: 'highpass', freq: 3000, at: 0.28, dur: 0.03, vol: 0.18, attack: 0.001 });
    tone(v, { type: 'triangle', freq: 1700, at: 0.28, dur: 0.16, vol: 0.05 });
  },
  // the Jet
  jetDash(v) { // afterburners lit: a sharp roar of air tearing past, a growl dropping under it
    noise(v, { freq: 600, to: 2400, q: 0.8, dur: 0.3, vol: 0.26, attack: 0.02 });
    tone(v, { type: 'sawtooth', freq: 180, to: 90, dur: 0.28, vol: 0.06, attack: 0.01 });
  },
  jetSwoop(v) { // peeling off into a dive: a whistle falling over a long rush of air
    tone(v, { type: 'triangle', freq: 1500, to: 520, dur: 0.6, vol: 0.06, attack: 0.05 });
    noise(v, { freq: 300, to: 1400, q: 0.9, dur: 0.65, vol: 0.2, attack: 0.08 });
  },
  // the Binary
  binaryCharge(v) { // the light between them flaring up: two glassy tones rising a fifth apart over a thin crackle
    tone(v, { type: 'sine', freq: 440, to: 880, dur: 0.8, vol: 0.05, attack: 0.3 });
    tone(v, { type: 'sine', freq: 660, to: 1320, dur: 0.8, vol: 0.04, attack: 0.3 });
    noise(v, { filter: 'highpass', freq: 4000, dur: 0.7, vol: 0.05, attack: 0.3 });
  },
  binaryOrbit(v) { // the beam lit as they fly apart and round: a bright zap, two tones parting and closing in again over a rush
    tone(v, { type: 'sawtooth', freq: 1400, to: 600, dur: 0.25, vol: 0.05, attack: 0.005 });
    tone(v, { type: 'triangle', freq: 900, to: 600, dur: 0.4, vol: 0.05 });
    tone(v, { type: 'triangle', freq: 900, to: 1350, dur: 0.4, vol: 0.05 });
    tone(v, { type: 'triangle', freq: 600, to: 880, at: 0.4, dur: 0.35, vol: 0.04 });
    tone(v, { type: 'triangle', freq: 1350, to: 900, at: 0.4, dur: 0.35, vol: 0.04 });
    noise(v, { freq: 900, to: 2600, q: 1, dur: 0.75, vol: 0.14, attack: 0.05 });
  },
  binarySnap(v) { // the beam breaking: a glassy crack and a tone falling away
    noise(v, { filter: 'highpass', freq: 3500, dur: 0.06, vol: 0.28, attack: 0.001 });
    tone(v, { type: 'triangle', freq: 1800, to: 300, dur: 0.4, vol: 0.07 });
    tone(v, { type: 'sine', freq: 1200, to: 200, at: 0.02, dur: 0.35, vol: 0.04 });
  },
  binaryLash(v) { // the broken beam whipped round: a whoosh rising and a crack at its end
    noise(v, { freq: 400, to: 2600, q: 0.9, dur: 0.45, vol: 0.2, attack: 0.1 });
    tone(v, { type: 'sawtooth', freq: 300, to: 900, dur: 0.4, vol: 0.04, attack: 0.08 });
    noise(v, { filter: 'highpass', freq: 3000, at: 0.4, dur: 0.05, vol: 0.2, attack: 0.001 });
  },
  // the Alembic (its own attacks are played at its sfxPitch, a good deal lower)
  ventVolley(v) { // every valve firing at once: a hard pneumatic chuff over a thump, a hiss and a clack of metal
    tone(v, { freq: 140, to: 45, dur: 0.26, vol: 0.4 });
    noise(v, { freq: 900, to: 380, q: 1, dur: 0.2, vol: 0.4, attack: 0.003 });
    noise(v, { filter: 'highpass', freq: 4200, to: 2400, q: 0.7, dur: 0.38, vol: 0.14, attack: 0.01 });
    tone(v, { type: 'square', freq: 1800, to: 1500, dur: 0.02, vol: 0.04 });
    tone(v, { type: 'triangle', freq: 2650, to: 2600, at: 0.005, dur: 0.18, vol: 0.03 });
  },
  puff(v) { // one valve firing: a short pneumatic pfft and a click
    noise(v, { filter: 'highpass', freq: 2600, to: 1800, q: 0.7, dur: 0.09, vol: 0.22, attack: 0.003 });
    noise(v, { freq: 1200, to: 650, q: 1.2, dur: 0.07, vol: 0.16, attack: 0.002 });
    tone(v, { type: 'square', freq: 1300, to: 1100, dur: 0.015, vol: 0.03 });
  },
  lob(v) { // a glob lobbed: a pressure whine climbing, then a heavy chuff and a hiss
    tone(v, { type: 'triangle', freq: 300, to: 760, dur: 0.12, vol: 0.05, attack: 0.04 });
    tone(v, { freq: 110, to: 38, at: 0.08, dur: 0.28, vol: 0.42 });
    noise(v, { freq: 700, to: 260, q: 1, at: 0.08, dur: 0.22, vol: 0.36, attack: 0.003 });
    noise(v, { filter: 'highpass', freq: 3200, to: 2000, at: 0.08, dur: 0.32, vol: 0.13, attack: 0.01 });
  },
  // Canisters launched: their clamps springing open with a clank, then a rush of gas
  // climbing as they fly off, a whistle over it.
  podLaunch(v) {
    noise(v, { filter: 'highpass', freq: 3000, to: 1600, q: 0.7, dur: 0.05, vol: 0.28, attack: 0.002 });
    tone(v, { type: 'triangle', freq: 1650, to: 1600, dur: 0.3, vol: 0.05 });
    tone(v, { freq: 2470, to: 2420, dur: 0.22, vol: 0.03 });
    noise(v, { freq: 400, to: 2400, q: 0.8, at: 0.03, dur: 0.45, vol: 0.3, attack: 0.03 });
    tone(v, { freq: 900, to: 1900, at: 0.04, dur: 0.4, vol: 0.025, attack: 0.05 });
  },
  globSplat(v) { // a glob landing: a big wet splat over a thud, then the poison sizzling
    tone(v, { freq: 110, to: 35, dur: 0.35, vol: 0.45 });
    splat(v, { freq: 1500, to: 350, dur: 0.3, vol: 0.55 });
    splat(v, { freq: 380, to: 150, q: 0.7, at: 0.02, dur: 0.35, vol: 0.7 });
    noise(v, { filter: 'highpass', freq: 3000, to: 5200, at: 0.08, dur: 0.6, vol: 0.05, attack: 0.15 });
  },
  // A valve or canister blown off as it dies: a sharp bang, metal ringing and a jet of gas.
  partBlown(v) {
    noise(v, { filter: 'highpass', freq: 2400, to: 1200, q: 0.7, dur: 0.06, vol: 0.32, attack: 0.002 });
    noise(v, { filter: 'lowpass', freq: 1400, to: 120, dur: 0.3, vol: 0.4 });
    tone(v, { freq: 120, to: 40, dur: 0.25, vol: 0.35 });
    tone(v, { type: 'triangle', freq: 2100, to: 2050, at: 0.005, dur: 0.4, vol: 0.04 });
    tone(v, { freq: 3150, to: 3080, at: 0.005, dur: 0.3, vol: 0.025 });
    noise(v, { filter: 'highpass', freq: 3600, to: 2200, q: 0.7, at: 0.02, dur: 0.5, vol: 0.16, attack: 0.02 });
  },
  // Dying, about as long as its `dying`: its machinery failing, a motor grinding down and
  // shuddering harder, pressure whining up under a swelling hiss, metal rattling faster and
  // faster, cut off by bossKill as it bursts.
  blightDying(v) {
    const motor = dull(v, 1200);
    const m = tone(v, { type: 'sawtooth', freq: 110, to: 42, dur: 2.8, vol: 0.09, attack: 0.1, hold: 2.6, out: motor });
    lfo(v, m.frequency, { rate: 9, depth: 8, dur: 2.8, type: 'square' });
    tone(v, { type: 'triangle', freq: 380, to: 2100, dur: 2.8, vol: 0.05, attack: 2, hold: 2.7 });
    noise(v, { filter: 'highpass', freq: 1800, to: 4200, q: 0.7, dur: 2.8, vol: 0.14, attack: 1.8, hold: 2.7 });
    tone(v, { freq: 60, to: 95, dur: 2.8, vol: 0.25, attack: 0.1, hold: 2.65 });
    for (let t = 0.1, gap = 0.32; t < 2.7; t += gap, gap *= 0.86) {
      tone(v, { type: 'triangle', freq: 1300 + Math.random() * 1400, at: t, dur: 0.07, vol: 0.03 + t * 0.012 });
      noise(v, { freq: 2600, q: 3, at: t, dur: 0.03, vol: 0.06 });
    }
  },
  vent(v) { // now and then, idle: a valve letting off a soft hiss of gas
    noise(v, { filter: 'highpass', freq: 3200, to: 2200, q: 0.7, dur: 0.5, vol: 0.08, attack: 0.05 });
    noise(v, { freq: 1300, to: 900, q: 2, dur: 0.4, vol: 0.04, attack: 0.04 });
  },
  creak(v) { // now and then, idle: a low metallic groan of something under strain
    const pipe = dull(v, 1400);
    for (const freq of [176, 183.5]) {
      const o = tone(v, { type: 'triangle', freq, to: freq * 0.88, dur: 1, vol: 0.06, attack: 0.2, hold: 0.6, out: pipe });
      lfo(v, o.frequency, { rate: 6, depth: 2.5, dur: 1 });
    }
    noise(v, { freq: 640, to: 520, q: 7, dur: 0.9, vol: 0.05, attack: 0.2, hold: 0.5 });
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

  // props (src/game/props.js)
  podHit(v) { // a star pod struck: a soft, papery thump
    noise(v, { freq: 900, to: 400, q: 0.8, dur: 0.1, vol: 0.3 });
    tone(v, { freq: 220, to: 120, dur: 0.08, vol: 0.15 });
  },
  podBreak(v) { // ...and bursting: a muffled pop, petals rustling off, an airy chime as the star slips out
    noise(v, { filter: 'lowpass', freq: 2500, to: 300, dur: 0.2, vol: 0.4 });
    tone(v, { freq: 180, to: 70, dur: 0.18, vol: 0.3 });
    for (let i = 0; i < 8; i++) {
      noise(v, { freq: 1500 + Math.random() * 2000, q: 1.5, at: Math.random() * 0.25, dur: 0.02 + Math.random() * 0.02, vol: 0.05 + Math.random() * 0.05 });
    }
    noise(v, { filter: 'highpass', freq: 2000, to: 6000, dur: 0.4, vol: 0.06, attack: 0.05 });
    arp(v, [784, 1047, 1319], 0.06, { type: 'triangle', at: 0.08, dur: 0.5, vol: 0.05 });
  },
  cageHit(v) { // a caged star struck: a ringing ting
    tone(v, { type: 'triangle', freq: 1760, dur: 0.4, vol: 0.07 });
    tone(v, { freq: 2640, dur: 0.3, vol: 0.04 });
    noise(v, { filter: 'highpass', freq: 5000, dur: 0.03, vol: 0.12 });
  },
  cageBreak(v) { // ...and breaking: its rings snapping one after another, the star zinging free
    for (const [freq, to, at] of [[2349, 2200, 0], [1760, 1600, 0.04], [1319, 1150, 0.09]]) {
      tone(v, { type: 'triangle', freq, to, at, dur: 0.35, vol: 0.08 });
    }
    noise(v, { filter: 'highpass', freq: 4000, to: 2000, dur: 0.15, vol: 0.25 });
    tone(v, { freq: 140, to: 60, dur: 0.14, vol: 0.25 });
    tinkles(v, 6, { at: 0.03, spread: 0.3, vol: 0.045, lo: 3000, hi: 6500 });
    tone(v, { freq: 1047, to: 2093, at: 0.05, dur: 0.35, vol: 0.05 });
  },
  eggHit(v) { // a star egg struck: a hollow tock and the shell crackling
    tone(v, { type: 'triangle', freq: 520, to: 420, dur: 0.09, vol: 0.14 });
    noise(v, { freq: 1800, q: 2, dur: 0.05, vol: 0.25 });
    for (let i = 0; i < 4; i++) noise(v, { filter: 'highpass', freq: 3000 + Math.random() * 2000, at: 0.02 + Math.random() * 0.1, dur: 0.015, vol: 0.06 });
  },
  eggBreak(v) { // ...and hatching: the shell crunching apart with a pop, then a shimmer of light
    noise(v, { filter: 'lowpass', freq: 3500, to: 200, dur: 0.25, vol: 0.45 });
    tone(v, { freq: 200, to: 70, dur: 0.2, vol: 0.35 });
    for (let i = 0; i < 10; i++) {
      noise(v, { freq: 2000 + Math.random() * 2500, q: 2, at: Math.random() * 0.2, dur: 0.015 + Math.random() * 0.02, vol: 0.05 + Math.random() * 0.06 });
    }
    noise(v, { filter: 'highpass', freq: 4000, to: 7000, dur: 0.5, vol: 0.05, attack: 0.08 });
    arp(v, [659, 880, 1175, 1568], 0.05, { type: 'triangle', at: 0.1, dur: 0.5, vol: 0.05 });
  },
  stoneHit(v) { // a geode struck: a crunchy knock and the faint ping of the crystal inside
    tone(v, { type: 'square', freq: 190, to: 85, dur: 0.09, vol: 0.14 });
    noise(v, { filter: 'lowpass', freq: 2600, to: 300, dur: 0.1, vol: 0.45 });
    tone(v, { type: 'triangle', freq: 1900, to: 1860, at: 0.01, dur: 0.14, vol: 0.04 });
  },
  stoneBreak(v) { // ...and bursting: a heavy crack, rubble crumbling, light rushing out
    tone(v, { freq: 110, to: 38, dur: 0.5, vol: 0.5 });
    noise(v, { filter: 'lowpass', freq: 3200, to: 90, dur: 0.45, vol: 0.55 });
    for (let i = 0; i < 10; i++) {
      noise(v, { freq: 600 + Math.random() * 1000, q: 2, at: Math.random() * 0.35, dur: 0.03 + Math.random() * 0.03, vol: 0.08 + Math.random() * 0.08 });
    }
    noise(v, { filter: 'highpass', freq: 4000, to: 2500, dur: 0.3, vol: 0.1 });
    arp(v, [988, 1319, 1976], 0.045, { type: 'triangle', at: 0.06, dur: 0.5, vol: 0.05 });
  },
  druseHit(v) { // a druse struck: a deep, woody thock, a gritty crunch and a low knock under it
    tone(v, { freq: 95, to: 55, dur: 0.14, vol: 0.4 });
    tone(v, { type: 'triangle', freq: 340, to: 210, dur: 0.1, vol: 0.22 });
    noise(v, { freq: 900, to: 500, q: 3, dur: 0.07, vol: 0.4 });
    noise(v, { filter: 'lowpass', freq: 2200, to: 250, dur: 0.12, vol: 0.4 });
    for (let i = 0; i < 4; i++) noise(v, { freq: 700 + Math.random() * 900, q: 3, at: 0.02 + Math.random() * 0.08, dur: 0.02, vol: 0.08 });
  },
  druseBreak(v) { // ...and splitting open: a heavy crack and thud, rubble knocking and clattering
    // down like wood blocks, then a low, warm marimba roll of the crystals ringing out
    tone(v, { freq: 85, to: 30, dur: 0.6, vol: 0.55 });
    tone(v, { type: 'triangle', freq: 260, to: 110, dur: 0.12, vol: 0.3 });
    noise(v, { freq: 1100, to: 400, q: 2, dur: 0.08, vol: 0.5 });
    noise(v, { filter: 'lowpass', freq: 2800, to: 80, dur: 0.55, vol: 0.6 });
    for (let i = 0; i < 16; i++) {
      const at = 0.03 + 0.5 * Math.random() ** 1.5, freq = 220 + Math.random() * 500;
      tone(v, { type: 'triangle', freq, to: freq * 0.8, at, dur: 0.05 + Math.random() * 0.04, vol: 0.06 + Math.random() * 0.06 });
      noise(v, { freq: freq * 3, q: 3, at, dur: 0.025, vol: 0.06 + Math.random() * 0.05 });
    }
    for (const [freq, at] of [[392, 0.06], [494, 0.11], [587, 0.16], [784, 0.22]]) {
      tone(v, { freq, at, dur: 0.45, vol: 0.09 });
      tone(v, { freq: freq * 4, at, dur: 0.08, vol: 0.02 }); // a mallet's bright overtone, gone at once
    }
  },
  cacheHit(v) { // a reliquary struck: a gilded clang, ringing
    tone(v, { type: 'triangle', freq: 620, to: 600, dur: 0.4, vol: 0.08 });
    tone(v, { freq: 930, to: 915, dur: 0.28, vol: 0.05 });
    tone(v, { type: 'square', freq: 180, to: 80, dur: 0.08, vol: 0.12 });
    noise(v, { filter: 'lowpass', freq: 3000, to: 400, dur: 0.08, vol: 0.35 });
  },
  cacheBreak(v) { // ...and bursting open: a deep boom and a shatter of gold, then a bright chord rising
    tone(v, { freq: 80, to: 28, dur: 1, vol: 0.5 });
    noise(v, { filter: 'lowpass', freq: 4000, to: 80, dur: 0.8, vol: 0.5 });
    noise(v, { filter: 'highpass', freq: 4000, to: 2000, dur: 0.4, vol: 0.2 });
    tinkles(v, 10, { at: 0.03, spread: 0.5, vol: 0.045, lo: 1800, hi: 4800 });
    arp(v, [523, 659, 784, 1047, 1319, 1568], 0.05, { type: 'triangle', at: 0.12, dur: 0.8, vol: 0.07 });
    tone(v, { freq: 262, at: 0.15, dur: 1.1, vol: 0.1, attack: 0.04 });
  },
  // A spawner (PROPS.spawner): everything about it a little off, tritones and wet sounds.
  spawnerHit(v) { // struck: a wet, meaty thud, a crunch, and a sour ring a tritone apart
    tone(v, { freq: 120, to: 48, dur: 0.18, vol: 0.4 });
    noise(v, { filter: 'lowpass', freq: 1800, to: 180, dur: 0.16, vol: 0.5 });
    noise(v, { freq: 900, to: 400, q: 3, dur: 0.12, vol: 0.18, attack: 0.01 });
    tone(v, { type: 'triangle', freq: 466, to: 452, dur: 0.45, vol: 0.05, attack: 0.01 });
    tone(v, { type: 'triangle', freq: 659, to: 677, dur: 0.4, vol: 0.04, attack: 0.01 });
  },
  // Birthing a foe, about as long as SPAWNERS.telegraph: a low groan straining upward over a
  // wet swell, then a tearing rip as it comes free.
  spawnerBirth(v) {
    const dur = SPAWNERS.telegraph;
    const throat = ctx.createGain();
    throat.gain.value = 0.5;
    lfo(v, throat.gain, { rate: 11, depth: 0.3, dur });
    const muffle = ctx.createBiquadFilter();
    muffle.type = 'lowpass';
    muffle.frequency.setValueAtTime(260, v.t);
    muffle.frequency.exponentialRampToValueAtTime(1100, v.t + dur);
    throat.connect(muffle).connect(v.out);
    for (const freq of [62, 64.4]) tone(v, { type: 'sawtooth', freq, to: freq * 1.6, dur, vol: 0.14, attack: dur * 0.6, hold: dur - 0.05, out: throat });
    noise(v, { freq: 300, to: 1200, q: 2.5, dur, vol: 0.12, attack: dur * 0.7, hold: dur - 0.05 });
    noise(v, { freq: 700, to: 2600, q: 1.2, at: dur - 0.04, dur: 0.22, vol: 0.32, attack: 0.008 });
    noise(v, { filter: 'lowpass', freq: 900, to: 120, at: dur - 0.02, dur: 0.3, vol: 0.3 });
    tone(v, { freq: 90, to: 40, at: dur - 0.02, dur: 0.25, vol: 0.3 });
  },
  // Struck down, caving in (PROPS.spawner.collapse.time): a sharp gasp sucked inward, rising
  // too fast, cut off by spawnerBreak.
  spawnerCollapse(v) {
    const dur = PROPS.spawner.collapse.time + 0.02;
    noise(v, { freq: 400, to: 4200, q: 1.8, dur, vol: 0.32, attack: dur * 0.9, hold: dur - 0.02 });
    tone(v, { type: 'sawtooth', freq: 110, to: 330, dur, vol: 0.08, attack: dur * 0.8, hold: dur - 0.02 });
    tone(v, { type: 'triangle', freq: 156, to: 466, dur, vol: 0.07, attack: dur * 0.8, hold: dur - 0.02 });
    tone(v, { freq: 40, to: 70, dur, vol: 0.3, attack: dur * 0.7, hold: dur - 0.02 });
  },
  // ...and bursting: a deep, wet blast, glass and gristle flying, and a dissonant cluster
  // sliding down out of tune as a long moan dies away.
  spawnerBreak(v) {
    tone(v, { freq: 66, to: 22, dur: 1.6, vol: 0.6 });
    noise(v, { filter: 'lowpass', freq: 3600, to: 70, dur: 1.2, vol: 0.6 });
    noise(v, { freq: 1200, to: 220, q: 2, dur: 0.5, vol: 0.25, attack: 0.005 });
    noise(v, { filter: 'highpass', freq: 3800, to: 1800, dur: 0.45, vol: 0.16 });
    tinkles(v, 8, { at: 0.02, spread: 0.6, vol: 0.035, lo: 1200, hi: 3200 });
    for (const [freq, to] of [[311, 233], [330, 241], [466, 311]]) tone(v, { type: 'triangle', freq, to, at: 0.08, dur: 1.6, vol: 0.05, attack: 0.03 });
    const moan = ctx.createGain();
    moan.gain.value = 0.5;
    lfo(v, moan.gain, { rate: 5, depth: 0.25, dur: 2.2 });
    moan.connect(v.out);
    for (const freq of [98, 103.8]) tone(v, { type: 'sawtooth', freq, to: freq * 0.55, at: 0.15, dur: 2, vol: 0.05, attack: 0.3, out: moan });
  },
  lootPop(v) { // loot springing out
    tone(v, { freq: 520, to: 1040, dur: 0.08, vol: 0.06 });
    tone(v, { type: 'triangle', freq: 780, to: 1560, at: 0.03, dur: 0.08, vol: 0.04 });
  },

  // pickups and progression
  orb(v) {
    tone(v, { freq: 660, to: 990, dur: 0.09, vol: 0.12 });
  },
  mend(v) { // a mend orb: a warm, airy chime
    tone(v, { freq: 392, to: 523, dur: 0.5, vol: 0.06, attack: 0.05 });
    arp(v, [784, 988, 1175], 0.05, { type: 'triangle', dur: 0.4, vol: 0.07 });
    noise(v, { filter: 'highpass', freq: 3000, to: 6000, dur: 0.4, vol: 0.04, attack: 0.1 });
  },
  // Buffs (src/player/buffs.js) as they're taken.
  swiftGain(v) { // a whoosh swept upward and a quick bright run
    noise(v, { freq: 600, to: 4000, q: 1, dur: 0.35, vol: 0.2, attack: 0.05 });
    arp(v, [1175, 1568, 2349], 0.04, { type: 'triangle', at: 0.1, dur: 0.3, vol: 0.06 });
  },
  wardGain(v) { // a glass bell struck over a low hum
    tone(v, { freq: 1047, dur: 1, vol: 0.08, attack: 0.01 });
    tone(v, { freq: 1568, dur: 0.8, vol: 0.05 });
    tone(v, { type: 'triangle', freq: 2093, dur: 0.6, vol: 0.04 });
    noise(v, { filter: 'highpass', freq: 5000, dur: 0.25, vol: 0.06, attack: 0.05 });
    tone(v, { freq: 262, dur: 0.6, vol: 0.06, attack: 0.08 });
  },
  furyGain(v) { // fire catching, a growl and a rising chime
    noise(v, { filter: 'lowpass', freq: 300, to: 3000, dur: 0.3, vol: 0.25, attack: 0.04 });
    tone(v, { type: 'sawtooth', freq: 110, to: 220, dur: 0.3, vol: 0.06, attack: 0.05 });
    arp(v, [659, 988, 1319], 0.05, { type: 'triangle', at: 0.1, dur: 0.4, vol: 0.07 });
    for (let i = 0; i < 4; i++) noise(v, { filter: 'highpass', freq: 3000 + Math.random() * 2000, at: 0.05 + Math.random() * 0.25, dur: 0.02, vol: 0.06 });
  },
  hasteGain(v) { // an electric zap snapping upward and a quick bright run
    tone(v, { type: 'square', freq: 400, to: 1600, dur: 0.12, vol: 0.05 });
    noise(v, { filter: 'highpass', freq: 3000, to: 6000, dur: 0.15, vol: 0.12 });
    for (let i = 0; i < 3; i++) noise(v, { filter: 'highpass', freq: 4000 + Math.random() * 2000, at: 0.02 + Math.random() * 0.12, dur: 0.012, vol: 0.08 });
    arp(v, [1319, 1760, 2349], 0.035, { type: 'triangle', at: 0.06, dur: 0.25, vol: 0.06 });
  },
  wardBreak(v) { // the ward stops a hit: a thump, and it shatters
    tone(v, { freq: 140, to: 60, dur: 0.15, vol: 0.25 });
    noise(v, { filter: 'highpass', freq: 3000, to: 1500, dur: 0.25, vol: 0.35 });
    tone(v, { type: 'triangle', freq: 1047, to: 523, dur: 0.3, vol: 0.08 });
    tinkles(v, 8, { at: 0.02, spread: 0.35, vol: 0.05 });
  },
  buffEnd(v) { // a buff wearing off: a soft falling blip
    tone(v, { type: 'triangle', freq: 880, to: 440, dur: 0.2, vol: 0.07 });
    noise(v, { filter: 'highpass', freq: 4000, to: 2000, dur: 0.12, vol: 0.03 });
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
  exitEnter(v) { // drawn into the exit: a rising rush and a climbing shimmer, swelling to the white
    noise(v, { freq: 300, to: 5000, q: 2, dur: 1.3, vol: 0.2, attack: 0.9 });
    tone(v, { freq: 196, to: 784, dur: 1.3, vol: 0.12, attack: 0.6 });
    arp(v, [659, 784, 988, 1175, 1319, 1568, 1976], 0.11, { type: 'triangle', at: 0.2, dur: 0.5, vol: 0.06 });
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
  // A guardian loses its temper (GUARDIAN_RAGE.angry): a huge, monstrous roar from far off,
  // a sub hit and a rumbling bellow of detuned saws that swells, cracks open into a raw
  // scream and drags back down, shaken by a growling tremolo and driven hard.
  guardianRoar(v) {
    const dur = 2.4;
    const throat = ctx.createGain();
    throat.gain.value = 0.6;
    lfo(v, throat.gain, { rate: 19, depth: 0.42, dur, type: 'triangle' });
    const grit = ctx.createWaveShaper();
    grit.curve = drive();
    const muffle = ctx.createBiquadFilter();
    muffle.type = 'lowpass';
    muffle.Q.value = 4;
    muffle.frequency.setValueAtTime(220, v.t);
    muffle.frequency.exponentialRampToValueAtTime(1500, v.t + 0.55);
    muffle.frequency.exponentialRampToValueAtTime(180, v.t + dur);
    const trim = ctx.createGain();
    trim.gain.value = 0.7;
    throat.connect(grit).connect(muffle).connect(trim).connect(v.out);
    for (const [freq, peak, to] of [[52, 88, 34], [53.1, 90, 35], [78, 132, 50], [104, 170, 66]]) {
      const osc = tone(v, { type: 'sawtooth', freq, dur, vol: 0.2, attack: 0.25, hold: 1.4, out: throat });
      osc.frequency.exponentialRampToValueAtTime(peak * v.pitch, v.t + 0.5);
      osc.frequency.exponentialRampToValueAtTime(to * v.pitch, v.t + dur);
      lfo(v, osc.frequency, { rate: 4.5, depth: freq * 0.05, dur });
    }
    noise(v, { freq: 380, to: 160, q: 0.8, dur: dur - 0.2, vol: 0.7, attack: 0.2, hold: 1.2, out: throat });
    tone(v, { freq: 48, to: 20, dur: 1.5, vol: 0.55, attack: 0.01 });
    noise(v, { filter: 'lowpass', freq: 500, to: 60, dur: 1.2, vol: 0.4 });
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
  // Cleave: a low, dark whoosh under a thin edge of air, a faint blade ring and a soft thump,
  // kept quiet since it rides on top of every hit.
  cleave(v) {
    noise(v, { freq: 1500, to: 360, q: 1.6, dur: 0.2, vol: 0.14, attack: 0.012 });
    noise(v, { filter: 'highpass', freq: 5200, to: 2800, dur: 0.07, vol: 0.035 });
    tone(v, { type: 'triangle', freq: 740, to: 680, at: 0.01, dur: 0.16, vol: 0.022, attack: 0.006 });
    tone(v, { freq: 150, to: 80, dur: 0.11, vol: 0.05 });
  },
  rift(v) {
    noise(v, { filter: 'highpass', freq: 1500, to: 6000, dur: 0.3, vol: 0.18, attack: 0.02 });
    arp(v, [659, 988], 0.04, { type: 'triangle', dur: 0.35, vol: 0.09 });
  },
  // Needle: a tiny high flick, quiet since it comes every few hits.
  needle(v) {
    noise(v, { filter: 'highpass', freq: 4200, to: 8000, dur: 0.06, vol: 0.05, attack: 0.004 });
    tone(v, { type: 'triangle', freq: 2400, to: 3000, dur: 0.05, vol: 0.015 });
  },
  // Momentum: a charged hit lands over the usual hit as a deep boom dropping away, a gritty
  // crunch, a sharp crack on top and a low rumble trailing after.
  momentum(v) {
    tone(v, { freq: 120, to: 30, dur: 0.4, vol: 0.5 });
    tone(v, { type: 'sawtooth', freq: 190, to: 50, dur: 0.15, vol: 0.12 });
    noise(v, { freq: 900, to: 160, q: 0.8, dur: 0.22, vol: 0.45 });
    noise(v, { filter: 'highpass', freq: 2200, to: 5000, dur: 0.05, vol: 0.2 });
    tone(v, { type: 'triangle', freq: 70, to: 38, at: 0.05, dur: 0.32, vol: 0.18 });
  },
  // Afterimage: left behind with an airy breath drawn in and two pale glassy notes ringing
  // apart; gone in a soft breathy puff under a note falling away.
  afterimage(v) {
    noise(v, { filter: 'highpass', freq: 1800, to: 5200, dur: 0.22, vol: 0.07, attack: 0.12 });
    tone(v, { type: 'triangle', freq: 1175, to: 1110, dur: 0.35, vol: 0.03, attack: 0.02 });
    tone(v, { type: 'triangle', freq: 1760, to: 1865, at: 0.03, dur: 0.3, vol: 0.02, attack: 0.02 });
  },
  afterimageFade(v) {
    noise(v, { freq: 2400, to: 700, q: 0.7, dur: 0.2, vol: 0.08, attack: 0.01 });
    tone(v, { type: 'triangle', freq: 1400, to: 700, dur: 0.22, vol: 0.025 });
  },
  // Feral: driven to the brink, a sharp hiss over a low rattling growl and two heavy heartbeats.
  feral(v) {
    noise(v, { filter: 'highpass', freq: 2600, to: 5200, dur: 0.38, vol: 0.14, attack: 0.012 });
    noise(v, { freq: 3400, to: 2200, q: 1.4, dur: 0.3, vol: 0.08, attack: 0.02 });
    const growl = tone(v, { type: 'sawtooth', freq: 95, to: 70, dur: 0.45, vol: 0.06, attack: 0.03 });
    lfo(v, growl.frequency, { rate: 26, depth: 14, dur: 0.45 });
    tone(v, { freq: 62, to: 38, dur: 0.16, vol: 0.4 });
    tone(v, { freq: 56, to: 36, at: 0.2, dur: 0.14, vol: 0.28 });
  },
  // Gravebloom: a lotus opens with a faint breath and two soft glassy notes, kept quiet since
  // every kill leaves one. It bursts with a soft round thump, a swell of breathy air rushing
  // out and a bright little chord of chimes; all round, lower and wider, the chimes rolling.
  bloom(v) {
    noise(v, { filter: 'highpass', freq: 2400, to: 4800, dur: 0.25, vol: 0.035, attack: 0.1 });
    tone(v, { type: 'triangle', freq: 1568, to: 1661, at: 0.04, dur: 0.4, vol: 0.016, attack: 0.03 });
    tone(v, { type: 'triangle', freq: 2349, at: 0.1, dur: 0.35, vol: 0.01, attack: 0.03 });
  },
  bloomBurst(v) {
    tone(v, { freq: 140, to: 55, dur: 0.22, vol: 0.32 });
    noise(v, { freq: 700, to: 2600, q: 0.7, dur: 0.32, vol: 0.2, attack: 0.02 });
    noise(v, { filter: 'highpass', freq: 3600, to: 7000, at: 0.03, dur: 0.22, vol: 0.06, attack: 0.03 });
    arp(v, [1568, 2093, 2637], 0.02, { type: 'triangle', at: 0.02, dur: 0.5, vol: 0.035, attack: 0.008 });
  },
  bloomRing(v) {
    tone(v, { freq: 110, to: 42, dur: 0.3, vol: 0.38 });
    noise(v, { filter: 'lowpass', freq: 1400, to: 300, dur: 0.35, vol: 0.25, attack: 0.01 });
    noise(v, { freq: 900, to: 2200, q: 0.6, dur: 0.4, vol: 0.14, attack: 0.04 });
    arp(v, [1319, 1760, 2093, 2637], 0.035, { type: 'triangle', at: 0.02, dur: 0.6, vol: 0.03, attack: 0.008 });
  },
  // Astral Blades: a soft glassy shimmer as each blade is drawn, and a thin rising zip as it flies.
  astralDraw(v) {
    noise(v, { filter: 'highpass', freq: 3000, to: 7000, dur: 0.12, vol: 0.06, attack: 0.03 });
    tone(v, { type: 'triangle', freq: 1760, to: 1980, dur: 0.2, vol: 0.035, attack: 0.01 });
  },
  astralLaunch(v) {
    noise(v, { freq: 1200, to: 5200, q: 1.8, dur: 0.12, vol: 0.12, attack: 0.01 });
    tone(v, { type: 'triangle', freq: 1320, to: 2640, dur: 0.1, vol: 0.03 });
  },
  // Oracle Discs: a disc is thrown with an airy shimmer and a quick rising sweep of chimes over
  // a soft warble, like it sings as it spins; on every enemy it ricochets off, a glassy bell note
  // with a sparkle of tiny chimes (pitched a step higher each time by the caller).
  oracleLaunch(v) {
    noise(v, { filter: 'highpass', freq: 3200, to: 7500, dur: 0.3, vol: 0.06, attack: 0.04 });
    arp(v, [1047, 1319, 1568, 2093], 0.035, { type: 'sine', dur: 0.35, vol: 0.03, attack: 0.006 });
    const hum = tone(v, { type: 'sine', freq: 523, to: 784, dur: 0.3, vol: 0.025, attack: 0.03 });
    lfo(v, hum.frequency, { rate: 14, depth: 12, dur: 0.3 });
  },
  oracleHit(v) {
    noise(v, { filter: 'highpass', freq: 5000, to: 8000, dur: 0.05, vol: 0.04, attack: 0.002 });
    tone(v, { type: 'sine', freq: 1568, dur: 0.4, vol: 0.05, attack: 0.003 });
    tone(v, { type: 'sine', freq: 3136, dur: 0.25, vol: 0.015, attack: 0.003 });
    tinkles(v, 3, { at: 0.02, spread: 0.18, vol: 0.02, lo: 3000, hi: 6500 });
  },
  // Off a wall: just a faint glassy tick and a chime, quieter than a strike.
  oracleBounce(v) {
    noise(v, { filter: 'highpass', freq: 4500, to: 7000, dur: 0.04, vol: 0.025, attack: 0.002 });
    tone(v, { type: 'sine', freq: 2349, dur: 0.18, vol: 0.02, attack: 0.003 });
  },
  // Black Rose, both striking 0.2s in, all of it muffled, over a hiss chopped into a stutter as
  // the world tears: a pulse swells up out of the dark and drops into a gritty, deep thump; an
  // implosion is sucked in, rising and cut dead at the strike, into a deep collapse with a
  // knock on top.
  rosePulse(v) {
    roseMuffle(v);
    const push = roseGrit(v);
    roseStutter(v, 42);
    noise(v, { filter: 'lowpass', freq: 200, to: 900, dur: 0.22, vol: 0.12, attack: 0.17 });
    tone(v, { freq: 55, to: 90, dur: 0.22, vol: 0.15, attack: 0.15 });
    tone(v, { freq: 90, to: 32, at: 0.2, dur: 0.45, vol: 0.6, out: push });
    noise(v, { filter: 'lowpass', freq: 2500, to: 150, at: 0.2, dur: 0.3, vol: 0.35, out: push });
    noise(v, { freq: 1800, to: 500, q: 1.4, at: 0.2, dur: 0.15, vol: 0.18 });
  },
  roseImplode(v) {
    roseMuffle(v);
    const push = roseGrit(v);
    roseStutter(v, 60);
    noise(v, { freq: 200, to: 900, q: 1.2, dur: 0.205, vol: 0.22, attack: 0.19 });
    tone(v, { freq: 70, to: 220, dur: 0.205, vol: 0.15, attack: 0.18 });
    tone(v, { freq: 140, to: 30, at: 0.2, dur: 0.35, vol: 0.7, out: push });
    noise(v, { filter: 'lowpass', freq: 4000, to: 100, at: 0.2, dur: 0.2, vol: 0.4, out: push });
    noise(v, { freq: 500, q: 1.5, at: 0.2, dur: 0.04, vol: 0.3 });
    tone(v, { freq: 45, at: 0.22, dur: 0.5, vol: 0.25, attack: 0.02 });
  },
  // Thunderclap (twice: as it strikes and as it twitches): a split-second crack tearing into a
  // deep boom, then a long low rumble that rolls on in waves, all pushed hard into a soft
  // clipper so it's loud and thick without peaking; and a smaller crack and
  // thud on each enemy it leaps to.
  thunder(v) {
    const push = ctx.createGain();
    push.gain.value = 1.5;
    const grit = ctx.createWaveShaper();
    grit.curve = drive();
    const trim = ctx.createGain();
    trim.gain.value = 0.8;
    push.connect(grit).connect(trim).connect(v.out);
    noise(v, { filter: 'lowpass', freq: 8000, to: 2000, dur: 0.18, vol: 0.7, attack: 0.002, out: push });
    noise(v, { freq: 1400, to: 400, q: 0.7, at: 0.02, dur: 0.26, vol: 0.5, out: push });
    tone(v, { freq: 65, to: 28, dur: 0.9, vol: 0.8, out: push });
    noise(v, { filter: 'lowpass', freq: 520, to: 60, at: 0.04, dur: 1.8, vol: 0.75, attack: 0.05, hold: 0.35, out: push });
    noise(v, { filter: 'lowpass', freq: 340, to: 70, at: 0.4, dur: 0.8, vol: 0.5, attack: 0.08, out: push });
    noise(v, { filter: 'lowpass', freq: 280, to: 60, at: 0.85, dur: 0.9, vol: 0.35, attack: 0.1, out: push });
  },
  thunderZap(v) {
    noise(v, { filter: 'lowpass', freq: 5000, to: 1200, dur: 0.08, vol: 0.2, attack: 0.002 });
    tone(v, { freq: 110, to: 45, dur: 0.16, vol: 0.16 });
  },
  // Phoenix: the wings thrown open with a deep whoomp of air and a roar of fire catching,
  // crackling as it dies; and a short hissing fwoosh for everything that catches fire.
  phoenix(v) {
    noise(v, { filter: 'lowpass', freq: 300, to: 900, dur: 0.22, vol: 0.45, attack: 0.03 });
    tone(v, { freq: 70, to: 45, dur: 0.25, vol: 0.3, attack: 0.02 });
    noise(v, { freq: 600, to: 1600, q: 0.6, at: 0.02, dur: 0.45, vol: 0.22, attack: 0.05 });
    noise(v, { filter: 'highpass', freq: 2500, to: 4000, at: 0.05, dur: 0.4, vol: 0.06, attack: 0.08 });
    for (let i = 0; i < 6; i++) noise(v, { filter: 'highpass', freq: 3000 + Math.random() * 3000, at: 0.08 + Math.random() * 0.35, dur: 0.02, vol: 0.08 * Math.random() });
  },
  ignite(v) {
    noise(v, { freq: 900, to: 2400, q: 0.7, dur: 0.18, vol: 0.14, attack: 0.02 });
    noise(v, { filter: 'lowpass', freq: 400, to: 200, dur: 0.16, vol: 0.12, attack: 0.01 });
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
  boxHit(v) { // a tier box's gem struck: a crunching knock, glass splintering, and the stone ringing
    tone(v, { type: 'square', freq: 210, to: 80, dur: 0.09, vol: 0.13 });
    noise(v, { filter: 'lowpass', freq: 3400, to: 350, dur: 0.11, vol: 0.45 });
    for (let i = 0; i < 6; i++) {
      noise(v, { freq: 2200 + Math.random() * 3500, q: 3, at: Math.random() * 0.09, dur: 0.012 + Math.random() * 0.018, vol: 0.05 + Math.random() * 0.07 });
    }
    tone(v, { type: 'triangle', freq: 1760, to: 1740, at: 0.005, dur: 0.45, vol: 0.06 });
    tone(v, { freq: 2637, to: 2610, at: 0.005, dur: 0.3, vol: 0.03 });
    tinkles(v, 3, { at: 0.04, spread: 0.25, vol: 0.03 });
  },
  boxShatter(v) { // ...and bursting: a deep boom, a sheet of glass exploding, shards raining down, light rushing out
    tone(v, { freq: 95, to: 30, dur: 0.9, vol: 0.55 });
    noise(v, { filter: 'lowpass', freq: 5000, to: 90, dur: 0.7, vol: 0.55 });
    noise(v, { filter: 'highpass', freq: 5500, to: 2500, dur: 0.45, vol: 0.22 });
    for (let i = 0; i < 14; i++) {
      noise(v, { freq: 1500 + Math.random() * 4500, q: 3, at: Math.random() * 0.3, dur: 0.015 + Math.random() * 0.03, vol: 0.06 + Math.random() * 0.08 });
    }
    tinkles(v, 22, { at: 0.05, spread: 0.9, vol: 0.06 });
    noise(v, { freq: 600, to: 6000, q: 0.8, at: 0.05, dur: 0.6, vol: 0.08, attack: 0.15 });
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

// A couple of seconds of dense, wet grain: tiny decaying noise ticks packed close and
// overlapping, mostly faint with a louder one now and then, like something squelching.
function goo() {
  if (gooBuffer) return gooBuffer;
  const sr = ctx.sampleRate, len = Math.floor(sr * 2);
  gooBuffer = ctx.createBuffer(1, len, sr);
  const d = gooBuffer.getChannelData(0);
  for (let i = 0; i < len; i += Math.floor(sr * (0.0003 + Math.random() * 0.0012))) {
    const amp = 0.1 + 0.9 * Math.random() ** 3, n = Math.floor(sr * (0.0005 + Math.random() * 0.0025));
    for (let k = 0; k < n && i + k < len; k++) d[i + k] += (Math.random() * 2 - 1) * amp * Math.exp((-5 * k) / n);
  }
  let sum = 0; // as loud on average as the white noise, so their volumes compare
  for (const x of d) sum += x * x;
  const gain = 0.58 / Math.sqrt(sum / len);
  for (let i = 0; i < len; i++) d[i] *= gain;
  return gooBuffer;
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

// The context and the music bus, for the fight music (music.js) to play through, so the
// music level and muting apply to it. Null until the first key or mouse press creates them.
export function audioBus() {
  return ctx ? { ctx, bus: music } : null;
}

// ── public API ─────────────────────────────────────────────────────
export const sfx = {
  // Must run inside a user gesture before anything is audible.
  unlock() {
    if (ensureContext()?.state === 'suspended') ctx.resume();
  },

  // opts: { volume = 1, pan = 0 (-1 left … 1 right), pitch = 1, jitter = PITCH_JITTER }
  play(name, { volume = 1, pan = 0, pitch = 1, jitter = PITCH_JITTER } = {}) {
    if (silenced() || !ctx || ctx.state !== 'running' || voices >= MAX_VOICES || volume <= 0) return;
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
      out.connect(panner).connect(effects);
    } else {
      out.connect(effects);
    }
    const v = { t: now + 0.005, out, pitch: pitch * (1 + (Math.random() * 2 - 1) * jitter), end: 0, last: null };
    recipe(v);
    voices++;
    v.last.onended = () => { voices--; out.disconnect(); };
  },

  // Starts a looping bed and returns { setLevel(0…1), stop(fade seconds) }. Loops sit
  // outside the voice cap and keep running silently while silenced (in the background).
  loop(name, { volume = 1, fadeIn = 0.6 } = {}) {
    const recipe = LOOPS[name];
    if (!ctx || !recipe) return NO_LOOP;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(effects);
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
};
