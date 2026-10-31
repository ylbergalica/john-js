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
      { type: 'shade', weight: { min: 0.3, max: 1 }, fromFloor: 5, peakFloor: 7, toFloor: 11 },
      { type: 'seer', weight: { min: 0.6, max: 1 }, fromFloor: 6, peakFloor: 7, toFloor: 9 },
      { type: 'lemur', weight: { min: 0.6, max: 1 }, fromFloor: 8, peakFloor: 10, toFloor: 13 },
      { type: 'boxer', weight: { min: 0.5, max: 1 }, fromFloor: 10, peakFloor: 12, toFloor: 15 },
      { type: 'gunner', weight: { min: 0.5, max: 1 }, fromFloor: 10, peakFloor: 13, toFloor: 15 },
      { type: 'corsair', weight: { min: 0.5, max: 1 }, fromFloor: 12, peakFloor: 15, toFloor: 17 },
      { type: 'weaver', weight: { min: 0.5, max: 1 }, fromFloor: 15, peakFloor: 17, toFloor: 22 },
      { type: 'nova', weight: { min: 0.4, max: 0.9 }, fromFloor: 15, peakFloor: 19, toFloor: 22 },
      { type: 'bulwark', weight: { min: 0.5, max: 1 }, fromFloor: 17, peakFloor: 18, toFloor: 23 },
      { type: 'jet', weight: { min: 0.5, max: 1 }, fromFloor: 19, peakFloor: 21, toFloor: 26 },
      { type: 'binary', weight: { min: 0.4, max: 0.8 }, fromFloor: 23, peakFloor: 25, toFloor: 29 },
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
  // Guardians, the same way. Past the last floor any of them guards, every one of them can
  // (see scaleConfig).
  chasers: [
    { type: 'warden', weight: 1, fromFloor: 1, toFloor: 5 },
    { type: 'seraph', weight: 1, fromFloor: 1, toFloor: 5 },
    { type: 'blight', weight: 1, fromFloor: 6, toFloor: 10 },
  ],
};

export const WALL_VISUAL = {
  squiggleAmplitude: 0.04,
  squiggleSpeed: 2,
  squiggleFrequency: 1,
  squiggleResolution: 7,
  strokeWidth: 0.1,
};
// Now and then a patch of wall outline nearby sways faster (its waves taller) or slower
// (lower) for a while, bunching its waves up on one side as it runs ahead or falls
// behind. Then, so they fall back in step with those around it, it drifts gently the
// other way for a while longer.
export const WALL_GUSTS = {
  everyRange: { x: 0.4, y: 1.2 }, // seconds between gusts
  radiusRange: { x: 3, y: 6 }, // tiles: fades out toward its edge
  holdRange: { x: 1, y: 2.5 }, // seconds fully at the other speed
  ease: 0.5, // seconds to change speed, and again to change back
  settleRange: { x: 8, y: 14 }, // seconds drifting back in step after
  fasterRange: { x: 1.2, y: 2.4 }, // added to the speed (1 = twice as fast)
  slowerRange: { x: 0.7, y: 0.95 }, // taken off it (1 = stopped)
  slowerChance: 0.35,
  swell: 0.8, // a fast gust's waves grow by up to this (0.8 = 1.8× as tall)
  shrink: 0.45, // a slow gust's shrink by up to this
};
// Where something strikes a wall its outline dents in, springs back and forth and
// ripples out along it, dying away. A body stirs it by how fast it hits.
export const WALL_IMPACT = {
  minSpeed: 2, // tiles a second into the wall: slower contacts don't stir it
  fullSpeed: 20, // and this fast (a dash, a hard knockback) stirs it fully
  soft: 0.15, // the slowest stir that counts, as a fraction of a full one
  cooldown: 0.3, // seconds before the same body stirs it again, unless it hits harder
  swing: 0.6, // the stir of the player's swing reaching a wall
  attack: 0.5, // of an enemy's attack or projectile reaching one, where it first touches each stretch
  attackSpacing: 1.2, // tiles: an attack stirs a stretch of wall no closer than this to where it already has
  depth: 0.18, // tiles a full stir dents the outline in
  decay: 0.45, // seconds for it to die to about a third
  frequency: 16, // radians a second it springs back and forth
  wavenumber: 3.5, // radians per tile across its ripples (with frequency, how fast they run)
  radius: 0.7, // tiles: how wide the dent is at first
  spread: 2.5, // tiles a second it widens by, flattening as it goes
  rise: 0.04, // seconds to dent fully in
  // Its thump (sfx wallRipple), from the softest stir to a full one: only a little louder and lower.
  sound: { volume: { x: 0.4, y: 1 }, pitch: { x: 1.12, y: 0.9 } },
};
// An explosion shoves the wall outlines round it back: a shockwave runs out from it,
// denting each wall in as it passes (those facing it most) and letting it spring back.
// The bigger the explosion, the further its shove carries, the harder it hits and the
// longer the walls ring after.
export const WALL_BLAST = {
  reachScale: 2, // how far the shove carries, in the explosion's own reaches
  minReach: 4.5, // tiles: even the smallest carries this far
  fullReach: 28, // tiles: a shove carrying this far hits as hard as any
  depth: 0.75, // tiles the hardest dents a wall in at its centre
  curve: 0.9, // a smaller one's: depth × (its reach / fullReach) ^ curve
  speed: 16, // tiles a second the shockwave runs out
  rise: 0.05, // seconds for a wall to be shoved fully in as it passes
  decayRange: { x: 0.22, y: 0.5 }, // seconds for its springing back to die to about a third, smallest to biggest
  frequency: 11, // radians a second it springs back and forth
  facing: 0.3, // the shove on walls side-on or facing away, as a fraction of facing ones'
  // Its boom (sfx wallShove), smallest to fullReach: only a little louder and lower. `far`:
  // its volume with the nearest wall at the edge of its reach (full with one right by it);
  // `pull`: the pitch of one caving in, against one going off.
  sound: { volume: { x: 0.6, y: 1 }, pitch: { x: 1.1, y: 0.86 }, far: 0.45, pull: 1.15 },
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
