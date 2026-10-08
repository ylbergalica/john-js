// Per-floor difficulty curve: returns a scaled copy of the base level config.
export function scaleConfig(base, floor) {
  const s = structuredClone(base);
  const F = Math.floor;
  const es = s.enemySpawn;

  // Types are introduced floor by floor.
  const introduced = (e) => (e.fromFloor ?? 1) <= floor;
  es.enemies = es.enemies.filter(introduced);
  s.chasers = s.chasers.filter(introduced);

  const enemyBonus = F(floor * 0.4);
  es.minEnemiesPerRoom = Math.min(es.minEnemiesPerRoom + enemyBonus, 10);
  es.maxEnemiesPerRoom = Math.min(es.maxEnemiesPerRoom + enemyBonus, 15);
  es.skipLastRoom = F(floor * 0.07) < 1;
  es.skipFirstRoom = F(floor * 0.05) < 1;

  s.chaserCount += F(floor / 20);
  s.roomCount += F(floor * 0.2);

  const roomSizeBonus = F(floor * 0.1);
  s.roomMinSize.x = Math.min(s.roomMinSize.x + roomSizeBonus, 50);
  s.roomMinSize.y = Math.min(s.roomMinSize.y + roomSizeBonus, 50);
  s.roomMaxSize.x = Math.min(s.roomMaxSize.x + roomSizeBonus, 70);
  s.roomMaxSize.y = Math.min(s.roomMaxSize.y + roomSizeBonus, 70);

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
