// Enemy types: stats, drops, visuals and AI. Chasers are the floor bosses. A `hurtbox`
// (convex polygon in the enemy's frame, +x forward) is where it can be struck, if not its
// round body (see game/hurtbox.js). One knocked `alongBlow` flies the way the player's
// swing was aimed, not straight away from it.

const AI_DEFAULTS = {
  aggroRange: 12, orbitRadius: 4, attackEngageRange: 0,
  moveSpeed: 3, orbitSpeed: 2, repositionSpeed: 2,
  movementResponsiveness: 0.35, preservedExternalVelocityLimit: 6,
  pathRefreshInterval: 0.25, pathGoalSearchRadius: 2, chaserPathGoalSearchRadius: 8,
  decisionDelayRange: { x: 0.8, y: 1.5 }, recoverDuration: 0.5,
  orbitPreference: 0.5, repositionDurationRange: { x: 0.5, y: 1.5 },
  turnSmoothTime: 0.1, maxTurnSpeed: Infinity, // rad/s
};

export const ENEMY_TYPES = {
  goblin: {
    name: 'Goblin', maxHealth: 5, damage: 1, radius: 0.5 * 0.9, mass: 3, linearDamping: 1,
    knockbackResistance: 0, knockbackMovementPause: 0.12,
    minAdrenalineDrops: 2, maxAdrenalineDrops: 3, isChaser: false, flashDuration: 0.14, particleOffset: 0.08, hitColor: 0x3ddc84, sfxPitch: 1.2,
    visual: { kind: 'sprite', outline: 'goblin_idle', void: 'goblin_idle_void', size: 1.5 * 0.9, sparkleCount: 20 },
    ai: { ...AI_DEFAULTS, aggroRange: 15, orbitRadius: 5, moveSpeed: 3, orbitSpeed: 3, repositionSpeed: 3, maxTurnSpeed: 3.5,
      attacks: [{ ability: 'GoblinThrow', weight: 1 }] },
  },
  striker: {
    name: 'Striker', maxHealth: 7, damage: 1, radius: 0.5, mass: 3, linearDamping: 1,
    knockbackResistance: 0, knockbackMovementPause: 0.12,
    minAdrenalineDrops: 2, maxAdrenalineDrops: 3, isChaser: false, flashDuration: 0.14, particleOffset: 0.08, hitColor: 0xffad3b, sfxPitch: 1,
    visual: { kind: 'sprite', outline: 'striker_idle', void: 'striker_idle_void', size: 1.5, sparkleCount: 22 },
    ai: { ...AI_DEFAULTS, aggroRange: 12, orbitRadius: 3, moveSpeed: 3, orbitSpeed: 3, repositionSpeed: 3, maxTurnSpeed: 5,
      attacks: [{ ability: 'StrikerDash', weight: 1 }] },
  },
  // A hulking brute hauling a star-maul, a haft topped with a chunk of fallen star. Slow and
  // heavy, it steps into every blow: a wide swing, or an overhead slam down a long strip.
  // The maul is its own sprite, swung by the attacks (`rig`, see maulerRig.js).
  mauler: {
    name: 'Mauler', maxHealth: 13, damage: 1.5, radius: 0.52, mass: 5, linearDamping: 1,
    knockbackResistance: 0.2, knockbackMovementPause: 0.12,
    minAdrenalineDrops: 2, maxAdrenalineDrops: 3, isChaser: false, flashDuration: 0.14, particleOffset: 0.1, hitColor: 0xd2742f, sfxPitch: 0.8,
    visual: { kind: 'sprite', outline: 'mauler_idle', void: 'mauler_idle_void', size: 1.47, sparkleCount: 22, rig: 'maul' },
    ai: { ...AI_DEFAULTS, aggroRange: 12, orbitRadius: 3.5, moveSpeed: 2.4, orbitSpeed: 2, repositionSpeed: 2, maxTurnSpeed: 3,
      attacks: [{ ability: 'MaulerSwing', weight: 0.65 }, { ability: 'MaulerSlam', weight: 0.35 }] },
  },
  // A dark grey shadow, its back drawn out into three points split by sharp notches, its
  // arms crescent blades that float free at its sides, folded round its body at rest. It
  // steps into a stab-and-slash from one side, then the other, or cocks both arms and
  // lunges with them in a dash much like the player's. The arms are their own sprites,
  // moved by the attacks (`rig`, see shadeRig.js).
  shade: {
    name: 'Shade', maxHealth: 10, damage: 1.3, radius: 0.5, mass: 3, linearDamping: 1,
    knockbackResistance: 0.1, knockbackMovementPause: 0.12,
    minAdrenalineDrops: 2, maxAdrenalineDrops: 3, isChaser: false, flashDuration: 0.14, particleOffset: 0.08, hitColor: 0x9aa1ad, sfxPitch: 1.05,
    visual: { kind: 'sprite', outline: 'shade_idle', void: 'shade_idle_void', size: 1.62, sparkleCount: 22, rig: 'blades' },
    ai: { ...AI_DEFAULTS, aggroRange: 12, orbitRadius: 3.5, moveSpeed: 3.2, orbitSpeed: 2.6, repositionSpeed: 2.6, maxTurnSpeed: 4.5,
      attacks: [{ ability: 'ShadeSlashes', weight: 0.6 }, { ability: 'ShadeLunge', weight: 0.4 }] },
  },
  // A dark blue caster, a half-circle gulf cut into its front and a round hole through it
  // to either side behind. It sees far, keeps its distance and conjures balls of mist bigger
  // than itself: one it throws up out of sight to come down where the player is heading,
  // the other it hurls straight at them.
  seer: {
    name: 'Seer', maxHealth: 9, damage: 1.3, radius: 0.47, mass: 3, linearDamping: 1,
    knockbackResistance: 0, knockbackMovementPause: 0.12,
    minAdrenalineDrops: 2, maxAdrenalineDrops: 3, isChaser: false, flashDuration: 0.14, particleOffset: 0.08, hitColor: 0x3d63ff, sfxPitch: 0.9,
    visual: { kind: 'sprite', outline: 'seer_idle', void: 'seer_idle_void', size: 1.45, sparkleCount: 20 },
    ai: { ...AI_DEFAULTS, aggroRange: 22, orbitRadius: 6.5, moveSpeed: 2.6, orbitSpeed: 2.4, repositionSpeed: 2.4, maxTurnSpeed: 3.5,
      attacks: [{ ability: 'SeerOmen', weight: 0.6 }, { ability: 'SeerBolt', weight: 0.4 }] },
  },
  // A dark green ball with brown patches and a long ringed tail ending in a spade, which
  // lags after it and whips round as it turns (`rig`, see lemurRig.js). Nimble, it keeps its
  // distance and flings spinning crescents: whirling round one way then the other, a crescent
  // flung out to each side to curve back in on the player, or turning its back on them and
  // firing two straight down its tail.
  lemur: {
    name: 'Lemur', maxHealth: 12, damage: 1.5, radius: 0.45, mass: 3, linearDamping: 1,
    knockbackResistance: 0, knockbackMovementPause: 0.12,
    minAdrenalineDrops: 2, maxAdrenalineDrops: 3, isChaser: false, flashDuration: 0.14, particleOffset: 0.08, hitColor: 0x7fbf4f, sfxPitch: 1.1,
    visual: { kind: 'sprite', outline: 'lemur_idle', void: 'lemur_idle_void', size: 1.45, sparkleCount: 18, rig: 'tail' },
    ai: { ...AI_DEFAULTS, aggroRange: 14, orbitRadius: 5, moveSpeed: 3.2, orbitSpeed: 3, repositionSpeed: 3, maxTurnSpeed: 7,
      attacks: [{ ability: 'LemurSpin', weight: 0.55 }, { ability: 'LemurVolley', weight: 0.45 }] },
  },
  // A dark red decagon, a brawler. It has no hands until it fights: it conjures red fists
  // out of thin air, detached from its body, that grow as they swing (`rig`, see
  // boxerRig.js). As quick as the Striker but heavier-hitting: a hook from one side as it
  // steps in; both fists drawn behind its back, then brought round to clap together in
  // front, striking all round there like the Mauler's slam; or a big step in and a flurry
  // of punches across a wide cone that only a parry stops.
  boxer: {
    name: 'Boxer', maxHealth: 23, damage: 1.7, radius: 0.56, mass: 4, linearDamping: 1,
    knockbackResistance: 0.15, knockbackMovementPause: 0.12,
    minAdrenalineDrops: 2, maxAdrenalineDrops: 3, isChaser: false, flashDuration: 0.14, particleOffset: 0.1, hitColor: 0xd8303e, sfxPitch: 0.9,
    visual: { kind: 'sprite', outline: 'boxer_idle', void: 'boxer_idle_void', size: 1.7, sparkleCount: 24, rig: 'fists' },
    ai: { ...AI_DEFAULTS, aggroRange: 12, orbitRadius: 3.2, moveSpeed: 3, orbitSpeed: 2.6, repositionSpeed: 2.6, maxTurnSpeed: 4.5,
      attacks: [{ ability: 'BoxerHook', weight: 0.5 }, { ability: 'BoxerClap', weight: 0.25 }, { ability: 'BoxerFlurry', weight: 0.25 }] },
  },
  // A light blue gun platform: a bubbly ring of six bumps with three cannons side by side
  // across its front, the middle one a little shorter. It keeps its distance and fires all
  // three straight ahead: one after another in a random order, or all at once, three times over.
  gunner: {
    name: 'Gunner', maxHealth: 20, damage: 1.5, radius: 0.5, mass: 4, linearDamping: 1,
    knockbackResistance: 0.1, knockbackMovementPause: 0.12,
    minAdrenalineDrops: 2, maxAdrenalineDrops: 3, isChaser: false, flashDuration: 0.14, particleOffset: 0.1, hitColor: 0x7fd6ff, sfxPitch: 0.95,
    visual: { kind: 'sprite', outline: 'gunner_idle', void: 'gunner_idle_void', size: 1.65, sparkleCount: 22 },
    ai: { ...AI_DEFAULTS, aggroRange: 15, orbitRadius: 6, moveSpeed: 2.6, orbitSpeed: 2.4, repositionSpeed: 2.4, maxTurnSpeed: 3,
      attacks: [{ ability: 'GunnerCascade', weight: 0.55 }, { ability: 'GunnerBarrage', weight: 0.45 }] },
  },
  // A dark yellow swordsman with pale patches, a white cape hanging off the back of its
  // shoulders that streams and flaps as it moves (`rig`, see corsairRig.js and cape.js). It
  // holds a scimitar at one side and swings it across to the other: a big step in with a
  // swing, or a rush of swinging steps, picking up speed, straight ahead until it hits
  // something.
  corsair: {
    name: 'Corsair', maxHealth: 22, damage: 1.6, radius: 0.5, mass: 4, linearDamping: 1,
    knockbackResistance: 0.1, knockbackMovementPause: 0.12,
    minAdrenalineDrops: 2, maxAdrenalineDrops: 3, isChaser: false, flashDuration: 0.14, particleOffset: 0.1, hitColor: 0xe8b830, sfxPitch: 0.95,
    visual: { kind: 'sprite', outline: 'corsair_idle', void: 'corsair_idle_void', size: 1.6, sparkleCount: 22, rig: 'scimitar' },
    ai: { ...AI_DEFAULTS, aggroRange: 13, orbitRadius: 3, moveSpeed: 3.2, orbitSpeed: 2.6, repositionSpeed: 2.6, maxTurnSpeed: 4.5,
      attacks: [{ ability: 'CorsairSlash', weight: 0.6 }, { ability: 'CorsairRush', weight: 0.4 }] },
  },
  // A small spider of starlight, all but black, with a dim silver edge, a pale hourglass on
  // its abdomen and a cluster of glowing eyes, scuttling on eight legs that plant and step
  // (`rig`, see weaverRig.js). Its one attack is a ball of web thrown on a line that,
  // catching the player, reels them in for a bite. Whatever else is going on, it strings
  // the room with threads from wall to wall that hurt whoever touches them, left there for
  // good (its passive weave, web.js), and out of the fight it wanders the room (`wander`:
  // to a spot up to `reach` away at `speed`, pausing `pause` s between), weaving more slowly.
  // It sees far, so weaving out to the walls doesn't take it out of the fight.
  weaver: {
    name: 'Weaver', maxHealth: 18, damage: 1.5, radius: 0.36, mass: 3.5, linearDamping: 1,
    knockbackResistance: 0.05, knockbackMovementPause: 0.12,
    minAdrenalineDrops: 2, maxAdrenalineDrops: 3, isChaser: false, flashDuration: 0.14, particleOffset: 0.08, hitColor: 0xa99be8, sfxPitch: 1.05,
    visual: { kind: 'sprite', outline: 'weaver_idle', void: 'weaver_idle_void', size: 1.15, sparkleCount: 10, rig: 'legs' },
    ai: { ...AI_DEFAULTS, aggroRange: 20, orbitRadius: 5.5, moveSpeed: 3.6, orbitSpeed: 3, repositionSpeed: 3.2, maxTurnSpeed: 6,
      wander: { speed: 1.6, reach: 6, pause: [0.8, 2.2] },
      attacks: [{ ability: 'WeaverReel', weight: 1 }], passives: [{ ability: 'WeaverWeave' }] },
  },
  // A ball of light in every colour, flickering faster and faster as it closes in (`rig`,
  // see novaRig.js). It rushes the player, swells up and bursts in a supernova that hurts
  // anything near, enemies too. Light, it barely resists knockback: a hit sends it flying,
  // still swelling, and a parry launches it to burst on whatever it hits.
  nova: {
    name: 'Nova', maxHealth: 8, damage: 4, radius: 0.4, mass: 1, linearDamping: 1.5,
    knockbackResistance: 0.15, knockbackMovementPause: 0.45, alongBlow: true,
    minAdrenalineDrops: 2, maxAdrenalineDrops: 3, isChaser: false, flashDuration: 0.14, particleOffset: 0.08, hitColor: 0xffd27a, sfxPitch: 1.15,
    visual: { kind: 'sprite', outline: 'nova_idle', void: 'nova_idle_void', size: 1.36, sparkleCount: 8, rig: 'nova' },
    ai: { ...AI_DEFAULTS, aggroRange: 13, orbitRadius: 5, moveSpeed: 3, orbitSpeed: 2.4, repositionSpeed: 2.55, maxTurnSpeed: 8,
      preservedExternalVelocityLimit: 20, decisionDelayRange: { x: 0.4, y: 1 },
      attacks: [{ ability: 'NovaFlare', weight: 1 }] },
  },
  // A squat slate-grey brute, broad and shallow, crouched behind a great curved shield it
  // always turns to face the player, slowly (`rig`, see bulwarkRig.js). A blow coming from
  // within `guard.arcDeg` of its facing glances off the shield with a spark and a ping (only
  // a parry's counter gets through), so it can only be hurt from the sides and back. Its
  // hurtbox takes in the shield, so a blow on it lands there to glance; with the shield
  // gone it's the body alone (`guard.hurtbox`). It bashes shield-first, and parried there
  // its guard breaks: the shield flies off its arm and it's open all round for
  // `guard.brokenTime`, until the shield flies back. Or it plants the shield, sending a
  // shockwave along the floor in a cone ahead. Squat, it doesn't block the others' line of
  // attack (`shootOver`): they shoot past it.
  bulwark: {
    name: 'Bulwark', maxHealth: 27, damage: 1.6, radius: 0.58, mass: 6, linearDamping: 1,
    knockbackResistance: 0.35, knockbackMovementPause: 0.12, shootOver: true,
    minAdrenalineDrops: 2, maxAdrenalineDrops: 3, isChaser: false, flashDuration: 0.14, particleOffset: 0.1, hitColor: 0x8e9db3, sfxPitch: 0.8,
    visual: { kind: 'sprite', outline: 'bulwark_idle', void: 'bulwark_idle_void', size: 1.5, sparkleCount: 22, rig: 'shield' },
    // The shield's outer edge (SHIELD_ART: r + thick / 2 out from SHIELD.poses.idle.ahead,
    // ±span / 2) round the body's back.
    hurtbox: [[0.57, 0], [0.52, 0.26], [0.37, 0.48], [0.13, 0.63], [-0.12, 0.57], [-0.33, 0.47], [-0.42, 0.26],
      [-0.42, -0.26], [-0.33, -0.47], [-0.12, -0.57], [0.13, -0.63], [0.37, -0.48], [0.52, -0.26]],
    guard: {
      arcDeg: 140, brokenTime: 2.6,
      hurtbox: [[0.34, 0.44], [0.22, 0.56], [-0.12, 0.56], [-0.33, 0.47], [-0.42, 0.26],
        [-0.42, -0.26], [-0.33, -0.47], [-0.12, -0.56], [0.22, -0.56], [0.34, -0.44]],
    },
    ai: { ...AI_DEFAULTS, aggroRange: 12, orbitRadius: 3.2, moveSpeed: 2.3, orbitSpeed: 1.7, repositionSpeed: 1.9, maxTurnSpeed: 4.6,
      turnSmoothTime: 0.22,
      attacks: [{ ability: 'BulwarkBash', weight: 0.55 }, { ability: 'BulwarkPlant', weight: 0.45 }] },
  },
  // A jet rimmed orange running to red, kin to the Seraph and a little bigger than the player:
  // an arrowhead with straight wings and clipped tips, twin engines burning at its back (`rig`,
  // see jetRig.js). It keeps far off, circling, and never stops to wind up: it dashes straight
  // through where the player stood and on as far again past, over walls and all, up to three
  // times in a row; or swoops out to one side and comes round onto them.
  jet: {
    name: 'Jet', maxHealth: 20, damage: 1.6, radius: 0.44, mass: 3.2, linearDamping: 1,
    knockbackResistance: 0.05, knockbackMovementPause: 0.12,
    minAdrenalineDrops: 2, maxAdrenalineDrops: 3, isChaser: false, flashDuration: 0.14, particleOffset: 0.1, hitColor: 0xff7a2a, sfxPitch: 1.05,
    visual: { kind: 'sprite', outline: 'jet_idle', void: 'jet_idle_void', size: 1.33, sparkleCount: 12, rig: 'jet' },
    hurtbox: [[0.48, 0], [-0.4, 0.45], [-0.47, 0.39], [-0.48, 0.17], [-0.48, -0.17], [-0.47, -0.39], [-0.4, -0.45]], // nose, wingtips and engines
    ai: { ...AI_DEFAULTS, aggroRange: 16, orbitRadius: 6.5, moveSpeed: 6.1, orbitSpeed: 5.4, repositionSpeed: 5.8, maxTurnSpeed: 6,
      turnSmoothTime: 0.12,
      attacks: [{ ability: 'JetDash', weight: 0.6 }, { ability: 'JetSwoop', weight: 0.4 }] },
  },
  warden: {
    name: 'Warden', maxHealth: 700, damage: 6.5, radius: 0.49 * 2, mass: 100, linearDamping: 1,
    knockbackResistance: 0, knockbackMovementPause: 0.12,
    minAdrenalineDrops: 3, maxAdrenalineDrops: 5, isChaser: true, flashDuration: 0.14, particleOffset: 0.08, hitColor: 0xc8cfff, sfxPitch: 0.55,
    navFootprint: 3, // tiles; the Warden needs 3-wide passages
    visual: { kind: 'hexagon', width: 2, height: 0.890625 * 2, color: 0xffffff },
    hurtbox: [[1, 0], [0.5, 0.89], [-0.5, 0.89], [-1, 0], [-0.5, -0.89], [0.5, -0.89]], // its hexagon
    ai: { ...AI_DEFAULTS, aggroRange: 12, orbitRadius: 4, attackEngageRange: 3.5, moveSpeed: 2, orbitSpeed: 1, repositionSpeed: 1, maxTurnSpeed: 2.5,
      attacks: [
        { ability: 'WardenDash', weight: 0.25 },
        { ability: 'WardenSlam', weight: 0.2 },
        { ability: 'WardenPunch', weight: 0.35 },
        { ability: 'WardenGroundPound', weight: 0.2 },
      ] },
  },
  // An astral star-fighter: a delta wing with twin engines. Keeps its distance and attacks
  // from range more than the Warden does.
  seraph: {
    name: 'Seraph', maxHealth: 600, damage: 9, radius: 0.9, mass: 100, linearDamping: 1,
    knockbackResistance: 0, knockbackMovementPause: 0.12,
    minAdrenalineDrops: 3, maxAdrenalineDrops: 5, isChaser: true, flashDuration: 0.14, particleOffset: 0.08, hitColor: 0xb9a4ff, sfxPitch: 0.75,
    navFootprint: 3,
    visual: { kind: 'sprite', outline: 'seraph_idle', void: 'seraph_idle_void', size: 2.2, sparkleCount: 0 },
    hurtbox: [[0.88, 0], [-0.77, 0.7], [-0.77, -0.7]], // nose and wingtips, leaving out the tail
    ai: { ...AI_DEFAULTS, aggroRange: 12, orbitRadius: 6, attackEngageRange: 8, moveSpeed: 2.5, orbitSpeed: 1.6, repositionSpeed: 1.6,
      turnSmoothTime: 0.2,
      attacks: [
        { ability: 'SeraphDash', weight: 0.3 },
        { ability: 'SeraphRam', weight: 0.25 },
        { ability: 'SeraphMissiles', weight: 0.25 },
        { ability: 'SeraphLaser', weight: 0.2 },
      ] },
  },
  // The Alembic: a still for poison made a guardian, a ten-sided shell of plates round a
  // heart of toxic nebula, an iris valve at each corner, canisters of toxin in its body and
  // a star of poison at its core (`rig`, see blightRig.js): idle it pumps, its gears turn,
  // toxin runs out to its valves and they vent; dying, its valves and canisters blow off one
  // by one before it bursts (`dying`, over DEATH_FX).
  // Slow, it keeps its distance and floods the floor with toxin: rings of orbs out of every
  // valve, canisters launched to hunt the player, a spew all round, and globs that splat
  // into pools of poison.
  blight: {
    name: 'Alembic', maxHealth: 1100, damage: 7, radius: 1.15, mass: 120, linearDamping: 1,
    knockbackResistance: 0, knockbackMovementPause: 0.12,
    minAdrenalineDrops: 3, maxAdrenalineDrops: 5, isChaser: true, flashDuration: 0.14, particleOffset: 0.1, hitColor: 0x7cd23a, sfxPitch: 0.7,
    navFootprint: 3,
    visual: { kind: 'sprite', outline: 'blight_idle', void: 'blight_idle_void', size: 3.2, sparkleCount: 34, rig: 'alembic' },
    dying: { time: 2.8, sound: 'blightDying' },
    ai: { ...AI_DEFAULTS, aggroRange: 12, orbitRadius: 6, attackEngageRange: 8, moveSpeed: 2.5, orbitSpeed: 1.5, repositionSpeed: 1.5,
      maxTurnSpeed: 2, turnSmoothTime: 0.25,
      attacks: [
        { ability: 'BlightRing', weight: 0.3 },
        { ability: 'BlightHeads', weight: 0.25 },
        { ability: 'BlightSpew', weight: 0.2 },
        { ability: 'BlightGlobs', weight: 0.25 },
      ] },
  },
};

