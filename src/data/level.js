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
  // fromFloor to max on toFloor (stays at min without a toFloor).
  enemySpawn: {
    enemies: [
      { type: 'goblin', weight: { min: 1, max: 1.4 }, fromFloor: 1, toFloor: 20 },
      { type: 'striker', weight: { min: 1, max: 1.4 }, fromFloor: 1, toFloor: 30 },
      { type: 'mauler', weight: 0.6, fromFloor: 2 },
      { type: 'shade', weight: 0.7, fromFloor: 3 },
      { type: 'seer', weight: 0.7, fromFloor: 2 },
    ],
    minEnemiesPerRoom: 3,
    maxEnemiesPerRoom: 6,
    skipFirstRoom: true,
    skipLastRoom: true,
    // Extra enemies are added until the floor's expected adrenaline drops reach this
    // multiple of what the meter still needs (slack for orbs missed or enemies skipped).
    adrenalineSurplus: 1.5,
  },
  chaserCount: 1,
  chasers: [{ type: 'warden', weight: 1, fromFloor: 1 }, { type: 'seraph', weight: 1, fromFloor: 1 }],
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
