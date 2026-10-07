// The player: movement, attack, parry, dash, health and body visuals.

export const PLAYER = {
  scale: 0.8,
  radius: 0.5 * 0.8,
  mass: 0.1,
  linearDamping: 1,
  moveSpeed: 5,
  movementResponsiveness: 0.8, // fraction of the velocity error corrected per step
  knockbackResistance: 0,
  inputBufferTime: 0.12,
  attack: {
    attackRange: 0.7,
    attackDamage: 1,
    enemyKnockbackForce: 20,
    playerKnockbackForce: 2,
    attackDuration: 0.1,
    cooldown: 0.7,
    cooldownAfterHit: 0.3,
    // Capsule perpendicular to facing, centred attackRange ahead.
    hitboxDepth: 0.5 * 1.8 * 0.8,
    hitboxWidth: 1 * 1.9 * 0.8,
    visualSize: 2 * 0.8,
  },
  parry: {
    parryDuration: 0.17,
    parryCooldown: 1,
    hitboxForward: 0.7 - 0.4 * 0.8,
    hitboxDepth: 0.5 * 1.85 * 0.8,
    hitboxWidth: 1 * 0.8,
    shakeDuration: 0.08,
    shakeStrength: 0.08,
    shakeFrequency: 45,
    clipLength: 0.125, // the parry animation is stretched to the parry window
    // Successful parries within comboWindow seconds of each other build a streak (capped
    // at comboMax); each level adds bonus damage and grows the shake, sound and sparks.
    comboWindow: 3,
    comboMax: 5,
    comboDamageStep: 1,
    comboShakeStep: 0.45, // extra shake strength per level, as a fraction of the base
    comboPitchStep: 2 ** (1 / 12), // one semitone higher per level
    comboVolumeStep: 0.08,
  },
  dash: { dashSpeed: 20, dashDuration: 0.15, dashCooldown: 1 },
  health: { maxHealth: 10, invincibilityDuration: 1 },
  hitFeedback: { flashDuration: 0.1, blinkInterval: 0.08, shakeDuration: 0.2, shakeStrength: 1, shakeFrequency: 10 },
  blob: {
    radius: 0.5, waveAmplitude: 0.023, waveCount: 9, resolution: 120, waveSpeed: 1,
    breathingCycleDuration: 5, breathingCycleLowerBound: 0, outlineThickness: 0.1,
    outlineColor: 0xffffff, fillColor: 0x000000,
  },
  tail: {
    followerCount: 2, firstFollowerScale: 0.65, scaleStep: 0.15, delayPerFollower: 0.01,
    baseSmoothTime: 0.06, smoothTimeStep: 0.04, firstFollowerAlpha: 1, alphaStep: 0,
    sourceScale: 0.7 * 0.8,
  },
};
