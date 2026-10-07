// All gameplay tuning, carried over from the original project's data assets.
// World units: one tile = one unit; the camera shows 20 units vertically.

export const FIXED_DT = 1 / 50; // simulation rate; responsiveness/damping values are tuned for it
export const MAX_STEPS_PER_FRAME = 5;
export const CAMERA = { orthoSize: 10, followDamping: 1 };

export const COLORS = {
  floor: 0x0e0e0e,
  wallStroke: 0xcccccc,
};

export const BASE_LEVEL_CONFIG = {
  width: 200,
  height: 200,
  roomCount: 5,
  roomMinSize: { x: 25, y: 25 },
  roomMaxSize: { x: 30, y: 30 },
  minRoomDistance: 4,
  maxRoomDistance: 6,
  corridorMinWidth: 4,
  corridorMaxWidth: 6,
  extraCorridorChance: 0.9,
  corridorDrift: 0.6,
  corridorObstacleChance: 0.2,
  edgeRoughness: 0.3,
  roomBusyness: 0.5,
  wallSizeRange: { x: 4, y: 7 },
  enemySpawn: {
    enemies: [{ type: 'goblin', weight: 1 }, { type: 'striker', weight: 1 }],
    minEnemiesPerRoom: 3,
    maxEnemiesPerRoom: 6,
    skipFirstRoom: true,
    skipLastRoom: true,
  },
  chaserCount: 1,
  chasers: [{ type: 'warden', weight: 1 }, { type: 'seraph', weight: 1 }],
};

export const WALL_VISUAL = {
  squiggleAmplitude: 0.04,
  squiggleSpeed: 2,
  squiggleFrequency: 1,
  squiggleResolution: 7,
  strokeWidth: 0.1,
};
export const WALL_SPARKLES = {
  sparklesPerTile: 0.16,
  edgePadding: 0.18,
  randomSeed: 12345,
  sizeRange: { x: 0.04, y: 0.12 },
  color: 0xffffff,
  minAlpha: 0.15,
  maxAlpha: 1,
  twinkleSpeedRange: { x: 0.8, y: 2.4 },
  twinkleScaleAmount: 1,
};

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

// Spark bursts; `size` is the spark's length in world units.
export const PARTICLES = {
  enemyHit: { count: 18, speed: 10, lifetime: 0.38, size: 0.42, coneDeg: 28, color: 0xffffff },
  enemyHitTinted: { count: 12, speed: 6, lifetime: 0.45, size: 0.3, coneDeg: 50 }, // colour: the enemy's hitColor
  playerHit: { count: 16, speed: 9, lifetime: 0.38, size: 0.32, coneDeg: 30, color: 0xffffff },
  parryConnect: { count: 24, speed: 12, lifetime: 0.4, size: 0.34, coneDeg: 40, color: 0xffe2a0 },
  parryConnectRing: { count: 16, speed: 5, lifetime: 0.35, size: 0.2, coneDeg: 180, color: 0xffffff },
  parryComboNova: { count: 40, speed: 16, lifetime: 0.55, size: 0.5, coneDeg: 180, color: 0xffb347 }, // max-streak parry only
  swing: { count: 8, speed: 5, lifetime: 0.2, size: 0.14, coneDeg: 50, color: 0xffffff },
};

export const FX = {
  animFps: 48, // frame animations are generated at twice the original art's 24 fps
  swingAnimSpeed: 1.5, // the swing clip plays faster than the rest so it lands within attackDuration
  parryConnectSize: 3.6,
  parryComboGrowth: 0.2, // per streak level: parry flash size and spark count/speed/size grow by this fraction
  parryComboColor: 0xffa030, // the parry sparks warm from parryConnect's colour toward this at max streak
  hitImpactSize: 1.5,
  hitImpactJitter: 0.35, // radians of random twist on the hit streak so repeat hits don't look stamped
};

export const ADRENALINE = {
  baseMaxAdrenaline: 20,
  baseDuration: 10,
  durationIncreasePerUse: 0.5,
  basePointValue: 1,
  toleranceIncreasePerUse: 2,
  damageMultiplier: 10,
  damageResistance: 0.7,
  speedMultiplier: 1.3,
};

