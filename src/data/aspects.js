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
    description: 'Throw an anchor which you can teleport to at any time. Expanding a stunning shockwave at the destination.',
    throwImpulse: 25, settleSpeedThreshold: 0.2, settleGraceTime: 0.25, retrievalRadius: 0.45,
    // The shockwave where you land stuns every enemy it sweeps over for stunTime, calling off
    // whatever it was about to do, and knocks it back.
    teleportWindUpTime: 0.5, teleportRecoverTime: 0.5, windRadius: 5, windDuration: 1, windForce: 30, stunTime: 2.5,
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
    description: 'Blink a short distance, flashing damage at the destination. Parries and kills reduce the active cooldown.',
    maxBlinkDistance: 6, baseCooldown: 5, cooldownReductionPerTrigger: 1,
    // Where you land, a star of light flashes out (arrive.star and its fainter twin, `cross`),
    // striking every enemy and prop its points or its middle touch, once, as it flashes:
    // within armWidth of a point's line, or `core` of its centre.
    damage: 3, enemyKnockbackForce: 6, armWidth: 0.3, core: 0.9,
    // The blink's look (src/aspects/flash.js): light folds in where you leave, a streak
    // of it joins the two spots, and it bursts out where you land in a star like its icon's:
    // two four-point flares crossed `cross.deg` apart, the one behind `cross.scale` the size.
    // Sizes in world units, times in seconds, [min, max] picks at random.
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
        star: { size: 6, time: 0.55, spin: 1.2 }, // spin: radians a second, either way
        cross: { deg: 38, scale: 0.75, alpha: 0.7 },
        hit: { sparks: { count: 10, speed: 8, lifetime: 0.3, size: 0.3, coneDeg: 40, color: 0xffd04a }, impactTint: 0xffe27a },
        sparks: { count: 20, speed: 8, lifetime: 0.6, size: 0.3, coneDeg: 180 },
        glints: { count: 12, speed: [2, 5], size: [0.16, 0.3], life: [0.8, 1.4] },
      },
    },
  },
  {
    id: 'rift', displayName: 'Rift', tier: AspectTier.Gift, icon: 'rift_icon', activatable: false, stat: AspectStat.Hits,
    quote: 'Compact violent solutions.',
    description: 'Connecting a parry unfolds damaging rift-blades on each side.',
    activeTime: 1, damage: 1, enemyKnockbackForce: 5,
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
    id: 'needle', displayName: 'Needle', tier: AspectTier.Gift, icon: 'needle_icon', activatable: false, stat: AspectStat.Hits,
    quote: 'Death by a thousand pricks.',
    description: 'Every third hit sends a needle homing in on the enemy struck.',
    // Counts any damage to enemies but its own. Every everyHits-th hit sends a needle out of the
    // player's side or back (spawnDistance from its centre, spawnDeg round from the line to the
    // enemy hit), heading launchDeg off that line on the same side, flying at
    // `speed` and curving round to that enemy in one smooth arc (an even turn all the way, re-fitted
    // as the enemy moves), turning at no more than maxTurnRate radians a second. It breaks on
    // the first enemy it meets (within hitRadius of its tip) or on a wall. If its enemy dies it
    // never picks another, flying on straight for orphanTime; it gives up after `lifetime`.
    // comboTime without a hit loses the count. The HUD fills its icon toward the next one.
    everyHits: 3, comboTime: 30, damage: 1.5, speed: 24, maxTurnRate: 30, launchDeg: [20, 35], spawnDeg: [100, 150], spawnDistance: 0.5, hitRadius: 0.1, orphanTime: 1, lifetime: 3,
    // The look (src/aspects/needle.js): a small pale grey spike, white along one edge to its tip,
    // trailing a streak of pale light `length` long back from its tip and shedding grey motes. It
    // leaves in a flash, a ring and a puff of glints along its flight; it breaks on an enemy or a
    // wall (`hit`) in a brighter flash and a spray of sparks, with the usual hit impact shown at
    // `impact` of its size; giving out in the air (`fizzle`) is a smaller one. World units and
    // seconds, [min, max] picks at random.
    fx: {
      length: 0.42, width: 0.07, color: 0xb8bcc6, tip: 0xffffff,
      streak: { length: 1.6, width: 0.3, anchor: 0.92, color: 0xc8ccd8, alpha: 0.55 },
      motes: { rate: 90, size: [0.07, 0.14], life: [0.15, 0.3], spread: 0.6, color: 0xe4e6ec, fade: 0x50535c, alpha: 0.7 },
      spawn: {
        flash: { size: 0.7, grow: 1.6, time: 0.16, alpha: 0.8 },
        ring: { from: 0.2, to: 0.9, time: 0.18, alpha: 0.6 },
        glints: { count: 6, speed: 5, lifetime: 0.18, size: 0.2, coneDeg: 30, color: 0xe4e6ec },
      },
      hit: {
        flash: { size: 0.9, grow: 1.8, time: 0.2, alpha: 0.9 },
        sparks: { count: 10, speed: 8, lifetime: 0.2, size: 0.24, coneDeg: 45, color: 0xe2e4ea },
        impact: 0.6,
      },
      fizzle: {
        flash: { size: 0.5, grow: 1.4, time: 0.15, alpha: 0.6 },
        sparks: { count: 5, speed: 4, lifetime: 0.15, size: 0.18, coneDeg: 60, color: 0xc8ccd8 },
      },
    },
  },
  {
    id: 'momentum', displayName: 'Momentum', tier: AspectTier.Gift, icon: 'momentum_icon', activatable: false, stat: AspectStat.Uses,
    quote: 'Never let them see you stop.',
    description: 'Dashing empowers your next attack.',
    // Charged the moment a dash starts; the next swing to land on an enemy or a prop strikes
    // everything it hits for `multiplier` times the damage (src/aspects/momentum.js).
    multiplier: 2.5,
    // The look: while charged the player sheds embers (`motes`, `rate` a second, `spread` from its
    // centre, drifting outward at `drift`); a charged hit lands in a flash, a ring, the hit impact
    // at `impact` times its size in `hot`, a spray of sparks and a shake. World units and seconds,
    // [min, max] at random.
    fx: {
      color: 0xff7a2e, hot: 0xffd9a8,
      motes: { rate: 45, size: [0.14, 0.26], life: [0.3, 0.5], spread: [0.3, 0.6], drift: [0.6, 1.4], alpha: 0.9 },
      hit: {
        flash: { size: 1.2, grow: 2, time: 0.22, alpha: 0.9 },
        ring: { from: 0.4, to: 3.2, time: 0.25, alpha: 0.7 },
        impact: 1.8,
        sparks: { count: 16, speed: 10, lifetime: 0.3, size: 0.35, coneDeg: 50 },
        shake: { duration: 0.14, strength: 0.12, frequency: 28 },
      },
    },
  },
  {
    id: 'afterimage', displayName: 'Afterimage', tier: AspectTier.Gift, icon: 'afterimage_icon', activatable: false, stat: AspectStat.Uses,
    quote: 'They never saw you leave.',
    description: 'Dashing leaves an afterimage behind that draws the enemies away.',
    // Setting off on a dash leaves a copy of the player where they stood, for `lifetime`: every
    // enemy hunts it instead of the player meanwhile (src/aspects/afterimage.js). Their blows
    // still hurt the player if they happen to land. `cooldown` from when it's left; each kill
    // takes cooldownReductionPerKill off.
    lifetime: 3, cooldown: 10, cooldownReductionPerKill: 2,
    // The look: the copy is the player's body and tail exactly, wobbling and breathing on, its
    // tail settling in behind it. Meanwhile the real player is drawn see-through (`unseen`),
    // easing there over `time`. Left behind, a ring closes onto it in a faint flash and a few
    // glints; over its last `flicker.from` seconds it flickers, down to `flicker.alpha`, `rate`
    // times a second; then it swells by `grow` and fades over `time` in a flash, a ring racing
    // out, glints and pale mist. World units and seconds, [min, max] picks at random.
    fx: {
      color: 0xa8c4ff, hot: 0xffffff,
      unseen: { alpha: 0.35, time: 0.15 },
      appear: {
        ring: { from: 1.5, to: 0.5, time: 0.22, alpha: 0.6 }, // band radius
        flash: { size: 1.4, time: 0.2, alpha: 0.35 },
        glints: { count: 5, speed: [0.4, 1.2], size: [0.1, 0.18], life: [0.3, 0.5] },
      },
      flicker: { from: 0.5, rate: 12, alpha: 0.45 },
      vanish: {
        time: 0.25, grow: 1.3,
        flash: { size: 1, grow: 1.8, time: 0.25, alpha: 0.6 },
        ring: { from: 0.5, to: 1.4, time: 0.3, alpha: 0.5 }, // band radius
        glints: { count: 9, speed: [1, 2.6], size: [0.1, 0.2], life: [0.35, 0.6] },
        mist: { count: 7, speed: [0.4, 1.2], size: [0.4, 0.7], life: [0.35, 0.55], alpha: 0.25, grow: 1.8 },
      },
    },
  },
  {
    id: 'cornered', displayName: 'Feral', tier: AspectTier.Gift, icon: 'feral_icon', activatable: false, stat: AspectStat.Uses,
    quote: 'Nothing fights like a cornered cat.',
    description: 'The lower your health, the harder you hit.',
    // Every bit of damage the player deals, whatever deals it, grows with the health they've
    // lost, from 1x at full up to `multiplier` at `threshold` of their health and below
    // (src/aspects/cornered.js). Driven that low counts as a use. The HUD fills its icon
    // as health is lost, full at `threshold`.
    multiplier: 2.5, threshold: 0.3,
    // The look, only while it's at its height: the player burns with a dark red light, a wide
    // soft `halo`, a brighter `core` close round the body and a `rim` of light hugging its
    // edge, all swelling with a heartbeat (`beat` seconds apart, a second softer beat `second`
    // after the first) and flickering a little, and motes of light drift off it. Driven there,
    // the light flares up `flare` times its size and settles over `time`, in a flash, a ring
    // and a spray of sparks; healed out of it, it all eases away over `fadeOut`. Sizes scale
    // with the body. World units and seconds, [min, max] at random.
    fx: {
      color: 0xa8101c, hot: 0xff6a5e, deep: 0x2a0206,
      fadeOut: 0.3,
      light: {
        halo: { size: 4.2, alpha: 1 },
        core: { size: 2, alpha: 0.75 },
        rim: { radius: 0.46, alpha: 0.65 }, // band radius
        flicker: { rate: 7, amount: 0.08 },
      },
      beat: { every: 0.8, second: 0.2, decay: 10, swell: 0.15 },
      motes: { rate: 22, size: [0.1, 0.18], life: [0.5, 0.9], spread: 0.3, speed: [0.3, 0.9], alpha: 0.8 },
      enter: {
        flare: 1.8, time: 0.4,
        flash: { size: 1.4, grow: 1.8, time: 0.25, alpha: 0.7 },
        ring: { from: 0.4, to: 2.2, time: 0.3, alpha: 0.7 }, // band radius
        sparks: { count: 24, speed: 9, lifetime: 0.3, size: 0.3, coneDeg: 180 },
        shake: { duration: 0.12, strength: 0.08, frequency: 30 },
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
    // `lifetime` in flight. With no enemy left to fly at, it keeps guard at its spot behind the
    // player (from the way they face), trailing after them and easing in by `follow` a
    // second, swaying up to `sway` radians round and `bob` of its distance out and in, and
    // pointing the way they face, until the next parry sets them all on the enemy parried,
    // `stagger` apart.
    damage: 2, enemyKnockbackForce: 4, hitRadius: 0.15,
    stagger: [0.4, 0.1], arcDeg: 150, distance: [1.7, 2.2], settleTime: 1, launchDelay: 1,
    speed: 20, turnRate: 10, aimRate: 8, lifetime: 4,
    guard: { follow: 5, sway: 0.12, swaySpeed: 1.3, bob: 0.06, bobSpeed: 2.1, stagger: 0.08 },
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
    description: 'Stringing hits on different enemies calls down thunder that leaps between foes.',
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
    // loses it. The HUD fills its icon as it builds, by the chain so far or, once past
    // sameShownAfter hits in a row on one enemy, by those (whichever is further). twitchDelay
    // after it's all out it twitches once into a new shape, with a second clap of thunder, then
    // holds still for `hold` and fades over `fade`.
    chainHits: 5, sameHits: 10, sameShownAfter: 5, comboTime: 6, reach: 7, maxTargets: 10,
    damage: 2, soloDamage: 4, arcDamage: 1, hitRadius: 0.3, enemyKnockbackForce: 2,
    speed: 150, minJumpTime: 0.01, // how fast it runs along a line, and the least any one jump takes
    twitchDelay: 0.05, hold: 0.35, fade: 0.35, soloTime: 0.06, soloReach: 4.5, // how far out from the enemy alone its arcs crawl
    // The look (src/aspects/thunder.js): jagged bolts, white-hot down the middle in a
    // wide band of purple, under a soft purple glow, with thin forked sprouts off them, each
    // laid down once where things are as it sets off. Every line is cut into pieces no longer
    // than `step` and its midpoints knocked sideways by up to `rough` of each piece's length.
    // Alone, `burst` arcs leap out at once and more follow, `rate` a second, from the enemy or a
    // fork of an arc already out, up to soloReach away. World units and seconds, [min, max] at random.
    fx: {
      color: 0xa94dff, core: 0xffffff, glow: 0x7a2cff,
      width: 0.14, coreWidth: 0.05, glowWidth: [0.55, 0.28], glowAlpha: [0.1, 0.2],
      step: 0.28, rough: 0.42,
      // Sprouts: off a share of a bolt's points, `width` of the bolt's and thinning to `taper` of
      // that. A `share` of them are long, out to 5 units though mostly nearer the low end, with
      // short twigs off them `twig` as wide as a short sprout.
      sprouts: {
        chance: 0.2, length: [0.3, 1], spreadDeg: [25, 70], width: 0.45, taper: 0.4, step: 0.14, rough: 0.5,
        long: { share: 0.08, length: [1.5, 4], width: 0.6, twig: 0.8, step: 0.2, rough: 0.42 },
      },
      solo: { rate: 60, burst: 6, length: [1.2, 2.8], fork: 0.45, width: 0.75 },
      // Static crackling over every enemy in the count so far: `arcs` little jagged arcs hugging
      // its outline (one more for each hit in a row on the enemy hit last, up to maxArcs), from
      // `from` to `to` times its radius out, each `turnDeg` round it, laid anew every `every`.
      static: {
        arcs: 2, maxArcs: 6, from: [0.9, 1.15], to: [0.9, 1.3], turnDeg: [30, 75], step: 0.12, rough: 0.7,
        width: 0.05, glowWidth: 0.24, glowAlpha: 0.35, alpha: [0.6, 1], every: 0.06,
      },
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
    // through the fade: catching fire is a hit for catchDamage, and then it burns for burnTime,
    // taking `burn` damage more in all, a little every step. Catching again hits again and starts
    // the burn over; the burn itself isn't a hit: no flinch, flash or knockback, so it
    // interrupts nothing, and nothing that counts hits counts it.
    length: 2.8, catchDamage: 1, burn: 9, burnTime: 5, bodyReach: 0.2,
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
  {
    id: 'gravebloom', displayName: 'Gravebloom', tier: AspectTier.Prestige, icon: 'gravebloom_icon', activatable: false, stat: AspectStat.Hits,
    quote: 'Every grave a garden.',
    description: 'Fallen enemies leave lotus flowers behind that burst when shaken.',
    // Every enemy killed (its own bursts' kills too) leaves a lotus where it fell
    // (src/aspects/gravebloom.js); armTime after, it can be struck by anything of the player's
    // that deals damage, like a prop. Struck, it bursts in a wave out along the blow (along the
    // swing, for the player's own; else away from where the blow came from): a `cone`
    // `halfDeg` either side, its front racing out from `from` to `range` over `time` (easing
    // out), striking every enemy and prop it passes over, not through walls, once. Set off any
    // other way, it bursts all round instead, in a `ring`: struck by another's burst, `delay`
    // after an enemy is killed within `nearby` of it while it's ready, or grown from a burst's
    // kill, which sets itself off once it's bloomed (doom.at after it appears, bursting
    // doom.delay later, swelling meanwhile). And every streak.hits hits in a row on one enemy
    // (any damage but its bursts'; streak.time without one loses the count) grow a lotus
    // somewhere up to streak.reach out from its edge, clear of walls. There's
    // no limit to how many there are; each wilts after `lifetime`, over wiltTime. radius: how far
    // out from its centre it can be struck (a little past its petals).
    doom: { at: 0.75, delay: 0.12 },
    streak: { hits: 7, time: 6, reach: 2 },
    lifetime: 20, wiltTime: 0.8, armTime: 0.4, radius: 0.3, nearby: 2.5, delay: 0.12,
    cone: { damage: 4, enemyKnockbackForce: 8, halfDeg: 50, from: 0.4, range: 5.5, time: 0.4 },
    ring: { damage: 3, enemyKnockbackForce: 6, from: 0.3, range: 4.2, time: 0.4 },
    // The look: a small pale lotus (about half the player's size), pink at its petal tips and
    // white within round a pale green seed pod, see-through, breathing and swaying a little
    // under a soft pink glow and shedding motes (pink, white and a little green). It blooms out of
    // nothing (`open`): a closed bud swells up over `emerge`, its petals `closed` (length,
    // width) of their full size; each ring's petals start opening at its `starts` (plus up to
    // `jitter`, each), taking `time` to fall open, turning `twist` radians as they go; the
    // seed pod shows from core[0] over core[1]. The glow comes up over growTime. It glints once
    // when it's ready. Set off, it swells by `swell` and brightens until it goes. Its burst: a flash, the flower's petals popping out in light, a
    // wave of pink light with a white edge and a faint green haze trailing it, petals and glints
    // flung along it (`spreadDeg` either side of it, or all round) and a spray of sparks. Wilting,
    // it sheds its petals and fades. World units and seconds, [min, max] at random.
    fx: {
      pink: 0xff7eb6, white: 0xfff2f8, green: 0x9fe0b4, deep: 0xc0306e,
      size: 0.48, alpha: 0.75, growTime: 1, swell: 1.35,
      // As it blooms, `count` misty lines (`lime` of them lime, the rest pink) wander in to it from
      // `radius` out, each setting off `delay` after it appears and taking `time` to run in, its
      // trail `trail` of its length long; `layers`: haze, band and thread (half-width, alpha,
      // colour), over `points` points each. src/aspects/gravebloom.js (gather) for `wander`.
      gather: {
        count: 7, lime: 2, radius: [1, 2], delay: [0, 0.3], time: 0.75, trail: 0.55, points: 16,
        wander: { amp: [2, 5], freq: [1.5, 4], free: 35, pull: 8 },
        layers: [{ width: 0.07, alpha: 0.3 }, { width: 0.025, alpha: 0.45 }, { width: 0.008, alpha: 0.75 }],
        colors: { pink: [0xff6aa8, 0xff9cc8, 0xffe0ee], lime: [0x9fe060, 0xc4f580, 0xeaffc8] },
      },
      open: { emerge: 0.35, starts: [0.1, 0.24, 0.4, 0.55], jitter: 0.08, time: 0.6, closed: [0.25, 0.45], twist: 0.35, core: [0.6, 0.35] },
      glow: { size: 1.1, alpha: [0.22, 0.34], pulse: 0.5, color: 0xff6aa8 },
      breathe: { rate: 2.2, amount: 0.03, sway: 0.05 },
      motes: { rate: 2, size: [0.06, 0.12], life: [0.9, 1.6], spread: 0.22, rise: [0.3, 0.7], alpha: 0.75, greenShare: 0.25 },
      sprout: {
        flash: { size: 0.6, grow: 1.6, time: 0.3, alpha: 0.4 },
        motes: { count: 6, speed: [0.4, 1.2], size: [0.08, 0.16], life: [0.5, 0.9] }, // green, rising out of the ground
      },
      ready: { ring: { from: 0.15, to: 0.5, time: 0.35, alpha: 0.5 }, glints: { count: 4, speed: [0.3, 0.9], size: [0.1, 0.18], life: [0.3, 0.5] } },
      burst: {
        flash: { size: 1.6, grow: 1.8, time: 0.28, alpha: 0.85 },
        // All round: a bigger, brighter flash, a disc of pink haze swelling out to the ring's
        // range under its rings, and a harder shake.
        round: { flash: { size: 2.6, grow: 2, time: 0.35, alpha: 1 }, disc: { alpha: 0.4, time: 1.2 }, shake: { duration: 0.16, strength: 0.12, frequency: 30 } },
        pop: { grow: 1.9, time: 0.3, alpha: 0.9 },
        wave: { alpha: 0.9, fade: 0.6, edge: 0.65, green: 0.3, lag: 0.05 }, // the white edge and the green haze behind
        rings: [
          { from: 0.1, to: 1, time: 1, alpha: 1, fade: 0.4, mist: true }, // band radius in units of the ring's range, time in units of its
          { from: 0.08, to: 1, time: 1, alpha: 1, fade: 0.5 },
          { from: 0.05, to: 0.82, time: 1.2, alpha: 0.6, delay: 0.05, mist: true },
          { from: 0.1, to: 0.7, time: 1.4, alpha: 0.35, delay: 0.08, mist: true, green: true },
        ],
        petals: { count: 26, ringCount: 40, speed: [4, 11], spreadDeg: 50, size: [0.35, 0.55], life: [0.55, 1], alpha: 0.9, sway: 6 },
        glints: { count: 10, ringCount: 22, speed: [2, 6], size: [0.12, 0.24], life: [0.35, 0.65] },
        sparks: { count: 14, ringCount: 30, speed: 9, lifetime: 0.3, size: 0.3 },
        shake: { duration: 0.1, strength: 0.07, frequency: 30 },
      },
      hit: { sparks: { count: 8, speed: 7, lifetime: 0.25, size: 0.26, coneDeg: 40, color: 0xffb3d4 }, impactTint: 0xffc2dc },
      wilt: { petals: 5 },
    },
  },
  {
    id: 'warding', displayName: 'Warding Amulet', tier: AspectTier.Prestige, icon: 'warding_icon', activatable: false, stat: AspectStat.Uses,
    quote: 'Strike true, and be spared.',
    description: 'Land consecutive attacks to gain protection.',
    // Every everyAttacks swings in a row that land on an enemy (one count a swing, however many
    // it strikes) give the player a ward, the one props drop (BUFFS.ward), stacking with any
    // held, unless they already hold maxWards or more (src/aspects/warding.js); a swing that
    // strikes no enemy loses the count. The HUD fills its icon toward the next one.
    everyAttacks: 8, maxWards: 3,
  },
  {
    id: 'bloodthirst', displayName: 'Bloodthirst', tier: AspectTier.Prestige, icon: 'bloodthirst_icon', activatable: false, stat: AspectStat.Uses,
    quote: 'Every wound a mouthful.',
    description: 'Draw life from every wound you deal.',
    // Every hit on an enemy (any damage dealt but a burn's) heals the player `heal`
    // (src/aspects/bloodthirst.js), once the mist it draws out reaches them.
    heal: 0.1,
    // The look: faint red mist. Each hit draws `count` lines of it out of the enemy (no more
    // than `max` about at once), each setting off `delay` after the hit and taking `time`
    // to run in to the player, its trail `trail` of its length long, rushing in faster as it
    // goes (`rush`, the power of its ease); the player is healed as the first one's head
    // reaches them. Each leaves the enemy turned up to `spreadDeg` (plus `jitterDeg`) off
    // the straight line, wavering (`amp`, `freq`: two random turns laid over each other,
    // dying away as it nears) and steered toward the player by `pull`, ever harder toward the
    // end (`tighten`), so it curls in. `layers`: haze, band and thread (half-width, alpha,
    // colour), over `points` points each. A puff of red mist and motes where it's drawn out,
    // and a faint red bloom on the player as each line sinks in. World units and seconds,
    // [min, max] at random.
    fx: {
      red: 0xe0162a, deep: 0x5a0008, bright: 0xff6a6a,
      lines: {
        count: [2, 3], max: 36, delay: [0, 0.12], time: 0.55, trail: 0.6, rush: 1.6, points: 16,
        wander: { spreadDeg: 70, jitterDeg: 20, amp: [2, 5], freq: [1.5, 4], pull: 3, tighten: 8 },
        layers: [
          { width: 0.14, alpha: 0.32, color: 0xa0081a },
          { width: 0.045, alpha: 0.5, color: 0xe0162a },
          { width: 0.012, alpha: 0.8, color: 0xff8a8a },
        ],
      },
      puff: { size: 0.7, grow: 1.6, time: 0.3, alpha: 0.3 },
      motes: { count: 4, speed: [0.3, 1], size: [0.06, 0.12], life: [0.4, 0.8], alpha: 0.7 },
      absorb: { size: 0.9, grow: 1.4, time: 0.25, alpha: 0.22 },
    },
  },
  {
    id: 'antlers', displayName: 'Antlers', tier: AspectTier.Prestige, icon: 'antlers_icon', activatable: false, stat: AspectStat.Hits,
    quote: 'A crown is grown, not given.',
    description: 'Gore whatever your antlers touch. Charge in to strike harder.',
    // Antlers on the player's brow (src/aspects/antlers.js), facing where they aim. An enemy
    // they touch takes touchDamage (once every touchCooldown seconds, each); one the player
    // dashes into them takes ramDamage instead (once a dash, each), as does a prop. Both are
    // scaled by `scale`: `start`, plus a step for every `every` kills of the run (by
    // anything), up to maxKills, the first `step` and each after `grow` more than the last.
    // The antlers grow with every kill until halfway there, then whiten instead, from the
    // base out, over the other half.
    touchDamage: 0.5, ramDamage: 2, touchCooldown: 0.5,
    touchKnockback: 6, ramKnockback: 22,
    scale: { start: 0.1, step: 0.2, grow: 0.02, every: 20, maxKills: 500 },
    // The antler (the right one; the left mirrors it), +x forward, world units (src/render/
    // antlerShape.js, which the icon draws full grown too): its beam leaves `base`, inside the
    // body, `length` long when full grown, and grows out to it by beamBy of the way to full growth
    // from `nub` of it (two little nubs to begin with), its heading along it running smoothly
    // through `curve` ([how far along, degrees off forward]); young, it curls ahead instead, from
    // nubCurve[0] degrees at its root to nubCurve[1] at its tip, giving way to that sweep over the
    // first nubFor of its growth, and while it's still growing its tip curls ahead (to curl.to
    // degrees over its last curl.length). `width`: its half-width at the
    // base, nub to full grown. Every branch thins to `taper` of its base width toward its tip,
    // coming to a sharp point over the last tipLength (thinning as its distance from the tip to
    // the power `point`), with a point every `spacing` or so along it. A branch (`tines`, on the
    // beam or on another branch) forks off at `at` of its parent's length, `width` of the
    // parent's width there, `angle` degrees off the parent's heading there (out and back
    // positive, ahead and in negative), bending by `bend` over its `length` and swaying `sway`
    // degrees one way then the other along it (its own, or the shape's toward the side it left
    // on); it grows out once its parent reaches it, over tineTime of the way to full
    // growth (forkTime times that for each fork deeper). Hit, each part strikes `reach` beyond
    // its half-width.
    shape: {
      base: [0.1, 0.15], length: 2.15, nub: 0.15, nubCurve: [55, -25], nubFor: 0.35, curl: { length: 0.4, to: -20 }, beamBy: 0.72, points: 60,
      curve: [[0, 34], [0.1, 30], [0.3, 126], [0.42, 120], [0.56, 10], [0.8, -6], [1, -10]], // ahead, out and back to the side, ahead again
      width: [0.05, 0.085], taper: 0.6, tipLength: 0.2, point: 0.9, sway: 14, spacing: 0.04, tineTime: 0.22, forkTime: 0.6, reach: 0.04,
      tines: [
        { at: 0.12, angle: -32, bend: -4, length: 0.56, width: 0.92, tines: [ // brow
          { at: 0.4, angle: 58, bend: -14, length: 0.27, width: 0.85 },
        ] },
        { at: 0.33, angle: 78, bend: -20, length: 0.46, width: 0.9, tines: [ // out behind
          { at: 0.42, angle: -62, bend: 6, length: 0.23, width: 0.82 },
        ] },
        { at: 0.48, angle: -108, bend: 8, length: 0.64, width: 0.92, tines: [ // straight ahead off the bend
          { at: 0.45, angle: -52, bend: 10, length: 0.27, width: 0.85 },
        ] },
        { at: 0.63, angle: 58, bend: -30, length: 0.46, width: 0.9, tines: [ // out behind
          { at: 0.42, angle: -62, bend: 6, length: 0.22, width: 0.8 },
        ] },
        { at: 0.77, angle: -96, bend: 10, length: 0.48, width: 0.9, tines: [ // the crown, fanning out
          { at: 0.32, angle: -50, bend: 8, length: 0.27, width: 0.8 },
        ] },
        { at: 0.92, angle: 78, bend: -14, length: 0.32, width: 0.86 },
      ],
    },
    // The look: bone (`color`), all one shade, in an `outline` (`outer` outside its edge and
    // `inner` within, but never more than `keep` of its half-width, carried on `point` times
    // `outer` past each tip; `color`, cooling to `white` as the bone whitens). They come out of
    // the body black (`root`), coming into colour from `from` to `to` out from its centre,
    // inside its outline. Whitening, the white spreads out from the base
    // along each part, `band` of the way out between the two, and glows: soft light along it
    // (`glow`, each puff `size` times the width across, breathing at `pulse` Hz) and glints
    // drifting off the white (`glints`, `rate` a second when all white). It eases into each
    // new size over `ease` seconds. A touch throws off a few bone-coloured sparks, a ram
    // more and a hit flash, with a little shake.
    fx: {
      color: 0xc8955a, white: 0xffffff, outline: { outer: 0.012, inner: 0.026, keep: 0.5, point: 2.5, color: 0x3a2210, white: 0xb4bcd4 },
      root: { from: 0.11, to: 0.29, color: 0x000000 }, band: 0.22, ease: 0.35,
      glow: { size: 7, spacing: 0.05, alpha: 0.13, pulse: 0.4, breathe: 0.25 },
      glints: { rate: 3, size: [0.08, 0.15], life: [0.5, 0.9], speed: [0.1, 0.4], alpha: 0.85 },
      touch: { sparks: { count: 5, speed: 5, lifetime: 0.2, size: 0.22, coneDeg: 50 } },
      ram: {
        sparks: { count: 12, speed: 9, lifetime: 0.3, size: 0.32, coneDeg: 40 },
        shake: { duration: 0.1, strength: 0.08, frequency: 30 },
      },
    },
  },
];
