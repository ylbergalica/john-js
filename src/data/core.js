// Simulation, camera, audio, HUD and run-level settings.
// World units: one tile = one unit; the camera shows 20 units vertically.

// The demo build (`npm run build:demo` / `dev:demo`, mode "demo" reading .env.demo).
// Demo-only changes check this, so the full game's build never has them.
export const DEMO = import.meta.env.VITE_DEMO === 'true';

export const FIXED_DT = 1 / 50; // simulation rate; responsiveness/damping values are tuned for it
export const MAX_STEPS_PER_FRAME = 5;
export const CAMERA = { orthoSize: 10, followDamping: 1 };

// Positional sounds: full volume within `fullVolumeRange` units of the camera, silent past
// `silentRange`; panned by horizontal offset, reaching `maxPan` at the screen edge.
export const AUDIO = { fullVolumeRange: 8, silentRange: 24, maxPan: 0.6 };

// Fight music (src/audio/music.js). It plays only while blows are traded: a hit either
// way, a parry, or an enemy winding up or swinging at the player, the last within
// `blowMemory` seconds. Enemies count while they're out of idle and within their aggro
// range (a guardian within `guardianRange` units). The music ends on the next bar `linger`
// seconds after the fighting stops. It fades in over `fadeIn` seconds and builds up with
// `crowd` enemies, a guardian, or health under `dangerHealth` of max. Each floor plays
// `tempoPerFloor` BPM faster, up to `maxTempoGain`, and a guardian fight `guardianTempo`
// times faster still. `volume` is relative to the sound effects; `cutFade` is how fast it
// dies with the player or into the exit.
export const MUSIC = {
  volume: 0.25,
  fadeIn: 3,
  guardianTempo: 1.2,
  blowMemory: 5,
  guardianRange: 16,
  linger: 2,
  crowd: 4,
  dangerHealth: 0.3,
  tempoPerFloor: 1,
  maxTempoGain: 12,
  cutFade: 1.2,
};

// returnDelay / playgroundRespawnDelay: seconds after the player's death has played out
// (PLAYER_DEATH) until the run summary / the player is back.
export const GAME = { returnDelay: 1, floorIntroDuration: 3, playgroundRespawnDelay: 0.5 };

// The first floors of a run open on their guardian, with the world frozen: the camera
// fades in on it and slowly pushes in (`zoom`) for `hold` seconds, then glides to the
// player. The glide takes `panPerUnit` seconds per unit of distance, within min/maxPan.
export const GUARDIAN_INTRO = { floors: 5, fadeIn: 0.5, hold: 2, zoom: 1.15, panPerUnit: 0.03, minPan: 1.1, maxPan: 2 };

// Runs teach the game until one has shown all of it (Tutorial). Times in seconds.
export const TUTORIAL = {
  introPace: 1.8, // the guardian intro's hold and pan take this many times longer
  guardianCaptionAt: 0.6, // into the intro, the caption over the guardian
  runCaption: 6, // the caption once play starts
  controlsAfter: 0.3, // after the run caption has gone, the controls tip
  tipLinger: { controls: 7, essence: 7 }, // how long each tip stays by the player (game time)
  tipGap: 0.8, // after a tip goes (or is cut short), before the next
  tipMinShown: 5, // the controls tip stays at least this long, even once the essence tip is waiting
  cardDelay: 3, // the adrenaline meter stays full this long before the Exalted card
  cardLead: 1, // the card's dark veil, alone, before its first line
  cardStagger: 1.5, // between the card's lines
  holdGuard: 1.6, // after a hold (the card, the Exalted tip) has fully come in, before a key or click lets it go
  tipHoldLead: 0.5, // a holding tip (parrying, Exalted) coming in
  parryLead: 0.7, // the parry lesson holds the game this long before an attack would reach the player
  parryGuard: 1, // once the player parries, hits connecting until this long after that are parried
  spotRadius: 4, // the parry lesson's light: world units around the line from the player to their attacker
  epilogueDelay: 0.6, // after the death screen has played out, the last word
  guardian: 'warden', // the first floor's guardian, always
  startClearance: 26, // the first floor's foes spawn at least this far from the player's start (well off-screen)
};

// Coins a run earns (banked on death): `base` on floor 1, plus `perFloor` for each floor
// after it. Kills don't grow: deeper floors already hold more enemies, and growing both
// makes a run's coins snowball with depth. Achievements will name their own rewards.
// Breaking a spawner (src/game/spawner.js) is worth `spawnerBroken`.
export const COINS = {
  enemyKill: { base: 3, perFloor: 0 },
  guardianKill: { base: 10, perFloor: 2 },
  spawnerBroken: { base: 10, perFloor: 0 },
  floorCleared: { base: 50, perFloor: 5 },
};

export const HUD = {
  pixelsPerHealthPoint: 22,
  healthyColor: 0x25b92c,
  lowHealthColor: 0xe94600,
  pixelsPerAdrenalinePoint: 7,
  cooldownOverlay: 'rgba(89,89,89,0.9)',
  tooltipHoverDelay: 0.25,
};
