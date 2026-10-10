// The adrenaline meter, the Exalted state it buys, and how that state looks.

export const ADRENALINE = {
  baseMaxAdrenaline: 20,
  baseDuration: 10,
  durationIncreasePerUse: 0.5,
  basePointValue: 1,
  toleranceIncreasePerUse: 2,
  damageMultiplier: 10,
  damageResistance: 0.5,
  speedMultiplier: 1.3,
  // While Exalted, every time an enemy takes damage (swings, parries, aspects) buys back
  // extendPerHit seconds, and a parry buys extendPerParry more on top, never past the
  // state's full duration, so it lasts as long as the player keeps fighting.
  extendPerHit: 1,
  extendPerParry: 2,
};

// Exalted state visuals (src/player/exaltedView.js, src/render/screenRipple.js).
// Rates are particles per second; sizes and speeds are in world units.
export const EXALTED_FX = {
  tint: 0xff2e2e, // the player's outline, tail, swings and parry warm toward this while Exalted
  fadeIn: 0.15, // seconds for the effects to reach full strength
  fadeOut: 0.5, // seconds for them to die away once the state ends
  warnTime: 1.5, // the last seconds of the state, when the ribbons and outline flicker
  // Fallen-angel wings, shown only on entry: stretch open over openTime (the outer feathers up
  // to `stagger` later), hold for holdTime, then fade over fadeTime, shedding feathers and
  // folding back in by up to `foldBack` of the way (gone before they get there).
  wings: {
    size: 1.4, openTime: 0.5, holdTime: 0.05, fadeTime: 1, flapSpeed: 2.2, flapDeg: 7,
    extend: 1.15, // how far past the open pose they stretch before turning around
    // The hand trailing the stroke by up to `deg` (the rest of the wing by its reach, at most
    // `max` times that), full once the spread moves faster than about `speed` per second;
    // `smooth`: seconds the spread's speed is smoothed over.
    drag: { deg: 34, speed: 0.6, max: 1.6, smooth: 0.06 },
    stagger: 0.06, foldBack: 0.65,
    droop: 0.22, // how far each feather's tip sags toward hanging straight down
    flutter: { deg: 5, speed: 6 }, // each feather trembling on its own
    // Normal blend: the vanes land dark, rims and shafts this. Each ripples like smoke toward
    // its tip by up to `wave` of its length.
    feather: { color: 0xd41e26, alpha: 0.75, wave: 0.08, waveSpeed: 6 },
    // Glowing afterimages of the back `layers` feathers where they were `lags` seconds ago.
    echo: { lags: [0.06, 0.13], alpha: [0.3, 0.15], color: 0xe0202a, layers: 3, widen: 1.2 },
    wisp: { rate: 320, color: 0xb0141c, fade: 0x200000, size: [0.25, 0.45], life: [0.35, 0.6], alpha: 0.45 }, // smoke off the feather tips
    boneRate: 220, glowRate: 600, strandColor: 0xc8160c, strandAlpha: 0.5,
    flameShare: 0.3, // fraction of arm particles that are flame tongues rather than mist
    bone: { color: 0x9e100c, fade: 0x2a0000, size: [0.35, 0.55], grow: 1.4, life: [0.18, 0.32], alpha: 0.4 },
    glow: { color: 0x7a0812, fade: 0x160000, size: [0.4, 0.7], grow: 1.5, life: [0.2, 0.34], alpha: 0.35 }, // mist behind the feathers
    // Loose feathers tumbling off, a trickle while held and a flurry as they dissolve.
    shed: { rate: 60, hold: 0.15, color: 0xd41e26, fade: 0x3a0006, size: [0.2, 0.34], life: [0.9, 1.5], speed: [0.6, 1.6], alpha: 0.9 },
    drift: 0.35, // how much wing smoke streams back while the player moves
  },
  body: { rate: 85, radius: 0.36, speed: [1.4, 2.4], color: 0xc0180c, fade: 0x300000, size: [0.45, 0.7], life: [0.3, 0.55] },
  halo: { size: 2.8, color: 0x900a0a, alpha: 0.5, pulse: 0.2, pulseSpeed: 2.6 }, // soft glow behind the player
  embers: { rate: 22, color: 0xff3020, fade: 0x5a0000, size: [0.08, 0.16], life: [0.7, 1.3], speed: [1, 2.4] },
  haze: { rate: 12, color: 0x4a0208, fade: 0x100000, size: [1.1, 1.6], grow: 1.5, life: [1, 1.5], alpha: 0.6 },
  ribbons: {
    width: 0.24, span: 0.42, points: 24, stream: 0.6, // stream: trail lag per second of age when moving
    orbits: [
      { radius: 0.72, speed: 4.2, phase: 0, color: 0xe01c10 },
      { radius: 0.92, speed: -3.4, phase: 2.1, color: 0xa00c0c },
      { radius: 0.6, speed: 5.1, phase: 4.2, color: 0xc81408 },
    ],
  },
  entry: {
    shake: { duration: 0.5, strength: 0.45, frequency: 16 },
    sparks: { count: 60, speed: 15, lifetime: 0.6, size: 0.55, coneDeg: 180, color: 0xc0140c },
    smokeRing: { count: 30, speed: 7, color: 0x9a0a0a, fade: 0x200000, size: 0.9, grow: 2.2, life: 0.9, alpha: 0.55 },
  },
  exit: { sparks: { count: 24, speed: 7, lifetime: 0.45, size: 0.35, coneDeg: 180, color: 0x8a0a0a } },
  // strength/width: fractions of screen height; the scene the ripple has passed is multiplied by grade.
  ripple: { duration: 1.1, strength: 0.05, width: 0.09, tint: [0.62, 0.02, 0.03], grade: [1, 0.4, 0.4] },
};
