// Things the player picks up: adrenaline orbs, chaser cores and the floor exit.

export const PICKUPS = {
  adrenalineOrb: { adrenalineValue: 1, radius: 0.5 * 0.2, magneticRange: 3, magneticSpeed: 10, size: 0.2, color: 0xa60000, scatter: 0.5 },
  chaserCore: { radius: 0.2 * 0.8, magneticRange: 1, magneticSpeed: 10, width: 0.8, height: 1.0 },
  exit: { radius: 0.5, width: 0.89, height: 1, color: 0x606060 },
};

// The exit once open (every core collected, src/game/pickups.js). It flares open over
// `openTime` (a flash, a ring, sparks and a small shake), then stands bright and solid,
// `grow` times its sealed size and breathing, reaching `radius`: a pulsing halo behind it,
// light rays turning slowly, two hex frames turning opposite ways around it, hex ripples
// sent out every `ripples.every` seconds and motes of light rising off it. Sizes in world
// units (frames and ripples: outline width); spins in radians a second, pulses in Hz.
export const EXIT_FX = {
  color: 0xa9b8ff,
  openTime: 0.6,
  radius: 0.65,
  grow: 1.4, breathe: 0.05, breatheSpeed: 1.8,
  halo: { size: 6, alpha: [0.35, 0.6], pulse: 0.9 },
  star: { size: 0.9, alpha: 0.6, spin: 0.5, pulse: 1.3 },
  rays: { count: 9, length: [2.2, 3.6], width: 0.4, alpha: 0.35, spin: 0.12, flicker: 2.5 },
  frames: [{ size: 2, alpha: 0.75, spin: 0.35 }, { size: 2.7, alpha: 0.35, spin: -0.22 }],
  ripples: { every: 1.5, time: 1.8, from: 1.3, to: 5.5, alpha: 0.45 },
  motes: { rate: 14, spread: 0.8, speed: [0.3, 1], lift: 1.2, size: [0.14, 0.3], life: [1, 1.8] },
  flare: {
    flash: 7, ring: 10, time: 0.8,
    sparks: { count: 40, speed: 14, lifetime: 0.7, size: 0.5, coneDeg: 180 },
    shake: { duration: 0.35, strength: 0.25, frequency: 18 },
  },
};

// Taking the exit (World.updateWarp). The world holds still while the camera glides onto
// the exit over `glide` seconds and closes in to `zoom`, and the player is drawn in,
// spiralling `turns` times into its centre and shrinking away by `absorbAt` of `time`,
// when the exit flares (`flare`). Meanwhile the exit swells (`surge`: × its size) and
// spins up (`spinUp`: × its speed), and the screen washes white from `whiteFrom` of the
// way, fully by `time`, holding `hold` more. The next floor fades in from white over
// `fadeIn` as the camera eases out from `zoomIn`, and the player appears there `appearAt`
// seconds in, or once a guardian intro ends, with a flare of its own (`arrive`), growing
// to full size over `arrive.time`.
export const EXIT_WARP = {
  time: 1.3, glide: 0.5, zoom: 1.6, turns: 1.25, absorbAt: 0.65,
  surge: 0.35, spinUp: 3, whiteFrom: 0.5, hold: 0.15,
  fadeIn: 1, zoomIn: 1.3, appearAt: 0.3,
  flare: {
    flash: 6, ring: 7, time: 0.6,
    sparks: { count: 50, speed: 16, lifetime: 0.6, size: 0.5, coneDeg: 180 },
    shake: { duration: 0.4, strength: 0.3, frequency: 20 },
  },
  arrive: {
    time: 0.4, flash: 3.5, ring: 4,
    sparks: { count: 26, speed: 9, lifetime: 0.45, size: 0.35, coneDeg: 180 },
  },
};

// After the floor's last guardian bursts, a faint trail of stardust shows the way from
// where the player is then to the exit, once, `delay` seconds later (src/game/exitTrail.js).
// The route is an A* path kept off the walls (each step costs up to 1 + `wallBias` more
// the closer it runs to a wall, within `clearance` tiles), smoothed through every
// `smoothStep`-th cell and wound gently side to side (`meander`: up to `amp` units, as
// far as the walls allow less `margin`, over waves `wavelength` units long). It leaves a
// gap of `gap` units at either end. It's a thin haze: puffs of mist every `spacing` units
// (± `jitter` sideways), wide enough to run together, each drifting (`drift` units at
// `driftSpeed` Hz), turning and breathing (`breathe`: fraction of its size) on its own.
// It spreads from the player's end toward the exit at `reveal` units a second, and a
// faint swell flows along it toward the exit.
export const EXIT_TRAIL = {
  delay: 3,
  wallBias: 3, clearance: 4,
  smoothStep: 4,
  meander: { amp: 1, wavelength: [8, 14], margin: 0.8 },
  gap: 1.2,
  spacing: 0.45, jitter: 0.08,
  color: 0xa9b8ff,
  size: [1, 1.5], alpha: [0.07, 0.11],
  drift: 0.12, driftSpeed: [0.15, 0.4], spin: 0.25, breathe: 0.15,
  reveal: 30,
  flow: { speed: 5, wavelength: 12, alpha: 0.06, grow: 0.15 },
};
