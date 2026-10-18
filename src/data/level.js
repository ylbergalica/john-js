// Level generation and the look of walls and the void.

export const COLORS = {
  floor: 0x0e0e0e,
  wallStroke: 0xcccccc,
};

export const BASE_LEVEL_CONFIG = {
  width: 200,
  height: 200,
  roomCount: 5,
  roomMinSize: { x: 18, y: 18 },
  roomMaxSize: { x: 22, y: 22 },
  minRoomDistance: 3,
  maxRoomDistance: 5,
  corridorMinWidth: 4,
  corridorMaxWidth: 6,
  extraCorridorChance: 0.9,
  corridorDrift: 0.6,
  corridorObstacleChance: 0.2,
  edgeRoughness: 0.3,
  roomBusyness: 0.5,
  wallSizeRange: { x: 4, y: 7 },
  // `fromFloor` / `toFloor`: the first and last floor an enemy (or guardian) type can spawn
  // on (both optional). `weight` is a number, or { min, max } to rise linearly from min on
  // fromFloor to max on `peakFloor` (defaults to fromFloor), then fall back to min on
  // toFloor (stays at max without one).
  enemySpawn: {
    enemies: [
      { type: 'goblin', weight: { min: 0.8, max: 1 }, fromFloor: 1, peakFloor: 3, toFloor: 5 },
      { type: 'striker', weight: { min: 0.8, max: 1 }, fromFloor: 1, peakFloor: 3, toFloor: 5 },
      { type: 'mauler', weight: { min: 0.5, max: 1 }, fromFloor: 3, peakFloor: 4, toFloor: 9 },
      { type: 'shade', weight: { min: 0.3, max: 1 }, fromFloor: 5, peakFloor: 7 },
      { type: 'seer', weight: { min: 0.6, max: 1 }, fromFloor: 6, peakFloor: 7 },
      { type: 'lemur', weight: { min: 0.6, max: 1 }, fromFloor: 8, peakFloor: 9 },
      { type: 'boxer', weight: { min: 0.5, max: 1 }, fromFloor: 10, peakFloor: 12 },
    ],
    // Each room gets minEnemiesPerRoom, then enemies are added (never past maxEnemiesPerRoom
    // in a room) until killing them all fills `meterShare` of a meter even if each drops
    // only its minAdrenalineDrops; the floor's spawners (SPAWNERS) bring the rest. Per-type
    // drops are in enemies.js.
    minEnemiesPerRoom: 1,
    meterShare: 0.75,
    maxEnemiesPerRoom: 6,
    skipFirstRoom: true,
    skipLastRoom: true,
  },
  chaserCount: 1,
  chasers: [
    { type: 'warden', weight: 1, fromFloor: 1 }, 
    { type: 'seraph', weight: 1, fromFloor: 1 }
  ],
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
  // The sky fills in floor by floor: each floor adds this many per tile, up to the max.
  sparklesPerFloor: 0.006,
  maxSparklesPerTile: 0.3,
  edgePadding: 0.18,
  sizeRange: { x: 0.04, y: 0.12 },
  // Each star's colour, picked by weight (the enemySpawn format: deeper floors bring more
  // colour into the sky).
  colors: [
    { color: 0xffffff, weight: 1 },
    { color: 0xb8ccff, weight: { min: 0.08, max: 0.35 }, fromFloor: 1, peakFloor: 8 },
    { color: 0xffe0a0, weight: { min: 0.04, max: 0.25 }, fromFloor: 2, peakFloor: 10 },
    { color: 0xff9a88, weight: { min: 0.02, max: 0.15 }, fromFloor: 4, peakFloor: 12 },
    { color: 0xd4b0ff, weight: { min: 0.02, max: 0.18 }, fromFloor: 6, peakFloor: 14 },
  ],
  minAlpha: 0.15,
  maxAlpha: 1,
  twinkleSpeedRange: { x: 0.8, y: 2.4 },
  twinkleScaleAmount: 1,
};

// Wall stars flaring in a ring that spreads out from a kill or a parry.
export const STAR_PULSE = {
  speed: 24, // tiles per second the ring travels
  width: 1.8, // tiles: the ring's thickness
  swell: 1.4, // stars grow by this fraction of their size as the ring passes
  // How far the ring travels, in tiles, fading as it goes.
  kill: 11,
  guardianKill: 34,
  parry: 6,
  parryPerStreak: 2.5, // added per parry-streak level
};

// Coloured clouds drifting in the space behind the wall stars. Each floor picks one of the
// palettes (never the last floor's), and they grow denser and brighter floor by floor,
// reaching their max on fullFloor.
export const NEBULA = {
  alpha: { min: 0.18, max: 0.45 },
  coverage: { min: 0.25, max: 0.5 }, // share of the sky the clouds fill
  fullFloor: 12,
  scale: 0.045, // noise frequency per tile: lower means bigger clouds
  drift: 0.012, // how fast the clouds roll, in noise units per second
  palettes: [
    [0x2f55e0, 0x9040d8], // blue, violet
    [0x20a0b0, 0x2a50d8], // teal, blue
    [0xd03a78, 0x6030c0], // rose, purple
    [0xe0662a, 0xb02050], // ember, crimson
    [0x2aa070, 0x2070b0], // jade, sea blue
    [0xc09030, 0x983048], // gold, wine
  ],
};

// The ground: brighter in open floor, dimmer against walls, and each room leaning a touch
// toward one of the floor's nebula colours, blending through the corridors between them.
export const FLOOR_LIGHT = {
  edgeLight: 0.65, // × COLORS.floor right against a wall
  centerLight: 1.4, // × COLORS.floor deep in open floor
  poolRadius: 8, // tiles from a wall until centerLight
  tint: { min: 0.3, max: 0.55 }, // how far a room leans toward its colour, floor 1 → NEBULA.fullFloor
  tintSpread: 5, // tiles: how far a room's colour carries past its walls
  pixelsPerTile: 4,
};

export const VOID_SPARKLES = {
  sizeRange: { x: 0.025, y: 0.08 },
  color: 0xffeb8c,
  minAlpha: 0.18,
  maxAlpha: 1,
  twinkleSpeedRange: { x: 0.8, y: 2.4 },
  twinkleScaleAmount: 0.45,
};
