// Enemy types: stats, drops, visuals and AI. Chasers are the floor bosses.

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
    name: 'Shade', maxHealth: 9, damage: 1.3, radius: 0.5, mass: 3, linearDamping: 1,
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
  warden: {
    name: 'Warden', maxHealth: 500, damage: 6.5, radius: 0.49 * 2, mass: 100, linearDamping: 1,
    knockbackResistance: 0, knockbackMovementPause: 0.12,
    minAdrenalineDrops: 3, maxAdrenalineDrops: 5, isChaser: true, flashDuration: 0.14, particleOffset: 0.08, hitColor: 0xc8cfff, sfxPitch: 0.55,
    navFootprint: 3, // tiles; the Warden needs 3-wide passages
    visual: { kind: 'hexagon', width: 2, height: 0.890625 * 2, color: 0xffffff },
    ai: { ...AI_DEFAULTS, aggroRange: 12, orbitRadius: 4, attackEngageRange: 3.5, moveSpeed: 2, orbitSpeed: 1, repositionSpeed: 1,
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
    name: 'Seraph', maxHealth: 450, damage: 9, radius: 0.9, mass: 100, linearDamping: 1,
    knockbackResistance: 0, knockbackMovementPause: 0.12,
    minAdrenalineDrops: 3, maxAdrenalineDrops: 5, isChaser: true, flashDuration: 0.14, particleOffset: 0.08, hitColor: 0xb9a4ff, sfxPitch: 0.75,
    navFootprint: 3,
    visual: { kind: 'sprite', outline: 'seraph_idle', void: 'seraph_idle_void', size: 2.2, sparkleCount: 30 },
    ai: { ...AI_DEFAULTS, aggroRange: 12, orbitRadius: 6, attackEngageRange: 8, moveSpeed: 2.5, orbitSpeed: 1.6, repositionSpeed: 1.6,
      turnSmoothTime: 0.2,
      attacks: [
        { ability: 'SeraphDash', weight: 0.3 },
        { ability: 'SeraphRam', weight: 0.25 },
        { ability: 'SeraphMissiles', weight: 0.25 },
        { ability: 'SeraphLaser', weight: 0.2 },
      ] },
  },
};

export const ENEMY_COMBAT = { maxActiveAttackers: 3 };
