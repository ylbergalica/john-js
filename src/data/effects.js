// Shared visual effects: spark bursts, frame animations and how enemy attacks read.

// Spark bursts; `size` is the spark's length in world units.
export const PARTICLES = {
  enemyHit: { count: 27, speed: 17, lifetime: 0.4, size: 0.66, coneDeg: 28, color: 0xffffff },
  enemyHitTinted: { count: 20, speed: 11.5, lifetime: 0.45, size: 0.48, coneDeg: 50 }, // colour: the enemy's hitColor
  enemyHitGore: { count: 9, speed: 6, lifetime: 0.6, size: 0.95, coneDeg: 65 }, // thick slow globs of the hitColor, spilling out after
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
    pop: { time: 0.26, scale: 1.9 },
    flash: { size: 4, grow: 2, time: 0.22, alpha: 0.95 },
    rings: [{ delay: 0, time: 0.35, from: 1, to: 3.6, alpha: 0.9 }],
    rays: null,
    sparks: [{ count: 38, speed: 13, lifetime: 0.5, size: 0.48, coneDeg: 180 }],
    blow: { count: 34, speed: 20, lifetime: 0.45, size: 0.72, coneDeg: 24, color: 0xffffff }, // along the killing blow
    stars: { count: 16, speed: [3, 8], size: [0.22, 0.4], life: [0.6, 1.1], color: 0xffffff },
    mist: { count: 10, speed: [1, 3], size: [1.1, 1.6], grow: 2.2, life: [0.5, 0.8], alpha: 0.4 },
    embers: null,
    shake: { duration: 0.18, strength: 0.14, frequency: 22 },
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
    // Struck down, a guardian first stops dead for `time` seconds before it bursts: it
    // trembles harder and harder (× body radius, at the start and end), swells, glows and
    // heats up in its colour, blinks white faster and faster (blinks a second, at the start
    // and end; solid white for the last `whiteOut`), and light leaks out of it in sparks
    // (every `sparkEvery` seconds, at the start and end). It sounds `sound` as it starts. A
    // guardian type's own `dying` overrides any of these (the Alembic's lasts longer).
    dying: {
      time: 1.8, sound: 'bossDying',
      tremble: [0.015, 0.08], swell: 0.14,
      glow: { size: 2.6, grow: 0.6, alpha: [0.15, 0.85] }, heat: 0.55,
      blink: [2.5, 14], blinkOn: 0.35, whiteOut: 0.12,
      sparkEvery: [0.2, 0.035], sparks: { count: 3, speed: 7, lifetime: 0.4, size: 0.45, coneDeg: 22 },
    },
    // Its burst shoves the player and enemies within `radius` straight away, harder the
    // closer they are (up to `speed`, units/s). No damage. Enemies lose control of their
    // movement for `stagger` seconds; the player's push fades out over `playerTime`.
    push: { radius: 8, speed: 18, stagger: 0.35, playerTime: 0.45 },
  },
};

export const FX = {
  animFps: 48, // frame animations are generated at twice the original art's 24 fps
  swingAnimSpeed: 1.5, // the swing clip plays faster than the rest so it lands within attackDuration
  parryConnectSize: 3.6,
  parryComboGrowth: 0.2, // per streak level: parry flash size and spark count/speed/size grow by this fraction
  parryComboColor: 0xffa030, // the parry sparks warm from parryConnect's colour toward this at max streak
  hitImpactSize: 1.75,
  hitImpactJitter: 0.35, // radians of random twist on the hit streak so repeat hits don't look stamped
};

