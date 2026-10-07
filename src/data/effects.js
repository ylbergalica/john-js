// Shared visual effects: spark bursts, frame animations and how enemy attacks read.

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
