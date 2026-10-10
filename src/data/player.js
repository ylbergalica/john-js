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
    comboDamageFraction: 0.3, // bonus damage per level, as a fraction of the parried attack's base damage
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

// The player's death (src/player/death.js), set off by the killing blow; the camera pushes
// in on the body (to `zoom`) until it bursts.
//   purge: dying with the meter at least `from` full (and not Exalted), it is first wrung out of
//     them: the body convulses and flushes crimson, and gouts of adrenaline jet out of it in
//     quickening spurts, each jolting the body and draining the meter a gulp, until a last
//     wrench tears the rest out all around. Then the collapse.
//   collapse: the body seizes, buckles and blinks white faster and faster, swells a moment
//     and caves in over the last `cave` seconds, then bursts into white shards, light and
//     the stars of its void, a shockwave dimming the world as it passes and throwing
//     enemies back. A few motes of
//     light drift up from the spot after.
//   exalted: dying Exalted, the wings tear open one last time and the fire roars up, jetting
//     out of the body as it swells and heats white-hot (and draining the meter with each
//     jet), then it caves in and explodes into hellfire: crimson rays, a ring of flame, a
//     screen-wide shockwave and a blast that hurts enemies and throws them back. Smoke and embers rise
//     from the spot after.
// The burst and after-effects take DEATH_FX's form (pop/flash/rings/rays sized in body
// radii), with `color` for whatever doesn't name one. Times in seconds, sizes in world
// units; [min, max] picks at random, or gives the value at the start and end of a phase.
export const PLAYER_DEATH = {
  zoom: 1.15,
  kick: { time: 0.22, jolt: 0.1, squash: 0.2 }, // a spurt's convulsion: the body jolts away from it and squashes
  purge: {
    from: 0.7, // fraction of the meter's max
    time: 2.1,
    tremble: [0.01, 0.05], writhe: [0.015, 0.06], flush: 0.9, // writhe: extra wobble of the outline; flush: how crimson it turns
    spurts: [0.42, 0.1], // seconds between spurts
    spurt: {
      sound: 'adrenalineSpurt', grow: 1.8, // the last spurt is `grow` times the first
      sparks: { count: 8, speed: 9, lifetime: 0.45, size: 0.38, coneDeg: 20, color: 0xff2e2e },
      flames: { count: 5, speed: [3, 6], spreadDeg: 22, size: [0.35, 0.6], life: [0.28, 0.52], color: 0xc0180c, fade: 0x300000, alpha: 0.85 },
      mist: { count: 2, speed: [1, 2.5], size: [0.6, 0.9], grow: 2, life: [0.55, 0.95], alpha: 0.4, color: 0x9e100c },
      shake: { duration: 0.16, strength: 0.1, frequency: 26 },
    },
    wrench: { // the last one, all around
      sparks: { count: 30, speed: 12, lifetime: 0.7, size: 0.45, coneDeg: 180, color: 0xff2e2e },
      flames: { count: 18, speed: [4, 8], spreadDeg: 180, size: [0.45, 0.75], life: [0.35, 0.6], color: 0xc0180c, fade: 0x300000, alpha: 0.85 },
      mist: { count: 6, speed: [1.5, 3], size: [0.8, 1.2], grow: 2, life: [0.7, 1.1], alpha: 0.45, color: 0x9e100c },
      shake: { duration: 0.35, strength: 0.25, frequency: 22 },
    },
  },
  collapse: {
    time: 0.95, cave: 0.45, swell: 0.1, shrink: 0.2, // swells by `swell`, then caves to `shrink` of its size
    tremble: [0.015, 0.06], writhe: [0.02, 0.09],
    blink: [3, 14], blinkOn: 0.4, whiteOut: 0.08, // white blinks a second at the start and end; solid white for the last `whiteOut`
    heat: 0,
    color: 0xc8d2ff,
    burst: {
      sound: 'deathBurst',
      pop: { time: 0.55, scale: 2.6 }, // the outline swells away
      flash: { size: 4, grow: 2, time: 0.5, alpha: 1 },
      rings: [
        { delay: 0, time: 0.55, from: 1, to: 6, alpha: 1, color: 0xffffff },
        { delay: 0.1, time: 1.1, from: 1, to: 11, alpha: 0.6 },
      ],
      rays: { count: 8, length: [4, 7], width: [0.3, 0.5], time: [0.5, 0.75] },
      sparks: [
        { count: 40, speed: 14, lifetime: 0.95, size: 0.5, coneDeg: 180, color: 0xffffff },
        { count: 24, speed: 8, lifetime: 1.2, size: 0.3, coneDeg: 180 },
      ],
      stars: { count: 24, speed: [2, 8], size: [0.2, 0.42], life: [1.1, 2], color: 0xffffff },
      mist: { count: 10, speed: [1, 3], size: [1, 1.6], grow: 2.2, life: [1, 1.5], alpha: 0.35 },
      embers: null,
      flames: null,
      shake: { duration: 0.7, strength: 0.4, frequency: 16 },
      ripple: { duration: 1.6, strength: 0.035, width: 0.08, glow: 0.35, grade: [0.55, 0.55, 0.62] },
      // Throws enemies within `radius` straight back, harder the closer they are (up to
      // `speed`, units/s), out of control for `stagger` seconds, as DEATH_FX.guardian.push.
      push: { radius: 6, speed: 13, stagger: 0.3 },
      blast: null,
    },
    after: {
      time: 1.8,
      motes: { rate: 10, speed: [0.4, 1.2], size: [0.12, 0.26], life: [1.1, 1.9], color: 0xffffff, fade: 0xc8d2ff },
    },
  },
  exalted: {
    time: 2.4, cave: 0.32, swell: 0.3, shrink: 0.2,
    tremble: [0.02, 0.1], writhe: [0.02, 0.1],
    blink: [1, 10], blinkOn: 0.25, whiteOut: 0.12,
    heat: 0.85, heatColor: 0xffc890, // the outline heats from crimson toward heatColor
    color: 0xe01c10,
    // The Exalted fire (src/player/exaltedView.js) roars up through the throes: its rates ×
    // (1 + these), the halo's size likewise.
    throes: { flames: 3, embers: 5, haze: 2, halo: 1.2 },
    wings: { shake: { duration: 0.7, strength: 0.4, frequency: 16 } },
    spurts: [0.44, 0.11],
    spurt: {
      sound: 'fireJet', grow: 2,
      sparks: { count: 10, speed: 12, lifetime: 0.5, size: 0.45, coneDeg: 16, color: 0xff6a30 },
      flames: { count: 8, speed: [5, 9], spreadDeg: 16, size: [0.6, 1], life: [0.32, 0.58], color: 0xff3a14, fade: 0x300000, alpha: 0.9 },
      mist: { count: 2, speed: [1.5, 3], size: [0.8, 1.2], grow: 2.2, life: [0.65, 1.05], alpha: 0.45, color: 0x9a0a0a },
      shake: { duration: 0.18, strength: 0.16, frequency: 24 },
    },
    burst: {
      sound: 'exaltedDeathBurst',
      pop: { time: 0.8, scale: 4 },
      flash: { size: 9, grow: 2.6, time: 0.8, alpha: 1 },
      rings: [
        { delay: 0, time: 0.7, from: 1, to: 10, alpha: 1, color: 0xffd0b0 },
        { delay: 0.08, time: 1.25, from: 1, to: 18, alpha: 0.9 },
        { delay: 0.28, time: 1.8, from: 2, to: 28, alpha: 0.6, color: 0x5e0410 },
      ],
      rays: { count: 16, length: [10, 20], width: [0.6, 1.1], time: [0.7, 1.2] },
      sparks: [
        { count: 120, speed: 26, lifetime: 1.3, size: 0.75, coneDeg: 180 },
        { count: 60, speed: 16, lifetime: 1.05, size: 0.5, coneDeg: 180, color: 0xff8a40 },
      ],
      stars: { count: 30, speed: [4, 14], size: [0.25, 0.5], life: [1.1, 2.1], color: 0xff6a40 },
      mist: { count: 36, speed: [3, 9], size: [1.6, 2.6], grow: 2.6, life: [1.6, 2.4], alpha: 0.5 },
      embers: { count: 70, speed: [2, 11], size: [0.18, 0.36], life: [1.8, 3.2] },
      flames: { count: 48, speed: [8, 14], spreadDeg: 180, size: [0.9, 1.5], life: [0.45, 0.8], color: 0xff3a14, fade: 0x300000, alpha: 0.9 },
      shake: { duration: 1.5, strength: 0.9, frequency: 13 },
      ripple: { duration: 2, strength: 0.07, width: 0.11, glow: 0.8, grade: [0.9, 0.25, 0.25] },
      push: { radius: 8, speed: 18, stagger: 0.4 },
      // Deals every enemy within `radius` `damage`, plus `perFloor` × the floor number.
      blast: { radius: 7, damage: 20, perFloor: 1 },
    },
    after: {
      time: 3.2,
      smoke: { rate: 24, speed: [0.3, 1], size: [1, 1.6], grow: 2.2, life: [1.6, 2.4], color: 0x5e0410, fade: 0x100000, alpha: 0.5 },
      embers: { rate: 30, speed: [0.5, 2], size: [0.08, 0.16], life: [1.1, 2], color: 0xff3020, fade: 0x5a0000 },
    },
  },
};
