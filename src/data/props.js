// Destroyable props (src/game/props.js): odds and ends of the void left lying about the
// floors, smashed with attacks for what's sealed inside. Each is a solid but heavy body the
// player and enemies can nudge, taking `health` worth of hits (attack damage, so stronger
// hits break them sooner); every hit cracks it further (its art has a sprite per crack
// stage, src/render/sprites.js). `size`: the sprite's width; `spin`: its art slowly turns
// (rad/s). Sizes in world units; times in seconds; [min, max] picks at random.
//   starPod     a closed bud of petals, starlight glowing through the seams: one hit,
//               the petals bursting off.
//   cagedStar   a star held in turning rings of light: one hit, the rings snapping.
//   starEgg     a speckled shell, something bright stirring inside: two hits, cracking open.
//   geode       a lump of void rock, light leaking through its cracks: three hits.
//   reliquary   a gilded hex casket sealing a star: five hits, rare, never empty.
// `glow`: the trapped light behind it, breathing (alpha at its dimmest and brightest,
//   `pulse` Hz), brighter as it cracks (`crackGlow`: extra alpha once fully cracked).
// `mote`: a star glinting inside it (`at`: its place on the sprite, from the centre, ×
//   size), wandering up to `drift` units, turning at `spin` rad/s.
// `hit`: struck but holding: it flashes white, is pushed off along the blow (`push`, units/s),
//   jolts away from it (`jolt`, units, just the look) and wobbles (`wobble`: squash at the
//   start, `wobbleTime`, `wobbleHz`); chips fly back off the struck face and light sprays out
//   through the far side, with a small shake.
// `break`: as an enemy death (DEATH_FX.enemy; flash/rings sized in body radii) plus shards of
//   its shell flung out, mostly along the blow (`shards`: speeds in units/s, `spin` rad/s,
//   `colors` picked at random, settling on the floor and fading over `life`).
// `loot`: `rolls` tries, each dropping something with `chance`, picked from LOOT[`table`].
export const PROPS = {
  starPod: {
    health: 1, radius: 0.34, size: 0.82, mass: 2, damping: 14,
    color: 0xc8a8ff, // its light: sparks, flash, rings
    glow: { size: 2.2, alpha: [0.12, 0.24], pulse: 0.45, crackGlow: 0 },
    mote: { size: 0.2, at: [0, 0], drift: 0, spin: 0.5 }, // the star peeking out where the petals meet
    sounds: { hit: 'podHit', break: 'podBreak' },
    hit: {
      push: 2.5, jolt: 0.06, wobble: 0.22, wobbleTime: 0.3, wobbleHz: 9,
      chips: { count: 4, speed: [2, 4], size: [0.08, 0.14], life: [0.5, 0.8] },
      sparks: { count: 10, speed: 7, lifetime: 0.3, size: 0.3, coneDeg: 40 },
      shake: { duration: 0.08, strength: 0.05, frequency: 30 },
    },
    break: {
      pop: { time: 0.24, scale: 1.8 },
      flash: { size: 5, grow: 1.8, time: 0.22, alpha: 0.9 },
      rings: [{ delay: 0, time: 0.3, from: 1, to: 4, alpha: 0.85 }],
      rays: null,
      sparks: [{ count: 20, speed: 9, lifetime: 0.45, size: 0.4, coneDeg: 180 }, { count: 10, speed: 6, lifetime: 0.35, size: 0.25, coneDeg: 180, color: 0xffffff }],
      blow: { count: 12, speed: 13, lifetime: 0.35, size: 0.45, coneDeg: 26, color: 0xffffff },
      stars: { count: 8, speed: [2, 5], size: [0.18, 0.32], life: [0.6, 1.1], color: 0xffffff },
      mist: { count: 5, speed: [0.8, 2], size: [0.8, 1.3], grow: 2.2, life: [0.5, 0.8], alpha: 0.35 },
      embers: null,
      shards: { count: 14, speed: [2.5, 6.5], size: [0.16, 0.3], spin: 10, life: [1.2, 2], along: 0.4, colors: [0x2a1e40, 0x4a3670, 0x8a6cc8, 0xd8c4ff] },
      shake: { duration: 0.14, strength: 0.1, frequency: 26 },
      ripple: null,
    },
    loot: { rolls: 1, chance: 0.22, table: 'common' },
  },
  cagedStar: {
    health: 1, radius: 0.34, size: 0.86, mass: 2, damping: 14, spin: 0.35,
    color: 0x9fd8ff,
    glow: { size: 2.2, alpha: [0.16, 0.28], pulse: 0.6, crackGlow: 0 },
    mote: { size: 0.36, at: [0, 0], drift: 0.03, spin: 0.7 }, // the star in the cage
    sounds: { hit: 'cageHit', break: 'cageBreak' },
    hit: {
      push: 2.5, jolt: 0.06, wobble: 0.2, wobbleTime: 0.3, wobbleHz: 10,
      chips: { count: 4, speed: [2, 4], size: [0.08, 0.14], life: [0.5, 0.8] },
      sparks: { count: 12, speed: 8, lifetime: 0.3, size: 0.3, coneDeg: 40 },
      shake: { duration: 0.08, strength: 0.05, frequency: 30 },
    },
    break: {
      pop: { time: 0.22, scale: 1.9 },
      flash: { size: 5.5, grow: 2, time: 0.25, alpha: 0.95 },
      rings: [{ delay: 0, time: 0.3, from: 1, to: 4.5, alpha: 0.95, color: 0xffffff }, { delay: 0.05, time: 0.5, from: 1, to: 6, alpha: 0.4 }],
      rays: { count: 4, length: [3, 4.5], width: [0.2, 0.3], time: [0.25, 0.4] },
      sparks: [{ count: 24, speed: 11, lifetime: 0.45, size: 0.4, coneDeg: 180 }, { count: 10, speed: 6, lifetime: 0.35, size: 0.25, coneDeg: 180, color: 0xffffff }],
      blow: { count: 14, speed: 14, lifetime: 0.35, size: 0.45, coneDeg: 26, color: 0xffffff },
      stars: { count: 10, speed: [2, 6], size: [0.2, 0.36], life: [0.6, 1.1], color: 0xffffff },
      mist: { count: 3, speed: [0.8, 2], size: [0.8, 1.2], grow: 2, life: [0.4, 0.7], alpha: 0.25 },
      embers: null,
      shards: { count: 14, speed: [3, 7.5], size: [0.16, 0.32], spin: 16, life: [0.9, 1.6], along: 0.3, colors: [0xffffff, 0xc8e8ff, 0x7fb8e8] },
      shake: { duration: 0.14, strength: 0.1, frequency: 26 },
      ripple: null,
    },
    loot: { rolls: 1, chance: 0.22, table: 'common' },
  },
  starEgg: {
    health: 2, radius: 0.34, size: 0.84, mass: 3, damping: 14,
    color: 0xffb8a0,
    glow: { size: 2.3, alpha: [0.06, 0.2], pulse: 0.8, crackGlow: 0.16 },
    mote: null,
    sounds: { hit: 'eggHit', break: 'eggBreak' },
    hit: {
      push: 2, jolt: 0.05, wobble: 0.18, wobbleTime: 0.3, wobbleHz: 9,
      chips: { count: 5, speed: [2, 4], size: [0.08, 0.16], life: [0.6, 1] },
      sparks: { count: 12, speed: 8, lifetime: 0.32, size: 0.32, coneDeg: 38 },
      shake: { duration: 0.09, strength: 0.06, frequency: 28 },
    },
    break: {
      pop: { time: 0.26, scale: 1.7 },
      flash: { size: 5, grow: 2, time: 0.28, alpha: 0.95 },
      rings: [{ delay: 0, time: 0.35, from: 1, to: 4, alpha: 0.9 }],
      rays: { count: 5, length: [2.5, 4], width: [0.22, 0.34], time: [0.3, 0.45] },
      sparks: [{ count: 26, speed: 11, lifetime: 0.5, size: 0.42, coneDeg: 180 }],
      blow: { count: 14, speed: 14, lifetime: 0.38, size: 0.5, coneDeg: 26, color: 0xffffff },
      stars: { count: 12, speed: [2, 6], size: [0.2, 0.36], life: [0.7, 1.2], color: 0xffffff },
      mist: { count: 6, speed: [1, 2.5], size: [0.9, 1.4], grow: 2.2, life: [0.5, 0.8], alpha: 0.35 },
      embers: null,
      shards: { count: 16, speed: [2, 6], size: [0.14, 0.28], spin: 9, life: [1.4, 2.2], along: 0.4, colors: [0x2e1c22, 0x4a2e34, 0x8a5a58, 0xffd0c0] },
      shake: { duration: 0.16, strength: 0.12, frequency: 24 },
      ripple: null,
    },
    loot: { rolls: 1, chance: 0.3, table: 'common' },
  },
  geode: {
    health: 3, radius: 0.42, size: 1.05, mass: 4, damping: 14,
    color: 0x7af0d0,
    glow: { size: 2.4, alpha: [0.08, 0.16], pulse: 0.35, crackGlow: 0.14 },
    mote: null,
    sounds: { hit: 'stoneHit', break: 'stoneBreak' },
    hit: {
      push: 1.8, jolt: 0.05, wobble: 0.14, wobbleTime: 0.28, wobbleHz: 10,
      chips: { count: 6, speed: [2, 4.5], size: [0.1, 0.2], life: [0.7, 1.1] },
      sparks: { count: 14, speed: 9, lifetime: 0.35, size: 0.36, coneDeg: 36 },
      shake: { duration: 0.1, strength: 0.08, frequency: 28 },
    },
    break: {
      pop: { time: 0.26, scale: 1.6 },
      flash: { size: 5, grow: 2, time: 0.28, alpha: 0.95 },
      rings: [{ delay: 0, time: 0.35, from: 1, to: 4, alpha: 0.9 }, { delay: 0.06, time: 0.55, from: 1, to: 6, alpha: 0.4 }],
      rays: { count: 5, length: [3, 5], width: [0.25, 0.4], time: [0.3, 0.45] },
      sparks: [{ count: 30, speed: 12, lifetime: 0.5, size: 0.45, coneDeg: 180 }],
      blow: { count: 18, speed: 16, lifetime: 0.4, size: 0.55, coneDeg: 24, color: 0xffffff },
      stars: { count: 10, speed: [2, 6], size: [0.2, 0.36], life: [0.7, 1.2], color: 0xffffff },
      mist: { count: 6, speed: [1, 2.5], size: [1, 1.5], grow: 2.2, life: [0.5, 0.8], alpha: 0.35 },
      embers: null,
      shards: { count: 18, speed: [2, 6], size: [0.14, 0.32], spin: 9, life: [1.4, 2.4], along: 0.45, colors: [0x3a3550, 0x2b2840, 0x4f4a68, 0x7af0d0] },
      shake: { duration: 0.18, strength: 0.14, frequency: 24 },
      ripple: null,
    },
    loot: { rolls: 1, chance: 0.4, table: 'common' },
  },
  reliquary: {
    health: 5, radius: 0.48, size: 1.12, mass: 6, damping: 14,
    color: 0xffd27a,
    glow: { size: 3, alpha: [0.18, 0.32], pulse: 0.7, crackGlow: 0.2 },
    mote: { size: 0.4, at: [0, 0], drift: 0, spin: 0.4 }, // the sealed star, flaring brighter as it cracks
    maxPerFloor: 1, // at most this many on a floor
    sounds: { hit: 'cacheHit', break: 'cacheBreak' },
    hit: {
      push: 1.2, jolt: 0.04, wobble: 0.12, wobbleTime: 0.3, wobbleHz: 11,
      chips: { count: 6, speed: [2, 4.5], size: [0.1, 0.2], life: [0.7, 1.1] },
      sparks: { count: 16, speed: 9, lifetime: 0.38, size: 0.38, coneDeg: 36 },
      shake: { duration: 0.1, strength: 0.09, frequency: 28 },
    },
    break: {
      pop: { time: 0.35, scale: 1.9 },
      flash: { size: 6, grow: 2.2, time: 0.4, alpha: 1 },
      rings: [
        { delay: 0, time: 0.4, from: 1, to: 5, alpha: 1, color: 0xffffff },
        { delay: 0.08, time: 0.7, from: 1, to: 8, alpha: 0.6 },
      ],
      rays: { count: 8, length: [4, 7], width: [0.3, 0.5], time: [0.45, 0.65] },
      sparks: [{ count: 46, speed: 15, lifetime: 0.65, size: 0.5, coneDeg: 180 }, { count: 20, speed: 9, lifetime: 0.5, size: 0.3, coneDeg: 180, color: 0xffffff }],
      blow: { count: 22, speed: 18, lifetime: 0.45, size: 0.6, coneDeg: 26, color: 0xffffff },
      stars: { count: 22, speed: [3, 9], size: [0.22, 0.42], life: [0.9, 1.6], color: 0xffffff },
      mist: { count: 10, speed: [1.5, 3.5], size: [1.2, 1.8], grow: 2.4, life: [0.7, 1.1], alpha: 0.4 },
      embers: { count: 16, speed: [1.5, 5], size: [0.12, 0.24], life: [0.9, 1.6] },
      shards: { count: 24, speed: [2.5, 7.5], size: [0.14, 0.3], spin: 11, life: [1.6, 2.6], along: 0.35, colors: [0xffe2a0, 0xd9a64a, 0x8a6424, 0xfff4d6] },
      shake: { duration: 0.3, strength: 0.22, frequency: 20 },
      ripple: { duration: 0.9, strength: 0.025, width: 0.07, glow: 0.4, grade: [1, 1, 1] },
    },
    loot: { rolls: 1, chance: 1, table: 'rich' },
  },
};

