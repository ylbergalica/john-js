// Aspects: equippable perks bought with coins, and their tiers.

export const AspectTier = { Gift: 0, Prestige: 1, Mythic: 2 };
export const TIERS = [
  { tier: AspectTier.Gift, name: 'Gift', price: 1000, color: 'var(--gift)' },
  { tier: AspectTier.Prestige, name: 'Prestige', price: 5000, color: 'var(--prestige)' },
  { tier: AspectTier.Mythic, name: 'Mythic', price: 15000, color: 'var(--mythic)' },
];
export const MAX_EQUIPPED_ASPECTS = 3;
// What the run summary counts for an aspect: times it was used (activated, or for a passive,
// triggered), or every hit it landed — each enemy struck, every time it's struck.
// `label` is shown when hovering it there.
export const AspectStat = { Uses: { label: 'Times used' }, Hits: { label: 'Hits landed' } };

// `id` values are save keys; never rename them.
export const ASPECTS = [
  {
    id: 'anchor', displayName: 'Anchor', tier: AspectTier.Gift, icon: 'anchor_icon', activatable: true, stat: AspectStat.Uses,
    quote: "Now you see me, now you don't.",
    description: 'Throw an anchor which you can teleport to at any time.',
    throwImpulse: 25, settleSpeedThreshold: 0.2, settleGraceTime: 0.25, retrievalRadius: 0.45,
    teleportWindUpTime: 0.5, teleportRecoverTime: 0.5, windRadius: 5, windDuration: 1, windForce: 30,
    anchorMass: 1, anchorDamping: 5, anchorSize: 0.36 * 2, anchorRadius: 0.18,
    teleportDotScale: 0.08, windRingWidth: 0.45,
    // The look (src/aspects/anchor.js): blue light pinches in on you as you shrink away
    // (over teleportWindUpTime) and blooms where you land, and the shockwave is a thick
    // ring of blue mist. Sizes in world units, times in seconds, [min, max] picks at random.
    fx: {
      color: 0x3d63ff, hot: 0xcfe0ff,
      depart: {
        flash: { size: 1.6, shrink: 0.2, alpha: 0.8 },
        glints: { count: 6, speed: [1, 2.5], size: [0.12, 0.22], life: [0.3, 0.5] },
      },
      arrive: {
        flash: { size: 1.2, grow: 2, time: 0.45, alpha: 0.9 },
        star: { size: 1.8, time: 0.4 },
        glints: { count: 9, speed: [1.5, 3.5], size: [0.14, 0.26], life: [0.5, 0.9] },
      },
      ring: {
        color: 0x4f7dff, alpha: 0.9, spin: 0.5, // two hazy layers turning opposite ways
        edge: 0xa9c4ff, edgeAlpha: 0.45, // a soft leading edge
        puffs: { rate: 40, size: [0.7, 1.3], life: [0.5, 0.9], alpha: 0.35 }, // mist shed behind the wave
      },
    },
  },
  {
    id: 'assassin', displayName: 'Predator', tier: AspectTier.Gift, icon: 'predator_icon', activatable: false, stat: AspectStat.Uses,
    quote: "You miss 100% of the shots you don't take.",
    description: 'Attacks aimed at an enemy blink you into ideal melee range.',
    targetAcquireDistance: 10, aimDotThreshold: 0.5, minimumBlinkDistance: 0.2,
    // The blink's look (src/aspects/predator.js), kept small: where you left, a few glints
    // and a little light-blue mist blown back the way you came; where you land, a faint puff
    // and a star. Sizes in world units, times in seconds, [min, max] picks at random.
    fx: {
      color: 0x5cc8ff, hot: 0xd6f2ff,
      depart: {
        glints: { count: 5, speed: [0.6, 1.6], size: [0.1, 0.18], life: [0.25, 0.45] },
        // Wisps like the dash's launch puffs, fanning up to spreadDeg either side of straight
        // back and cooling to `fade` as they go.
        mist: { count: 7, speed: [1.6, 3.2], spreadDeg: 75, size: [0.25, 0.36], life: [0.3, 0.42], alpha: 0.35, grow: 2.4, fade: 0x1f5fb0 },
      },
      arrive: {
        flash: { size: 0.9, grow: 1.6, time: 0.28, alpha: 0.45 },
        star: { size: 1.3, time: 0.28 },
        glints: { count: 6, speed: [1, 2.5], size: [0.1, 0.2], life: [0.3, 0.55] },
      },
    },
  },
  {
    id: 'crescent', displayName: 'Cleave', tier: AspectTier.Gift, icon: 'cleave_icon', activatable: false, stat: AspectStat.Hits,
    quote: 'Every strike leaves a wake.',
    description: 'Connecting a hit sends a cleaving slash flying forward.',
    damage: 1, speed: 25, travelDistance: 6, spawnForwardOffset: 0.5, enemyKnockbackForce: 9, cooldown: 0,
    hitboxDepth: 0.36178464 * 1.5, hitboxWidth: 1.765077 * 1.5, spriteSize: 2 * 1.5, alpha: 1,
    // The slash's trail (src/aspects/cleave.js): red motes shed from along its edge, `rate` a
    // second, coasting `forward` behind it and up to `spread` sideways, cooling to `fade`;
    // and it fades out over its last fadeTime. World units and seconds, [min, max] at random.
    fx: {
      fadeTime: 0.05,
      motes: { rate: 70, size: [0.12, 0.24], life: [0.2, 0.4], forward: [1, 4], spread: 0.8, color: 0xd11a2a, fade: 0x4a0510, alpha: 0.75 },
    },
  },
  {
    id: 'flash', displayName: 'Flash', tier: AspectTier.Gift, icon: 'flash_icon', activatable: true, stat: AspectStat.Uses,
    quote: 'F for flash.',
    description: 'Blink a short distance. Every parry or kill reduces the active cooldown.',
    maxBlinkDistance: 6, baseCooldown: 5, cooldownReductionPerTrigger: 1,
    // The blink's look (src/aspects/flash.js): light folds in where you leave, a streak
    // of it joins the two spots, and it bursts out where you land. Sizes in world units,
    // times in seconds, [min, max] picks at random.
    fx: {
      color: 0xffb81f, hot: 0xffe27a,
      depart: {
        flash: { size: 2.6, shrink: 0.3, time: 0.22, alpha: 0.9 },
        star: { size: 2, time: 0.2 },
        glints: { count: 7, speed: [1, 3], size: [0.14, 0.26], life: [0.3, 0.55] },
      },
      streak: { width: 0.7, time: 0.22, alpha: 0.7 },
      arrive: {
        flash: { size: 1.4, grow: 2.2, time: 0.5, alpha: 1 },
        star: { size: 3.2, time: 0.55, spin: 1.2 }, // spin: radians a second, either way
        sparks: { count: 20, speed: 8, lifetime: 0.6, size: 0.3, coneDeg: 180 },
        glints: { count: 12, speed: [2, 5], size: [0.16, 0.3], life: [0.8, 1.4] },
      },
    },
  },
  {
    id: 'rift', displayName: 'Rift', tier: AspectTier.Gift, icon: 'rift_icon', activatable: false, stat: AspectStat.Hits,
    quote: 'Compact violent solutions.',
    description: 'Connecting a parry unfolds damaging rift-blades on each side.',
    activeTime: 1, damage: 1, enemyKnockbackForce: 5, minDamage: 0.2,
    hitboxDepth: 0.6074743 * 0.8, hitboxWidth: 4.5242996 * 0.8, spriteW: 1 * 0.8, spriteH: 5 * 0.8,
    // Motes shed off the blades while they're out, in the player's tint (src/aspects/rift.js): `rate` a
    // second, drifting `outward` from the player and `back` from its facing, world units
    // and seconds, [min, max] picks at random.
    motes: { rate: 40, size: [0.2, 0.4], life: [0.35, 0.7], outward: [0.3, 1.4], back: [0.4, 1.6], jitter: 0.4 },
  },
];
