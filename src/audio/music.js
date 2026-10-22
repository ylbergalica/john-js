// Fight music, synthesized live like the sound effects (sfx.js): nothing is loaded. Dark,
// down-tuned metal: two distorted rhythm guitars panned apart, a bass doubling them, a rock
// kit, and a low lead guitar once things get bad. A step sequencer writes a moment ahead
// into Web Audio and, bar by bar, decides how hard to play from the fight it's fed
// (FightMusic.update): a brooding drone and toms as a fight breaks out, chugging riffs as
// it gets going, gallops and double kick for a crowd or close to death, tremolo and
// blast beats while Exalted. Against a guardian it speeds up and comes apart: frantic
// riffs and drums rewritten every bar, dissonant accents, tom rolls, bars cut short so
// the beat never settles, horror strings sawing a rising cluster and a brass blast
// every few bars.
//
// Each floor's nebula palette picks a mood (tuning, scale, tempo, chord progressions), and
// deeper floors play faster. Riffs, drum patterns and lead lines are rewritten from the
// chords every few bars, so a fight never loops exactly. Kills and parries hit back in
// time with the riff. A fight fades in, and once it's over ends on one last ringing chord.
import { audioBus } from './sfx.js';
import { MUSIC } from '../data/config.js';

const LOOKAHEAD = 0.12; // seconds scheduled ahead of the clock
const TICK_MS = 25; // how often the scheduler runs
const STEPS = 16; // sixteenths per bar
const PHRASE = 4; // bars per chord progression
const SECTION = 8; // bars before the parts are rewritten
const SILENT = 0.0001; // exponential ramps can't reach 0
const LOWEST = 33; // MIDI: no guitar root below A1

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const mod = (n, m) => ((n % m) + m) % m;

// ── moods ──────────────────────────────────────────────────────────
const AEOLIAN = [0, 2, 3, 5, 7, 8, 10];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
const HARMONIC = [0, 2, 3, 5, 7, 8, 11]; // minor with a raised 7th
const PHRYGIAN_DOMINANT = [0, 1, 4, 5, 7, 8, 10]; // phrygian with a major 3rd: snake-charmer menace

// One per NEBULA palette, in the same order: the guitars' low root (MIDI), the scale, the
// tempo on floor 1, and chord progressions as scale degrees, one chord a bar (0 = tonic).
// Chords are power chords (root, fifth, octave), so the scale only colours the roots,
// accents and lead.
const MOODS = [
  { tonic: 40, scale: PHRYGIAN, bpm: 146, progressions: [[0, 1, 0, 6], [0, 5, 6, 1], [0, 6, 5, 1]] }, // blue, violet: E phrygian, cold
  { tonic: 38, scale: AEOLIAN, bpm: 124, progressions: [[0, 5, 6, 0], [0, 3, 5, 6], [0, 6, 5, 4]] }, // teal, blue: D minor, doom
  { tonic: 37, scale: HARMONIC, bpm: 136, progressions: [[0, 5, 4, 4], [0, 3, 4, 0], [0, 5, 1, 4]] }, // rose, purple: C# harmonic minor, sinister
  { tonic: 36, scale: PHRYGIAN_DOMINANT, bpm: 168, progressions: [[0, 1, 0, 1], [0, 1, 6, 5], [0, 6, 5, 1]] }, // ember, crimson: C phrygian dominant, savage
  { tonic: 35, scale: AEOLIAN, bpm: 154, progressions: [[0, 6, 5, 6], [0, 3, 6, 5], [0, 2, 3, 6]] }, // jade, sea blue: B minor, relentless
  { tonic: 39, scale: HARMONIC, bpm: 160, progressions: [[0, 4, 5, 4], [0, 3, 4, 4], [0, 5, 3, 4]] }, // gold, wine: D# harmonic minor, grand
];