// What a broken prop can hold, weighted. `count`: how many of it drop at once.
export const LOOT = {
  common: [
    { drop: 'adrenaline', weight: 5, count: [2, 4] },
    { drop: 'mend', weight: 3 },
    { drop: 'swift', weight: 1 },
    { drop: 'ward', weight: 1 },
    { drop: 'fury', weight: 1 },
    { drop: 'haste', weight: 1 },
  ],
  rich: [
    { drop: 'adrenaline', weight: 2, count: [4, 6] },
    { drop: 'mend', weight: 2 },
    { drop: 'swift', weight: 2 },
    { drop: 'ward', weight: 2 },
    { drop: 'fury', weight: 2 },
    { drop: 'haste', weight: 2 },
  ],
};

// Props scattered over each floor (scatterProps in src/game/props.js), gathered in nooks:
// floor against a wall, a corner where two walls meet. Each room gets `room.clusters`
// clusters and the corridors `corridor.clusters` between them, each of `clusterSize`
// props, all of one type, or (`mixed` of the time) each of its own: the first in a corner
// `cornerBias` of the time (else along a wall), the rest lined up in the nooks beside it
// (or huddled within `spread` units of it if there are none). In rooms, `pile.chance` of
// clusters are instead a tight pile of `pile.size`, each pressed against another, none
// more than `pile.reach` units from the first. A nook needs `open` tiles of floor out from
// its walls, so props never narrow the way. Never within `clearOfStart` units of the start
// or the exit. `hoard`: `chance` a floor that a corridor also gets a huge pile of `size`
// props all of one kind (never one with a `maxPerFloor`), heaped out of one of its nooks (a
// corner `cornerBias` of the time) up to `reach` units, spilling into a room if it must.
export const PROP_SPAWN = {
  hoard: { chance: 0.05, size: [30, 50], reach: 14, cornerBias: 0.85 },
  room: { clusters: [1, 1], clusterSize: [2, 3], cornerBias: 0.85, mixed: 0.4, pile: { chance: 0.5, size: [3, 5], reach: 1.6 } },
  corridor: { clusters: [1, 3], clusterSize: [1, 2], cornerBias: 0.6, mixed: 0.4, pile: null },
  spread: 1.1,
  open: 3,
  clearOfStart: 4,
  types: [
    { type: 'starPod', weight: 2 },
    { type: 'cagedStar', weight: 2 },
    { type: 'starEgg', weight: 2 },
    { type: 'geode', weight: 2 },
    { type: 'reliquary', weight: 0.35 },
  ],
};

