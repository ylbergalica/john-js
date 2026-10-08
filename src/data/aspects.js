// Aspects: equippable perks bought with coins, and their tiers.

export const AspectTier = { Gift: 0, Prestige: 1, Mythic: 2 };
export const TIERS = [
  { tier: AspectTier.Gift, name: 'Gift', price: 1000, color: 'var(--gift)' },
  { tier: AspectTier.Prestige, name: 'Prestige', price: 5000, color: 'var(--prestige)' },
  { tier: AspectTier.Mythic, name: 'Mythic', price: 15000, color: 'var(--mythic)' },
];
export const MAX_EQUIPPED_ASPECTS = 3;

// `id` values are save keys; never rename them.
export const ASPECTS = [
  {
    id: 'anchor', displayName: 'Anchor', tier: AspectTier.Gift, icon: 'anchor_icon', activatable: true,
    quote: "Now you see me, now you don't.",
    description: 'Throw an anchor which you can teleport to at any time.',
    throwImpulse: 20, settleSpeedThreshold: 0.2, settleGraceTime: 0.25, retrievalRadius: 0.45,
    teleportWindUpTime: 0.5, teleportRecoverTime: 0.5, windRadius: 5, windDuration: 1, windForce: 20,
    anchorMass: 1, anchorDamping: 5, anchorSize: 0.36 * 2, anchorRadius: 0.18, anchorTint: 0xd95732,
    teleportDotScale: 0.08, windRingWidth: 0.45,
  },
  {
    id: 'assassin', displayName: 'Predator', tier: AspectTier.Gift, icon: 'predator_icon', activatable: false,
    quote: "You miss 100% of the shots you don't take.",
    description: 'Attacks aimed at an enemy blink you into ideal melee range.',
    targetAcquireDistance: 10, aimDotThreshold: 0.5, minimumBlinkDistance: 0.2,
  },
  {
    id: 'crescent', displayName: 'Crescent', tier: AspectTier.Gift, icon: 'crescent_icon', activatable: false,
    quote: 'Every strike leaves a wake.',
    description: 'Connecting a hit sends a crescent slash flying forward.',
    damage: 1, speed: 25, travelDistance: 4.5, spawnForwardOffset: 0.5, enemyKnockbackForce: 9, cooldown: 0,
    hitboxDepth: 0.36178464 * 1.5, hitboxWidth: 1.765077 * 1.5, spriteSize: 2 * 1.5, alpha: 0.2784314,
  },
  {
    id: 'flash', displayName: 'Flash', tier: AspectTier.Gift, icon: 'flash_icon', activatable: true,
    quote: 'F for flash.',
    description: 'Blink a short distance. Every parry or kill reduces the active cooldown.',
    maxBlinkDistance: 6, baseCooldown: 10, cooldownReductionPerTrigger: 1,
  },
  {
    id: 'rift', displayName: 'Rift', tier: AspectTier.Gift, icon: 'rift_icon', activatable: false,
    quote: 'Compact violent solutions.',
    description: 'Connecting a parry unfolds damaging rift-blades on each side.',
    activeTime: 1, damage: 1, enemyKnockbackForce: 5, minDamage: 0.2,
    hitboxDepth: 0.6074743 * 0.8, hitboxWidth: 4.5242996 * 0.8, spriteW: 1 * 0.8, spriteH: 5 * 0.8,
  },
];
