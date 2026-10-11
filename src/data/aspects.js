// Aspects: equippable perks bought with coins, and their tiers. A tier's box takes `hits`
// clicks to break open. The demo build (DEMO) sells a box at its `demoPrice`, shown as a
// discount on the full price.

export const AspectTier = { Gift: 0, Prestige: 1, Mythic: 2 };
export const TIERS = [
  { tier: AspectTier.Gift, name: 'Gift', price: 1000, demoPrice: 100, hits: 5, color: 'var(--gift)' },
  { tier: AspectTier.Prestige, name: 'Prestige', price: 5000, demoPrice: 300, hits: 8, color: 'var(--prestige)' },
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
  {
    id: 'thunder', displayName: 'Thunderclap', tier: AspectTier.Prestige, icon: 'thunder_icon', activatable: false, stat: AspectStat.Hits,
    quote: 'The sky keeps count.',
    description: 'Stringing hits together calls down thunder that leaps between foes.',
    // Counts any damage to enemies but its own. Hits on chainHits different enemies (hitting
    // one already in the chain again neither adds to it nor breaks it) call thunder out of the
    // last enemy hit, back along the chain through every enemy in it. Any enemy within `reach`
    // of the chain's lines is struck too, by a fork off the nearest point of it, and each fork
    // stretches the area further, nearest enemy first, until maxTargets enemies are struck or
    // no more are in reach. sameHits hits in a row on one enemy instead strike it alone for
    // soloDamage, the thunder crawling out around it for soloTime, its arcs hitting every other
    // enemy and prop they touch for arcDamage, once each. A chain's bolts hit every prop they
    // touch for `damage` (sprouts don't hit anything). Touching: within hitRadius of the bolt.
    // Either way the count starts over; there's no cooldown, but comboTime without a hit
    // loses it. The HUD shows the chain so far. twitchDelay after it's all
    // out it twitches once into a new shape, with a second clap of thunder, then holds still
    // for `hold` and fades over `fade`.
    chainHits: 4, sameHits: 5, comboTime: 6, reach: 7, maxTargets: 10,
    damage: 2, soloDamage: 4, arcDamage: 1, hitRadius: 0.3, enemyKnockbackForce: 2,
    speed: 150, minJumpTime: 0.01, // how fast it runs along a line, and the least any one jump takes
    twitchDelay: 0.05, hold: 0.35, fade: 0.35, soloTime: 0.06, soloReach: 4.5, // how far out from the enemy alone its arcs crawl
    // The look (src/aspects/thunder.js): thick jagged bolts, white-hot down the middle in a
    // wide band of purple, under a soft purple glow, with thin forked sprouts off them, each
    // laid down once where things are as it sets off. Every line is cut into pieces no longer
    // than `step` and its midpoints knocked sideways by up to `rough` of each piece's length.
    // Alone, `burst` arcs leap out at once and more follow, `rate` a second, from the enemy or a
    // fork of an arc already out, up to soloReach away. World units and seconds, [min, max] at random.
    fx: {
      color: 0xa94dff, core: 0xffffff, glow: 0x7a2cff,
      width: 0.21, coreWidth: 0.075, glowWidth: [0.8, 0.42], glowAlpha: [0.12, 0.22],
      step: 0.28, rough: 0.42,
      // Sprouts: off a share of a bolt's points, `width` of the bolt's and thinning to `taper` of
      // that. A `share` of them are long, out to 5 units though mostly nearer the low end, with
      // short twigs off them `twig` as wide as a short sprout.
      sprouts: {
        chance: 0.38, length: [0.3, 1], spreadDeg: [25, 70], width: 0.45, taper: 0.4, step: 0.14, rough: 0.5,
        long: { share: 0.12, length: [1.5, 5], width: 0.6, twig: 0.8, step: 0.2, rough: 0.42 },
      },
      solo: { rate: 110, burst: 9, length: [1.2, 2.8], fork: 0.45, width: 0.75 },
      strike: { size: 2.6, time: 0.32, alpha: 0.95 }, // the flash where it comes out
      hit: {
        flash: { size: 1.3, time: 0.22, alpha: 0.8 },
        sparks: { count: 12, speed: 9, lifetime: 0.25, size: 0.3, coneDeg: 60, color: 0xc89bff },
        impactTint: 0xc89bff,
      },
      shake: { duration: 0.12, strength: 0.08, frequency: 30 },
    },
  },
  {
    id: 'phoenix', displayName: 'Phoenix', tier: AspectTier.Prestige, icon: 'phoenix_icon', activatable: false, stat: AspectStat.Hits,
    quote: 'Ash remembers the shape of wings.',
    description: 'Dashing unfurls wings of fire that set alight whatever they touch.',
    // Every dash bursts out as fire and unfurls a wing of it on each side of the player,
    // `length` long (from the player's centre to its furthest flame). They sweep open over
    // openTime and, from flapAt, flap forward over flapTime, turning flapDeg toward the dash
    // and bending up to bendDeg further toward their tips, so they curl around in front; the
    // moment they stop they flap back over foldTime, past where they opened by foldDeg and up
    // to foldBendDeg more toward their tips, so they sweep back behind, folding at the player's
    // back and sides as they shrink to foldScale of their size; from fadeAt, once folded, they go
    // out over fadeTime. Each stroke speeds up over the first [0] of it and brakes to a stop over
    // the last [1] of it (flapEase, foldEase). Every
    // enemy and prop the wings or the dashing
    // player (within bodyReach of its body) touch catches fire, up to burnUntil of the way
    // through the fade: it burns for burnTime, taking `burn` damage in all, a little every
    // step. Catching fire counts as a hit by the player (dealing nothing itself), and catching
    // again only starts the burn over, counting again; the burn itself isn't a hit: no flinch,
    // flash or knockback, so it interrupts nothing, and nothing that counts hits counts it.
    length: 2.8, burn: 5, burnTime: 5, bodyReach: 0.2,
    openTime: 0.07, flapAt: 0.03, flapTime: 0.18, flapEase: [0.3, 0.15], flapDeg: 35, bendDeg: 80,
    foldTime: 0.17, foldEase: [0.15, 0.3], foldDeg: 30, foldBendDeg: 40, foldScale: 0.7, fadeAt: 0.36, fadeTime: 0.12, burnUntil: 0.5,
    // The look (src/aspects/phoenix.js): nothing but fire in the shape of wings. Each is a
    // blazing arm under a soft glow, trailing tongues of flame (an orange `outer` one with a
    // hot `core` inside), rippling by up to `wave` of their length and flickering by `flicker`,
    // all wreathed in flames licking off them that ride along with the player, and more left
    // behind with embers. While the wings are out the player burns too. The dash bursts out
    // in fire, and the wings burst into a flurry of it as they burn away. What burns
    // flickers with flames, embers and a haze, dying down over its last `ebb`. World units and
    // seconds, [min, max] picks at random; rates are per second, per wing for the wings.
    fx: {
      tongue: {
        outer: { color: 0xff5a0c, width: 1.35, alpha: 0.85 }, core: { color: 0xffd270, width: 0.55, alpha: 0.9 },
        wave: 0.16, waveSpeed: 26, flicker: 0.25,
      },
      arm: { color: 0xfff0b8, alpha: 0.9, width: [0.5, 0.16], glow: 0xff6a10, glowAlpha: 0.7, glowWidth: 3 },
      under: { color: 0xff4a08, alpha: 0.8, size: 2.8 }, // a glow under each wing
      flames: { rate: 950, color: 0xffb440, fade: 0xc8280a, size: [0.7, 1.3], life: [0.12, 0.24], speed: [0.5, 1.6], alpha: 0.9 },
      trail: { rate: 110, color: 0xffb040, fade: 0x701004, size: [0.4, 0.7], life: [0.2, 0.35], speed: [0.3, 1.2], alpha: 0.55 },
      embers: { rate: 70, color: 0xffe080, fade: 0xff3000, size: [0.07, 0.14], life: [0.4, 0.8], speed: [1.5, 4] },
      body: { rate: 240, radius: 0.45, color: 0xffd060, fade: 0xc02008, size: [0.5, 0.85], life: [0.15, 0.3], speed: [1, 2.5], alpha: 0.9 },
      launch: {
        flames: { count: 26, speed: [3, 8], spreadDeg: 55, size: [0.5, 0.9], life: [0.18, 0.32] }, // out the back, in `flames` colours
        sparks: { count: 16, speed: 10, lifetime: 0.3, size: 0.32, coneDeg: 40, color: 0xffa030 },
        flash: { size: 1.4, time: 0.16, alpha: 0.7, color: 0xff7a18 },
      },
      dissolve: { flames: 25, embers: 30 }, // per wing, as they start going out
      catch: {
        flash: { size: 1.2, time: 0.2, alpha: 0.75, color: 0xff7a18 },
        sparks: { count: 10, speed: 7, lifetime: 0.3, size: 0.3, coneDeg: 50, color: 0xffb040 },
      },
      burning: {
        ebb: 1,
        flames: { rate: 90, color: 0xffd060, fade: 0xa01a04, size: [0.6, 1], life: [0.3, 0.5], speed: [1.2, 2.4], alpha: 1 },
        haze: { rate: 12, color: 0xff6a14, fade: 0x400400, size: [1.8, 2.4], life: [0.4, 0.7], alpha: 0.4 }, // sizes in units of its radius
        embers: { rate: 9, color: 0xffd070, fade: 0xff2a00, size: [0.06, 0.12], life: [0.5, 0.9], speed: [1, 2.4] },
      },
    },
  },
];
