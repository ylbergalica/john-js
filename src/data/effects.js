// Shared visual effects: spark bursts, frame animations and how enemy attacks read.

// Spark bursts; `size` is the spark's length in world units.
export const PARTICLES = {
  enemyHit: { count: 27, speed: 17, lifetime: 0.4, size: 0.66, coneDeg: 28, color: 0xffffff },
  enemyHitTinted: { count: 20, speed: 11.5, lifetime: 0.45, size: 0.48, coneDeg: 50 }, // colour: the enemy's hitColor
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
    // (every `sparkEvery` seconds, at the start and end).
    dying: {
      time: 1.8,
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
