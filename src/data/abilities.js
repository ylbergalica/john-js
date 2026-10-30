// Enemy attacks. Each enemy type lists which of these it uses (see enemies.js).
// `lockTime`: the enemy turns to follow the player through the wind-up, except for its
// last `lockTime` seconds, when its aim is fixed. Dashes and throws fire along the facing.
// Every attack flashes a parry cue just before it can hurt (ATTACK_FX.cue), where it comes
// from: a held weapon's head, a throw's muzzle, a laser's nose, missiles' engines, or else
// `cueAt` body radii ahead (default 1, the enemy's front).
// Dashes hurt only across the front `hitboxArcDeg` of their hitbox, as seen from its centre,
// so running into a dashing enemy's side or back is safe.

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
    dashForce: 30, hitboxRadius: 0.55, hitboxArcDeg: 150,
  },
  // The Mauler's maul. Both lunge `stepDistance` along the locked aim over `stepTime` as
  // they strike; `maul` says how the maul moves with them (maulerRig.js).
  // Swing: the maul crosses the front in `swingTime` as the Mauler lunges. The maul is the
  // hitbox (a charge, parried like one), hurting for `duration` as it sweeps across: from
  // `maulHit.reach[0]` to `[1]` along it from the grip, `maulHit.radius` either side (both
  // grown with the maul), at `maulHit.samples` points of its sweep each step so it can't
  // pass over the player between steps.
  MaulerSwing: {
    type: 'swing', tell: 'swing', cooldown: 2.2, range: 2.5, windUpTime: 0.62, lockTime: 0.22, duration: 0.18, recoveryTime: 0.25,
    damageMultiplier: 1, parryStunTime: 0.9, ...clearPath({ x: 1, y: 1 }, 0.3),
    swingTime: 0.12, stepDistance: 1.3, stepTime: 0.15, parryKnockback: 15,
    maulHit: { reach: [0.3, 0.8], radius: 0.3, samples: 4 },
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
  // The Lemur's crescents (`look: 'crescent'`): they spin like boomerangs and break on walls.
  // Both attacks form them on its tail's spade, `muzzle` out from its centre with the tail
  // stretched out, and fling them off it. Spin: it whirls a full turn one way in
  // `spinTime`, then, `spinGap` later, a full turn back, each with a little wind-back before
  // and overshoot after, its tail whipping round after it. Each turn flings a crescent off
  // the spade as the tail swings out to that side, to curve round onto where the player
  // stood when the spin began: out square to the side, so a half circle, unless that would
  // be tighter than `minArcRadius` (the player close), when it is flung further back and
  // loops wider, almost a full circle, to stay that wide. Once round it steers at the
  // player at up to `turnRate` for `chaseTime`, then flies straight on, gone `chaseTime +
  // coastTime` after its arc. The next crescent forms over `regrowTime`.
  LemurSpin: {
    type: 'spin', tell: 'spin', cooldown: 4.5, range: 11, windUpTime: 0.75, lockTime: 0.25, duration: 0, recoveryTime: 0.4,
    damageMultiplier: 1, parryStunTime: 0.7, ...clearPath({ x: 0.75, y: 0.75 }, 0.3),
    look: 'crescent', projectileSpeed: 9.5, projectileSize: 0.42, muzzle: 1,
    spinTime: 0.65, spinGap: 0.06, minArcRadius: 2.6, turnRate: 1.4, chaseTime: 0.6, coastTime: 1, regrowTime: 0.25,
  },
  // Volley: `shots` crescents, `shotInterval` apart, each flung straight at the player off
  // the spade as the tail sweeps round in front, `spreadDeg` off toward the way it sweeps.
  // `swing`, in degrees off its facing (0 ahead, 180 behind): through each wind-up the tail
  // is drawn round to one side, `cockDeg` off, then sweeps across the front in the last
  // `swingIn`, flinging the crescent as it comes past, and on through to `throughDeg` off
  // the other side over `followTime`. From there it is drawn back on that side for the next,
  // which sweeps back the other way. After the last it swings on round behind as it
  // recovers. Each wind-up re-aims until the last `lockTime`.
  LemurVolley: {
    type: 'volley', tell: 'tail', cooldown: 4, range: 12, windUpTime: 0.9, lockTime: 0.25, duration: 0, recoveryTime: 0.5,
    damageMultiplier: 1, parryStunTime: 0.7, ...clearPath({ x: 0.75, y: 0.75 }, 0.3),
    look: 'crescent', projectileSpeed: 10.5, projectileLifetime: 3, projectileSize: 0.42, muzzle: 1,
    shots: 2, shotInterval: 1, spreadDeg: 4,
    swing: { cockDeg: 125, throughDeg: 55, swingIn: 0.16, followTime: 0.2 },
  },
  // The Boxer's fists, conjured out of nothing for each attack; `fists` says how they move
  // (FISTS, boxerRig.js). Its wind-ups are as quick as the Striker's. The hook and the
  // flurry are charges whose fists are the hitbox (parried like a charge): capsules along
  // the fist's path since the last step, at `sweepSamples` points of it, as wide as the
  // fist, which grows as it goes.
  // Hook: a fist conjured at one side (at random) swings round across the front in
  // `swingTime` as the Boxer steps `stepDistance` in over `stepTime`.
  BoxerHook: {
    type: 'hook', tell: 'hook', cooldown: 2.5, range: 2.5, windUpTime: 0.5, lockTime: 0.2, duration: 0.16, recoveryTime: 0.3,
    damageMultiplier: 1, parryStunTime: 0.9, ...clearPath({ x: 1, y: 1 }, 0.3),
    swingTime: 0.13, stepDistance: 1.9, stepTime: 0.13, parryKnockback: 15, sweepSamples: 4,
    strikeSound: 'hook', fists: 'hook',
  },
  // Clap: both fists drawn behind its back through the wind-up, then brought round either
  // side to clap together `impactAt` ahead `landTime` after the strike, as it steps in; a
  // circle there spreads from `radius[0]` to `radius[1]` over `spreadTime` (like the
  // Mauler's slam).
  BoxerClap: {
    type: 'smash', tell: 'clap', cooldown: 4.5, range: 3, windUpTime: 0.6, lockTime: 0.25, duration: 0.4, recoveryTime: 0.4,
    damageMultiplier: 1.5, parryStunTime: 1.2, ...clearPath({ x: 1, y: 1 }, 0.3),
    impactAt: 1.05, landTime: 0.13, radius: [0.5, 1.9], spreadTime: 0.22, stepDistance: 1.9, stepTime: 0.12,
    strikeSound: 'heave', landSound: 'clap', fists: 'clap',
    shake: { duration: 0.2, strength: 0.25, frequency: 22 },
  },
  // Flurry: a big step in (`stepDistance` over `stepTime`), then `punches` of them, one
  // every `punchInterval` from each hand in turn, the first from a side at random, each
  // out at random across the front `coneDeg`: its fist shoots out in `punchTime`, then is
  // drawn back in over `returnTime`, so the next is out before it is back. Each fist hurts
  // on the way out and `linger` seconds into the way back, its hitbox `hitboxScale` × the
  // fist; overlapping, they take turns at `hitboxes` hitboxes. Through it the Boxer keeps
  // turning to the player at up to `turnRate` (rad/s) and pressing in at `advanceSpeed`,
  // stopping `advanceStop` away. `duration` covers the step and the punches, the last one
  // back (0.2 + 24 × 0.08 + 0.05 + 0.16, a touch over). Blows don't stop it; only a parry
  // does, stunning it as for any charge.
  BoxerFlurry: {
    type: 'flurry', tell: 'flurry', cooldown: 6, range: 3.6, windUpTime: 0.5, lockTime: 0.2, duration: 2.35, recoveryTime: 0.5,
    damageMultiplier: 1, parryStunTime: 1, ...clearPath({ x: 1, y: 1 }, 0.3),
    stepDistance: 1.8, stepTime: 0.2, punches: 25, punchInterval: 0.08, punchTime: 0.05, returnTime: 0.16, coneDeg: 110,
    turnRate: 1.6, advanceSpeed: 1.4, advanceStop: 1.3, parryKnockback: 15, sweepSamples: 3,
    linger: 0.07, hitboxScale: 1.4, hitboxes: 3,
    strikeSound: 'enemyDash', punchSound: 'jab', fists: 'flurry',
  },
  // The Gunner's cannons: `muzzles`, in its frame (+x forward, world units): the ends of
  // its three barrels, the middle one a touch further back (GUNNER in sprites.js). Each
  // fires its shot straight ahead, a little bigger than the Goblin's and about as fast as
  // the Lemur's crescents, kicking the Gunner back `recoil` (speed) as it goes. A shot forms at each
  // cannon over the wind-up and waits there until fired. `salvos` of them, one every
  // `salvoInterval`, each cued at the cannons about to fire.
  // Cascade: each salvo is a single cannon, all three in a random order, its aim locked.
  GunnerCascade: {
    type: 'cannons', tell: 'cannons', cooldown: 4, range: 13, windUpTime: 0.8, lockTime: 0.25, duration: 0, recoveryTime: 0.4,
    damageMultiplier: 1, parryStunTime: 0.8, ...clearPath({ x: 1.2, y: 1.2 }, 0.3),
    projectileSpeed: 10, projectileLifetime: 2.5, projectileSize: 0.42,
    muzzles: [{ x: 0.7, y: -0.314 }, { x: 0.6, y: 0 }, { x: 0.7, y: 0.314 }],
    salvos: 3, salvoInterval: 0.3, recoil: 0.5,
  },
  // Barrage: all three at once, `salvos` times. Each fresh set of shots forms over
  // `regrowTime`; between salvos it turns after the player at up to `turnRate` (rad/s),
  // except for the last `lockTime` before the next.
  GunnerBarrage: {
    type: 'cannons', tell: 'barrage', cooldown: 5.5, range: 11, windUpTime: 0.9, lockTime: 0.2, duration: 0, recoveryTime: 0.5,
    damageMultiplier: 1, parryStunTime: 1, ...clearPath({ x: 1.2, y: 1.2 }, 0.3),
    projectileSpeed: 10, projectileLifetime: 2.5, projectileSize: 0.42,
    muzzles: [{ x: 0.7, y: -0.314 }, { x: 0.6, y: 0 }, { x: 0.7, y: 0.314 }],
    salvos: 3, salvoInterval: 0.55, together: true, regrowTime: 0.3, turnRate: 1.2, recoil: 1,
  },
  // The Corsair's scimitar, held at one side and carried to the other by every swing;
  // `blade` says how it moves (SCIMITAR, corsairRig.js).
  // Slash: drawn back on its side, then swung across the front in `swingTime` as it steps
  // `stepDistance` in over `stepTime`, leaving it on the other side. The blade is the hitbox
  // (a charge, parried like one): along it from `bladeHit.reach[0]` to `[1]` from the guard,
  // `bladeHit.radius` either side (both grown with the blade), at `bladeHit.samples` points of
  // its sweep each step so it can't pass over the player between steps.
  CorsairSlash: {
    type: 'scimitar', tell: 'scimitar', cooldown: 2, range: 3.8, windUpTime: 0.6, lockTime: 0.2, duration: 0.18, recoveryTime: 0.35,
    damageMultiplier: 1, parryStunTime: 0.9, ...clearPath({ x: 1, y: 1 }, 0.3),
    swingTime: 0.12, stepDistance: 3.1, stepTime: 0.17, parryKnockback: 15,
    bladeHit: { reach: [0.1, 0.88], radius: 0.18, samples: 4 },
    strikeSound: 'slash', blade: 'slash',
  },
  // Rush: a charge of swinging steps along its locked aim, the blade swung from side to side
  // with every `stride`, setting off at `startSpeed` of its `speed` and up to full speed
  // `rampTime` later, until it runs into something (or `duration` runs out). A wall or
  // another enemy: it crashes and is left reeling. The player: it cuts through them and
  // carries on `followTime` before skidding to a stop. It would rather close in and swing,
  // rushing only once the player has kept out of reach a while (`patience`). See RushAbility.
  CorsairRush: {
    type: 'rush', tell: 'rush', cooldown: 5, range: 9, windUpTime: 0.8, lockTime: 0.1, duration: 2.2, recoveryTime: 0.8,
    damageMultiplier: 1.3, parryStunTime: 1.1, ...clearPath({ x: 1.1, y: 1.1 }, 0.35),
    speed: 24, startSpeed: 0.3, rampTime: 1, stride: 2.3, swingShare: 0.55, surge: 0.55,
    hitboxRadius: 0.85, hitboxForward: 0.25, hitboxArcDeg: 180,
    followTime: 0.5, skidEase: 0.1, crashStunTime: 1.5, bounceForce: 10, parryKnockback: 15,
    patience: { range: 4.5, time: [1.5, 3] },
    strikeSound: 'rush', swingSound: 'swish', crashSound: 'clang', blade: 'rush',
    crashShake: { duration: 0.22, strength: 0.3, frequency: 20 },
  },
  // The Weaver's silk, spat from its mouth `spawnDistance` / `muzzle` ahead of its centre
  // (both attacks rear up its front legs as they wind up; `legs` says how, WEAVER_LEGS,
  // weaverRig.js).
  // Weave: it strings a thread from wall to wall, through where it stands (WeaveAbility). A
  // passive (its type's `passives`), not an attack: its AI never picks it; it goes off on
  // its own whenever the Weaver is free, every `cooldown` seconds while the player is about
  // (its AI is after them), `absent` times as long while they aren't, trying again `retry`
  // later (likewise) if there's no line to string from where it stands. Picking a line (`line`: of `tries` through it at random, one `length` [min, max] long
  // from wall to wall, clear of the player by `clear`, not lying along one of its threads
  // within `apart`, the nearer the player the better, out to `near`, and the shorter the
  // better), it spits an anchor of silk (`look: 'silk'`) into its far end, then turns and
  // walks to the near end at `walkSpeed`, the thread paying out of its spinnerets
  // (`spinneret` behind its centre), and fastens it there (within `reach` of the wall;
  // failing that, wherever it is). Walking more than `walkTime`, getting stuck, stunned,
  // slain or the player coming within `minPlayerDist` (it doesn't start one with them that
  // close), it fastens it where it is (letting it fall if shorter than `minThread`). The
  // anchor hits the player on the way for `damageMultiplier` and its line falls; parried,
  // it stuns the Weaver.
  // A thread (web.js) stays strung until cut, through its Weaver's death too: touching it
  // hurts (× `thread.damage`, again every `thread.rehit` they stay in it), the thread being
  // spun too. Anything of the player's that deals damage cuts it; a parry breaks it and
  // hurts the Weaver as any parry would (`damageMultiplier`), but doesn't stun it. Each
  // Weaver keeps at most `max` strung and stops weaving while it has that many.
  WeaverWeave: {
    type: 'weave', tell: 'spit', cooldown: 3, absent: 3, retry: 1, windUpTime: 0.55, lockTime: 0, duration: 0, recoveryTime: 0.5,
    damageMultiplier: 1, parryStunTime: 0.7, requireClearAttackPath: false,
    look: 'silk', projectileSpeed: 18, projectileSize: 0.28, spawnDistance: 0.36,
    line: { length: [2.5, 22], tries: 16, clear: 1.3, apart: 1, near: 5 },
    walkSpeed: 3.4, walkTime: 6, reach: 1.5, minThread: 1.5, minPlayerDist: 2.5, spinneret: 0.28, max: 5,
    thread: { width: 0.05, damage: 0.6, rehit: 0.8 },
    legs: 'spit',
  },
  // Reel: a ball of web (`look: 'silk'`) forms at its mouth, then is thrown straight out on
  // a line, `ballSpeed` out to `ballReach`. Catching the player (no hurt yet), it winds them
  // in a few strands of web and reels them in, braced, its front legs hauling hand over
  // hand: the player is dragged straight at it at a steady `pullSpeed` (through any of its
  // threads in the way) until they are `biteRange` from it, then held there through the
  // bite's wind-up (`biteWindup`, cued at its mouth), and it bites: a circle `biteRadius`
  // round a point `biteForward` ahead, lunging `biteStep` over `duration`, then lets go.
  // Caught, the player can't attack or dash: each try is a struggle instead, shaking the
  // web and tearing a strand off, and the `struggles`th tears them free. A thread's hurt
  // and the bite land on them caught however recently they were hurt. The line breaks too
  // if they get out of reach (`snapRange` past the ball's reach) or out of the fight; it
  // gives up reeling after
  // `reelTime` and bites anyway. Missing (a wall, or out of line), the ball is drawn back
  // over `retractTime`. Parried,
  // the pull flips: the line drags the Weaver to the player at `yankSpeed` until it is
  // `yankStop` from them (or `yankTime` runs out), and it lies there stunned. A parried
  // bite stuns it too.
  WeaverReel: {
    type: 'reel', tell: 'rear', cooldown: 4.5, range: 8, windUpTime: 0.75, lockTime: 0.25, duration: 0.14, recoveryTime: 0.5,
    damageMultiplier: 1.5, parryStunTime: 1.3, ...clearPath({ x: 0.5, y: 0.5 }, 0.3),
    look: 'silk', projectileSize: 0.42, muzzle: 0.36,
    ballSpeed: 17, ballReach: 8.5, snapRange: 2.5, retractTime: 0.22,
    pullSpeed: 4.5, reelTime: 3, biteRange: 0.95, biteWindup: 0.45, struggles: 3,
    biteRadius: 0.5, biteForward: 0.38, biteStep: 0.35,
    yankSpeed: 13, yankStop: 1.1, yankTime: 1, parryKnockback: 6,
    legs: 'rear',
  },
  // The Nova's flare (FlareAbility): it rushes the player at `rushSpeed` (steering in by
  // `rushResponsiveness` a step, along the paths round walls) until it is `swellRange`
  // from them, or `rushTime` runs out, skidding to a halt (keeping `swellSkid` of its
  // speed), then swells up over the wind-up and goes critical: for `duration` its blast,
  // `blastRadius` all round it, can hurt the player (cued at its heart), and then it bursts
  // in a supernova. Struck while it swells, it is knocked back hard but swells on, bursting
  // wherever it ends up. Parried as it goes critical, it is launched along the parry at
  // `launchSpeed`, lit, and bursts the moment it touches an enemy or a prop (within
  // `contactMargin`), a wall, or `launchTime` runs out, sparing the player. Every burst
  // hurts the enemies and props in its blast for `blastDamage` (a launched one's scaled by
  // Exalted), throwing them back (`blastKnockback`); another Nova in it is lit instead, and
  // bursts `chainDelay` later (going critical first, unless the burst was a launched one's).
  NovaFlare: {
    type: 'flare', tell: 'swell', cooldown: 1.5, range: 7, windUpTime: 0.95, duration: 0.08, recoveryTime: 0,
    damageMultiplier: 1, parryStunTime: 0, cueAt: 0,
    rushSpeed: 8.25, rushTime: 2.5, rushResponsiveness: 0.25, swellRange: 1.4, swellSkid: 0.8,
    blastRadius: 3, blastDamage: 8, blastKnockback: 25,
    launchSpeed: 17, launchTime: 0.7, contactMargin: 0.08, chainDelay: 0.12,
    rushSound: 'novaRush', swellSound: 'novaSwell', burstSound: 'supernova', launchSound: 'novaLaunch', fuseSound: 'novaFuse',
  },
  // The Bulwark's shield; `shield` says how it moves (SHIELD, bulwarkRig.js). Neither is
  // tried with the shield off its arm.
  // Bash: it lunges shield-first, `stepDistance` along its locked aim over `stepTime`, the
  // shield rammed out ahead in `swingTime`; a charge, its hitbox a circle `hitboxRadius`
  // round a point `hitboxForward` ahead (the shield). Parried, its guard breaks
  // (enemies.js, `guard.brokenTime`).
  BulwarkBash: {
    type: 'bash', tell: 'bash', cooldown: 2.8, range: 3.6, windUpTime: 0.7, lockTime: 0.22, duration: 0.24, recoveryTime: 0.38,
    damageMultiplier: 1.1, parryStunTime: 1.1, ...clearPath({ x: 1.1, y: 1.1 }, 0.3),
    hitboxRadius: 0.6, hitboxForward: 0.6, swingTime: 0.08, stepDistance: 2.8, stepTime: 0.2, parryKnockback: 12,
    strikeSound: 'bash', shield: 'bash',
  },
  // Plant: the shield, heaved up through the wind-up, comes down edge-first `landTime`
  // after the strike, as it steps `stepDistance` in, and a shockwave runs out along the
  // floor from it, across `arcDeg` ahead: a band `band` deep, its front spreading from
  // `radius[0]` to `radius[1]` out from where the Bulwark stood over `spreadTime`. Only the
  // band hurts, so it can be dashed through or outrun.
  BulwarkPlant: {
    type: 'plant', tell: 'plant', cooldown: 4.5, range: 4.5, windUpTime: 0.95, lockTime: 0.3, duration: 0.5, recoveryTime: 0.42,
    damageMultiplier: 1.4, parryStunTime: 1.1, ...clearPath({ x: 1, y: 1 }, 0.3),
    landTime: 0.08, stepDistance: 0.4, stepTime: 0.08, radius: [0.7, 5.2], arcDeg: 70, band: 1.1, spreadTime: 0.42,
    strikeSound: 'heave', landSound: 'plant', shield: 'plant',
    shake: { duration: 0.22, strength: 0.3, frequency: 18 },
  },
  // The Alembic's parts (BLIGHT, blightRig.js): ten iris valves ring its rim, the first
  // straight ahead, and canisters of toxin sit in its body. Its orbs of toxin (`look:
  // 'blob'`, see BLOB) form over its valves and fly straight out; `parts` says how its parts
  // move (its rig).
  // Ring: the ten valves open, an orb forming over each through the wind-up, then all ten
  // fire straight out, evenly round, `salvos` times, `salvoInterval` apart, a fresh set
  // forming over `regrowTime` between. It turns after the player at up to `turnRate` the
  // whole time, so the valve in front always fires at them; only its orb is cued.
  BlightRing: {
    type: 'ring', tell: 'gape', cooldown: 5, range: 12, windUpTime: 1, lockTime: 0, duration: 0, recoveryTime: 0.6,
    damageMultiplier: 0.8, parryStunTime: 0.6, requireClearAttackPath: false,
    look: 'blob', projectileSpeed: 7, projectileLifetime: 3.5, projectileSize: 0.42,
    salvos: 3, salvoInterval: 0.65, together: true, regrowTime: 0.35, turnRate: 2.5, recoil: 0,
    salvoSound: 'ventVolley', parts: 'gape',
  },
  // Canisters: `count` of its canisters (none whose socket is still empty) strain outward
  // through the wind-up, pushed out `pushOut`, then launch and fly straight out away from
  // its centre, homing in on the player at up to `turnRate` from `homingDelay` until
  // `homingTime` after launch, through walls. A new one slides up into each socket over
  // `regrowTime` after `regrowDelay`. A parried canister only hurts the Alembic; it isn't
  // stunned.
  BlightHeads: {
    type: 'canisters', tell: 'loose', cooldown: 6, range: 13, windUpTime: 1, lockTime: 0.2, duration: 0, recoveryTime: 0.5,
    damageMultiplier: 1, parryStunTime: 0, requireClearAttackPath: false,
    look: 'canister', count: 3, pushOut: 0.24, projectileSpeed: 7.5, projectileLifetime: 5, projectileSize: 0.5,
    turnRate: 2.4, homingDelay: 0.35, homingTime: 3.2, passesWalls: true,
    regrowDelay: 1.5, regrowTime: 0.8, parts: 'loose',
  },
  // Spew: it builds pressure through the wind-up, every valve opening, then for `bursts` ×
  // `burstInterval` seconds, every `burstInterval`, `perBurst` of its valves at random each
  // fire an orb straight out, up to `jitterDeg` off: a steady stream all round. Only orbs
  // fired within `cueWithinDeg` of the player are cued. A parried orb only hurts the
  // Alembic; it isn't stunned and keeps spewing.
  BlightSpew: {
    type: 'spew', tell: 'spew', cooldown: 9, range: 9, windUpTime: 1.2, lockTime: 0, duration: 0, recoveryTime: 0.7,
    damageMultiplier: 0.7, parryStunTime: 0, requireClearAttackPath: false,
    look: 'blob', projectileSpeed: 7.5, projectileLifetime: 3, projectileSize: 0.4,
    bursts: 30, burstInterval: 0.1, perBurst: 1, jitterDeg: 12, cueWithinDeg: 30, parts: 'spew',
  },
  // Globs: big globs form over the valves `from` (its front three) through the wind-up,
  // then `globs` of them are lobbed, one every `globInterval`, from each of those valves in
  // turn, each at a spot around where the player is as it is thrown (turning after them at
  // up to `turnRate` meanwhile; each valve's next glob re-forms as the others go, and each
  // is cued as it is thrown): the first right at them, the rest `spread` (from, to) away,
  // evenly round (never past a wall). Each flies there at `projectileSpeed`, the spot marked
  // meanwhile, and splats into a pool of poison `pool.radius` round, which hurts the player
  // whenever their invincibility runs out for `pool.time` seconds, at
  // `pool.damageMultiplier`. One that hits the player on the way splats there; parried or
  // broken on a wall, it doesn't splat at all.
  BlightGlobs: {
    type: 'globs', tell: 'retch', cooldown: 6, range: 11, windUpTime: 1, lockTime: 0.25, duration: 0, recoveryTime: 0.6,
    damageMultiplier: 1.1, parryStunTime: 0.8, ...clearPath({ x: 1.2, y: 1.2 }, 1),
    look: 'blob', chargeSize: 0.8, projectileSize: 0.75, projectileSpeed: 9,
    globs: 5, globInterval: 0.6, turnRate: 1.5, from: [9, 0, 1], spread: [1.3, 3.2],
    pool: { radius: 1.7, time: 5, damageMultiplier: 0.25 },
    parts: 'lob',
  },
  WardenDash: {
    type: 'dash', tell: 'charge', cooldown: 3, range: 7, windUpTime: 1, duration: 1, recoveryTime: 0.5,
    damageMultiplier: 1, parryStunTime: 1, ...clearPath({ x: 1.25, y: 1.25 }, 0.35),
    dashForce: 700, hitboxRadius: 1.1, hitboxArcDeg: 150,
  },
  WardenGroundPound: {
    type: 'groundPound', tell: 'pound', cooldown: 6, range: 4, windUpTime: 1.5, duration: 0.3, recoveryTime: 1,
    damageMultiplier: 1.3, parryStunTime: 0.6, requireClearAttackPath: false, radius: 3.5, cueAt: 0,
  },
  WardenPunch: {
    type: 'punch', tell: 'punch', cooldown: 1.5, range: 4, windUpTime: 0.8, duration: 0.15, recoveryTime: 0.3,
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
    dashForce: 640, hitboxRadius: 1, hitboxArcDeg: 150, // carries ~3.7 units, a little short of the Warden's ~4.4
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
  // until `projectileLifetime`. A parried missile only hurts the Seraph: no `parryStunTime`, no stagger.
  SeraphMissiles: {
    type: 'missiles', tell: 'missiles', cooldown: 5, range: 10, windUpTime: 0.8, duration: 0, recoveryTime: 0.5,
    damageMultiplier: 1, parryStunTime: 0, ...clearPath({ x: 0.6, y: 0.6 }, 0.3),
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