// ── parts ──────────────────────────────────────────────────────────
// Levels: 1 the fight has broken out, 2 it's on, 3 a crowd, a guardian or danger, 4 Exalted.
//
// Riffs, one bar of sixteenths: 'O' an open power chord ringing until the next hit, 'm' a
// palm-muted chug, 'A'/'a' the same on the section's accent note instead of the chord's
// root, 'D' a smothered drone held to the bar's end, '.' rest (or ring on).
const RIFFS = {
  1: ['D...............'],
  2: ['O...m.m.m.m.m.m.', 'O.m.m.m.O.m.m.m.', 'O.m.mmA.O.m.mmA.', 'O..mm.m.A..mm.m.'],
  3: ['O.mmm.mmA.mmm.mm', 'mmmmmmmmAmmmmmmm', 'O.mmO.mmA.mmA.mm', 'O.m.mmm.A.m.mmmA'],
  4: ['Ommmmmmmmmmmmmmm', 'OmmmmmmmAmmmmmmm', 'mmmmAmmmmmmmAmma'],
  guardian: ['OmmAmmOmmammOmAm', 'mmmmAmmmmmmmAmAm', 'OmOmAmAmOmOmamam', 'Ommmmmammmmmamaa', 'O.mmA.mmO.mmAmAm'],
};
// The accent note, in semitones from the chord's root: flat second, tritone, minor third, flat seventh.
const ACCENTS = [1, 6, 3, -2];
// Bar lengths against a guardian, in sixteenths: mostly whole, sometimes cut short.
const GUARDIAN_METERS = [16, 16, 16, 14, 12, 15];
// ...and against a guardian, any of these, picked afresh every bar.
const CHAOS_ACCENTS = [1, 6, 3, -2, 2, 5, -1, 11];

