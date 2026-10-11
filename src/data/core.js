// Simulation, camera, audio, HUD and run-level settings.
// World units: one tile = one unit; the camera shows 20 units vertically.

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

// Runs teach the game until the first one ends in death (Tutorial). Times in seconds.
export const TUTORIAL = {
  introPace: 1.8, // the guardian intro's hold and pan take this many times longer
  guardianCaptionAt: 0.6, // into the intro, the caption over the guardian
  runCaption: 5, // the caption once play starts
  cardDelay: 3, // the adrenaline meter stays full this long before the Exalted card
  cardLead: 1, // the card's dark veil, alone, before its first line
  cardStagger: 1.5, // between the card's lines
  cardGuard: 0.3, // after its last line, before a key or click closes it
  epilogueDelay: 0.6, // after the death screen has played out, the last word
  guardian: 'warden', // the first floor's guardian, always
  // Carved into the floor: letter height and line spacing in world units, how far from the
  // player's start the controls go, and how long the essence carving takes to cut.
  carving: { textSize: 0.46, lineHeight: 0.95, controlsDistance: [2.5, 9], essenceAhead: 4, cutTime: 1.2 },
};

// Coins a run earns (banked on death): `base` on floor 1, plus `perFloor` for each floor
// after it. Kills don't grow: deeper floors already hold more enemies, and growing both
// makes a run's coins snowball with depth. Achievements will name their own rewards.
export const COINS = {
  enemyKill: { base: 3, perFloor: 0 },
  guardianKill: { base: 10, perFloor: 2 },
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
