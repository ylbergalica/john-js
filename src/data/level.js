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
      { type: 'goblin', weight: { min: 0.8, max: 1 }, fromFloor: 1, peakFloor: 2, toFloor: 5 },
      { type: 'striker', weight: { min: 0.8, max: 1 }, fromFloor: 1, peakFloor: 2, toFloor: 5 },
      { type: 'mauler', weight: { min: 0.5, max: 1 }, fromFloor: 2, peakFloor: 4 },
      { type: 'shade', weight: { min: 0.4, max: 1 }, fromFloor: 4, peakFloor: 6 },
      { type: 'seer', weight: { min: 0.6, max: 1 }, fromFloor: 5, peakFloor: 7 },
    ],
    // Each room gets minEnemiesPerRoom, then enemies are added (never past maxEnemiesPerRoom
    // in a room) until killing them all fills a whole meter even if each drops only its
    // minAdrenalineDrops. Per-type drops are in enemies.js.
    minEnemiesPerRoom: 2,
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
  edgePadding: 0.18,
  randomSeed: 12345,
  sizeRange: { x: 0.04, y: 0.12 },
  color: 0xffffff,
  minAlpha: 0.15,
  maxAlpha: 1,
  twinkleSpeedRange: { x: 0.8, y: 2.4 },
  twinkleScaleAmount: 1,
};

export const VOID_SPARKLES = {
  sizeRange: { x: 0.025, y: 0.08 },
  color: 0xffeb8c,
  minAlpha: 0.18,
  maxAlpha: 1,
  twinkleSpeedRange: { x: 0.8, y: 2.4 },
  twinkleScaleAmount: 0.45,
};
