// Enemy attacks. Each enemy type lists which of these it uses (see enemies.js).
// `lockTime`: the enemy turns to follow the player through the wind-up, except for its
// last `lockTime` seconds, when its aim is fixed. Dashes and throws fire along the facing.
// Every attack flashes a parry cue just before it can hurt (ATTACK_FX.cue), where it comes
// from: a held weapon's head, a throw's muzzle, a laser's nose, missiles' engines, or else
// `cueAt` body radii ahead (default 1, the enemy's front).

const clearPath = (size, offset) => ({ requireClearAttackPath: true, attackPathCastSize: size, attackPathOriginOffset: offset });

export const ABILITIES = {
  GoblinThrow: {
    type: 'throw', tell: 'throw', cooldown: 5, range: 15, windUpTime: 1, lockTime: 0.25, duration: 0.3, recoveryTime: 0.5,
    damageMultiplier: 1, parryStunTime: 0, ...clearPath({ x: 0.75, y: 0.75 }, 0.3),
    projectileSpeed: 7, projectileLifetime: 4, spawnDistance: 0.75,
    projectileSize: 0.3,
  },
  StrikerDash: {
    type: 'dash', tell: 'charge', cooldown: 3, range: 5, windUpTime: 0.5, lockTime: 0.2, duration: 0.4, recoveryTime: 0.1,
    damageMultiplier: 1, parryStunTime: 1, ...clearPath({ x: 1, y: 1 }, 0.25),
    dashForce: 30, hitboxRadius: 0.55,
  },
  // The Mauler's maul. Both lunge `stepDistance` along the locked aim over `stepTime` as
  // they strike; `maul` says how the maul moves with them (maulerRig.js).
  // Swing: the maul crosses the front in `swingTime` as the Mauler lunges. The Mauler is the
  // hitbox (a charge, parried like one): a circle `hitboxRadius` around a point
  // `hitboxForward` ahead, hurting for `duration`.
  MaulerSwing: {
    type: 'swing', tell: 'swing', cooldown: 2.2, range: 2.5, windUpTime: 0.62, lockTime: 0.22, duration: 0.18, recoveryTime: 0.25,
    damageMultiplier: 1, parryStunTime: 0.9, ...clearPath({ x: 1, y: 1 }, 0.3),
    hitboxRadius: 0.85, hitboxForward: 0.3, swingTime: 0.12, stepDistance: 1.3, stepTime: 0.15, parryKnockback: 15,
    strikeSound: 'heave', maul: 'swing',
  },
  // Slam: the maul comes down `landTime` after the strike, `impactAt` ahead (where the maul's
  // head lands), and a circle there spreads from `radius[0]` to `radius[1]` over `spreadTime`.
  MaulerSlam: {
    type: 'smash', tell: 'smash', cooldown: 4.5, range: 3.5, windUpTime: 0.92, lockTime: 0.3, duration: 0.4, recoveryTime: 0.45,
    damageMultiplier: 1.6, parryStunTime: 1.2, ...clearPath({ x: 1, y: 1 }, 0.3),
    impactAt: 1.25, landTime: 0.09, radius: [0.55, 1.8], spreadTime: 0.25, stepDistance: 1.15, stepTime: 0.09,
    strikeSound: 'heave', landSound: 'slam', maul: 'slam',
    shake: { duration: 0.2, strength: 0.25, frequency: 20 },
  },
  // The Shade's arm-blades; `blades` says how they move (shadeRig.js). Both lunge like the
  // Mauler's swing, the Shade the hitbox.
  // Slashes: `strikes` of them, the right arm first and then each side in turn, one every
  // `strikeInterval` seconds. Each steps its `stepDistance` over `stepTime` along its aim,
  // the arm stabbing from its side to just past the middle ahead in `swingTime`, with a
  // touch of slash. Between strikes it re-aims, except for the last `lockTime` before the next.
  // While winding up it keeps closing in at `advanceSpeed`, stopping `advanceStop` away.
  // Each stab's arm stays locked out a while (BLADES.stab); the recovery lasts until the
  // last one is back (swingTime + hold + fold, less `duration`).
  ShadeSlashes: {
    type: 'slashes', tell: 'slash', cooldown: 3, range: 3, windUpTime: 0.55, lockTime: 0.18, duration: 0.16, recoveryTime: 0.58,
    damageMultiplier: 1, parryStunTime: 0.9, ...clearPath({ x: 1, y: 1 }, 0.3),
    strikes: 2, strikeInterval: 0.5, advanceSpeed: 2.4, advanceStop: 1.1,
    hitboxRadius: 0.85, hitboxForward: 0.7, swingTime: 0.09, stepDistance: [1.2, 2.2], stepTime: 0.13, parryKnockback: 15,
    strikeSound: 'slash', blades: 'slash',
  },
  // Lunge: both blades thrust ahead as the Shade dashes `stepDistance` in `stepTime`,
  // further than the player's dash (3 in 0.15) but slower. They stay thrust out until
  // part way through the recovery (BLADES.lungeHold), then fold back as it ends.
  ShadeLunge: {
    type: 'swing', tell: 'lunge', cooldown: 4, range: 4.8, windUpTime: 0.6, lockTime: 0.2, duration: 0.26, recoveryTime: 0.45,
    damageMultiplier: 1.3, parryStunTime: 1, ...clearPath({ x: 1, y: 1 }, 0.3),
    hitboxRadius: 0.7, hitboxForward: 0.55, swingTime: 0.08, stepDistance: 3.6, stepTime: 0.24, parryKnockback: 15,
    strikeSound: 'enemyDash', blades: 'lunge',
  },
  // The Seer's mist balls (`look: 'mist'`, see MIST_BALL), formed `spawnDistance` ahead.
  // Omen: a ball `chargeSize` across forms over the wind-up, then is thrown up out of sight.
  // It comes down `flightTime` later a little way along the player's path: `leadFraction`
  // of how far they would get by then at their current velocity (at most `maxLead`, and
  // never past a wall), the spot marked on the floor meanwhile, and hangs there `boomTime`
  // as a boom `boomRadius` around that can hurt from the moment it lands (mistShell.js).
  // The Seer sees through walls: neither attack needs a clear path, the Omen comes down over
  // them and the Bolt flies through them.
  SeerOmen: {
    type: 'lob', tell: 'conjure', cooldown: 3, range: 16, windUpTime: 1.5, lockTime: 0.3, duration: 0, recoveryTime: 0.2,
    damageMultiplier: 1.5, parryStunTime: 1.2, requireClearAttackPath: false,
    look: 'mist', spawnDistance: 1.2, chargeSize: 1.7,
    flightTime: 1.5, boomTime: 0.5, boomRadius: 0.85, leadFraction: 0.4, maxLead: 2.8,
  },
  // Bolt: the same ball, formed the same way, hurled straight ahead, slower than the
  // Goblin's throw.
  SeerBolt: {
    type: 'throw', tell: 'conjure', cooldown: 3, range: 16, windUpTime: 1.5, lockTime: 0.3, duration: 0, recoveryTime: 0.2,
    damageMultiplier: 1, parryStunTime: 0.8, requireClearAttackPath: false,
    look: 'mist', projectileSpeed: 5.5, projectileLifetime: 5, spawnDistance: 1.2,
    projectileSize: 1.7, passesWalls: true,
  },
  WardenDash: {
    type: 'dash', tell: 'charge', cooldown: 3, range: 7, windUpTime: 1, duration: 1, recoveryTime: 0.5,
    damageMultiplier: 1, parryStunTime: 1, ...clearPath({ x: 1.25, y: 1.25 }, 0.35),
    dashForce: 700, hitboxRadius: 1.1,
  },
  WardenGroundPound: {
    type: 'groundPound', tell: 'pound', cooldown: 6, range: 4, windUpTime: 1.5, duration: 0.3, recoveryTime: 1,
    damageMultiplier: 1.3, parryStunTime: 0.6, requireClearAttackPath: false, radius: 3.5, cueAt: 0,
  },
  WardenPunch: {
    type: 'punch', tell: 'punch', cooldown: 1.5, range: 4, windUpTime: 0.5, duration: 0.15, recoveryTime: 0.3,
    damageMultiplier: 0.6, parryStunTime: 0.4, ...clearPath({ x: 1, y: 1 }, 0.2),
    hitboxSize: 2.2, forwardOffset: 1.6, stepForce: 550,
  },
  WardenSlam: {
    type: 'slam', tell: 'slam', cooldown: 3, range: 4, windUpTime: 1, lockTime: 0.2, duration: 1, recoveryTime: 1,
    damageMultiplier: 1.2, parryStunTime: 0.5, ...clearPath({ x: 2.5, y: 2 }, 0.2),
    // Slam box: `range` long, `slamWidth` wide, both scaled by the Warden's 2x size.
    slamWidth: 2, sizeScale: 2,
  },
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
