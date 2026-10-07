// Enemy attacks. Each enemy type lists which of these it uses (see enemies.js).

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
    damageMultiplier: 1, parryStunTime: 0.8, ...clearPath({ x: 0.6, y: 0.6 }, 0.3),
    launchPoint: { x: -0.9, y: 0.45 }, launchAngleDeg: 135,
    projectileSpeed: 10, projectileLifetime: 7, projectileSize: 0.35, turnRate: 2, homingDelay: 0, homingTime: 4,
    passesWalls: true,
  },
  // A beam from the nose (`beamFrom` ahead of centre) to the first wall, held for
  // `duration` while the Seraph stays put. Standing in it hurts every time the player's
  // invincibility runs out.
  SeraphLaser: {
    type: 'laser', tell: 'beam', cooldown: 8, range: 12, windUpTime: 1.8, lockTime: 0.7, duration: 3, recoveryTime: 0.6,
    damageMultiplier: 1.2, parryStunTime: 1.2, ...clearPath({ x: 0.6, y: 0.6 }, 0.5),
    beamFrom: 0.85, beamWidth: 0.7, maxLength: 40, orbSize: 0.55, parryKnockback: 0,
  },
};
