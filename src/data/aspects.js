// Aspects: equippable perks bought with coins, and their tiers. A tier's box takes `hits`
// clicks to break open.

export const AspectTier = { Gift: 0, Prestige: 1, Mythic: 2 };
export const TIERS = [
  { tier: AspectTier.Gift, name: 'Gift', price: 1000, hits: 5, color: 'var(--gift)' },
  { tier: AspectTier.Prestige, name: 'Prestige', price: 5000, hits: 8, color: 'var(--prestige)' },
  { tier: AspectTier.Mythic, name: 'Mythic', price: 15000, hits: 10, color: 'var(--mythic)' },
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
    quote: 'A system not based purely on strength is boring.',
    description: 'Connecting a hit sends a flying slash forward.',
    damage: 0.5, speed: 25, travelDistance: 6, spawnForwardOffset: 0.5, enemyKnockbackForce: 6, cooldown: 0,
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
  {
    id: 'wraith', displayName: 'Wraith', tier: AspectTier.Gift, icon: 'wraith_icon', activatable: false, stat: AspectStat.Hits,
    quote: 'Shackled by regret, unable to leave.',
    description: 'Dashing turns you to mist that cuts through enemies.',
    // While mist the player passes through enemies and nothing hits them; each enemy passed
    // through is cut once a dash, thrown aside from its line. Still inside one as the dash
    // runs out, it carries on through it, up to lingerTime longer, so they're never left stuck in it.
    // hitRadius: how far out from the player's centre it cuts, swept along the dash (the body's
    // radius is 0.4).
    damage: 1, enemyKnockbackForce: 5, hitRadius: 0.8, lingerTime: 0.15,
    // The look (src/aspects/wraith.js): the body bursts into mist and a small black shard of it
    // pops out, white-hot at the tip, rimmed in the player's tint, pointing along the dash and
    // shedding black and white wisps and a few pale motes; as the dash ends the mist is drawn
    // back in, the shard collapses and the body swells back out of it. The whites warm with the
    // rest of the player while Exalted. Sizes in world units, times in seconds, [min, max]
    // picks at random.
    fx: {
      form: { length: 1.2, width: 0.5, from: 0.2, formTime: 0.08, flicker: 0.06 }, // pops out from `from` of its size over formTime, overshooting
      wisps: { rate: 120, speed: [1, 2.5], spread: 1.5, size: [0.3, 0.55], grow: 1.8, life: [0.25, 0.45], alpha: 1, color: 0x000000, fade: 0x0d0a18 },
      white: { share: 0.2, color: 0xffffff, fade: 0xa8a0d0, alpha: 0.85 }, // a share of every lot of wisps is pure white mist
      tip: { rate: 220, speed: [0.3, 1.2], size: [0.15, 0.28], life: [0.12, 0.22] }, // white mist streaming off the shard's tip
      haze: { share: 0.5, size: 1.6, alpha: 0.13, color: 0x6a5fa0, fade: 0x1a1530 }, // faint light under a share of the black wisps, so they show on the dark floor
      motes: { rate: 30, speed: [0.5, 1.5], size: [0.08, 0.16], life: [0.25, 0.45], color: 0xd9d4ff },
      // Turning to mist: the body blows apart into a cloud of black, in a white flash, rays of
      // light and a ring of haze, mist blasted out all around and harder back the way it came,
      // with a jolt of the camera.
      burst: {
        flash: { size: 0.6, grow: 1.5, time: 0.1, alpha: 0.8 },
        ring: { from: 0.3, to: 1.3, time: 0.24, alpha: 0.55, color: 0x8a80c0 }, // band radius
        core: { count: 4, speed: [0.5, 1.5], size: [0.7, 0.9], grow: 2.6, life: [0.25, 0.35] }, // black only
        rays: { count: 16, speed: 12, lifetime: 0.22, size: 0.5, coneDeg: 180 },
        around: { count: 22, speed: [4, 9], spreadDeg: 180, size: [0.35, 0.6], life: [0.25, 0.45] },
        back: { count: 10, speed: [3, 6], spreadDeg: 50, size: [0.4, 0.7], life: [0.3, 0.5] },
        shake: { duration: 0.08, strength: 0.05, frequency: 30 },
      },
      // Re-forming: wisps are drawn in from `radius` away (arriving as they fade) while the shard
      // collapses over `collapse`, and the body swells from `from` of its size past full and
      // settles over `time`, in a small white flash.
      reform: {
        time: 0.3, from: 0.15, collapse: 0.07,
        wisps: { count: 24, radius: [0.8, 1.4], size: [0.35, 0.6], life: [0.15, 0.22] },
        flash: { size: 0.5, grow: 2.4, time: 0.22, alpha: 0.9 },
      },
      cut: {
        wisps: { count: 5, speed: [1.5, 3.5], spreadDeg: 35, size: [0.3, 0.5], life: [0.25, 0.4] }, // dragged on through the enemy
        sparks: { count: 10, speed: 9, lifetime: 0.25, size: 0.3, coneDeg: 15, color: 0xd9d4ff },
        impactTint: 0xd9d4ff,
      },
    },
  },
  {
    id: 'astral', displayName: 'Astral Blades', tier: AspectTier.Prestige, icon: 'astral_icon', activatable: false, stat: AspectStat.Hits,
    quote: 'The stars remember who struck first.',
    description: 'Parrying conjures a blade of light that hunts down the attacker.',
    // Each parry draws a blade out of the player for every level of the parry streak (up to
    // the streak's cap), a moment apart: `stagger` seconds at a streak of 2, closing evenly to
    // the second figure at the cap. Each glides out to its own spot on an arc
    // `arcDeg` wide behind the player (from the enemy parried), `distance` out, easing to a
    // stop over settleTime while turning to point at it; launchDelay after it appeared it
    // flies at it (or, if it's dead, at whichever enemy is nearest the player) at `speed`,
    // turning toward it at up to turnRate radians a second, through walls. It breaks on the
    // first enemy it meets, cutting props on the way without stopping, and gives up after
    // `lifetime` in flight.
    damage: 2, enemyKnockbackForce: 4, hitRadius: 0.15,
    stagger: [0.4, 0.1], arcDeg: 150, distance: [1.7, 2.2], settleTime: 1, launchDelay: 1,
    speed: 20, turnRate: 10, aimRate: 8, lifetime: 4,
    // The look (src/aspects/astral.js): a small sword-shaped silhouette of bright blue light,
    // `length` long, growing out of the player over growTime as it leaves them, trailing a thin line
    // of blue light `trail` seconds long, `width` at the head and tapering away. It bursts in a
    // small blue flash where it strikes. While the player is Exalted it all turns the dark
    // crimson of `exalted`. World units and seconds.
    fx: {
      length: 0.5, color: 0x5aa8ff, grow: 0.12, growTime: 0.25,
      trail: { time: 0.14, width: 0.13, alpha: 1, color: 0x62b4ff, core: 0xeaf6ff, coreWidth: 0.4 },
      halo: { length: 2.2, width: 1.2, color: 0x3d9bff, alpha: 0.85 }, // a soft glow under the blade, in units of its length
      launch: { size: 0.5, time: 0.16, alpha: 0.7 },
      hit: { sparks: { count: 10, speed: 8, lifetime: 0.22, size: 0.28, coneDeg: 25, color: 0x8fb8ff }, impactTint: 0x8fb8ff },
      exalted: { color: 0xff2a48, trail: 0xff3450, core: 0xffe4e8, halo: 0xff1438, haloAlpha: 1, hit: 0xff8090 },
    },
  },
];
