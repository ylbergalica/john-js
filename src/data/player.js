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
    comboDamageStep: 1, // flat bonus damage per level
    comboDamageFraction: 0.3, // plus this fraction of the parried attack's base damage per level
    comboShakeStep: 0.45, // extra shake strength per level, as a fraction of the base
    comboPitchStep: 2 ** (1 / 12), // one semitone higher per level
    comboVolumeStep: 0.08,
  },
  dash: { dashSpeed: 20, dashDuration: 0.15, dashCooldown: 1 },
  // Dash visuals (src/player/dashView.js). Colours warm toward EXALTED_FX.tint while Exalted.
  // Sizes are × the body's diameter unless noted; speeds and spacing in world units.
  dashFx: {
    color: 0xc8d2ff, fade: 0x4a55ff, // puffs cool from `color` to `fade` as they die
    stretch: 0.34, squash: 0.2, stretchIn: 0.03, settleTime: 0.22, // the body pulls long along the dash, then wobbles back
    afterimageSpacing: 0.26, afterimageLife: 0.26, afterimageAlpha: 0.75, afterimageShrink: 0.3,
    afterimageColor: 0xffffff, afterimageFade: 0xdde3ff, // nearly white throughout, the faintest cool tinge as they die
    launchRing: { life: 0.3, to: 2.6, flatten: 0.45, alpha: 0.85 }, // bursts behind the launch, flattened along the dash
    launchSparks: { count: 14, speed: 10, lifetime: 0.3, size: 0.32, coneDeg: 28 },
    puffs: { count: 7, speed: 4, spreadDeg: 75, size: 0.45, grow: 2.4, life: 0.42, alpha: 0.35 },
    streakRate: 110, streaks: { count: 1, speed: 3, lifetime: 0.16, size: 0.42, coneDeg: 6 }, // peeling off the body's edges
    brakePuffs: { count: 4, speed: 2.2, spreadDeg: 55, size: 0.35, grow: 2, life: 0.3, alpha: 0.25 },
    ready: { life: 0.32, from: 2, alpha: 0.75 }, // a ring closing in on the body when the dash recharges
    // While Exalted (scaled by how strong the state is): dark red afterimages, the body trails
    // flame tongues and leaves embers along its path, and the launch flares harder.
    exalted: {
      afterimageColor: 0x8c0a0a, afterimageFade: 0x2a0000, afterimageAlpha: 0.9,
      flameRate: 220, flames: { color: 0xe0200c, fade: 0x300000, size: [0.5, 0.85], life: [0.18, 0.3], speed: [3, 5], alpha: 0.9 },
      emberRate: 70, embers: { color: 0xff3020, fade: 0x5a0000, size: [0.08, 0.15], life: [0.5, 0.9], speed: [0.6, 1.8] },
      launchSparks: { count: 22, speed: 14, lifetime: 0.4, size: 0.4, coneDeg: 40, color: 0xff6a30 },
      launchSmoke: { count: 8, speed: 3, spreadDeg: 180, size: 0.6, grow: 2.2, life: 0.5, alpha: 0.45, color: 0x9a0a0a, fade: 0x200000 },
      shake: { duration: 0.12, strength: 0.12, frequency: 30 },
    },
  },
  // floorHeal: fraction of max health restored on each new floor, streamed in once play starts
  // (after any guardian intro): floorHealDelay seconds of astral build-up on the health bar,
  // then filling over floorHealDuration.
  health: { maxHealth: 10, invincibilityDuration: 1, floorHeal: 0.2, floorHealDelay: 0.5, floorHealDuration: 1.4 },
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