// Guardians lose patience as a floor drags on (src/game/guardianRage.js). A floor's fill
// time is how long the player should take there to fill the adrenaline meter they arrived
// with: `secondsPerPoint` for each point of it, so a bigger meter buys more time. For
// `calm` fill times the floor's guardians keep their pace, then it climbs by `climb` (×
// their own) with each fill time more, up to `max`. Reaching `angry` they roar (a sign over
// them, or at the screen's edge toward them, ANGER_SIGN); an Exalted state started on the
// floor (not one carried in) running out, or the first of the floor's spawners broken,
// drives them straight there, the clock jumping ahead to it. Breaking the last spawner
// drives them all the way to `max`, and they roar again. Pace speeds up only their
// walking, turning and decisions; their wind-ups, recoveries and cooldowns stay as they
// are. `glow`: the red haze an impatient guardian smoulders in, × its radius, full at
// `max`; `embers` a second.
export const GUARDIAN_RAGE = {
  secondsPerPoint: 6, calm: 1, climb: 1, angry: 2, max: 3,
  glow: { size: 5, alpha: 0.7, pulse: [0.8, 2.4] },
  embers: { rate: 14, count: 1, speed: 2.2, lifetime: 0.7, size: 0.32, coneDeg: 25, color: 0xff3a24 },
  roarVolume: 0.7, // heard at least this loud however far off it is
};

// A stunned enemy (parried, or by Anchor's shockwave; not one just recovering) has `count`
// little stars circling over it (src/enemies/stunMark.js): on a ring `orbit` × its radius
// out, squashed to `tilt` of that, centred `lift` × its radius up the screen (as if round its
// head), `speed` turns a second, each `size` × its radius across and twinkling `twinkle`
// times a second; they pop in over `popTime` and out the same.
export const STUN_MARK = {
  count: 3, orbit: 1.1, tilt: 0.4, lift: 0.8, speed: 0.8, size: 1.15, twinkle: 3, popTime: 0.12,
  color: 0xffe680, glow: { color: 0xffc830, size: 2.2, alpha: 0.6 }, alpha: 1,
};

// How many enemies can be attacking the player at once (from wind-up through the strike;
// the rest wait their turn), by floor (attackersOn in src/level/difficulty.js): `steps`
// set it from each listed floor on, and past the last one more joins every `every` + (as
// many as there are by then) floors: 4 from floor 9, 5 from 18, 6 from 28, 7 from 39...
// The playground keeps `playground`.
export const ENEMY_COMBAT = {
  attackers: { steps: [[1, 1], [2, 2], [4, 3], [9, 4]], every: 5, playground: 3 },
};