// Exalted state visuals (src/player/exaltedView.js, src/render/screenRipple.js).
// Rates are particles per second; sizes and speeds are in world units.
export const EXALTED_FX = {
  tint: 0xff2e2e, // the player's outline, tail, swings and parry warm toward this while Exalted
  fadeIn: 0.15, // seconds for the effects to reach full strength
  fadeOut: 0.5, // seconds for them to die away once the state ends
  warnTime: 1.5, // the last seconds of the state, when the ribbons and outline flicker
  // Shown only on entry: open over openTime, hold for holdTime, dissolve over fadeTime.
  wings: {
    size: 1.4, openTime: 0.3, holdTime: 0.1, fadeTime: 0.3, flapSpeed: 3.2, flapDeg: 7,
    boneRate: 320, membraneRate: 900, strandColor: 0xc8160c, strandAlpha: 0.45,
    flameShare: 0.3, // fraction of bone particles that are flame tongues rather than mist
    bone: { color: 0x9e100c, fade: 0x2a0000, size: [0.5, 0.8], grow: 1.4, life: [0.18, 0.32], alpha: 0.4 },
    membrane: { color: 0x5e0410, fade: 0x160000, size: [0.8, 1.3], grow: 1.5, life: [0.2, 0.34], alpha: 0.3 },
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
  ripple: { duration: 1.1, strength: 0.05, width: 0.09, tint: [0.62, 0.02, 0.03] }, // strength/width: fractions of screen height
};

export const PICKUPS = {
  adrenalineOrb: { adrenalineValue: 1, radius: 0.5 * 0.2, magneticRange: 3, magneticSpeed: 10, size: 0.2, color: 0xa60000, scatter: 0.5 },
  chaserCore: { radius: 0.2 * 0.8, magneticRange: 1, magneticSpeed: 10, width: 0.8, height: 1.0 },
  exit: { radius: 0.5, width: 0.89, height: 1, color: 0x606060 },
};

const clearPath = (size, offset) => ({ requireClearAttackPath: true, attackPathCastSize: size, attackPathOriginOffset: offset });

export const ABILITIES = {
  GoblinThrow: {
    type: 'throw', tell: 'throw', cooldown: 5, range: 15, windUpTime: 1, duration: 0.3, recoveryTime: 0.5,
    damageMultiplier: 1, parryStunTime: 0, ...clearPath({ x: 0.75, y: 0.75 }, 0.3),
    projectileSpeed: 7, projectileLifetime: 4, spawnDistance: 0.75,
    projectileSize: 0.3,
  },
  StrikerDash: {
    type: 'dash', tell: 'charge', cooldown: 3, range: 5, windUpTime: 0.5, duration: 0.4, recoveryTime: 0.1,
    damageMultiplier: 1, parryStunTime: 1, ...clearPath({ x: 1, y: 1 }, 0.25),
    dashForce: 30, hitboxRadius: 0.55,
  },
  WardenDash: {
    type: 'dash', tell: 'charge', cooldown: 3, range: 7, windUpTime: 1, duration: 1, recoveryTime: 0.5,
    damageMultiplier: 1, parryStunTime: 1, ...clearPath({ x: 1.25, y: 1.25 }, 0.35),
    dashForce: 700, hitboxRadius: 1.1,
  },
  WardenGroundPound: {
    type: 'groundPound', tell: 'pound', cooldown: 6, range: 4, windUpTime: 1.5, duration: 0.3, recoveryTime: 1,
    damageMultiplier: 1.3, parryStunTime: 0.6, requireClearAttackPath: false, radius: 3.5,
  },
  WardenPunch: {
    type: 'punch', tell: 'punch', cooldown: 1.5, range: 4, windUpTime: 0.5, duration: 0.15, recoveryTime: 0.3,
    damageMultiplier: 0.6, parryStunTime: 0.4, ...clearPath({ x: 1, y: 1 }, 0.2),
    hitboxSize: 2.2, forwardOffset: 1.6, stepForce: 550,
  },
  WardenSlam: {
    type: 'slam', tell: 'slam', cooldown: 3, range: 4, windUpTime: 1, duration: 1, recoveryTime: 1,
    damageMultiplier: 1.2, parryStunTime: 0.5, ...clearPath({ x: 2.5, y: 2 }, 0.2),
    // Slam box: `range` long, `slamWidth` wide, both scaled by the Warden's 2x size.
    slamWidth: 2, sizeScale: 2,
  },
  // `lockTime`: the enemy turns to follow the player through the wind-up, except for its
  // last `lockTime` seconds, when its aim is fixed.
  SeraphDash: {
    type: 'dash', tell: 'charge', cooldown: 2.5, range: 6, windUpTime: 0.6, duration: 0.85, recoveryTime: 0.4,
    damageMultiplier: 0.8, parryStunTime: 1, ...clearPath({ x: 1.6, y: 1.6 }, 0.4),
    dashForce: 640, hitboxRadius: 1, // carries ~3.7 units, a little short of the Warden's ~4.4
  },
  // Flies at `speed` along its locked aim until it hits a wall (or `duration` runs out).
  SeraphRam: {
    type: 'ram', tell: 'boost', cooldown: 6, range: 12, windUpTime: 1.4, lockTime: 0.15, duration: 2.5, recoveryTime: 0.6,
    damageMultiplier: 1.2, parryStunTime: 1.2, ...clearPath({ x: 1.6, y: 1.6 }, 0.4),
    speed: 17, hitboxRadius: 1, crashRecoveryTime: 1.1, bounceForce: 250, parryKnockback: 300,
    crashShake: { duration: 0.25, strength: 0.35, frequency: 18 },
  },
  // Two homing missiles, one from each engine, launched `launchAngleDeg` off the facing
  // (135 = 45° behind to either side). `launchPoint`: the right engine, in the enemy's
  // local units (+x forward); the left mirrors it. They fly through walls, steering at most
  // `turnRate` rad/s from `homingDelay` until `homingTime` after launch, then straight on
  // until `projectileLifetime`.
  SeraphMissiles: {
    type: 'missiles', tell: 'missiles', cooldown: 5, range: 10, windUpTime: 0.8, duration: 0, recoveryTime: 0.5,
    damageMultiplier: 0.4, parryStunTime: 0.8, ...clearPath({ x: 0.6, y: 0.6 }, 0.3),
    launchPoint: { x: -0.9, y: 0.45 }, launchAngleDeg: 135,
    projectileSpeed: 7, projectileLifetime: 6, projectileSize: 0.35, turnRate: 1.5, homingDelay: 0.2, homingTime: 3,
    passesWalls: true,
  },
  // A beam from the nose (`beamFrom` ahead of centre) to the first wall, held for
  // `duration` while the Seraph stays put. Standing in it hurts every time the player's
  // invincibility runs out.
  SeraphLaser: {
    type: 'laser', tell: 'beam', cooldown: 8, range: 12, windUpTime: 1.8, lockTime: 0.7, duration: 3, recoveryTime: 0.6,
    damageMultiplier: 0.4, parryStunTime: 1.2, ...clearPath({ x: 0.6, y: 0.6 }, 0.5),
    beamFrom: 0.85, beamWidth: 0.7, maxLength: 40, orbSize: 0.55, parryKnockback: 0,
  },
};

// How enemy attacks read (src/enemies/attackView.js). Every enemy and attack shares one
// visual language, so a new enemy only has to say which kind its attacks are:
//   Winding up: the enemy glows `color` and trembles, and shows its attack's tell (below),
//     which tightens to land the moment the attack fires. It never shows where the attack
//     will land.
//   Striking: whatever can hurt burns `color` around a `hot` core (a charging body with
//     afterimages, a struck zone, a projectile in flight). Once it can't hurt, it only fades.
// Sizes are in world units unless noted.
export const ATTACK_FX = {
  color: 0xff2e48,
  hot: 0xffd9cf,
  windup: {
    glowSize: 2.2, glowAlpha: 0.45, // soft glow behind the enemy; size is × body radius
    tintAlpha: 0.8, // how far the enemy's outline warms toward `color`
    pulseSpeed: [5, 16], // glow pulse rate (Hz) at the start and end of the wind-up
    tremble: 0.025, // × body radius
    alpha: 0.85, lineWidth: 0.065, // the tell's lines (width in world units)
  },
  // Each attack has its own tell, named by its ability's `tell`, so the player can see which
  // attack is coming. Shapes, sized in body radii:
  //   ring      closes in from `reach` past the body to `to` all around (attacks all around)
  //   arc       the same, only across the front, `arcDeg` wide and `lines` deep (strikes in front)
  //   chevrons  `count` arrows streaming forward from the front, faster as it nears (charges)
  //   focus     `count` sparks spiralling in from `reach` to `to` around a point `at` ahead
  //             (a beam gathering at the muzzle)
  //   none      nothing (a throw shows its orb instead)
  // Pose: `lean` draws the body back, `squash` flattens it along its facing (a spring
  // loading), `swell` grows it (fractions of body radius / size).
  tells: {
    charge: { shape: 'chevrons', count: 3, spacing: 0.4, size: 0.32, lean: 0.25, squash: 0.14, swell: 0 },
    punch: { shape: 'arc', arcDeg: 70, lines: 1, reach: 0.5, to: 1.15, lean: 0.14, squash: 0, swell: 0 },
    slam: { shape: 'arc', arcDeg: 170, lines: 2, reach: 0.6, to: 1.15, lean: 0.06, squash: 0, swell: 0.08 },
    pound: { shape: 'ring', reach: 0.6, to: 1.1, lean: 0, squash: 0, swell: 0.16 },
    throw: { shape: 'none', lean: 0.06, squash: 0, swell: 0 },
    boost: { shape: 'chevrons', count: 5, spacing: 0.45, size: 0.36, lean: 0.32, squash: 0.2, swell: 0 },
    missiles: { shape: 'none', lean: 0.05, squash: 0, swell: 0.05 },
    beam: { shape: 'focus', count: 6, at: 1, reach: 1.1, to: 0.12, lean: 0.1, squash: 0.06, swell: 0 },
  },
  strike: {
    pop: 0.1, popTime: 0.14, // the body swells by this fraction and settles
    releaseTime: 0.18, releaseReach: 0.9, // the tell bursts outward this many body radii as it fades
  },
  // Charges: while active the body burns and leaves afterimages.
  body: {
    stretch: 0.16, afterimageInterval: 0.03, afterimageLife: 0.22, afterimageAlpha: 0.55,
    sparks: { count: 2, speed: 4, lifetime: 0.25, size: 0.22, coneDeg: 25 },
  },
  // Struck areas. Box zones sweep a bright band from near to far edge as they strike;
  // circles ring outward.
  zone: {
    outlineWidth: 0.06, sweepWidth: 0.3,
    burnAlpha: 0.3, flashAlpha: 0.4, flashTime: 0.12, flicker: 0.07, sweepTime: 0.12, fadeTime: 0.25,
    sparks: { count: 6, speed: 9, lifetime: 0.35, size: 0.4, coneDeg: 30 }, sparkSpacing: 0.7,
  },
  projectile: {
    glowSize: 3.4, glowAlpha: 0.75, pulseSpeed: 9, trailLength: 1.6, trailWidth: 1.3, // × projectile size, except trailLength
    chargeFrom: 0.25, // a throw's orb starts at this fraction of the projectile's size
    fizzle: { count: 10, speed: 5, lifetime: 0.3, size: 0.25, coneDeg: 180 },
  },
  // Beams: widths are × the beam's width. It grows in over growTime with a white-hot flash,
  // flickers while it burns, sprays sparks where it meets the wall, and fades once it stops.
  beam: {
    glowWidth: 2.4, coreWidth: 0.35, growTime: 0.07, flashTime: 0.15, fadeTime: 0.2, flicker: 0.08,
    lockGlow: 1.4, // the muzzle's charge brightens by this once the aim locks
    sparkInterval: 0.05, sparks: { count: 3, speed: 7, lifetime: 0.3, size: 0.3, coneDeg: 70 },
  },
  // A charge crashing into a wall.
  crash: { count: 14, speed: 9, lifetime: 0.4, size: 0.4, coneDeg: 70 },
};

const AI_DEFAULTS = {
  aggroRange: 12, orbitRadius: 4, attackEngageRange: 0,
  moveSpeed: 3, orbitSpeed: 2, repositionSpeed: 2,
  movementResponsiveness: 0.35, preservedExternalVelocityLimit: 6,
  pathRefreshInterval: 0.25, pathGoalSearchRadius: 2, chaserPathGoalSearchRadius: 8,
  decisionDelayRange: { x: 0.8, y: 1.5 }, recoverDuration: 0.5,
  orbitPreference: 0.5, repositionDurationRange: { x: 0.5, y: 1.5 },
  turnSmoothTime: 0.1,
};

export const ENEMY_TYPES = {
  goblin: {
    name: 'Goblin', maxHealth: 5, damage: 1, radius: 0.5 * 0.9, mass: 3, linearDamping: 1,
    knockbackResistance: 0, knockbackMovementPause: 0.12,
    minAdrenalineDrops: 1, maxAdrenalineDrops: 3, isChaser: false, flashDuration: 0.14, particleOffset: 0.08, hitColor: 0x3ddc84, sfxPitch: 1.2,
    visual: { kind: 'sprite', outline: 'goblin_idle', void: 'goblin_idle_void', size: 1.5 * 0.9, sparkleCount: 20 },
    ai: { ...AI_DEFAULTS, aggroRange: 15, orbitRadius: 5, moveSpeed: 3, orbitSpeed: 3, repositionSpeed: 3,
      attacks: [{ ability: 'GoblinThrow', weight: 1 }] },
  },
  striker: {
    name: 'Striker', maxHealth: 7, damage: 1, radius: 0.5, mass: 3, linearDamping: 1,
    knockbackResistance: 0, knockbackMovementPause: 0.12,
    minAdrenalineDrops: 1, maxAdrenalineDrops: 3, isChaser: false, flashDuration: 0.14, particleOffset: 0.08, hitColor: 0xffad3b, sfxPitch: 1,
    visual: { kind: 'sprite', outline: 'striker_idle', void: 'striker_idle_void', size: 1.5, sparkleCount: 22 },
    ai: { ...AI_DEFAULTS, aggroRange: 12, orbitRadius: 3, moveSpeed: 3, orbitSpeed: 3, repositionSpeed: 3,
      attacks: [{ ability: 'StrikerDash', weight: 1 }] },
  },
  warden: {
    name: 'Warden', maxHealth: 200, damage: 5, radius: 0.49 * 2, mass: 100, linearDamping: 1,
    knockbackResistance: 0, knockbackMovementPause: 0.12,
    minAdrenalineDrops: 3, maxAdrenalineDrops: 5, isChaser: true, flashDuration: 0.14, particleOffset: 0.08, hitColor: 0xc8cfff, sfxPitch: 0.55,
    navFootprint: 3, // tiles; the Warden needs 3-wide passages
    visual: { kind: 'hexagon', width: 2, height: 0.890625 * 2, color: 0xffffff },
    ai: { ...AI_DEFAULTS, aggroRange: 12, orbitRadius: 4, attackEngageRange: 3.5, moveSpeed: 1, orbitSpeed: 1, repositionSpeed: 1,
      attacks: [
        { ability: 'WardenDash', weight: 0.25 },
        { ability: 'WardenSlam', weight: 0.2 },
        { ability: 'WardenPunch', weight: 0.35 },
        { ability: 'WardenGroundPound', weight: 0.2 },
      ] },
  },
  // An astral star-fighter: a delta wing with twin engines. Keeps its distance and attacks
  // from range more than the Warden does.
  seraph: {
    name: 'Seraph', maxHealth: 180, damage: 7, radius: 0.9, mass: 100, linearDamping: 1,
    knockbackResistance: 0, knockbackMovementPause: 0.12,
    minAdrenalineDrops: 3, maxAdrenalineDrops: 5, isChaser: true, flashDuration: 0.14, particleOffset: 0.08, hitColor: 0xb9a4ff, sfxPitch: 0.75,
    navFootprint: 3,
    visual: { kind: 'sprite', outline: 'seraph_idle', void: 'seraph_idle_void', size: 2.2, sparkleCount: 30 },
    ai: { ...AI_DEFAULTS, aggroRange: 12, orbitRadius: 6, attackEngageRange: 8, moveSpeed: 2, orbitSpeed: 1.6, repositionSpeed: 1.6,
      turnSmoothTime: 0.2,
      attacks: [
        { ability: 'SeraphDash', weight: 0.3 },
        { ability: 'SeraphRam', weight: 0.25 },
        { ability: 'SeraphMissiles', weight: 0.25 },
        { ability: 'SeraphLaser', weight: 0.2 },
      ] },
  },
};

export const ENEMY_COMBAT = { maxActiveAttackers: 3 };

// Positional sounds: full volume within `fullVolumeRange` units of the camera, silent past
// `silentRange`; panned by horizontal offset, reaching `maxPan` at the screen edge.
export const AUDIO = { fullVolumeRange: 8, silentRange: 24, maxPan: 0.6 };

export const VOID_SPARKLES = {
  sizeRange: { x: 0.025, y: 0.08 },
  color: 0xffeb8c,
  minAlpha: 0.18,
  maxAlpha: 1,
  twinkleSpeedRange: { x: 0.8, y: 2.4 },
  twinkleScaleAmount: 0.45,
};

export const AspectTier = { Gift: 0, Prestige: 1, Mythic: 2 };
export const TIERS = [
  { tier: AspectTier.Gift, name: 'Gift', price: 2500, color: 'var(--gift)' },
  { tier: AspectTier.Prestige, name: 'Prestige', price: 6000, color: 'var(--prestige)' },
  { tier: AspectTier.Mythic, name: 'Mythic', price: 10000, color: 'var(--mythic)' },
];
export const MAX_EQUIPPED_ASPECTS = 3;

// `id` values are save keys; never rename them.
export const ASPECTS = [
  {
    id: 'anchor', displayName: 'Anchor', tier: AspectTier.Gift, icon: 'anchor_icon', activatable: true,
    quote: "Now you see me, now you don't.",
    description: 'Throw an anchor which you can teleport to at any time.',
    throwImpulse: 20, settleSpeedThreshold: 0.2, settleGraceTime: 0.25, retrievalRadius: 0.45,
    teleportWindUpTime: 0.5, teleportRecoverTime: 0.5, windRadius: 5, windDuration: 1, windForce: 20,
    anchorMass: 1, anchorDamping: 5, anchorSize: 0.36 * 2, anchorRadius: 0.18, anchorTint: 0xd95732,
    teleportDotScale: 0.08, windRingWidth: 0.45,
  },
  {
    id: 'assassin', displayName: 'Predator', tier: AspectTier.Gift, icon: 'predator_icon', activatable: false,
    quote: "You miss 100% of the shots you don't take.",
    description: 'Attacks aimed at an enemy blink you into ideal melee range.',
    targetAcquireDistance: 10, aimDotThreshold: 0.5, minimumBlinkDistance: 0.2,
  },
  {
    id: 'crescent', displayName: 'Crescent', tier: AspectTier.Gift, icon: 'crescent_icon', activatable: false,
    quote: 'Every strike leaves a wake.',
    description: 'Connecting a hit sends a crescent slash flying forward.',
    damage: 1, speed: 25, travelDistance: 4.5, spawnForwardOffset: 0.5, enemyKnockbackForce: 9, cooldown: 0,
    hitboxDepth: 0.36178464 * 1.5, hitboxWidth: 1.765077 * 1.5, spriteSize: 2 * 1.5, alpha: 0.2784314,
  },
  {
    id: 'flash', displayName: 'Flash', tier: AspectTier.Gift, icon: 'flash_icon', activatable: true,
    quote: 'F for flash.',
    description: 'Blink a short distance. Every parry or kill reduces the active cooldown.',
    maxBlinkDistance: 6, baseCooldown: 10, cooldownReductionPerTrigger: 1,
  },
  {
    id: 'rift', displayName: 'Rift', tier: AspectTier.Gift, icon: 'rift_icon', activatable: false,
    quote: 'Compact violent solutions.',
    description: 'Connecting a parry unfolds damaging rift-blades on each side.',
    activeTime: 1, damage: 1, enemyKnockbackForce: 5, minDamage: 0.2,
    hitboxDepth: 0.6074743 * 0.8, hitboxWidth: 4.5242996 * 0.8, spriteW: 1 * 0.8, spriteH: 5 * 0.8,
  },
];

export const GAME = { returnDelay: 3, floorIntroDuration: 3 };

// Coins a run earns (banked on death). Achievements will name their own rewards.
export const COINS = { perEnemyKill: 3, perGuardianKill: 10, perFloorCleared: 50 };

export const HUD = {
  pixelsPerHealthPoint: 16,
  healthyColor: 0x25b92c,
  lowHealthColor: 0xe94600,
  pixelsPerAdrenalinePoint: 5,
  cooldownOverlay: 'rgba(89,89,89,0.9)',
  tooltipHoverDelay: 0.65,
};
