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

// Enemy deaths (src/render/deathFx.js), all at the moment of the killing blow: the enemy's
// silhouette pops white and swells away, light flashes, rings race out, sparks spray all
// around and along the blow, the stars of its void spill out and a puff of its colour hangs
// a moment. Guardians are bosses, so theirs is the same, only far grander, with light rays
// bursting from the body, drifting embers, a heavy shake and a screen-wide shockwave.
// Colours not given are the enemy's hitColor. pop/flash/rings/rays are sized in body radii,
// particles in world units; times in seconds; [min, max] picks at random.
export const DEATH_FX = {
  enemy: {
    pop: { time: 0.22, scale: 1.6 },
    flash: { size: 3, grow: 1.8, time: 0.18, alpha: 0.85 },
    rings: [{ delay: 0, time: 0.35, from: 1, to: 3.6, alpha: 0.9 }],
    rays: null,
    sparks: [{ count: 22, speed: 9, lifetime: 0.45, size: 0.34, coneDeg: 180 }],
    blow: { count: 14, speed: 13, lifetime: 0.4, size: 0.42, coneDeg: 22, color: 0xffffff }, // along the killing blow
    stars: { count: 9, speed: [2, 5.5], size: [0.18, 0.32], life: [0.5, 0.9], color: 0xffffff },
    mist: { count: 6, speed: [0.6, 2], size: [0.9, 1.3], grow: 2, life: [0.45, 0.7], alpha: 0.35 },
    embers: null,
    shake: { duration: 0.14, strength: 0.08, frequency: 22 },
    ripple: null,
  },
  guardian: {
    pop: { time: 0.5, scale: 2.4 },
    flash: { size: 7, grow: 2.4, time: 0.5, alpha: 1 },
    rings: [
      { delay: 0, time: 0.45, from: 1, to: 6, alpha: 1, color: 0xffffff },
      { delay: 0.06, time: 0.8, from: 1, to: 10, alpha: 0.85 },
      { delay: 0.18, time: 1.1, from: 2, to: 15, alpha: 0.5 },
    ],
    rays: { count: 12, length: [5, 10], width: [0.35, 0.65], time: [0.4, 0.7] },
    sparks: [
      { count: 90, speed: 22, lifetime: 0.9, size: 0.7, coneDeg: 180 },
      { count: 50, speed: 15, lifetime: 0.7, size: 0.5, coneDeg: 180, color: 0xffffff },
    ],
    blow: { count: 36, speed: 26, lifetime: 0.6, size: 0.6, coneDeg: 28, color: 0xffffff },
    stars: { count: 40, speed: [4, 14], size: [0.25, 0.55], life: [0.9, 1.8], color: 0xffffff },
    mist: { count: 28, speed: [3, 7], size: [1.6, 2.4], grow: 2.6, life: [1.1, 1.6], alpha: 0.4 },
    embers: { count: 40, speed: [2, 9], size: [0.18, 0.34], life: [1.2, 2.4] },
    shake: { duration: 0.9, strength: 0.75, frequency: 14 },
    // As the Exalted ripple (strength/width: fractions of screen height); its light is the
    // guardian's colour × `glow`, and the scene it has passed is multiplied by `grade`.
    ripple: { duration: 1.3, strength: 0.06, width: 0.1, glow: 0.6, grade: [0.75, 0.75, 0.85] },
  },
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
//   Cue: `cue.lead` before the attack can hurt, a star flashes where it comes from (the
//     weapon, muzzle or front): parry now.
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
  // loading), `swell` grows it (fractions of body radius / size), `twist` turns it back
  // (degrees) and on the strike it whips through past its facing (a swing).
  tells: {
    charge: { shape: 'chevrons', count: 3, spacing: 0.4, size: 0.32, lean: 0.25, squash: 0.14, swell: 0 },
    punch: { shape: 'arc', arcDeg: 70, lines: 1, reach: 0.5, to: 1.15, lean: 0.14, squash: 0, swell: 0 },
    slam: { shape: 'arc', arcDeg: 170, lines: 2, reach: 0.6, to: 1.15, lean: 0.06, squash: 0, swell: 0.08 },
    pound: { shape: 'ring', reach: 0.6, to: 1.1, lean: 0, squash: 0, swell: 0.16 },
    throw: { shape: 'none', lean: 0.06, squash: 0, swell: 0 },
    boost: { shape: 'chevrons', count: 5, spacing: 0.45, size: 0.36, lean: 0.32, squash: 0.2, swell: 0 },
    missiles: { shape: 'none', lean: 0.05, squash: 0, swell: 0.05 },
    swing: { shape: 'arc', arcDeg: 140, lines: 1, reach: 0.5, to: 1.2, lean: 0.06, squash: 0, swell: 0.04, twist: 18 },
    smash: { shape: 'arc', arcDeg: 46, lines: 3, reach: 0.9, to: 1.2, lean: 0.22, squash: 0.08, swell: 0.1 },
    // Twisting to whichever side the next slash comes from (the ability's `side`).
    slash: { shape: 'arc', arcDeg: 120, lines: 1, reach: 0.45, to: 1.2, lean: 0.1, squash: 0, swell: 0.03, twist: 10 },
    lunge: { shape: 'chevrons', count: 3, spacing: 0.35, size: 0.3, lean: 0.3, squash: 0.12, swell: 0.04 },
    beam: { shape: 'focus', count: 6, at: 1, reach: 1.1, to: 0.12, lean: 0.1, squash: 0.06, swell: 0 },
  },
  // The parry cue: an amber four-point star with a small white core in a soft halo, popping
  // in over the first `rise` of its `time`, then shrinking away as it turns `spin` radians,
  // with a few sparks, and a ring bursting out from radius `ring.from` to `ring.to` so it
  // still reads past an enemy flashing white from a hit.
  // `lead`: how long before the attack can hurt it flashes, about a reaction's worth so a
  // parry pressed on seeing it is open as the attack lands. Sizes grow with the enemy
  // (× √(body radius / 0.5)).
  cue: {
    lead: 0.25, time: 0.24, rise: 0.2, spin: 0.7,
    size: 1.3, stretch: 1.6, color: 0xffa020, core: 0.4, coreColor: 0xffffff,
    haloSize: 2.6, haloAlpha: 0.9, haloColor: 0xff9a1f,
    ring: { from: 0.2, to: 0.9, alpha: 0.9 },
    sparks: { count: 8, speed: 5, lifetime: 0.22, size: 0.2, coneDeg: 180, color: 0xffa020 },
  },
  strike: {
    pop: 0.1, popTime: 0.14, // the body swells by this fraction and settles
    releaseTime: 0.18, releaseReach: 0.9, // the tell bursts outward this many body radii as it fades
    followTime: 0.3, // a twisted body's follow-through
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

// The Mauler's star-maul (src/enemies/maulerRig.js). Poses place it in the Mauler's frame
// (+x forward, +y to its right, world units): the grip `r` out from the centre at angle
// `phi`, the haft pointing `rot`, `pitch` tilting it up off the floor toward the camera
// (π/2 straight up, π laid back over the Mauler's head), and `grow` making it bigger.
// Angles in radians. How long a strike takes comes from the ability (swingTime, landTime).
export const MAUL = {
  lift: 0.18, // raised toward the camera it looks up to this much bigger
  poses: {
    idle: { phi: 0.9, r: 0.5, rot: 0.35, pitch: 0, grow: 0 },
    swingReady: { phi: 1.95, r: 0.51, rot: 2.55, pitch: 0, grow: 0.12 }, // drawn back on its right
    swingThrough: { phi: -1.05, r: 0.5, rot: -1.25, pitch: 0, grow: 0.32 }, // whipped across to its left
    slamReady: { phi: 0, r: 0.05, rot: 0, pitch: 2.75, grow: 0 }, // heaved back over its head
    slamDown: { phi: 0, r: 0.47, rot: 0, pitch: 0, grow: 0 }, // brought down in front: the head lands at MaulerSlam.impactAt
    stunned: { phi: 1.25, r: 0.53, rot: 1.45, pitch: 0, grow: 0 }, // hanging off to the side
  },
  readyIn: 0.6, // fraction of the wind-up spent getting into the ready pose; then it strains
  strain: { swing: { rot: 0.18, pitch: 0, shake: 0.04 }, slam: { rot: 0, pitch: 0.2, shake: 0.05 }, freq: 7 }, // freq: tremble Hz
  settleTime: 0.45, // back to idle, or into a stunned droop
  gait: { stride: 2.4, sway: 0.14, waddle: 0.045 }, // stride: gait radians per unit walked
  // The star in the head brightens through a wind-up and flashes on the strike.
  glint: { size: 0.55, grow: 0.7, flashTime: 0.18, color: 0xffe2b0 },
  // A smear behind the maul as it strikes, from `inner` (× the tip's reach) to the head's
  // tip for a swing, across the head for a slam, trailing `life` seconds.
  trail: { life: 0.13, inner: 0.4, alpha: 0.55, samples: 10 },
  // The slam landing: a flash and a few sparks, then dust rolling out from the impact as
  // the struck circle spreads, and a haze hanging over it. Sizes in world units; dust
  // starts on the circle's first radius.
  impact: {
    flash: { size: 1.1, grow: 1.6, time: 0.15, alpha: 0.6 },
    sparks: { count: 8, speed: 6, lifetime: 0.3, size: 0.3, coneDeg: 70 },
    dust: { count: 18, speed: [2, 3.2], size: [0.6, 1], life: [0.8, 1.3], alpha: 0.75, grow: 2, color: 0xd29a68, fade: 0x4a2a16 },
    haze: { count: 5, speed: [0.2, 0.6], size: [1.1, 1.6], life: [1.1, 1.6], alpha: 0.4, grow: 1.6, color: 0xa86e44, fade: 0x2a1a10 },
  },
};

// The Shade's arms (src/enemies/shadeRig.js), crescent blades floating free of its body.
// Poses are for its right arm, in the Shade's frame (+x forward, +y to its right, world
// units): the root `r` out from the centre at angle `phi`, the blade leaving it heading
// `rot` and curving in toward the body, `grow` making it bigger. With rot = phi - π/2 and r
// at the blade's bend (BLADE_ART.bend) it hugs the body's curve. The left arm mirrors them.
// Angles in radians. Strikes pierce more than they sweep: the arm is pulled back along its
// side and driven forward and across, turning little. How long a strike takes comes from
// the ability (swingTime).
export const BLADES = {
  poses: {
    idle: { phi: 1.75, r: 0.65, rot: 0.18, grow: 0 }, // folded round its side, points ahead
    guard: { phi: 1.85, r: 0.66, rot: 0.28, grow: 0 }, // the arm not striking, kept folded
    slashReady: { phi: 2, r: 0.64, rot: 0.75, grow: 0.06 }, // pulled back along its side
    slashThrough: { phi: 0.8, r: 0.5, rot: 0.1, grow: 0.15 }, // driven forward and across its front
    lungeReady: { phi: 2.05, r: 0.64, rot: 0.55, grow: 0.04 }, // both cocked back along its sides
    lungeThrust: { phi: 0.9, r: 0.48, rot: 0.29, grow: 0.2 }, // both thrust ahead, points meeting
    stunned: { phi: 1.9, r: 0.7, rot: 0.9, grow: 0 }, // drooping
  },
  bow: 0.08, // the root swings this far out mid-slash, arcing it
  hover: { amount: 0.025, freq: 0.8 }, // idle arms bob in and out, out of step (Hz)
  readyIn: 0.6, // fraction of the wind-up spent getting into the ready pose; then it strains
  strain: { rot: 0.1, shake: 0.035, freq: 8 }, // freq: tremble Hz
  settleTime: 0.3, // back to idle, or into a stunned droop
  gait: { stride: 3, sway: 0.08 }, // stride: gait radians per unit walked
  // A smear behind each striking blade, from `inner` (× its reach) to the point, trailing
  // `life` seconds.
  trail: { life: 0.12, inner: 0.35, alpha: 0.5, samples: 10 },
};