// Small boons dropped by props (src/player/buffs.js). `time`: seconds it lasts (picking
// another up starts it over). swift: × move speed; fury: × attack damage; haste: × the
// wait between attacks (lower is faster); ward: blocks the next hit outright, however long
// that takes, with a moment of invulnerability after.
// While one holds the player shows it (`color`), and the HUD lists it with what's left.
export const BUFFS = {
  swift: { time: 30, speed: 1.3, color: 0x7fe8ff },
  fury: { time: 30, damage: 1.5, color: 0xff5fc8 },
  haste: { time: 30, cooldown: 0.6, color: 0xffe95a },
  ward: { color: 0xc8d4ff },
};

// The look of buffs on the player (src/player/buffView.js). Sizes in world units.
//   gain: a flash, a ring and sparks in its colour, as the exit's flare.
//   ward: a bubble around the body (`radius`, its rim breathing at `pulse` Hz) with glints
//     circling it (`orbit` rad/s); struck, it bursts (`burst`) into shards.
//   swift: wisps peeling off the body as it moves (`rate` per second at full speed) and
//     motes left in its wake.
//   fury: embers rising off the body (`rate` per second) and now and then a crackle of sparks.
//   haste: little arcs of lightning jumping off the body's edge (`rate` per second), and a
//     snap of it along each swing.
export const BUFF_FX = {
  gain: { flash: 2.6, ring: 3, time: 0.45, sparks: { count: 18, speed: 8, lifetime: 0.4, size: 0.32, coneDeg: 180 } },
  end: { count: 8, speed: [0.5, 1.5], size: [0.12, 0.22], life: [0.5, 0.9] },
  ward: {
    radius: 0.62, alpha: [0.45, 0.7], pulse: 0.8, fill: 0.14,
    glints: 3, orbit: 1.6, glintSize: 0.22,
    appear: 0.25,
    burst: {
      ring: 3.2, flash: 2.6, time: 0.4,
      sparks: { count: 26, speed: 11, lifetime: 0.45, size: 0.38, coneDeg: 180 },
      shards: { count: 14, speed: [3, 7], size: [0.1, 0.22], spin: 14, life: [0.8, 1.3] },
      shake: { duration: 0.22, strength: 0.25, frequency: 22 },
    },
  },
  swift: {
    rate: 26, minSpeed: 1,
    wisps: { count: 1, speed: 4, lifetime: 0.3, size: 0.5, coneDeg: 14 },
    motes: { size: [0.14, 0.26], life: [0.45, 0.75], spread: 0.3 },
  },
  fury: {
    rate: 18, rim: [0.85, 1.15], // embers start around the body's edge (× its radius)
    embers: { size: [0.1, 0.18], life: [0.45, 0.8], speed: [0.6, 1.6], lift: 1.6, fade: 0x4a0030 },
    crackleEvery: [0.5, 1.1], crackle: { count: 4, speed: 5, lifetime: 0.2, size: 0.24, coneDeg: 180 },
  },
  haste: {
    rate: 14, arcs: { count: 2, speed: 5, lifetime: 0.18, size: 0.32, coneDeg: 50 },
    swing: { count: 10, speed: 9, lifetime: 0.2, size: 0.3, coneDeg: 35 },
  },
};
