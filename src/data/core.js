// Simulation, camera, audio, HUD and run-level settings.
// World units: one tile = one unit; the camera shows 20 units vertically.

export const FIXED_DT = 1 / 50; // simulation rate; responsiveness/damping values are tuned for it
export const MAX_STEPS_PER_FRAME = 5;
export const CAMERA = { orthoSize: 10, followDamping: 1 };

// Positional sounds: full volume within `fullVolumeRange` units of the camera, silent past
// `silentRange`; panned by horizontal offset, reaching `maxPan` at the screen edge.
export const AUDIO = { fullVolumeRange: 8, silentRange: 24, maxPan: 0.6 };

export const GAME = { returnDelay: 3, floorIntroDuration: 3 };

// The first floors of a run open on their guardian, with the world frozen: the camera
// fades in on it and slowly pushes in (`zoom`) for `hold` seconds, then glides to the
// player. The glide takes `panPerUnit` seconds per unit of distance, within min/maxPan.
export const GUARDIAN_INTRO = { floors: 5, fadeIn: 0.5, hold: 2, zoom: 1.15, panPerUnit: 0.03, minPan: 1.1, maxPan: 2 };

// Coins a run earns (banked on death). Achievements will name their own rewards.
export const COINS = { perEnemyKill: 3, perGuardianKill: 10, perFloorCleared: 50 };

export const HUD = {
  pixelsPerHealthPoint: 22,
  healthyColor: 0x25b92c,
  lowHealthColor: 0xe94600,
  pixelsPerAdrenalinePoint: 7,
  cooldownOverlay: 'rgba(89,89,89,0.9)',
  tooltipHoverDelay: 0.25,
};
