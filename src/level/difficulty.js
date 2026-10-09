// Per-floor difficulty curve: returns a scaled copy of the base level config.
export function scaleConfig(base, floor) {
  const s = structuredClone(base);
  const F = Math.floor;
  const es = s.enemySpawn;

  // Types come and go floor by floor, their weight resolved for this floor.
  es.enemies = spawnableOn(es.enemies, floor);
  s.chasers = spawnableOn(s.chasers, floor);

  const enemyBonus = F(floor * 0.4);
  es.minEnemiesPerRoom = Math.min(es.minEnemiesPerRoom + enemyBonus, 10);
  es.maxEnemiesPerRoom = Math.min(es.maxEnemiesPerRoom + enemyBonus, 15);
  es.skipLastRoom = F(floor * 0.07) < 1;
  es.skipFirstRoom = F(floor * 0.05) < 1;

  s.chaserCount += F(floor / 20);
  s.roomCount += F(floor * 0.2);

  // Rooms grow alongside the enemy counts above, both levelling off in the early 20s.
  const roomSizeBonus = Math.min(F(floor * 0.5), 12);
  s.roomMinSize.x += roomSizeBonus;
  s.roomMinSize.y += roomSizeBonus;
  s.roomMaxSize.x += roomSizeBonus;
  s.roomMaxSize.y += roomSizeBonus;

  const levelSizeBonus = F(floor * 5);
  s.width += levelSizeBonus;
  s.height += levelSizeBonus;

  const roomDistanceBonus = F(floor * 0.2);
  s.minRoomDistance = Math.min(s.minRoomDistance + roomDistanceBonus, 7);
  s.maxRoomDistance = Math.min(s.maxRoomDistance + roomDistanceBonus, 16);

  // These only kick in from floor 100.
  const late = F(floor * 0.01);
  s.roomBusyness = Math.max(s.roomBusyness - late, 0.25);
  s.wallSizeRange.x = Math.max(s.wallSizeRange.x - late, 2);
  s.wallSizeRange.y = Math.max(s.wallSizeRange.y - late, 2);
  s.extraCorridorChance = Math.max(0.2, s.extraCorridorChance - late);
  s.corridorObstacleChance = Math.min(s.corridorObstacleChance + late, 0.7);
  return s;
}

// Keeps the entries within [fromFloor, toFloor] and turns a { min, max } weight into a
// number, rising linearly from min on fromFloor to max on toFloor (min if open-ended).
function spawnableOn(entries, floor) {
  return entries
    .filter((e) => (e.fromFloor ?? 1) <= floor && floor <= (e.toFloor ?? Infinity))
    .map((e) => {
      if (typeof e.weight === 'number') return e;
      const from = e.fromFloor ?? 1;
      const span = (e.toFloor ?? Infinity) - from;
      const t = span > 0 && span < Infinity ? (floor - from) / span : 0;
      return { ...e, weight: e.weight.min + (e.weight.max - e.weight.min) * t };
    });
}
