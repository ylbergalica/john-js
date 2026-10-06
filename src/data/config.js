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
    minEnemiesPerRoom: 2,
    maxEnemiesPerRoom: 4,
    skipFirstRoom: true,
    skipLastRoom: true,
  },
  chaserCount: 1,
  chasers: [{ type: 'warden', weight: 1 }],
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
  swing: { count: 8, speed: 5, lifetime: 0.2, size: 0.14, coneDeg: 50, color: 0xffffff },
};

export const FX = {
  animFps: 48, // frame animations are generated at twice the original art's 24 fps
  swingAnimSpeed: 1.5, // the swing clip plays faster than the rest so it lands within attackDuration
  parryConnectSize: 3.6,
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

export const PICKUPS = {
  adrenalineOrb: { adrenalineValue: 1, radius: 0.5 * 0.2, magneticRange: 3, magneticSpeed: 10, size: 0.2, color: 0xa60000, scatter: 0.5 },
  chaserCore: { radius: 0.2 * 0.8, magneticRange: 1, magneticSpeed: 10, width: 0.8, height: 1.0 },
  exit: { radius: 0.5, width: 0.89, height: 1, color: 0x606060 },
};

const clearPath = (size, offset) => ({ requireClearAttackPath: true, attackPathCastSize: size, attackPathOriginOffset: offset });

export const ABILITIES = {
  GoblinThrow: {
    type: 'throw', cooldown: 5, range: 15, windUpTime: 1, duration: 0.3, recoveryTime: 0.5,
    damageMultiplier: 1, parryStunTime: 0, ...clearPath({ x: 0.75, y: 0.75 }, 0.3),
    projectileSpeed: 7, projectileLifetime: 4, spawnDistance: 0.75,
    projectileSize: 0.3, projectileColor: 0x878787,
  },
  StrikerDash: {
    type: 'dash', cooldown: 3, range: 5, windUpTime: 0.5, duration: 0.4, recoveryTime: 0.1,
    damageMultiplier: 1, parryStunTime: 1, ...clearPath({ x: 1, y: 1 }, 0.25),
    dashForce: 30, hitboxRadius: 0.55,
  },
  WardenDash: {
    type: 'dash', cooldown: 3, range: 7, windUpTime: 1, duration: 1, recoveryTime: 0.5,
    damageMultiplier: 1, parryStunTime: 1, ...clearPath({ x: 1.25, y: 1.25 }, 0.35),
    dashForce: 700, hitboxRadius: 1.1,
  },
  WardenGroundPound: {
    type: 'groundPound', cooldown: 6, range: 4, windUpTime: 1.5, duration: 0.3, recoveryTime: 1,
    damageMultiplier: 1.3, parryStunTime: 0.6, requireClearAttackPath: false, radius: 3.5,
  },
  WardenPunch: {
    type: 'punch', cooldown: 1.5, range: 4, windUpTime: 0.5, duration: 0.15, recoveryTime: 0.3,
    damageMultiplier: 0.6, parryStunTime: 0.4, ...clearPath({ x: 1, y: 1 }, 0.2),
    hitboxSize: 2.2, forwardOffset: 1.6, stepForce: 550,
  },
  WardenSlam: {
    type: 'slam', cooldown: 3, range: 4, windUpTime: 1, duration: 1, recoveryTime: 1,
    damageMultiplier: 1.2, parryStunTime: 0.5, ...clearPath({ x: 2.5, y: 2 }, 0.2),
    // Slam box: `range` long, `slamWidth` wide, both scaled by the Warden's 2x size.
    slamWidth: 2, sizeScale: 2,
  },
};

// Telegraph colours for active enemy hitboxes.
export const HITBOX_COLORS = {
  dash: { color: 0xff0000, alpha: 0.42 },
  groundPound: { color: 0xff9900, alpha: 0.35 },
  punch: { color: 0xff8000, alpha: 0.33 },
  slam: { color: 0xff0000, alpha: 0.33 },
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
    maxHealth: 5, damage: 1, radius: 0.5 * 0.9, mass: 3, linearDamping: 1,
    knockbackResistance: 0, knockbackMovementPause: 0.12,
    minAdrenalineDrops: 1, maxAdrenalineDrops: 3, isChaser: false, flashDuration: 0.14, particleOffset: 0.08, hitColor: 0x3ddc84, sfxPitch: 1.2,
    visual: { kind: 'sprite', outline: 'goblin_idle', void: 'goblin_idle_void', size: 1.5 * 0.9, sparkleCount: 20 },
    ai: { ...AI_DEFAULTS, aggroRange: 15, orbitRadius: 5, moveSpeed: 3, orbitSpeed: 3, repositionSpeed: 3,
      attacks: [{ ability: 'GoblinThrow', weight: 1 }] },
  },
  striker: {
    maxHealth: 7, damage: 1, radius: 0.5, mass: 3, linearDamping: 1,
    knockbackResistance: 0, knockbackMovementPause: 0.12,
    minAdrenalineDrops: 1, maxAdrenalineDrops: 3, isChaser: false, flashDuration: 0.14, particleOffset: 0.08, hitColor: 0xffad3b, sfxPitch: 1,
    visual: { kind: 'sprite', outline: 'striker_idle', void: 'striker_idle_void', size: 1.5, sparkleCount: 22 },
    ai: { ...AI_DEFAULTS, aggroRange: 12, orbitRadius: 3, moveSpeed: 3, orbitSpeed: 3, repositionSpeed: 3,
      attacks: [{ ability: 'StrikerDash', weight: 1 }] },
  },
  warden: {
    maxHealth: 100, damage: 10, radius: 0.49 * 2, mass: 100, linearDamping: 1,
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

export const GAME = { returnDelay: 3, floorIntroDuration: 3, coinsPerKill: 1 };

export const HUD = {
  pixelsPerHealthPoint: 16,
  healthyColor: 0x25b92c,
  lowHealthColor: 0xe94600,
  pixelsPerAdrenalinePoint: 5,
  cooldownOverlay: 'rgba(89,89,89,0.9)',
  tooltipHoverDelay: 0.65,
};