// The weight of a sword blow landing on an enemy (Player.onAttackHit): the world holds still
// for `hitstop` seconds of real time (`killHitstop` on a killing blow) while the camera kicks,
// and the struck body squashes by `squash.amount` and springs back over `squash.time`,
// wobbling `squash.wobble` times (Enemy.onHurt, for every hit).
export const ENEMY_HIT = {
  hitstop: 0.045, killHitstop: 0.085,
  shake: { duration: 0.11, strength: 0.11, frequency: 32 },
  squash: { amount: 0.17, time: 0.2, wobble: 1.5 },
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
  // (degrees) and on the strike it whips through past its facing (a swing). A charge with
  // `stretchIn` eases into its stretch over that many seconds (a launch gathering speed).
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
    slash: { shape: 'none', lean: 0.1, squash: 0, swell: 0.03 },
    lunge: { shape: 'chevrons', count: 3, spacing: 0.35, size: 0.3, lean: 0.3, squash: 0.12, swell: 0.04 },
    beam: { shape: 'focus', count: 6, at: 1, reach: 1.1, to: 0.12, lean: 0.1, squash: 0.06, swell: 0 },
    conjure: { shape: 'none', lean: 0.1, squash: 0, swell: 0.06 },
    spin: { shape: 'none', lean: 0.08, squash: 0.08, swell: 0.05 }, // crouching to whirl round
    tail: { shape: 'none', lean: 0.06, squash: 0, swell: 0.04 }, // drawing its tail round to fling
    hook: { shape: 'none', lean: 0.1, squash: 0, swell: 0.04, twist: 16 }, // its fist shows the side
    clap: { shape: 'arc', arcDeg: 120, lines: 2, reach: 0.7, to: 1.15, lean: 0.18, squash: 0.06, swell: 0.1 },
    flurry: { shape: 'chevrons', count: 3, spacing: 0.35, size: 0.3, lean: 0.22, squash: 0.1, swell: 0.04 },
    cannons: { shape: 'none', lean: 0.06, squash: 0, swell: 0.03 }, // its shots show which cannon
    barrage: { shape: 'arc', arcDeg: 60, lines: 2, reach: 0.6, to: 1.2, lean: 0.14, squash: 0.1, swell: 0.06 }, // bracing for the kick
    scimitar: { shape: 'none', lean: 0.1, squash: 0, swell: 0.04, twist: 18 }, // its blade shows the side
    rush: { shape: 'chevrons', count: 4, spacing: 0.4, size: 0.32, lean: 0.3, squash: 0.16, swell: 0.03 },
    gape: { shape: 'none', lean: 0, squash: 0, swell: 0.06 }, // its irises show the toxin forming
    loose: { shape: 'none', lean: 0, squash: 0, swell: 0.08 }, // its canisters strain out
    spew: { shape: 'ring', reach: 0.5, to: 1.05, lean: 0, squash: 0, swell: 0.14 }, // building pressure, about to spew all round
    retch: { shape: 'none', lean: 0.14, squash: 0.06, swell: 0.06 }, // rearing back to lob
    spit: { shape: 'none', lean: 0.12, squash: 0.08, swell: 0.03 }, // drawing back to spit, its silk showing at its mouth
    rear: { shape: 'none', lean: 0.08, squash: 0, swell: 0.07 }, // rearing up, front legs raised wide
    swell: { shape: 'ring', reach: 2.2, to: 1.8, lean: 0, squash: 0, swell: 0 }, // about to burst all round (its rig swells it)
    bash: { shape: 'chevrons', count: 3, spacing: 0.35, size: 0.34, lean: 0.28, squash: 0.12, swell: 0.05 }, // braced behind its shield
    plant: { shape: 'arc', arcDeg: 70, lines: 3, reach: 1.1, to: 1.25, lean: 0.12, squash: 0.06, swell: 0.08 }, // the cone the wave runs down
    jet: { shape: 'chevrons', count: 4, spacing: 0.45, size: 0.34, lean: 0, squash: 0, swell: 0, stretchIn: 0.16 }, // its engines spooling up
    bank: { shape: 'none', lean: 0, squash: 0, swell: 0, stretchIn: 0.14 }, // banking away shows which way it comes round
  },
  // The parry cue: an amber four-point star with a small white core in a soft halo, popping
  // in over the first `rise` of its `time`, then shrinking away as it turns `spin` radians,
  // with a few sparks, and a ring bursting out from radius `ring.from` to `ring.to` so it
  // still reads past an enemy flashing white from a hit.
  // `lead`: how long before the attack can hurt it flashes, about a reaction's worth so a
  // parry pressed on seeing it is open as the attack lands. Sizes grow with the enemy
  // (× √(body radius / 0.5)).
  cue: {
    lead: 0.4, time: 0.24, rise: 0.2, spin: 0.7,
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
    // A charge that hurts only across its front burns only across that arc: full inside it,
    // fading away over `fadeDeg` degrees across its sides. Its glow then takes the enemy's
    // own shape (`halo`): its silhouette blurred by `blur` of its size (`passes` times over,
    // to strengthen it), with `pad` of its size spare on each side, at `alpha`.
    arcMask: { fadeDeg: 24 },
    halo: { pad: 0.25, blur: 0.06, passes: 2, alpha: 0.9 },
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
    muzzle: { count: 6, speed: 6, lifetime: 0.18, size: 0.28, coneDeg: 40 }, // a cannon's flash as it fires
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

// The Seer's mist balls (MistBallLook in src/enemies/attackView.js): a dark blue heart in
// swirling blue mist, glowing so it reads on the dark floor. Sizes × the ball's size,
// except `trail` (world units). It forms over a wind-up like any thrown orb and, hurled,
// flies with a trail. The Omen's ball (src/enemies/mistShell.js) instead dissolves upward
// as it is thrown (`launch`: it grows by `grow` and fades over `time`), and while it is
// gone its landing spot is marked on the floor (`marker`): a ring the size of the boom,
// filling from the centre out to meet the ring as it lands,
// pulsing faster (`pulse`, Hz at the start and end). It lands with a pop (`boom`), holds
// at the size it was thrown while it hurts, then puffs away over `fadeTime`.
export const MIST_BALL = {
  color: 0x2f55ff, deep: 0x0a1446, bright: 0x9db4ff,
  halo: { size: 2.4, alpha: 0.6 },
  puffs: { count: 5, size: 0.8, orbit: 0.2, spin: 1.4, alpha: 0.55 },
  core: { size: 0.78, alpha: 0.85 },
  heart: { size: 0.3, alpha: 0.75 },
  pulseSpeed: 3,
  trail: 1.4, trailWidth: 0.9,
  fizzle: { count: 12, speed: 4, lifetime: 0.35, size: 0.28, coneDeg: 180 },
  launch: { time: 0.25, grow: 0.6, sparks: { count: 12, speed: 5, lifetime: 0.35, size: 0.28, coneDeg: 180 } },
  marker: { lineWidth: 0.06, ringAlpha: 0.75, fillAlpha: 0.3, pulse: [2, 8] },
  boom: {
    pop: 0.3, popTime: 0.12, fadeTime: 0.3, fadeGrow: 0.35, burnAlpha: 0.25, flicker: 0.06,
    sparks: { count: 26, speed: 8, lifetime: 0.4, size: 0.4, coneDeg: 180 },
    shake: { duration: 0.18, strength: 0.18, frequency: 22 },
  },
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

// The Bulwark's shield (src/enemies/bulwarkRig.js). Poses place it in the Bulwark's frame
// (+x forward, world units): the centre of its curve `ahead` of the Bulwark's centre (its
// plate stands SHIELD_ART.r out from there, hugging the front of the body), turned `rot`, `pitch`
// tilting it up off the floor toward the camera, and `grow` making it bigger. Angles in
// radians. How long a strike takes comes from the ability (swingTime, landTime).
export const SHIELD = {
  lift: 0.2, // raised toward the camera it looks up to this much bigger
  poses: {
    idle: { ahead: -0.1, rot: 0, pitch: 0, grow: 0 },
    bashReady: { ahead: -0.2, rot: 0, pitch: 0, grow: 0.06 }, // drawn in tight, braced behind it
    bashThrough: { ahead: 0.16, rot: 0, pitch: 0, grow: 0.14 }, // rammed out ahead
    plantReady: { ahead: -0.16, rot: 0, pitch: 1.15, grow: 0.12 }, // heaved up off the floor
    plantDown: { ahead: 0.06, rot: 0, pitch: 0, grow: 0 }, // slammed edge-first into the floor
    stunned: { ahead: -0.14, rot: 0.4, pitch: 0, grow: 0 }, // sagging off to one side
  },
  readyIn: 0.6, // fraction of the wind-up spent getting into the ready pose; then it strains
  strain: { bash: { ahead: -0.03, pitch: 0, shake: 0.03 }, plant: { ahead: 0, pitch: 0.2, shake: 0.05 }, freq: 7 }, // freq: tremble Hz
  settleTime: 0.4, // back to idle, or into a stunned sag
  gait: { stride: 2.2, bob: 0.025, waddle: 0.05 }, // stride: gait radians per unit walked; bob: the shield, waddle: the body
  // The star in its boss brightens through a wind-up and flashes on the strike.
  glint: { size: 0.5, grow: 0.7, flashTime: 0.18, color: 0xdfe8ff },
  // A blow turned by the shield: it flashes white for `flashTime`, sparks fly back off it
  // toward the blow with a flare of light, and a sword that struck it is thrown back
  // `recoil` × as hard as a landed hit's recoil.
  glance: {
    flashTime: 0.08, recoil: 1.8,
    sparks: { count: 16, speed: 11, lifetime: 0.3, size: 0.34, coneDeg: 55, color: 0xfff0c8 },
    glints: { count: 6, speed: 5, lifetime: 0.22, size: 0.2, coneDeg: 90, color: 0xc8d8ff },
    flare: { size: 0.5, grow: 2.2, time: 0.12, alpha: 0.9, color: 0xdfe8ff },
  },
  // The guard broken: the shield flies off its arm, `spreadDeg` either side of straight away
  // from the player, `distance` [min, max] (short of walls) over `time`, up off the floor and
  // down again (`height`: how much bigger it looms at the top) as it spins `spin` [min, max]
  // turns, and lands in a puff of dust with a clatter, where it lies at `lieAlpha`. It flies
  // back to the Bulwark's arm over the last `returnTime` of the break.
  fling: {
    spreadDeg: 55, distance: [2.2, 3.2], time: 0.5, height: 0.5, spin: [1.2, 2], lieAlpha: 0.85, returnTime: 0.3,
    dust: { count: 8, speed: [1.2, 2.2], size: [0.4, 0.7], life: [0.5, 0.9], alpha: 0.6, grow: 1.8, color: 0x9aa6b8, fade: 0x2a2f38 },
    sparks: { count: 10, speed: 6, lifetime: 0.3, size: 0.3, coneDeg: 180, color: 0xfff0c8 },
  },
  // The plant landing: a flash and sparks where the shield bites the floor, dust thrown up
  // along the shockwave's front as it runs out (`dust.rate` puffs a second across it) with
  // sparks flying ahead of it, and a haze hanging where it landed. Sizes in world units.
  impact: {
    flash: { size: 1, grow: 1.6, time: 0.15, alpha: 0.6 },
    sparks: { count: 10, speed: 7, lifetime: 0.3, size: 0.3, coneDeg: 40 },
    dust: { rate: 90, speed: [0.4, 1.2], size: [0.5, 0.9], life: [0.6, 1], alpha: 0.65, grow: 1.8, color: 0x9aa6b8, fade: 0x2a2f38 },
    frontSparks: { rate: 40, count: 1, speed: 9, lifetime: 0.25, size: 0.3, coneDeg: 15 },
    haze: { count: 4, speed: [0.2, 0.5], size: [1, 1.4], life: [1, 1.4], alpha: 0.35, grow: 1.6, color: 0x7d8899, fade: 0x1e2229 },
  },
};

// The Shade's arms (src/enemies/shadeRig.js), crescent blades floating free of its body.
// Poses are for its right arm, in the Shade's frame (+x forward, +y to its right, world
// units): the root `r` out from the centre at angle `phi`, the blade leaving it heading
// `rot` and curving in toward the body, `grow` making it bigger. With rot = phi - π/2 and r
// at the blade's bend (BLADE_ART.bend) it hugs the body's curve. The left arm mirrors them.
// Angles in radians. The arms move like machinery, not limbs: readying an attack or
// stunned, they slide straight out from the body, tilting only slightly inward. A slash is
// a stab from the arm's place at the side to well out past the middle ahead, turning a
// little as it goes; the arm then locks there (`stab`). How long a strike takes comes from
// the ability (swingTime).
export const BLADES = {
  poses: {
    idle: { phi: 2, r: 0.68, rot: 0.43, grow: 0 }, // folded round its side, points ahead
    guard: { phi: 2.1, r: 0.69, rot: 0.53, grow: 0 }, // the arm not striking, kept folded
    slashReady: { phi: 1.95, r: 0.92, rot: 0.26, grow: 0.06 }, // slid out from its side, tilted slightly in
    slashThrough: { phi: 0.64, r: 1.05, rot: -0.1, grow: 0.15 }, // stabbed far ahead, the point past the middle
    lungeReady: { phi: 1.9, r: 0.88, rot: 0.21, grow: 0.04 }, // both slid out from its sides, tilted slightly in
    lungeThrust: { phi: 0.9, r: 0.48, rot: 0.38, grow: 0.12 }, // both thrust ahead, points meeting
    stunned: { phi: 1.85, r: 0.95, rot: 0.16, grow: 0 }, // knocked loose, hanging out from its sides
  },
  // A landed stab's arm stays locked in place in the world for `hold` seconds, then snaps
  // back to rest over `fold`. ShadeSlashes' recovery is timed to end as the last one does.
  stab: { hold: 0.5, fold: 0.15 },
  lungeHold: 0.5, // fraction of the lunge's recovery its blades stay thrust out; the rest folds them back
  hover: { amount: 0.025, freq: 0.8 }, // idle arms bob in and out, out of step (Hz)
  readyIn: 0.6, // fraction of the wind-up spent getting into the ready pose; then it strains
  strain: { out: 0.06, shake: 0.018, freq: 14 }, // ready arms push `out` further, juddering `shake` in and out at `freq` Hz
  settleTime: 0.3, // back to idle, or out into the stunned pose
  gait: { stride: 3, sway: 0.08 }, // stride: gait radians per unit walked
  // A smear behind each striking blade, from `inner` (× its reach) to the point, trailing
  // `life` seconds.
  trail: { life: 0.12, inner: 0.35, alpha: 0.5, samples: 10 },
};

// The Lemur's tail (src/enemies/lemurRig.js): a short ringed stalk ending in a big spade, a
// chain of `segments` links `segment` long from a root `root` out from the Lemur's centre,
// `width` half as thick at the root and the tip. Each link's bend off the one before is
// sprung toward where it wants to be: `spring` sets how fast (`freq`, Hz, at the root and
// the tip) and how soon it settles (`damping`, 1 settling without swinging past), and no
// link bends more than `maxBend`. It wants its rest bend (`bends`, radians, root first: a
// lazy S), swept back by `lag` (root, tip; radians per rad/s) of how fast the body turns
// (eased over `turnEase` s), up to `maxLag`, so it curls back after a turn and swings
// through as the turn stops; and running, leant up to `trail` radians a link (more toward
// the tip) toward straight behind, after the Lemur's velocity eased over `trailEase` s. At
// rest it sways, a wave running down it, each link bending up to `sway.amount` radians more
// (less toward the root), `freq` times a second (× `walk` on the move), `lag` radians
// later each link. When an attack swings it (LemurVolley.swing) it comes out of the body
// wherever the attack has it, sprung straight by `swing`. Each crescent it flings
// `flick`s the spade, swelling it by `swell`, easing back over `time`. Stunned, it droops
// (`stunned`: × the bends and the spring's freq). `bands`: brown rings round the stalk.
export const LEMUR_TAIL = {
  root: 0.22, segments: 6, segment: 0.09, width: [0.06, 0.038],
  bends: [0.2, 0.12, 0, -0.12, -0.2, -0.16],
  spring: { freq: [5, 3], damping: 0.45 }, maxBend: 0.8,
  lag: [0.008, 0.02], turnEase: 0.05, maxLag: 0.22, trail: 0.2, trailEase: 0.3,
  sway: { amount: 0.1, freq: 0.7, walk: 1.8, lag: 0.6 },
  swing: { freq: 6, damping: 0.6 },
  flick: { swell: 0.3, time: 0.25 },
  stunned: { droop: 1.8, freq: 0.6 },
  bands: 3,
  color: { fill: 0x16341c, band: 0x5a3517, outline: 0x86c454, glow: 0x6cc040 },
  line: 0.05, glowLine: 0.16, glowAlpha: 0.22,
};

// The Lemur's crescents (CrescentLook in src/enemies/attackView.js): the Goblin's orb as a
// white-hot crescent, spinning `spin` rad/s like a boomerang, in the same glow, trailing a
// streak along the curve it has flown (up to ATTACK_FX.projectile.trailLength). Sizes ×
// the crescent's size.
export const CRESCENT = { spin: 15, glowSize: 3, glowAlpha: 0.7, pulseSpeed: 9, trailWidth: 0.55, trailAlpha: 0.8 };

// The Boxer's fists (src/enemies/boxerRig.js): red circles conjured out of thin air for each
// attack, detached from its body, and gone again once it lands. Poses place a fist in the
// Boxer's frame (+x forward, +y to its right, world units): `r` out from the centre at
// angle `phi` (radians), `size` its radius. Poses are for the right fist; the left mirrors
// them. Cosmetic, except that the hook's and the flurry's hitboxes are the fists, through
// these same poses (hookFist, punchFist).
//   hook    conjured `drawIn` round ahead of `ready` and drawn back there through the
//           wind-up, then swung round to `through`, past the middle ahead, bowing `bulge`
//           further out midway, growing as it goes; it holds `hold` after the swing.
//   clap    both conjured behind its back at `ready`, drawn `drawIn` further back and
//           growing to `charged` through the wind-up, then brought round either side,
//           bowing `bulge` out, gathering speed to meet at the strike's `impactAt` ahead,
//           grown to `meet` and just touching; they hold `hold` there.
//   flurry  none until it throws. Each punch bursts out of the body at its hand's shoulder
//           (`from`) and shoots straight out to `reach` along its angle, growing to
//           `size`, then is drawn back in, fading out over the last `1 - fadeFrom` of the
//           way back. Its smear is its own (`trail`): longer, wider and brighter, so the
//           punches overlapping make a mess of smears; drawn back, the smear of the way
//           out shrinks away over `turn` seconds.
// A fist forms over `manifest` seconds (growing from `from` of its size as it fades in),
// and vanishes swelling by `vanish.grow` as it fades over `vanish.time`. Through a wind-up
// it strains, juddering `strain.shake` at `strain.freq` Hz (more as the strike nears).
// `glow`: a soft light behind it, × its radius, brighter (`hot`) while it can hurt, when it
// also burns white-hot (`heat`: the white's alpha). A smear trails each fist in flight,
// back along the last `trail.life` seconds of its path, as wide as it (× `width`),
// tapering to `root` of that at its far end (0 if not given).
// `impact`: the clap's flash where the fists meet and a ring racing out to the struck
// circle's edge.
export const FISTS = {
  hook: { ready: { phi: 1.85, r: 0.85, size: 0.18 }, through: { phi: -0.55, r: 1, size: 0.33 }, drawIn: 0.4, bulge: 0.25, hold: 0.08 },
  clap: { ready: { phi: 2.45, r: 0.72, size: 0.17 }, charged: 0.24, meet: 0.34, drawIn: 0.3, bulge: 0.5, hold: 0.1 },
  flurry: { from: { phi: 0.9, r: 0.24, size: 0.13 }, reach: 2.1, size: 0.3, fadeFrom: 0.6, turn: 0.05, trail: { life: 0.2, alpha: 0.9, width: 1.4, root: 0.45, samples: 12 } },
  manifest: 0.12, from: 0.3,
  vanish: { time: 0.16, grow: 0.6 },
  strain: { shake: 0.025, freq: 14 },
  glow: { size: 3.2, alpha: 0.35, hot: 0.75 },
  heat: 0.6,
  trail: { life: 0.1, alpha: 0.55, width: 0.9, samples: 8 },
  impact: {
    flash: { size: 1.3, grow: 1.8, time: 0.16, alpha: 0.75 },
    ring: { time: 0.24, alpha: 0.8 },
    sparks: { count: 10, speed: 7, lifetime: 0.3, size: 0.32, coneDeg: 50 },
  },
  color: { fill: 0x3a0a10, rim: 0xff4a58 },
};

// The Corsair's scimitar (src/enemies/corsairRig.js), held in one hand at its side and
// swapped to the other side by every swing. Poses place it in the Corsair's frame (+x
// forward, +y to its right, world units): the guard `r` out from the centre at angle `phi`,
// the blade pointing `rot`, `grow` making it bigger, and `flip` which way up it is (1: its
// edge facing left, -1: right; between, the wrist rolling over). Poses are for the blade on
// its right side; on its left they are mirrored. Angles in radians. Cosmetic, except that
// the slash's hitbox is the blade, through these same poses (scimitarSwingPose).
//   slash   drawn back on its side through the wind-up, then swung across the front to
//           `slashThrough`, past the middle on the other side; there it settles to rest,
//           rolling the blade over so the edge faces back the way it came.
//   rush    crouched with the blade drawn far back (`rushReady`), then swung from side to
//           side with every step of the charge (CorsairRush): out of `slashReady`, across
//           to `slashThrough`, then drawn back on that side, rolling over, for the next.
//           Stopping, it twirls the blade a full turn (`flourish`) as it settles to rest.
// Through a wind-up it strains, drawn back a little further (`strain.rot`) and juddering.
// `trail`: a smear behind the blade as it swings, from `inner` (× its length) to the tip,
// trailing `life` seconds (`rushLife` in a rush, where the swings come thick and fast).
export const SCIMITAR = {
  poses: {
    idle: { phi: 1.62, r: 0.66, rot: 0.3, grow: 0, flip: 1 }, // at its side, the point ahead
    slashReady: { phi: 2.05, r: 0.68, rot: 2.15, grow: 0.06, flip: 1 }, // drawn back on its side
    slashThrough: { phi: -0.85, r: 0.64, rot: -1.25, grow: 0.22, flip: 1 }, // swung across to the other side
    rushReady: { phi: 2.4, r: 0.64, rot: 2.8, grow: 0.04, flip: 1 }, // crouched, drawn far back
    stunned: { phi: 1.55, r: 0.74, rot: 1.25, grow: 0, flip: 1 }, // knocked loose, hanging out to the side
  },
  readyIn: 0.6, // fraction of the wind-up spent getting into the ready pose; then it strains
  strain: { rot: 0.16, shake: 0.03, freq: 12 },
  settleTime: 0.3, // back to rest, or into a stunned droop
  flourish: { time: 0.5, turns: 1 },
  hover: { amount: 0.03, freq: 0.7 }, // at rest it bobs in and out (Hz)
  gait: { stride: 2.6, sway: 0.1 }, // stride: gait radians per unit walked
  trail: { life: 0.12, rushLife: 0.05, inner: 0.3, alpha: 0.55, samples: 10 },
  // Crashing: the impact's flash and steel sparks off the blade, and dust thrown up.
  crash: {
    flash: { size: 1.2, grow: 1.7, time: 0.16, alpha: 0.7 },
    sparks: { count: 16, speed: 9, lifetime: 0.4, size: 0.36, coneDeg: 110, color: 0xfff2c0 },
    dust: { count: 12, speed: [1.6, 2.8], size: [0.5, 0.85], life: [0.6, 1], alpha: 0.6, grow: 1.8, color: 0xd8b070, fade: 0x4a3816 },
  },
  // Skidding to a stop: dust kicked up at its feet, every `every` seconds while it is still
  // moving faster than `minSpeed`.
  skid: { every: 0.05, minSpeed: 1.5, dust: { size: [0.35, 0.6], life: [0.35, 0.6], alpha: 0.45, grow: 1.5, color: 0xd8b070, fade: 0x4a3816 } },
};

// The Corsair's cape (src/enemies/cape.js): one white cloth hanging off the back of its
// shoulders, simulated as cloth. It is a sheet `columns` points wide and `rows` long, its
// top row pinned round the body's back, `pins.r` out from its centre, from `pins.spread`
// degrees to one side of straight back to as far to the other. At rest each column hangs
// `segment` a row, the middle one straight back and those out to the sides fanning up to
// `fan` degrees off it. The points move freely (Verlet: each keeps going as it was, losing
// `drag` of its speed a step) and are held together by sticks (down, across and corner to
// corner) that stop it stretching past their rest lengths but let it bunch up, easing back
// out only `bunch` as hard, the corner to corner ones taking back just `shear` of what they
// are off by a pass, so it folds and ripples rather than swinging about as one stiff sheet. It trails behind as the body
// moves and swings round as it turns (its facing eased over `turnEase` seconds, so the AI's
// little twitches of it don't shake the cloth). Each point is also pulled toward its rest place
// behind the body by `stiffness` (/s²; root row, hem), so it hangs back rather than
// floating; stunned, that pull drops to `stunned` of itself and it sags. It flutters: a wave running down it (`lag` radians a row
// later and `across` a column, `freq` Hz from still to `top` speed) pushes each point
// sideways by up to `amount` (u/s², more toward the hem, `idle` of that at rest). Points
// are pushed out of the body (`clear` from its centre), and wherever it has folded over
// itself, drawn `unfold` of the way back toward rest a step. Drawn a quad at a time, each
// shaded by how bunched up it is against its rest size (`fold`: from that ratio, darkest,
// to that, lightest), white with a gold `hem`.
export const CAPES = {
  rows: 7, columns: 5, segment: 0.1, pins: { r: 0.4, spread: 68 }, fan: 22, turnEase: 0.06,
  drag: 0.04, iterations: 4, shear: 0.35, bunch: 0.3, stiffness: [40, 6], stunned: 0.3, clear: 0.47, unfold: 0.06, flipped: 0.15,
  flutter: { amount: 220, idle: 0.08, freq: [1.2, 3], top: 6, lag: 0.9, across: 0.6 },
  fold: [0.4, 0.95],
  color: { light: 0xf6f2e6, shadow: 0x8e887a, outline: 0xfff3c8, glow: 0xffe08a, hem: 0xe0ac2a },
  line: 0.035, glowLine: 0.14, glowAlpha: 0.25, hem: 0.05,
};

// The Weaver's legs (src/enemies/weaverRig.js): eight, four a side, each from a hip on its
// head out to a foot, a `femur` then a `tibia` long, the knee bent out away from the body.
// In its frame (+x forward, +y to its right, world units), `legs` lists its right legs,
// front first, as [hip x, hip y, foot x, foot y] with the foot where it rests (the left
// ones mirror them). Walking, each foot stays planted on the floor until it is
// `step.threshold` from where it would rest, then steps there in `step.time`, aimed
// `step.lead` seconds of the Weaver's velocity ahead, swinging `step.lift` out on the way;
// one too far for the leg to reach (`step.reach` × the leg's length) steps at once. Legs
// step in two sets of four (each side's first and third with the other's second and
// fourth), never both at once, so it always stands on one. At rest its legs flex in and
// out (`breathe`, × their reach, Hz).
// An attack poses them (its `legs`, `poses`): each listed foot lifts off the floor and
// is held where it says (null: left walking), trembling `tremble` as the wind-up nears
// its end (× that, Hz), the walking feet set wider by `spread`. `haul`: hand over hand,
// each front foot reaching to `reach` and hauling back to `pull` in turn, `rate` times a
// second. Stunned or yanked, it draws every leg in to `curl` of its reach, twitching
// (`twitch`). Lifted feet chase where they are held over `ease` seconds.
// Drawn as a dark leg in a pale outline and a soft glow (`width`: the femur's and tibia's,
// `line`, `glowLine`), warming with its body as it winds up.
export const WEAVER_LEGS = {
  legs: [[0.19, 0.08, 0.47, 0.3], [0.155, 0.1, 0.24, 0.44], [0.115, 0.1, -0.08, 0.44], [0.075, 0.08, -0.35, 0.32]],
  femur: 0.26, tibia: 0.3,
  step: { threshold: 0.18, time: 0.08, lead: 0.1, lift: 0.07, reach: 0.97 },
  breathe: { amount: 0.025, freq: 0.6 },
  poses: {
    spit: { feet: [[0.45, 0.12], null, null, null], spread: 1.06 },
    rear: { feet: [[0.31, 0.4], [0.35, 0.5], null, null], spread: 1.1 },
    reel: { feet: ['haul', null, null, null], spread: 1.14 },
    bite: { feet: [[0.36, 0.06], null, null, null], spread: 1.05 },
  },
  haul: { reach: [0.55, 0.09], pull: [0.18, 0.26], rate: 4 },
  tremble: { amount: 0.024, freq: 11 },
  curl: { stunned: 0.55, yank: 0.7 },
  twitch: { amount: 0.035, freq: 7 },
  ease: 0.05,
  width: [0.036, 0.025], line: 0.014, glowLine: 0.08, glowAlpha: 0.18,
  color: { fill: 0x121118, outline: 0x8e88ac, glow: 0x7a70b8 },
};

// The Weaver's silk (src/enemies/web.js): `color` with a soft `glow`.
// A thread is a line of it `width` thick in a glow `glowWidth` wide, a knot at each end
// (`knot`: `strands` short strands `length` long round a dot `dot` across). Dew glints
// along it every `dew.spacing`, twinkling; now and then (`shimmer.every` seconds or so) a
// glint runs along it (`speed`, `length`). Fastened, and whenever it hurts someone, it
// twangs, quivering up to `twang.amount` across at `twang.freq` Hz, dying away over
// `twang.decay` s. Cut, its halves spring back to their knots over `snap.time`,
// wriggling; a thread that falls slack (its anchor hitting or parried, or too short to
// keep) sags away over `slack`. Paying out behind an anchor in flight, it ripples
// (`payout`: up to `amount` across, `waves` along it).
// An anchor or a ball of web in flight (SilkLook) is a knot of it in the hostile glow. The
// ball (`snare`) flies on a line of silk `line` thick back to the Weaver's mouth, bursting
// into strands round the player it catches (`wrap`) or splatting on a wall (`splat`), and
// winds them in a few loops of web (`cocoon`: `loops` of them, each `span` [min, max]
// radians round, `reach` × their radius out, winding on over `wrap` s). Each time they
// struggle, the web shakes (up to `shake` × their radius, settling over `settle` s) and
// the line jerks (quivering like a twang), throwing off `strain` sparks.
export const WEB = {
  color: 0xece6ff, glow: 0x8f7ff0,
  width: 0.035, glowWidth: 0.17, alpha: 0.9, glowAlpha: 0.3,
  knot: { strands: 6, length: 0.15, dot: 0.07 },
  dew: { spacing: 0.85, size: 0.12, twinkle: [0.8, 2.2] },
  shimmer: { every: 1.8, speed: 10, length: 1.1 },
  twang: { amount: 0.16, freq: 21, decay: 0.4 },
  snap: { time: 0.35, sparks: { count: 10, speed: 6, lifetime: 0.3, size: 0.24, coneDeg: 180 } },
  slack: 0.45,
  payout: { amount: 0.08, waves: 2.5 },
  silk: { glowSize: 3, glowAlpha: 0.75, pulseSpeed: 9, spin: 4, trailWidth: 1.1 }, // × the anchor's size
  snare: {
    line: 0.03,
    cocoon: { loops: 4, span: [2.4, 4.2], reach: 1.18, wrap: 0.16, shake: 0.18, settle: 0.25 },
    wrap: { count: 14, speed: 5, lifetime: 0.35, size: 0.26, coneDeg: 180 },
    splat: { count: 10, speed: 5, lifetime: 0.3, size: 0.24, coneDeg: 100 },
    strain: { count: 5, speed: 3, lifetime: 0.25, size: 0.2, coneDeg: 180 },
  },
};

// The Nova (src/enemies/novaRig.js): a ball of light with every one of `hues` mixing in it
// round a white-hot heart. It flickers, `rate` times a second (Hz) while whoever it hunts
// is `far` off, up to [1] once they are `near`, faster still as it swells (`swellRate`,
// by the end) and once lit (`litRate`: critical, launched or caught in a blast). Each
// flicker lights it up (`flash`: how much brighter) and swells its corona (`corona`:
// × body radius across, its alpha unlit and lit) and its colour drifts round the hues
// `hueSpeed` times a second. Swelling it grows `swell` larger, `critical` more as it goes
// critical, and `lit` once launched. Rushing and launched it sheds sparks of its colour
// (`rushTrail`, `trail`: `rate` a second).
// Its supernova (FlareAbility) is drawn as an enemy's death (`burst`, see DEATH_FX), with
// sparks in every hue, sized to the blast: its sizes are in 1/`reach` of its blastRadius, so
// the white ring reaches just the blast's edge.
const NOVA_HUES = [0xff4d5e, 0xff9a3c, 0xffe94a, 0x6dff7a, 0x48e6ff, 0x5a78ff, 0xb35cff, 0xff5cd8];
export const NOVA = {
  hues: NOVA_HUES,
  far: 9, near: 1.5, rate: [1.2, 9], swellRate: 22, litRate: 26, hueSpeed: 0.35,
  flash: 0.5, corona: { size: 3.4, alpha: [0.22, 0.65] },
  swell: 0.6, critical: 0.15, lit: 0.12,
  rushTrail: { rate: 30, count: 1, speed: 2, lifetime: 0.3, size: 0.3, coneDeg: 40 },
  trail: { rate: 70, count: 1, speed: 3, lifetime: 0.4, size: 0.4, coneDeg: 30 },
  burst: {
    reach: 6,
    flash: { size: 9, grow: 1.6, time: 0.3, alpha: 1 },
    rings: [
      { delay: 0, time: 0.3, from: 1, to: 6, alpha: 1, color: 0xffffff },
      { delay: 0.04, time: 0.55, from: 1.5, to: 8, alpha: 0.7 },
    ],
    rays: { count: 10, length: [4, 8], width: [0.4, 0.7], time: [0.3, 0.5] },
    sparks: NOVA_HUES.map((color) => ({ count: 12, speed: 16, lifetime: 0.55, size: 0.5, coneDeg: 180, color })),
    stars: { count: 24, speed: [4, 11], size: [0.22, 0.42], life: [0.6, 1.2], color: 0xffffff },
    mist: { count: 14, speed: [2, 5], size: [1.2, 1.9], grow: 2.4, life: [0.5, 0.9], alpha: 0.4 },
    embers: null,
    shake: { duration: 0.3, strength: 0.35, frequency: 18 },
    ripple: { duration: 0.7, strength: 0.025, width: 0.07, glow: 0.5, grade: [0.92, 0.92, 0.96] },
  },
};

// The Jet's engines (src/enemies/jetRig.js): a flame out of each nozzle, `length` long
// and `height` across (its tongue about 0.4 of that) idling, wound up and flying (world
// units): a small pilot flame cruising, roaring up as it winds up. Round a core `core` of
// its length, flickering by ±`jitter` at `flicker` Hz (two mixed); over each nozzle a glow
// `glow.size` across. Its throttle eases between them over `ease` seconds. Wound up and
// flying, it sheds `sparks` off its nozzles (`windup` of the rate wound up). Over the last
// `roll.time` of each dash's wind-up (chained ones too) it barrel-rolls once, its wings
// turning edge-on (no thinner than `roll.edge` of their span) and over.
export const JET = {
  ease: 0.1,
  roll: { time: 0.57, edge: 0.1 }, // within JetDash's chainWindUpTime, or a chained roll starts part-way over
  flame: {
    length: [0.15, 1.05, 1.45], height: [0.14, 0.31, 0.36], core: 0.55, jitter: 0.14, flicker: [11, 17], alpha: 0.95,
    color: 0xff3a1e, hotColor: 0xff7a24, coreColor: 0xffa860, hotCore: 0xfff0dc,
  },
  glow: { size: [0.34, 0.83, 1], alpha: [0.3, 0.7, 0.85], color: 0xff4a20 },
  sparks: { rate: 40, windup: 0.4, count: 1, speed: 3, lifetime: 0.25, size: 0.22, coneDeg: 14, color: 0xff7a2a },
};

// The Alembic (type blight, src/enemies/blightRig.js), a still for poison made a guardian:
// a ten-sided shell of plates round a heart of toxic nebula, each part of it drawn on its
// own so its rig can move it. In its frame (+x forward, +y to its right, world units; see
// blightParts): `valves`, `count` iris valves round its rim `r` out, the first straight
// ahead, each `size` round (its radius); `pods`, `count` canisters of toxin `r` out, the
// first `angle`° round, each set into the conduit out to a valve, lying along the way
// out, each `size` (half its width; it is longer than wide); and its `core`, a star of
// poison in a glass sphere at its centre, `size` round.
// Each valve's iris (`iris`) is `blades` blades closing over a recess `recess` (× its size)
// round, shut to `shut` of that and opening to `wide`, turning `turn` radians as they do;
// its toxin forms over its centre, `muzzle` (× its size) further out.
// Idle it pumps (`pump`: swelling `across` and shrinking `along` its facing by those
// fractions and back, `rate` times a second, in a quick beat, `beat` sharpening it), its
// canisters slide out of their sockets and back `bob` (× their size), one after another
// round it, `bobRate` times a second, the toxin in each brightening and fading at its own
// pace (`glowRate`, × `pace`); its gear ring (`gear`: `r` out, `ticks` round, every
// `major`th longer, turning `spin` turns a second) and the ring round its core (`orbit`:
// `r` × the core's size, turning `spin`, `nodes` riding it) turn opposite ways; and toxin
// runs out along the conduits from its core to each valve (`flow`: `pulses` on each,
// `speed` along it a second, `rush` times faster while it winds up). Now and then a valve
// vents (`vent`: its iris opening to `open` for `time`, every `every` seconds or so,
// letting out a puff of gas, `puff`), a creak rolls out of it (every `creak` seconds or
// so) and vapour drifts off its rim (`vapour`, a second). Its colours: `colors`.
// Each part warms with its body as it winds up or dies, only `warm` as strongly (a whole
// part takes it far harder than the body's thin outline). Irises open over `open` seconds
// and close over `close`. A valve kicks back `kick` (× its size) as it fires and settles
// over `kickTime`; a canister about to launch (BlightHeads) is pushed out by the ability,
// swells by `strain.grow`, trembles `strain.shake` (× its size) and glows hotter.
// Launched, it leaves in a jet of gas (`launch`), and a new one slides up out of its empty
// socket (the ability's regrowDelay and regrowTime).
// Dying (its `dying`, longer than other guardians'), its valves and canisters blow off one
// by one in a random order, from `burst.from` to `burst.to` of the way through, crowding
// together toward the end (`burst.ease` < 1). Each strains first for `burst.strain`
// seconds, pushed out `burst.pull` (× its size), trembling up to `burst.shake`, a valve's
// iris flung wide, then blows off in a jet of gas (`burst.gas`) and sparks
// (`burst.sparks`) and flies off at `burst.speed` (slowing with `burst.drag`), spinning at
// up to `burst.spin`, shrinking to `burst.shrink` and fading over `burst.fly`. Meanwhile
// it races, its rings spinning and its toxin rushing `race` times as fast.
export const BLIGHT = {
  valves: { count: 10, r: 0.98, size: 0.2 },
  pods: { count: 5, r: 0.5, angle: 0, size: 0.115 },
  core: { size: 0.2 },
  iris: { blades: 6, recess: 0.72, shut: 0.12, wide: 0.88, turn: 1.1, muzzle: 0.1 },
  pump: { across: 0.018, along: 0.012, rate: 0.55, beat: 3 },
  pace: [0.75, 1.3], bob: 0.16, bobRate: 0.3, glowRate: 0.7,
  gear: { r: 0.75, ticks: 40, major: 4, spin: 0.025 },
  orbit: { r: 1.4, spin: -0.1, nodes: 3 },
  flow: { pulses: 2, speed: 0.55, rush: 3 },
  vent: { every: [8, 20], time: [0.45, 0.8], open: 0.5, puff: { count: 4, speed: 2.2, lifetime: 0.6, size: 0.6, coneDeg: 25, color: 0x8fe04a } },
  creak: [6, 12],
  vapour: { rate: 2, count: 1, speed: 0.8, lifetime: 1, size: 0.6, coneDeg: 30, color: 0x5ab02a },
  colors: {
    blade: 0x2c3a28, seam: 0xa8dc6a, aperture: 0x060c04, glow: 0x9cf05a,
    conduit: 0x121a12, toxin: 0x7cd23a, hot: 0xe0ffa8,
    gear: 0x8fbf5a, socket: 0x040704, socketRim: 0x5a8a32,
  },
  warm: 0.35, open: 0.22, close: 0.35, kick: 0.2, kickTime: 0.16,
  strain: { grow: 0.15, shake: 0.1 },
  race: 5,
  launch: { count: 10, speed: 6, lifetime: 0.5, size: 0.8, coneDeg: 30, color: 0x8fe04a },
  burst: {
    from: 0.08, to: 0.84, ease: 0.75, strain: 0.4, pull: 0.3, shake: 0.12,
    speed: [5, 9], drag: 2.5, spin: 9, shrink: 0.5, fly: 0.55,
    gas: { count: 14, speed: 7, lifetime: 0.7, size: 1, coneDeg: 35, color: 0x8fe04a },
    sparks: { count: 8, speed: 11, lifetime: 0.3, size: 0.4, coneDeg: 50, color: 0xfff3c8 },
  },
};

// The Alembic's toxin (BlobLook in src/enemies/attackView.js): a glowing orb of poison, a
// pale green `core` round a white-hot `heart`, a star's `glint` turning in it (`spin` turns
// a second), in a sickly `halo`. Sizes × the orb's size, except `trail` (world units). Its
// canisters (CanisterLook) fly in the same halo, tumbling end over end `tumble` turns a
// second, venting a trail of gas.
// A glob (BlightGlobs, src/enemies/glob.js) marks where it will land on the floor
// (`marker`, as the Seer's Omen's) and splats there into a pool of poison: it spreads out
// from `pool.from` of its size over `pool.spread` seconds with a flash, its edge rippling
// (`pool.ripple`: [lobes, × its radius, rad/s] for each wave), bubbles rising in it
// (`pool.bubbles` a second, each `size` (× its radius) across, popping after `life`), stars
// glinting in it (`pool.stars`: so many, each `size` (× its radius), twinkling `twinkle`
// times a second), fumes drifting up off it (`pool.fumes` a second), and shrinks and fades
// over `pool.fade` once it is spent. `splat`: the toxin flung out as it lands.
export const BLOB = {
  color: 0x6cc832, deep: 0x10240a, bright: 0xc8f582, pale: 0xb4ec78,
  halo: { size: 2.6, alpha: 0.55 },
  core: { size: 0.95, alpha: 1 },
  heart: { size: 0.9, alpha: 0.9 },
  glint: { size: 1.25, alpha: 0.8, spin: 0.5 },
  pulseSpeed: 4, trail: 1.3, trailWidth: 0.85,
  tumble: 0.9,
  launch: { count: 10, speed: 5, lifetime: 0.4, size: 0.6, coneDeg: 35 },
  marker: { lineWidth: 0.06, ringAlpha: 0.7, fillAlpha: 0.25, pulse: [2, 7] },
  splat: { count: 22, speed: 8, lifetime: 0.5, size: 0.8, coneDeg: 180 },
  pool: {
    from: 0.35, spread: 0.25, fade: 0.8, flash: 0.5,
    ripple: [[3, 0.05, 1.3], [5, 0.04, -2.1], [8, 0.02, 3.2]],
    fill: 0x1f4a12, fillAlpha: 0.62, inner: 0x3f8a22, innerAlpha: 0.3, rim: 0x8fe04a, rimAlpha: 0.65, rimWidth: 0.06,
    glow: { size: 2.4, alpha: 0.28 },
    bubbles: 7, bubble: { size: [0.06, 0.13], life: [0.4, 0.9] },
    stars: { count: 6, size: [0.05, 0.1], twinkle: [0.8, 2] },
    pop: { count: 3, speed: 2, lifetime: 0.25, size: 0.25, coneDeg: 180, color: 0xa8f060 },
    fumes: 4, fume: { count: 1, speed: 1.5, lifetime: 0.7, size: 0.4, coneDeg: 20, color: 0x5ab02a },
  },
};