// Drums: 'x' a full hit, 'o' a soft one, '.' a rest; a kick of 'riff' locks to the guitars.
const DRUMS = {
  1: [
    { kick: 'x.......x.......', tom: '....x.......x...' },
    { kick: 'x.........x.....', tom: '....x..o....x.oo' },
  ],
  2: [
    { kick: 'x.....x.x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
    { kick: 'x...x.x.x...x.x.', snare: '....x.......x...', hat: 'x.o.x.o.x.o.x.o.' },
    { kick: 'riff', snare: '....x.......x...', ride: 'x.x.x.x.x.x.x.x.' },
  ],
  3: [
    { kick: 'x.xx..xxx.xx..xx', snare: '....x.......x...', ride: 'x.x.x.x.x.x.x.x.' }, // gallop
    { kick: 'oooooooooooooooo', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' }, // double kick
    { kick: 'riff', snare: '....x.......x...', ride: 'x.x.x.x.x.x.x.x.' },
  ],
  4: [
    { kick: 'xxxxxxxxxxxxxxxx', snare: '....x.......x...', crash: 'x.......x.......' },
    { kick: 'x.x.x.x.x.x.x.x.', snare: '.x.x.x.x.x.x.x.x', ride: 'x.x.x.x.x.x.x.x.' }, // blast beat
  ],
  guardian: [ // picked afresh every bar
    { kick: 'x.x.x.x.x.x.x.x.', snare: '.x.x.x.x.x.x.x.x', china: 'x...x...x...x...' }, // blast beat
    { kick: 'xxxxxxxxxxxxxxxx', snare: '....x.......x...', china: 'x.......x...x...' },
    { kick: 'riff', snare: '..x...x...x...x.', china: 'x...x...x...x...' },
    { kick: 'xxxxxxxxxxxxxxxx', snare: '..x..x..x..x..x.', crash: 'x.......x.......' },
  ],
};

const TONE = [500, 1500, 4500, 7000, 8500]; // by level: the whole mix's lowpass, Hz
const PARRY_STEPS = [0, 2, 4, 5, 7]; // a parry streak climbs the scale

const parsed = new Map();
const hits = (pattern) => {
  if (!pattern || pattern === 'riff') return null;
  if (!parsed.has(pattern)) parsed.set(pattern, [...pattern].map((c) => (c === 'x' ? 1 : c === 'o' ? 0.5 : 0)));
  return parsed.get(pattern);
};

// Offsets (in scale steps from the chord's root) that land on the chord: root, third, fifth.
const isChordTone = (off) => [0, 2, 4].includes(mod(off, 7));
const nearestChordTone = (off) => (isChordTone(off) ? off : isChordTone(off - 1) ? off - 1 : off + 1);

// One bar of lead: notes as { step, len, off }, `off` in scale steps from the chord's root
// so the same line fits any chord. Long notes, mostly stepwise, strong beats on chord tones.
function makeMotif() {
  const notes = [];
  let off = pick([0, 2, 4]);
  for (let s = 0; s < STEPS;) {
    const strong = s % 4 === 0;
    if (s === 0 || Math.random() < (strong ? 0.5 : 0.15)) {
      const len = Math.min(pick([2, 3, 4, 4, 6, 8]), STEPS - s);
      off = Math.max(-2, Math.min(5, off + pick([-1, -1, 1, 1, 0, 2, -2])));
      if (strong) off = nearestChordTone(off);
      notes.push({ step: s, len, off });
      s += len;
    } else s++;
  }
  return notes;
}

// The line again, but settling: its last note lands on the root and holds to the bar's end.
function resolve(motif) {
  const notes = motif.map((n) => ({ ...n }));
  const last = notes[notes.length - 1];
  last.off = 0;
  last.len = STEPS - last.step;
  return notes;
}

// ── the player ─────────────────────────────────────────────────────
export class FightMusic {
  constructor() {
    this.ctx = null;
    this.mode = 'idle'; // 'idle' | 'playing' (the scheduler is running)
    this.state = null; // the latest fight state from update()
    this.quietSince = null; // audio time the fight went quiet
    this.ending = false; // finish on one last chord at the next bar
    this.timer = null;
    this.paused = false;
  }

  // ── node graph ───────────────────────────────────────────────────
  // dry → tone (opens with the level) → muffle (closes while paused) → out → the music bus (sfx.js).
  // Each guitar plays into its own amp (drive, waveshaper, speaker cabinet) on the way to
  // dry; a room reverb and a slap echo (lead only) feed `tone` too.
  build({ ctx, bus }) {
    this.ctx = ctx;
    const c = ctx;
    this.out = c.createGain();
    this.out.gain.value = MUSIC.volume;
    this.muffle = c.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    this.tone = c.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = TONE[1];
    this.tone.connect(this.muffle).connect(this.out).connect(bus);
    this.dry = c.createGain();
    this.dry.connect(this.tone);

    this.verb = c.createConvolver();
    this.verb.buffer = this.impulse(1.8);
    const verbOut = c.createGain();
    verbOut.gain.value = 0.25;
    this.verb.connect(verbOut).connect(this.tone);

    this.echo = c.createDelay(2);
    const fb = c.createGain(), echoOut = c.createGain();
    fb.gain.value = 0.3;
    echoOut.gain.value = 0.5;
    this.echo.connect(fb).connect(this.echo);
    this.echo.connect(echoOut).connect(this.tone);

    this.ampL = this.amp({ drive: 10, level: 0.08, pan: -0.75 });
    this.ampR = this.amp({ drive: 10, level: 0.08, pan: 0.75 });
    this.ampLead = this.amp({ drive: 7, level: 0.07, pan: 0, cut: 2600, verb: 0.35, echo: 0.25 });

    this.noiseBuffer = c.createBuffer(1, c.sampleRate * 3, c.sampleRate); // longer than any one hit
    const d = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  // A guitar amp: input → drive → hard clipping → cabinet (tightened lows, scooped mids,
  // rolled-off fizz) → panned into the mix. → its input node.
  amp({ drive, level, pan, cut = 3400, verb = 0.12, echo = 0 }) {
    const c = this.ctx;
    const input = c.createGain();
    input.gain.value = drive;
    const tight = c.createBiquadFilter();
    tight.type = 'highpass';
    tight.frequency.value = 100;
    const shaper = c.createWaveShaper();
    shaper.curve = this.distortion();
    shaper.oversample = '4x';
    const scoop = c.createBiquadFilter();
    scoop.type = 'peaking';
    scoop.frequency.value = 500;
    scoop.Q.value = 0.9;
    scoop.gain.value = -6;
    const cab = c.createBiquadFilter();
    cab.type = 'lowpass';
    cab.frequency.value = cut;
    cab.Q.value = 0.8;
    const cab2 = c.createBiquadFilter();
    cab2.type = 'lowpass';
    cab2.frequency.value = cut * 1.6;
    const out = c.createGain();
    out.gain.value = level;
    const panner = c.createStereoPanner();
    panner.pan.value = pan;
    input.connect(tight).connect(shaper).connect(scoop).connect(cab).connect(cab2).connect(out).connect(panner).connect(this.dry);
    if (verb) { const s = c.createGain(); s.gain.value = verb; panner.connect(s).connect(this.verb); }
    if (echo) { const s = c.createGain(); s.gain.value = echo; panner.connect(s).connect(this.echo); }
    return input;
  }

  distortion() {
    if (this.curve) return this.curve;
    this.curve = new Float32Array(2048);
    for (let i = 0; i < this.curve.length; i++) this.curve[i] = Math.tanh(4 * ((i / (this.curve.length - 1)) * 2 - 1));
    return this.curve;
  }

  // A small, dark room: noise decaying over `seconds`.
  impulse(seconds) {
    const c = this.ctx, len = Math.floor(c.sampleRate * seconds), buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        lp += 0.35 * ((Math.random() * 2 - 1) - lp); // darkened noise
        d[i] = lp * (1 - i / len) ** 3;
      }
    }
    return buf;
  }

  // ── voices ───────────────────────────────────────────────────────
  // Rises over `attack`, holds until `hold`, then decays to silence at `dur`. Sent dry to
  // `dest`, and by `verb` to the reverb; disconnects once `src` ends.
  envelope(src, t, { dur, vol, attack = 0.004, hold = 0, dest = this.dry, verb = 0, pan = 0 }) {
    const c = this.ctx, g = c.createGain();
    g.gain.setValueAtTime(SILENT, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    if (hold > attack) g.gain.setValueAtTime(vol, t + hold);
    g.gain.exponentialRampToValueAtTime(SILENT, t + dur);
    let out = g;
    if (pan) {
      out = c.createStereoPanner();
      out.pan.value = pan;
      g.connect(out);
    }
    out.connect(dest);
    if (verb) { const s = c.createGain(); s.gain.value = verb; out.connect(s).connect(this.verb); }
    src.onended = () => g.disconnect();
    return g;
  }

  // A lowpass between a source and its envelope, sweeping `cut` → `cutTo` over `dur`.
  lowpass(t, dur, cut, cutTo = cut, q = 0.7) {
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(cut, t);
    if (cutTo !== cut) f.frequency.exponentialRampToValueAtTime(cutTo, t + dur);
    return f;
  }

  // Oscillator gliding from `freq` to `to` over `glide`. → the oscillator.
  osc(t, { type = 'sine', freq, to = freq, glide, detune = 0, cut, cutTo, q, ...env }) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.detune.value = detune;
    o.frequency.setValueAtTime(freq, t);
    if (to !== freq) o.frequency.exponentialRampToValueAtTime(to, t + (glide ?? env.dur));
    const g = this.envelope(o, t, env);
    if (cut) o.connect(this.lowpass(t, env.dur, cut, cutTo, q)).connect(g);
    else o.connect(g);
    o.start(t);
    o.stop(t + env.dur + 0.02);
    return o;
  }

  noise(t, { filter = 'highpass', freq, to = freq, q = 0.7, ...env }) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (to !== freq) f.frequency.exponentialRampToValueAtTime(to, t + env.dur);
    src.connect(f).connect(this.envelope(src, t, env));
    src.start(t, Math.random() * Math.max(0, this.noiseBuffer.duration - env.dur - 0.05));
    src.stop(t + env.dur + 0.02);
  }

  // ── instruments ──────────────────────────────────────────────────
  kick(t, v = 1) {
    this.osc(t, { freq: 130, to: 48, glide: 0.06, dur: 0.3, vol: 0.6 * v, attack: 0.001 });
    this.noise(t, { filter: 'bandpass', freq: 3000, q: 1.5, dur: 0.015, vol: 0.18 * v, attack: 0.001 }); // the beater
  }

  snare(t, v = 1) {
    this.noise(t, { filter: 'bandpass', freq: 1600, q: 0.6, dur: 0.24, vol: 0.4 * v, verb: 0.4, attack: 0.001 });
    this.osc(t, { type: 'triangle', freq: 190, to: 140, dur: 0.14, vol: 0.28 * v });
  }

  hat(t, v = 1) {
    this.noise(t, { freq: 6500, dur: 0.04, vol: 0.035 * v, pan: 0.2 });
  }

  ride(t, v = 1) {
    this.noise(t, { filter: 'bandpass', freq: 3600, q: 1.2, dur: 0.28, vol: 0.04 * v, pan: -0.2 });
  }

  crash(t, v = 1, dur = 1.8) {
    this.noise(t, { filter: 'bandpass', freq: 4200, to: 2400, q: 0.4, dur, vol: 0.08 * v, attack: 0.002, verb: 0.4 });
  }

  china(t, v = 1) {
    this.noise(t, { filter: 'bandpass', freq: 2600, q: 1.6, dur: 0.7, vol: 0.12 * v, attack: 0.001, verb: 0.3 });
  }

  tom(t, freq, v = 1) {
    this.osc(t, { freq, to: freq * 0.65, dur: 0.45, vol: 0.45 * v, verb: 0.35 });
    this.noise(t, { filter: 'bandpass', freq: freq * 3, dur: 0.05, vol: 0.1 * v });
  }

  // Both rhythm guitars, a hair apart, playing the power chord on `root` (MIDI): 'open'
  // rings for `dur`, 'mute' is a short, choked chug, 'drone' a smothered swell.
  guitar(t, root, dur, kind = 'open', v = 1) {
    const notes = kind === 'mute' ? [root, root + 7] : [root, root + 7, root + 12];
    const mute = kind === 'mute', drone = kind === 'drone';
    const len = mute ? Math.min(dur, 0.11) : dur;
    for (const [amp, at, detune] of [[this.ampL, 0, -7], [this.ampR, 0.006 + Math.random() * 0.006, 7]]) {
      for (const m of notes) {
        this.osc(t + at, {
          type: 'sawtooth', freq: hz(m), detune, dest: amp,
          cut: drone ? 320 : mute ? 650 : 2600, cutTo: drone ? 260 : mute ? 380 : 1400,
          dur: len + (mute ? 0.04 : 0.15), hold: len * (mute ? 0.5 : 0.85), attack: drone ? 0.4 : 0.003,
          vol: (drone ? 0.18 : 0.3) * v,
        });
      }
    }
  }

  bass(t, midi, dur, v = 1) {
    const f = hz(midi), env = { dur: dur + 0.05, hold: dur * 0.8, attack: 0.003 };
    this.osc(t, { type: 'sawtooth', freq: f, cut: 900, cutTo: 350, q: 1.5, vol: 0.15 * v, ...env });
    this.osc(t, { freq: f, vol: 0.09 * v, ...env });
  }

  // The lead guitar: one long, crying note with vibrato.
  lead(t, midi, dur) {
    const f = hz(midi);
    for (const detune of [-5, 5]) {
      const o = this.osc(t, { type: 'sawtooth', freq: f, detune, dest: this.ampLead, cut: 1800, q: 1.2, dur: dur + 0.12, hold: dur, attack: 0.02, vol: 0.3 });
      if (dur < 0.2) continue;
      const lfo = this.ctx.createOscillator(), depth = this.ctx.createGain(); // vibrato, once the note settles
      lfo.frequency.value = 5.2;
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(f * 0.012, t + Math.min(0.35, dur));
      lfo.connect(depth).connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.15);
    }
  }

  // Horror strings: a cluster (an octave, a minor ninth and a tritone above `root`) sawed
  // in thirty-second-note tremolo, creeping up three semitones over `dur`.
  strings(t, root, dur) {
    const c = this.ctx, bow = c.createGain(), trem = c.createOscillator(), depth = c.createGain(), body = c.createBiquadFilter();
    bow.gain.value = 0.55;
    trem.type = 'square';
    trem.frequency.value = 2 / this.stepDur;
    depth.gain.value = 0.45;
    trem.connect(depth).connect(bow.gain);
    body.type = 'bandpass';
    body.frequency.value = 900;
    body.Q.value = 0.6;
    bow.connect(body).connect(this.dry);
    for (const semi of [12, 13, 18]) {
      for (const detune of [-10, 10]) {
        const f = hz(root + semi);
        this.osc(t, { type: 'sawtooth', freq: f, to: f * 2 ** (3 / 12), glide: dur, detune, dest: bow, dur, attack: 0.3, hold: dur * 0.9, vol: 0.05, verb: 0.25 });
      }
    }
    trem.start(t);
    trem.stop(t + dur + 0.05);
    trem.onended = () => bow.disconnect();
  }

  // A brass blast: a low, dissonant stack swelling open and closing again.
  braam(t, root, dur) {
    const c = this.ctx, horn = c.createBiquadFilter();
    horn.type = 'lowpass';
    horn.Q.value = 2;
    horn.frequency.setValueAtTime(150, t);
    horn.frequency.exponentialRampToValueAtTime(1300, t + dur * 0.3);
    horn.frequency.exponentialRampToValueAtTime(180, t + dur);
    horn.connect(this.dry);
    const send = c.createGain();
    send.gain.value = 0.5;
    horn.connect(send).connect(this.verb);
    for (const semi of [0, 12, 18]) {
      for (const detune of [-12, 12]) {
        this.osc(t, { type: 'sawtooth', freq: hz(root + semi), detune, dest: horn, dur, attack: 0.08, hold: dur * 0.5, vol: 0.07 });
      }
    }
    setTimeout(() => horn.disconnect(), (t - c.currentTime + dur + 0.5) * 1000);
  }

  // ── harmony ──────────────────────────────────────────────────────
  // MIDI note `deg` scale steps above `base` in the current mood.
  note(base, deg) {
    return base + 12 * Math.floor(deg / 7) + this.mood.scale[mod(deg, 7)];
  }

  // The guitars' root for the chord on scale degree `deg`, kept low.
  rootOf(deg) {
    const m = this.note(this.mood.tonic, deg);
    return m - this.mood.tonic > 6 && m - 12 >= LOWEST ? m - 12 : m;
  }

  // ── fight state ──────────────────────────────────────────────────
  // Fed every frame. `state`: { enemies, guardian, exalted, danger, mood, floor }, or null
  // when there's no fight to be had (player dead, warping, the guardian intro). The world
  // only counts enemies while blows are being traded.
  update(state) {
    if (!this.ctx) {
      const bus = audioBus();
      if (!bus) return;
      this.build(bus);
    }
    if (!state) {
      if (this.mode === 'playing') this.cut(MUSIC.cutFade);
      return;
    }
    this.state = state;
    const now = this.ctx.currentTime;
    if (state.enemies > 0 || state.guardian) {
      this.quietSince = null;
      this.ending = false;
      if (this.mode === 'idle') this.begin();
    } else if (this.mode === 'playing') {
      this.quietSince ??= now;
      if (now - this.quietSince >= MUSIC.linger) this.ending = true;
    }
  }

  begin() {
    const c = this.ctx, s = this.state, now = c.currentTime;
    this.mood = MOODS[mod(s.mood, MOODS.length)];
    this.bpm = this.mood.bpm + Math.min(MUSIC.maxTempoGain, (s.floor - 1) * MUSIC.tempoPerFloor);
    this.setTempo(this.bpm);
    this.progression = pick(this.mood.progressions);
    this.motifs = null;
    this.step = 0; // sixteenths since the start
    this.pos = 0; // ...and within the bar
    this.bar = 0;
    this.barLen = STEPS;
    this.level = 0;
    this.lowerBars = 0;
    this.barsIn = 0;
    this.groove = null;
    this.quietSince = null;
    this.ending = false;
    this.accented = new Map();
    this.nextStepTime = now + 0.06;
    const g = this.out.gain; // fading in
    g.cancelScheduledValues(now);
    g.setValueAtTime(0, now);
    g.linearRampToValueAtTime(MUSIC.volume, now + MUSIC.fadeIn);
    this.mode = 'playing';
    this.timer = setInterval(() => this.schedule(), TICK_MS);
    this.schedule();
  }

  setTempo(bpm) {
    this.stepDur = 60 / bpm / 4;
    this.echo.delayTime.setValueAtTime(this.stepDur * 3, this.ctx.currentTime); // dotted eighth
  }

  // Stops at once, fading out under a closing filter (death, taking the exit).
  cut(fade) {
    this.halt();
    const now = this.ctx.currentTime, g = this.out.gain, f = this.tone.frequency;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + fade);
    f.cancelScheduledValues(now);
    f.setTargetAtTime(200, now, fade / 3);
  }

  halt() {
    clearInterval(this.timer);
    this.timer = null;
    this.mode = 'idle';
  }

  // Paused: the music carries on, muffled, as if through the wall.
  setPaused(paused) {
    if (!this.ctx || paused === this.paused) return;
    this.paused = paused;
    this.muffle.frequency.setTargetAtTime(paused ? 380 : 20000, this.ctx.currentTime, 0.08);
  }

  destroy() {
    if (!this.ctx) return;
    if (this.mode === 'playing') this.cut(0.3);
    const now = this.ctx.currentTime;
    this.out.gain.setTargetAtTime(0, now + 0.3, 0.1);
    setTimeout(() => this.out.disconnect(), 4000); // past the reverb's tail
  }

  // ── sequencer ────────────────────────────────────────────────────
  schedule() {
    const now = this.ctx.currentTime;
    if (this.nextStepTime < now - 0.2) this.nextStepTime = now + 0.05; // the tab stalled: skip ahead rather than cram
    while (this.mode === 'playing' && this.nextStepTime < now + LOOKAHEAD) {
      this.playStep(this.pos, this.bar, this.nextStepTime);
      this.step++;
      this.nextStepTime += this.stepDur;
      if (++this.pos >= this.barLen) { this.pos = 0; this.bar++; }
    }
  }

  // Where the music goes at the top of each bar.
  targetLevel() {
    const s = this.state;
    if (s.exalted) return 4;
    if (s.guardian || s.enemies >= MUSIC.crowd || s.danger) return 3;
    if (s.enemies >= 2 || this.barsIn >= 2) return 2;
    return 1;
  }

  startBar(bar, t) {
    const inSection = bar % SECTION;
    if (this.ending) { this.finish(t); return; }

    // Up at once; down only once it's held lower for two bars.
    const target = this.targetLevel(), prev = this.level;
    if (target > this.level || prev === 0) { this.level = target; this.lowerBars = 0; }
    else if (target < this.level && ++this.lowerBars >= 2) { this.level = target; this.lowerBars = 0; }
    else if (target >= this.level) this.lowerBars = 0;
    const L = this.level, heavy = (this.heavy = this.state.guardian);
    const groove = `${L}${heavy}`;
    this.setTempo(heavy ? this.bpm * MUSIC.guardianTempo : this.bpm); // from this bar on

    if (inSection === 0 && bar > 0) {
      if (Math.random() < 0.35) this.progression = pick(this.mood.progressions);
      if (Math.random() < 0.5) this.motifs = null;
    }
    if (heavy || inSection === 0 || groove !== this.groove) this.writeParts(L, heavy);
    if (L >= 3 && !this.motifs) this.writeMotifs();
    this.groove = groove;

    this.chordDeg = this.progression[bar % PHRASE];
    this.barLen = heavy ? pick(GUARDIAN_METERS) : STEPS;
    this.fill = heavy ? bar % 2 === 1 && Math.random() < 0.6 : L >= 2 && (inSection === SECTION - 1 || (L >= 3 && inSection === 3 && Math.random() < 0.4));
    this.tone.frequency.cancelScheduledValues(t);
    this.tone.frequency.setTargetAtTime(TONE[L], t, 0.4);
    if ((L > prev && prev > 0) || (bar > 0 && inSection === 0 && L >= 2)) this.crash(t);
    if (heavy) {
      const root = this.rootOf(this.chordDeg), barDur = this.barLen * this.stepDur;
      if (bar % 2 === 0) this.strings(t, root, barDur * 2);
      if (bar % 4 === 0) this.braam(t, root - 12 < LOWEST ? root : root - 12, barDur * 1.5);
    }
    this.barsIn++;
  }

  // Against a guardian, every bar: chugs turn into accents at random too.
  writeParts(L, heavy) {
    const key = heavy ? 'guardian' : L;
    this.drums = pick(DRUMS[key]);
    this.riff = pick(RIFFS[key]);
    this.accentSemi = pick(heavy ? CHAOS_ACCENTS : ACCENTS);
    if (heavy) this.riff = [...this.riff].map((c) => (c === 'm' && Math.random() < 0.15 ? 'a' : c)).join('');
  }

  // A two-bar call and answer, played A B A B' (B' settling on the root).
  writeMotifs() {
    const a = makeMotif(), b = makeMotif();
    this.motifs = [a, b, Math.random() < 0.5 ? a : makeMotif(), resolve(b)];
  }

  playStep(s, bar, t) {
    if (s === 0) this.startBar(bar, t);
    if (this.mode !== 'playing') return; // finished on this bar
    const L = this.level, d = this.drums, dur = this.stepDur;
    const root = this.rootOf(this.chordDeg);

    // Rhythm guitars and the bass doubling them an octave down.
    const token = this.riff[s];
    let riffHit = 0;
    if (token !== '.') {
      let ring = 1;
      while (s + ring < this.barLen && this.riff[s + ring] === '.') ring++;
      const accent = token === 'A' || token === 'a', mute = token === 'm' || token === 'a';
      const r = accent ? root + this.accentSemi : root;
      if (token === 'D') this.guitar(t, r, ring * dur, 'drone');
      else this.guitar(t, r, ring * dur, mute ? 'mute' : 'open', mute ? 0.85 : 1);
      this.bass(t, r - 12, (mute ? 1 : ring) * dur * 0.9);
      riffHit = mute ? 0.8 : 1;
    }

    // Drums, with a roll into the next section.
    const at = (p) => hits(p)?.[s] ?? 0;
    const roll = s - (this.barLen - 4), fillHere = this.fill && roll >= 0; // the bar's last four sixteenths
    const kick = d.kick === 'riff' ? riffHit : at(d.kick);
    if (kick && !fillHere) this.kick(t, kick);
    if (fillHere) {
      if (this.heavy) this.tom(t, [110, 92, 78, 65][roll], 0.8 + 0.1 * roll);
      else { this.snare(t, 0.4 + 0.2 * roll); if (roll % 2 === 0) this.tom(t, roll === 0 ? 100 : 75, 0.6); }
    } else {
      if (at(d.snare)) this.snare(t, at(d.snare));
      if (at(d.tom)) this.tom(t, s % 8 === 4 ? 70 : 85, at(d.tom));
    }
    if (at(d.hat)) this.hat(t, at(d.hat));
    if (at(d.ride)) this.ride(t, at(d.ride));
    if (at(d.crash)) this.crash(t, 0.6, 0.8);
    if (at(d.china)) this.china(t, at(d.china));

    // Lead: low and mournful, shaped to the current chord; harmonised a third up while Exalted.
    if (L >= 3 && !this.heavy && this.motifs) {
      for (const n of this.motifs[bar % PHRASE]) {
        if (n.step !== s) continue;
        const base = this.mood.tonic + 12, deg = this.chordDeg >= 4 ? this.chordDeg - 7 : this.chordDeg;
        this.lead(t, this.note(base, deg + n.off), n.len * dur * 0.95);
        if (L >= 4) this.lead(t, this.note(base, deg + n.off + 2), n.len * dur * 0.95);
      }
    }
  }

  // The fight is over: one last chord, left to ring out.
  finish(t) {
    const ring = 3;
    this.kick(t);
    this.crash(t, 1, 3);
    this.guitar(t, this.rootOf(0), ring, 'open');
    this.bass(t, this.rootOf(0) - 12, ring);
    this.tone.frequency.cancelScheduledValues(t);
    this.tone.frequency.setTargetAtTime(700, t + 0.5, 1);
    this.halt();
  }

  // ── accents ──────────────────────────────────────────────────────
  // A kill or a parry, hit back on the next sixteenth (parry) or eighth (kill).
  accent(kind, streak = 1) {
    if (this.mode !== 'playing') return;
    const grid = kind === 'parry' ? 1 : 2, dur = this.stepDur, now = this.ctx.currentTime;
    let step = this.step - Math.floor((this.nextStepTime - now - 0.01) / dur);
    step = Math.ceil(step / grid) * grid;
    if (this.accented.get(kind) === step) return; // one per slot, however many land at once
    this.accented.set(kind, step);
    const t = this.nextStepTime + (step - this.step) * dur;
    const deg = this.chordDeg;

    if (kind === 'parry') { // a stab that climbs with the streak
      this.guitar(t, this.rootOf(deg + PARRY_STEPS[Math.min(streak, PARRY_STEPS.length) - 1]), dur * 2, 'open', 0.9);
      this.snare(t, 0.7);
    } else if (kind === 'kill') { // a choked stab and a tom
      this.guitar(t, this.rootOf(deg), dur * 1.5, 'open', 0.9);
      this.tom(t, 80, 0.8);
    } else if (kind === 'guardianKill') {
      this.kick(t);
      this.china(t, 1.2);
      this.crash(t, 1.2, 2.5);
      this.guitar(t, this.rootOf(deg), dur * 12, 'open', 1.1);
      this.bass(t, this.rootOf(deg) - 12, dur * 12);
    }
  }
}
