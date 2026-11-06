// Props: pods, cages, eggs, geodes, druses, reliquaries and spawners, and their crack stages.
import { seededRandom, lerp, TAU } from '../../engine/math.js';
import { DEG, surface, rgba, polar, glow, linear, radial, sparkle, hexPath, circlePath } from './paint.js';
import { nebula } from './enemies/common.js';

// ---------------------------------------------------------------- props

// Destroyable props (src/game/props.js): one sprite per crack stage, `${name}_${stage}`.
// Each is a shape of void in a glowing outline like the enemies, cracks of the light sealed
// inside spreading through it stage by stage (each stage keeps the last one's cracks).
export function propSprites() {
  const out = {};
  for (const name of Object.keys(PROP_ART)) {
    for (let stage = 0; stage < propStageCount(name); stage++) out[`${name}_${stage}`] = propSprite(name, stage);
  }
  return out;
}

export const propStageCount = (name) => PROP_ART[name].cracks.length;

const PROP_ART = {
  // A closed bud seen from above: petals curling round into the middle, starlight glowing
  // through the seams between them (a star peeks out where they meet, at runtime).
  starPod: {
    path: podPath, line: 0.034, cracks: [0],
    palette: { stroke: ['#f0e4ff', '#c8a8ff', '#6a4aa8'], glow: rgba('#b48cff', 0.7) },
    fill: (ctx) => radial(ctx, 0.5, 0.5, 0.4, ['#2a1c44', '#0a0614'], 0.44, 0.42),
    clouds: [['#9a6cff', 0.2], ['#5a7cff', 0.12]], seed: 61,
    detail: podDetail,
  },
  // A star (drawn at runtime) held in a cage of light seen from above: an outer ring and
  // two tilted orbits crossing it, slowly turning.
  cagedStar: {
    path: () => circlePath(CAGE.r), line: 0.03, cracks: [0],
    palette: { stroke: ['#ffffff', '#9fd8ff', '#3f7cc4'], glow: rgba('#7fc8ff', 0.8) },
    fill: (ctx) => radial(ctx, 0.5, 0.5, CAGE.r, [rgba('#16305a', 0.55), rgba('#060c1c', 0.35)]),
    clouds: [['#3f8cff', 0.12]], seed: 67,
    detail: cageDetail,
  },
  // A speckled egg of void lying on its side, something bright stirring inside; its shell
  // cracks before it bursts.
  starEgg: {
    path: eggPath, line: 0.034, cracks: [0, 4],
    palette: { stroke: ['#fff0e8', '#ffb8a0', '#a85a4a'], glow: rgba('#ff9a80', 0.6) },
    fill: (ctx) => radial(ctx, 0.5, 0.5, 0.4, ['#3a2230', '#0c0608'], 0.42, 0.4),
    clouds: [['#ff8a6a', 0.16], ['#8a4adc', 0.12]], seed: 89,
    crack: '#fff0e8', crackGlow: rgba('#ffb8a0', 0.95),
    detail: eggDetail,
  },
  // A lump of void rock, a cluster of crystal poking out of one side, light leaking
  // through its cracks.
  geode: {
    path: geodePath, line: 0.034, cracks: [2, 4, 6],
    palette: { stroke: ['#d6d0ee', '#8c85ad', '#4a4466'], glow: rgba('#6fe0c4', 0.4) },
    fill: (ctx) => radial(ctx, 0.5, 0.5, 0.4, ['#262236', '#09080f'], 0.42, 0.4),
    clouds: [['#2fae8c', 0.16], ['#5a46b0', 0.18]], seed: 73,
    crack: '#e6fff8', crackGlow: rgba('#7af0d0', 0.95),
    detail: geodeDetail, over: geodeCrystals,
  },
  // A lump of void rock like the geode, rose crystals breaking out of it in clumps all round
  // its rim. Each stage snaps more of the crystals off to glowing stumps.
  druse: {
    path: drusePath, line: 0.034, cracks: [1, 3, 5, 7],
    palette: { stroke: ['#e4d6e8', '#9a88a8', '#4a3e5a'], glow: rgba('#ff8ac8', 0.4) },
    fill: (ctx) => radial(ctx, 0.5, 0.5, 0.4, ['#282030', '#09070d'], 0.42, 0.4),
    clouds: [['#ff5aa8', 0.16], ['#6a46b0', 0.16]], seed: 103,
    crack: '#fff0f8', crackGlow: rgba('#ff8ac8', 0.95),
    detail: druseDetail, over: druseCrystals,
  },
  // A gilded hex casket: an inner hex sealing a star, straps of gold out to studs at its
  // corners.
  reliquary: {
    path: reliquaryPath, line: 0.04, cracks: [0, 2, 4, 6, 8],
    palette: { stroke: ['#fff4d6', '#ffd27a', '#a8701e'], glow: rgba('#ffb347', 0.7) },
    fill: (ctx) => radial(ctx, 0.5, 0.5, 0.42, ['#2a1d08', '#080502'], 0.44, 0.42),
    clouds: [['#d99a2a', 0.18], ['#7a3ec0', 0.12]], seed: 79,
    crack: '#fff6dc', crackGlow: rgba('#ffc85a', 0.95),
    detail: reliquaryDetail,
  },
  // A spawner: a wound in the void, a crown of uneven thorns round a slit of an eye, red
  // veins throbbing out from it to every thorn. Cracks split it wide before it bursts. Each
  // spawner in play grows its own (spawnerSprites); this one is the spawn menu's.
  spawner: spawnerArt(137),
};

function propSprite(name, stage, S = 256, A = PROP_ART[name]) {
  const { c, ctx, px } = surface(S);
  const shape = A.path();
  ctx.fillStyle = A.fill(ctx);
  ctx.fill(shape);
  ctx.save();
  ctx.clip(shape);
  nebula(ctx, seededRandom(A.seed), A.clouds, 5, A.cloudBox);
  A.detail(ctx, px);
  // Cracks: a soft glow under a thin white-hot line, both brighter each stage (and
  // `crackWidth` times as wide, if it has one).
  const heat = A.cracks.length > 1 ? stage / (A.cracks.length - 1) : 0, cw = A.crackWidth ?? 1;
  for (let i = 0; i < A.cracks[stage]; i++) {
    const p = crackPath(seededRandom(A.seed * 31 + i * 97), 0.42);
    glow(ctx, A.crackGlow, px * lerp(0.03, 0.06, heat) * cw, () => {
      ctx.strokeStyle = A.crackGlow;
      ctx.lineWidth = lerp(0.02, 0.03, heat) * cw;
      ctx.stroke(p);
    });
    ctx.strokeStyle = A.crack;
    ctx.lineWidth = lerp(0.008, 0.014, heat) * cw;
    ctx.stroke(p);
  }
  ctx.restore();
  ctx.strokeStyle = linear(ctx, 0.2, 0.15, 0.8, 0.85, A.palette.stroke);
  glow(ctx, A.palette.glow, px * 0.035, () => {
    ctx.lineWidth = A.line;
    ctx.stroke(shape);
  });
  A.over?.(ctx, px, stage);
  return c;
}

// A crack wandering out from near the centre past `reach`, with the odd short branch.
function crackPath(rand, reach) {
  const p = new Path2D();
  const walk = (x, y, heading, len, branchy) => {
    p.moveTo(x, y);
    for (let d = 0; d < len;) {
      const step = lerp(0.03, 0.055, rand()), a = heading + lerp(-0.75, 0.75, rand());
      x += Math.cos(a) * step; y += Math.sin(a) * step; d += step;
      p.lineTo(x, y);
      if (branchy && rand() < 0.2) {
        walk(x, y, heading + lerp(0.6, 1.1, rand()) * (rand() < 0.5 ? -1 : 1), (len - d) * 0.5, false);
        p.moveTo(x, y);
      }
    }
  };
  const a = rand() * TAU, r = rand() * 0.06;
  walk(0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r, a, reach, true);
  return p;
}

// The star pod's petals: `n` of them round to radius `r`, each bulging out to `bulge` × r
// between the seams; the seams curl `twist` degrees round on their way in.
const POD = { n: 6, r: 0.32, bulge: 1.32, twist: 34 };

// Where seam `i` meets the rim (degrees, radius).
const podSeam = (i) => [(i / POD.n) * 360 - 90, POD.r];

function podPath() {
  const p = new Path2D();
  for (let i = 0; i <= POD.n; i++) {
    const [a, r] = podSeam(i), [x, y] = polar(0.5, 0.5, a, r);
    if (i === 0) { p.moveTo(x, y); continue; }
    const [cx, cy] = polar(0.5, 0.5, a - 180 / POD.n, r * POD.bulge);
    p.quadraticCurveTo(cx, cy, x, y);
  }
  p.closePath();
  return p;
}

// The petals, every other one catching the light, and the seams between them glowing.
function podDetail(ctx, px) {
  const seam = (i) => {
    const [a, r] = podSeam(i), [x, y] = polar(0.5, 0.5, a, r), [cx, cy] = polar(0.5, 0.5, a - POD.twist, r * 0.55);
    return { x, y, cx, cy };
  };
  for (let i = 0; i < POD.n; i += 2) {
    const s0 = seam(i), s1 = seam(i + 1), [bx, by] = polar(0.5, 0.5, podSeam(i + 1)[0] - 180 / POD.n, POD.r * POD.bulge);
    const p = new Path2D();
    p.moveTo(0.5, 0.5);
    p.quadraticCurveTo(s0.cx, s0.cy, s0.x, s0.y);
    p.quadraticCurveTo(bx, by, s1.x, s1.y);
    p.quadraticCurveTo(s1.cx, s1.cy, 0.5, 0.5);
    ctx.fillStyle = rgba('#b48cff', 0.1);
    ctx.fill(p);
  }
  const seams = new Path2D();
  for (let i = 0; i < POD.n; i++) {
    const s = seam(i);
    seams.moveTo(0.5, 0.5);
    seams.quadraticCurveTo(s.cx, s.cy, s.x, s.y);
  }
  glow(ctx, rgba('#c8a8ff', 0.95), px * 0.05, () => {
    ctx.strokeStyle = rgba('#c8a8ff', 0.9);
    ctx.lineWidth = 0.026;
    ctx.stroke(seams);
  });
  ctx.strokeStyle = '#f4ecff';
  ctx.lineWidth = 0.009;
  ctx.stroke(seams);
  ctx.fillStyle = radial(ctx, 0.5, 0.5, 0.12, [rgba('#e8dcff', 0.7), rgba('#b48cff', 0)]);
  ctx.fillRect(0.38, 0.38, 0.24, 0.24);
}

// The caged star's outer ring (`r`), the two orbits crossing it (`orbit`: half-length,
// half-width, tilt in degrees either way), and an inner ring (`inner`).
const CAGE = { r: 0.42, orbit: [0.4, 0.15, 32], inner: 0.2 };

function cageDetail(ctx, px) {
  const [ox, oy, tilt] = CAGE.orbit;
  const rings = new Path2D();
  for (const t of [tilt, -tilt]) {
    rings.moveTo(0.5 + Math.cos(t * DEG) * ox, 0.5 + Math.sin(t * DEG) * ox); // no line joining it to the last
    rings.ellipse(0.5, 0.5, ox, oy, t * DEG, 0, TAU);
  }
  rings.moveTo(0.5 + CAGE.inner, 0.5);
  rings.arc(0.5, 0.5, CAGE.inner, 0, TAU);
  glow(ctx, rgba('#7fc8ff', 0.9), px * 0.04, () => {
    ctx.strokeStyle = rgba('#bfe4ff', 0.85);
    ctx.lineWidth = 0.018;
    ctx.stroke(rings);
  });
  // Beads of light riding the orbits.
  for (const [t, at] of [[tilt, 40], [-tilt, 200], [tilt, 250]]) {
    const a = at * DEG, c = Math.cos(t * DEG), s = Math.sin(t * DEG);
    const ex = Math.cos(a) * ox, ey = Math.sin(a) * oy;
    sparkle(ctx, 0.5 + ex * c - ey * s, 0.5 + ex * s + ey * c, 0.04, '#ffffff', 0.9);
  }
  ctx.fillStyle = radial(ctx, 0.5, 0.5, 0.18, [rgba('#cfeaff', 0.55), rgba('#7fc8ff', 0)]);
  ctx.fillRect(0.32, 0.32, 0.36, 0.36);
}

// An egg on its side, rounder at one end.
function eggPath() {
  const p = new Path2D();
  p.moveTo(0.13, 0.5);
  p.bezierCurveTo(0.13, 0.3, 0.4, 0.21, 0.57, 0.21);
  p.bezierCurveTo(0.76, 0.21, 0.87, 0.34, 0.87, 0.5);
  p.bezierCurveTo(0.87, 0.66, 0.76, 0.79, 0.57, 0.79);
  p.bezierCurveTo(0.4, 0.79, 0.13, 0.7, 0.13, 0.5);
  p.closePath();
  return p;
}

// Pale speckles over the shell and a soft sheen along its top.
function eggDetail(ctx) {
  const rand = seededRandom(97);
  for (let i = 0; i < 22; i++) {
    ctx.fillStyle = rgba('#ffd8c8', lerp(0.15, 0.45, rand()));
    ctx.beginPath();
    ctx.arc(lerp(0.18, 0.84, rand()), lerp(0.25, 0.75, rand()), lerp(0.005, 0.016, rand()), 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = rgba('#ffffff', 0.4);
  ctx.lineWidth = 0.022;
  ctx.beginPath();
  ctx.moveTo(0.3, 0.32); ctx.quadraticCurveTo(0.5, 0.25, 0.7, 0.29);
  ctx.stroke();
  ctx.fillStyle = radial(ctx, 0.56, 0.52, 0.2, [rgba('#ffb8a0', 0.35), rgba('#ffb8a0', 0)]);
  ctx.fillRect(0.3, 0.3, 0.5, 0.45);
}

// A lumpy, angular rock: a seeded ring of points at jittered radii.
function geodePath() {
  const rand = seededRandom(71), n = 11, p = new Path2D();
  for (let i = 0; i < n; i++) {
    const a = ((i + lerp(-0.25, 0.25, rand())) / n) * TAU, r = lerp(0.3, 0.385, rand());
    const x = 0.5 + Math.cos(a) * r, y = 0.5 + Math.sin(a) * r;
    if (i === 0) p.moveTo(x, y); else p.lineTo(x, y);
  }
  p.closePath();
  return p;
}

// Faint facet edges catching the light across the rock.
function geodeDetail(ctx) {
  const rand = seededRandom(83);
  ctx.strokeStyle = rgba('#b8b0e0', 0.12);
  ctx.lineWidth = 0.012;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = rand() * TAU, b = a + lerp(0.8, 1.6, rand());
    ctx.moveTo(0.5 + Math.cos(a) * 0.38, 0.5 + Math.sin(a) * 0.38);
    ctx.lineTo(0.5 + Math.cos(a) * 0.12 + lerp(-0.05, 0.05, rand()), 0.5 + Math.sin(a) * 0.12);
    ctx.lineTo(0.5 + Math.cos(b) * 0.38, 0.5 + Math.sin(b) * 0.38);
  }
  ctx.stroke();
}

// Teal crystals breaking out of its lower right.
function geodeCrystals(ctx, px) {
  const shards = [[38, 0.3, 0.16, 0.05], [22, 0.31, 0.11, 0.035], [56, 0.29, 0.1, 0.034]]; // angle°, root radius, length, half width
  glow(ctx, rgba('#7af0d0', 0.8), px * 0.04, () => {
    for (const [deg, r0, len, w] of shards) {
      const a = deg * DEG, [x, y] = polar(0.5, 0.5, deg, r0);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(-0.02, -w); ctx.lineTo(len * 0.7, -w * 0.8); ctx.lineTo(len, 0); ctx.lineTo(len * 0.7, w * 0.8); ctx.lineTo(-0.02, w);
      ctx.closePath();
      ctx.fillStyle = linear(ctx, 0, -w, 0, w, ['#d8fff4', '#4fd8b4', '#1c7a64']);
      ctx.fill();
      ctx.strokeStyle = '#eafffa';
      ctx.lineWidth = 0.01;
      ctx.stroke();
      ctx.restore();
    }
  });
}

// The druse's crystals, in clumps breaking out round the rock's rim: [angle in degrees, root's
// distance from the centre, length, half width], drawn in order so later ones lie over
// earlier ones. `snap`: the ones snapped off by each crack stage (by index, `perStage` more
// each stage, the biggest first), each leaving a stump `stump` × its length, light pouring
// from the break.
const DRUSE = {
  crystals: [
    [-26, 0.25, 0.17, 0.045], [-75, 0.25, 0.15, 0.042], [-50, 0.22, 0.24, 0.066],
    [56, 0.25, 0.15, 0.044], [96, 0.26, 0.13, 0.038], [76, 0.22, 0.23, 0.06],
    [207, 0.25, 0.15, 0.044], [133, 0.27, 0.12, 0.034], [185, 0.22, 0.22, 0.058],
  ],
  snap: [2, 5, 8, 0, 3, 6], perStage: 2, stump: 0.35,
};

// A lumpy, angular rock like the geode's, smaller to leave room for its crystals.
function drusePath() {
  const rand = seededRandom(107), n = 11, p = new Path2D();
  for (let i = 0; i < n; i++) {
    const a = ((i + lerp(-0.25, 0.25, rand())) / n) * TAU, r = lerp(0.26, 0.33, rand());
    const x = 0.5 + Math.cos(a) * r, y = 0.5 + Math.sin(a) * r;
    if (i === 0) p.moveTo(x, y); else p.lineTo(x, y);
  }
  p.closePath();
  return p;
}

// Faint facet edges catching the light across the rock, and light pooling where the
// crystals break out of it.
function druseDetail(ctx) {
  const rand = seededRandom(109);
  ctx.strokeStyle = rgba('#d0b0d0', 0.12);
  ctx.lineWidth = 0.012;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = rand() * TAU, b = a + lerp(0.8, 1.6, rand());
    ctx.moveTo(0.5 + Math.cos(a) * 0.33, 0.5 + Math.sin(a) * 0.33);
    ctx.lineTo(0.5 + Math.cos(a) * 0.11 + lerp(-0.05, 0.05, rand()), 0.5 + Math.sin(a) * 0.11);
    ctx.lineTo(0.5 + Math.cos(b) * 0.33, 0.5 + Math.sin(b) * 0.33);
  }
  ctx.stroke();
  for (const [deg, r0, len] of DRUSE.crystals) {
    const [x, y] = polar(0.5, 0.5, deg, r0), r = len * 0.8;
    ctx.fillStyle = radial(ctx, x, y, r, [rgba('#ff8ac8', 0.45), rgba('#ff8ac8', 0)]);
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

// The crystals, those snapped off by `stage` as stumps.
function druseCrystals(ctx, px, stage = 0) {
  const snapped = new Set(DRUSE.snap.slice(0, stage * DRUSE.perStage));
  DRUSE.crystals.forEach(([deg, r0, len, w], i) => {
    druseColumn(ctx, px, polar(0.5, 0.5, deg, r0), deg, len, w, snapped.has(i) ? DRUSE.stump : null);
  });
}

// Each face of a druse crystal, lit side to shaded, brightening from root to tip.
const DRUSE_FACES = [
  ['#b0407e', '#ff9ad0', '#fff0f8'],
  ['#7a2058', '#e0609e', '#ffc4e2'],
  ['#3e0c30', '#8e2a62', '#c86aa2'],
];

// A crystal breaking out of the rock at `root`, pointing `deg`: a six-sided column (three of
// its faces showing, lit, half lit and shaded) rising to a facetted point, darker at its
// root, a glowing edge, the ridges between its faces catching the light, and a glint on the
// lit face. Snapped (`cut`: the share of it left), it ends in a jagged break glowing
// white-hot instead.
function druseColumn(ctx, px, root, deg, len, w, cut) {
  ctx.save();
  ctx.translate(...root);
  ctx.rotate(deg * DEG);
  const b = -0.02, t = w / 3, sh = len * 0.68, ridge = len * 0.76; // root, a ridge's offset, the shoulders
  let edge, faces, ridges; // the outline, each face's corners, the ridges between them
  if (cut == null) {
    edge = [[b, -w], [sh, -w], [len, 0], [sh, w], [b, w]];
    faces = [
      [[b, -w], [sh, -w], [len, 0], [ridge, -t], [b, -t]],
      [[b, -t], [ridge, -t], [len, 0], [ridge, t], [b, t]],
      [[b, t], [ridge, t], [len, 0], [sh, w], [b, w]],
    ];
    ridges = [[[b, -t], [ridge, -t], [len, 0]], [[b, t], [ridge, t], [len, 0]]];
  } else {
    const c = len * cut, k = [[c * 1.08, -w], [c * 0.9, -t], [c * 1.16, 0], [c * 1.02, t], [c * 0.94, w]];
    edge = [[b, -w], ...k, [b, w]];
    faces = [[[b, -w], k[0], k[1], [b, -t]], [[b, -t], k[1], k[2], k[3], [b, t]], [[b, t], k[3], k[4], [b, w]]];
    ridges = [[[b, -t], k[1]], [[b, t], k[3]]];
  }
  const path = (pts) => {
    const p = new Path2D();
    pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
    p.closePath();
    return p;
  };
  const outline = path(edge), reach = cut == null ? len : len * cut;
  glow(ctx, rgba('#ff8ac8', 0.85), px * 0.05, () => { ctx.fillStyle = '#7a2058'; ctx.fill(outline); });
  faces.forEach((f, i) => {
    ctx.fillStyle = linear(ctx, 0, 0, len, 0, DRUSE_FACES[i]);
    ctx.fill(path(f));
  });
  ctx.fillStyle = linear(ctx, b, 0, reach * 0.55, 0, [rgba('#2a0820', 0.6), rgba('#2a0820', 0)]);
  ctx.fill(outline);
  ctx.strokeStyle = rgba('#ffe8f4', 0.6);
  ctx.lineWidth = 0.006;
  ctx.beginPath();
  for (const r of ridges) r.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  glow(ctx, rgba('#ff8ac8', 0.9), px * 0.035, () => {
    ctx.strokeStyle = '#fff0f8';
    ctx.lineWidth = 0.011;
    ctx.stroke(outline);
  });
  if (cut == null) {
    ctx.strokeStyle = rgba('#ffffff', 0.75); // light running up the lit face
    ctx.lineWidth = 0.008;
    ctx.beginPath(); ctx.moveTo(len * 0.18, -w * 0.68); ctx.lineTo(sh * 0.92, -w * 0.68); ctx.stroke();
    if (w > 0.05) sparkle(ctx, sh * 0.95, -w * 0.62, w * 0.95, '#ffffff', 0.95);
  } else {
    glow(ctx, rgba('#ffffff', 0.95), px * 0.06, () => {
      ctx.beginPath();
      edge.slice(1, -1).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.strokeStyle = '#fff4fa';
      ctx.lineWidth = 0.016;
      ctx.stroke();
    });
  }
  ctx.restore();
}

const RELIQUARY_HEX = { w: 0.84, inner: 0.52 };

function reliquaryHex(scale = 1) {
  const w = RELIQUARY_HEX.w, h = w * Math.sin(Math.PI / 3), p = new Path2D();
  p.addPath(hexPath(w, h, true), new DOMMatrix().translate(0.5, 0.5).scale(scale).translate(-w / 2, -h / 2));
  return p;
}

function reliquaryPath() { return reliquaryHex(); }

// The inner hex, gold straps out to studded corners, and the sealed star.
function reliquaryDetail(ctx, px) {
  const R = RELIQUARY_HEX, corners = Array.from({ length: 6 }, (_, i) => polar(0.5, 0.5, i * 60, R.w / 2));
  ctx.strokeStyle = rgba('#ffd27a', 0.45);
  ctx.lineWidth = 0.014;
  ctx.beginPath();
  for (const [x, y] of corners) {
    ctx.moveTo(lerp(0.5, x, R.inner), lerp(0.5, y, R.inner));
    ctx.lineTo(lerp(0.5, x, 0.9), lerp(0.5, y, 0.9));
  }
  ctx.stroke();
  ctx.strokeStyle = rgba('#ffe2a0', 0.8);
  ctx.lineWidth = 0.018;
  ctx.stroke(reliquaryHex(R.inner));
  ctx.fillStyle = '#ffe2a0';
  for (const [x, y] of corners) {
    ctx.beginPath();
    ctx.arc(lerp(0.5, x, 0.8), lerp(0.5, y, 0.8), 0.018, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = radial(ctx, 0.5, 0.5, 0.2, [rgba('#ffd27a', 0.45), rgba('#ffd27a', 0)]);
  ctx.fillRect(0.3, 0.3, 0.4, 0.4);
  glow(ctx, rgba('#ffc85a', 0.9), px * 0.05, () => sparkle(ctx, 0.5, 0.5, 0.13, '#fff4d6'));
}

// A spawner's crown, laid out afresh from each spawner's own seed so no two look alike:
// `count` thorns (picked in range) round a core of radius `r`, spaced evenly but for a
// little `jitter` (× the spacing), each pointing straight out to its own length past the
// core (`reach`), its own width (`width`, × the spacing either side), its sides bowing out
// or in a touch alike (`bow`).
const SPAWNER = { count: [6, 12], r: [0.2, 0.27], reach: [0.06, 0.2], width: [0.26, 0.4], jitter: 0.08, bow: [-0.25, 0.35] };

function spawnerCrown(seed) {
  const S = SPAWNER, rand = seededRandom(seed);
  const n = S.count[0] + Math.floor(rand() * (S.count[1] - S.count[0] + 1));
  const step = 360 / n, turn = rand() * 360, r = lerp(...S.r, rand());
  const thorns = Array.from({ length: n }, (_, i) => ({
    a: turn + (i + lerp(-S.jitter, S.jitter, rand())) * step,
    tip: r + lerp(...S.reach, rand()),
    half: step * lerp(...S.width, rand()),
    bow: lerp(...S.bow, rand()),
  }));
  return { r, thorns };
}

// The art (as PROP_ART's) of the spawner grown from `seed`.
function spawnerArt(seed) {
  let crown = null;
  const get = () => (crown ??= spawnerCrown(seed)); // only once it's drawn: SPAWNER isn't set yet while PROP_ART is
  return {
    path: () => spawnerPath(get()), line: 0.03, cracks: [0, 3, 6, 9, 12, 16], crackWidth: 1.7,
    palette: { stroke: ['#ff9a8a', '#c0141c', '#3a0208'], glow: rgba('#ff1a10', 0.75) },
    fill: (ctx) => radial(ctx, 0.5, 0.5, 0.44, ['#30040a', '#0a0004', '#020001'], 0.5, 0.5),
    clouds: [['#c0101a', 0.22], ['#5a0a3a', 0.18], ['#ff3a24', 0.08]], seed, cloudBox: [0.2, 0.8, 0.2, 0.8],
    crack: '#ffd8cc', crackGlow: rgba('#ff3a24', 0.95),
    detail: (ctx, px) => spawnerDetail(ctx, px, get(), seed), over: spawnerEye,
  };
}

// A spawner's own sprites, one per crack stage, grown from `seed` (src/game/spawner.js).
export function spawnerSprites(seed) {
  const A = spawnerArt(seed);
  return A.cracks.map((_, stage) => propSprite('spawner', stage, 256, A));
}

// Each thorn straight out from the core, its sides bowed alike; between thorns the rim
// sags in a little toward the core.
function spawnerPath({ r, thorns }) {
  const p = new Path2D();
  thorns.forEach((t, i) => {
    const [lx, ly] = polar(0.5, 0.5, t.a - t.half, r), [tx, ty] = polar(0.5, 0.5, t.a, t.tip);
    const [rx, ry] = polar(0.5, 0.5, t.a + t.half, r), mid = (r + t.tip) / 2, side = t.half * 0.5 * (1 + t.bow);
    const [c1x, c1y] = polar(0.5, 0.5, t.a - side, mid), [c2x, c2y] = polar(0.5, 0.5, t.a + side, mid);
    if (i === 0) p.moveTo(lx, ly); else p.lineTo(lx, ly);
    p.quadraticCurveTo(c1x, c1y, tx, ty);
    p.quadraticCurveTo(c2x, c2y, rx, ry);
    const next = thorns[(i + 1) % thorns.length], gap = ((next.a - next.half + 360 - (t.a + t.half)) % 360) / 2;
    const [sx, sy] = polar(0.5, 0.5, t.a + t.half + gap, r * 0.9);
    const [nx, ny] = polar(0.5, 0.5, next.a - next.half, r);
    p.quadraticCurveTo(sx, sy, nx, ny);
  });
  p.closePath();
  return p;
}

// Veins: a branching red line from the eye out to the tip of every thorn, throbbing hot
// near the middle, and the darkness pooling round the eye.
function spawnerDetail(ctx, px, { thorns }, seed) {
  const rand = seededRandom(seed + 7), veins = new Path2D();
  for (const t of thorns) {
    let x = 0.5, y = 0.5;
    const a = t.a * DEG, [ex, ey] = polar(0.5, 0.5, t.a, t.tip * 0.92);
    veins.moveTo(x, y);
    for (let k = 1; k <= 6; k++) {
      const f = k / 6, wob = lerp(-0.035, 0.035, rand()) * (1 - f * 0.6);
      x = lerp(0.5, ex, f) - Math.sin(a) * wob;
      y = lerp(0.5, ey, f) + Math.cos(a) * wob;
      veins.lineTo(x, y);
      if (k === 3 && rand() < 0.7) { // a short fork off to the side
        const side = rand() < 0.5 ? -1 : 1, fa = a + side * lerp(0.5, 0.9, rand()), len = lerp(0.04, 0.08, rand());
        veins.moveTo(x, y);
        veins.lineTo(x + Math.cos(fa) * len, y + Math.sin(fa) * len);
        veins.moveTo(x, y);
      }
    }
  }
  glow(ctx, rgba('#ff1a10', 0.9), px * 0.04, () => {
    ctx.strokeStyle = rgba('#b0101a', 0.85);
    ctx.lineWidth = 0.018;
    ctx.stroke(veins);
  });
  ctx.strokeStyle = rgba('#ff6a50', 0.55);
  ctx.lineWidth = 0.006;
  ctx.stroke(veins);
  ctx.fillStyle = radial(ctx, 0.5, 0.5, 0.2, [rgba('#000000', 0.85), rgba('#000000', 0)]);
  ctx.fillRect(0.3, 0.3, 0.4, 0.4);
}

// The eye, over everything: an almond slit, hot red rimmed in black, a darker slit of a
// pupil down it and a glint, so it reads however the spawner lies.
function spawnerEye(ctx, px) {
  const w = 0.075, hh = 0.15, eye = new Path2D();
  eye.moveTo(0.5, 0.5 - hh);
  eye.quadraticCurveTo(0.5 + w * 2, 0.5, 0.5, 0.5 + hh);
  eye.quadraticCurveTo(0.5 - w * 2, 0.5, 0.5, 0.5 - hh);
  glow(ctx, rgba('#ff2a10', 1), px * 0.07, () => {
    ctx.fillStyle = radial(ctx, 0.5, 0.5, hh, ['#ffe0c8', '#ff3a1a', '#8a0008']);
    ctx.fill(eye);
  });
  ctx.strokeStyle = '#0a0002';
  ctx.lineWidth = 0.014;
  ctx.stroke(eye);
  const pupil = new Path2D();
  pupil.moveTo(0.5, 0.5 - hh * 0.75);
  pupil.quadraticCurveTo(0.5 + w * 0.42, 0.5, 0.5, 0.5 + hh * 0.75);
  pupil.quadraticCurveTo(0.5 - w * 0.42, 0.5, 0.5, 0.5 - hh * 0.75);
  ctx.fillStyle = '#120004';
  ctx.fill(pupil);
  sparkle(ctx, 0.5 + w * 0.45, 0.5 - hh * 0.4, 0.035, '#ffffff', 0.9);
}

// An angry guardian's sign (ANGER_SIGN, src/ui/angerSign.js): nothing but a churning cloud
// of red mist, with the mist missing in three places: two long slits of eyes slanting down
// hard toward each other, and a mouth torn wide in a roar, its corners hooked up, its edges
// ragged into fangs of the mist itself. Dark seeps into the holes, so they read as void
// over anything, the guardian included.
export function angerSign(S = 256) {
  const { c, ctx, px } = surface(S);
  const rand = seededRandom(151);
  // The cloud: dark at its ragged rim, hotter toward its heart, with tendrils curling off it.
  ctx.save();
  ctx.filter = `blur(${Math.round(px * 0.028)}px)`;
  for (let i = 0; i < 70; i++) {
    const a = rand() * TAU, d = Math.sqrt(rand()) * 0.37, edge = d / 0.37;
    const x = 0.5 + Math.cos(a) * d, y = 0.54 + Math.sin(a) * d * 1.05, r = lerp(0.08, 0.17, rand());
    const color = edge > 0.8 ? '#7a0810' : rand() < 0.45 ? '#d4141a' : '#8a0810';
    ctx.fillStyle = radial(ctx, x, y, r, [rgba(color, lerp(0.6, 0.9, rand())), rgba(color, 0.3), rgba(color, 0)]);
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 9; i++) { // tendrils
    const a = (i / 9) * TAU + lerp(-0.3, 0.3, rand()), len = lerp(0.06, 0.1, rand());
    for (let k = 0; k < 5; k++) {
      const d = 0.36 + (k / 4) * len, bend = Math.sin(k * 0.9) * 0.05, r = lerp(0.05, 0.02, k / 4);
      const x = 0.5 + Math.cos(a + bend) * d, y = 0.54 + Math.sin(a + bend) * d * 1.05;
      ctx.fillStyle = radial(ctx, x, y, r, [rgba('#6a0a10', 0.6 * (1 - k / 5)), rgba('#6a0a10', 0)]);
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  ctx.restore();

  // Eyes: long thin slits, the inner ends dropped low, the outer ends flicked up to points.
  const eye = (side) => {
    const p = new Path2D(), o = side;
    p.moveTo(0.5 + o * 0.035, 0.47);
    p.quadraticCurveTo(0.5 + o * 0.15, 0.39, 0.5 + o * 0.29, 0.315);
    p.quadraticCurveTo(0.5 + o * 0.2, 0.45, 0.5 + o * 0.045, 0.495);
    p.closePath();
    return p;
  };
  // The mouth: corners hooked up, the upper edge ragged with fangs hanging in, the lower
  // dropped deep with fangs jutting up.
  const mouth = new Path2D(), L = 0.24, R = 0.76, half = (R - L) / 2;
  const top = (x) => 0.6 - 0.05 * ((x - 0.5) / half) ** 4;
  const bottom = (x) => 0.6 + 0.25 * (1 - ((x - 0.5) / half) ** 2) ** 0.7;
  const upper = [[0.3, 0.06], [0.355, 0.11], [0.42, 0.05], [0.47, 0.035], [0.53, 0.035], [0.58, 0.05], [0.645, 0.11], [0.7, 0.06]];
  const lower = [[0.67, 0.05], [0.6, 0.09], [0.53, 0.04], [0.47, 0.04], [0.4, 0.09], [0.33, 0.05]];
  mouth.moveTo(L, 0.54);
  for (const [x, len] of upper) {
    const w = len * 0.32;
    mouth.lineTo(x - w, top(x - w));
    mouth.lineTo(x + lerp(-0.006, 0.006, rand()), top(x) + len);
    mouth.lineTo(x + w, top(x + w));
  }
  mouth.lineTo(R, 0.54);
  mouth.quadraticCurveTo(R - 0.01, 0.66, 0.71, bottom(0.71));
  for (const [x, len] of lower) {
    const w = len * 0.36;
    mouth.lineTo(x + w, bottom(x + w));
    mouth.lineTo(x + lerp(-0.006, 0.006, rand()), bottom(x) - len);
    mouth.lineTo(x - w, bottom(x - w));
  }
  mouth.lineTo(0.29, bottom(0.29));
  mouth.quadraticCurveTo(L + 0.01, 0.66, L, 0.54);
  mouth.closePath();

  // Cut out of the cloud, soft at the rims and clean through in the middle...
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  for (const [blur, alpha] of [[0.022, 0.8], [0.008, 1]]) {
    ctx.filter = `blur(${Math.round(px * blur)}px)`;
    ctx.fillStyle = rgba('#000000', alpha);
    for (const p of [eye(-1), eye(1), mouth]) ctx.fill(p);
  }
  // ...and darkness seeping into them, so they're void whatever's behind.
  ctx.globalCompositeOperation = 'destination-over';
  ctx.filter = `blur(${Math.round(px * 0.01)}px)`;
  ctx.fillStyle = rgba('#050001', 0.92);
  for (const p of [eye(-1), eye(1), mouth]) ctx.fill(p);
  ctx.restore();
  return c;
}

// A shard of a broken prop or ward, white so it can be tinted (src/render/debris.js): a
// jagged sliver, pale with a bright edge, pointing along +x. Stretched at random for variety.
export function shard(S = 64) {
  const { c, ctx } = surface(S);
  const p = new Path2D();
  p.moveTo(0.94, 0.5); p.lineTo(0.42, 0.22); p.lineTo(0.08, 0.44); p.lineTo(0.3, 0.6); p.lineTo(0.5, 0.78);
  p.closePath();
  ctx.fillStyle = linear(ctx, 0.1, 0.3, 0.9, 0.7, ['#ffffff', '#bcbcbc', '#909090']);
  ctx.fill(p);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 0.05;
  ctx.stroke(p);
  return c;
}
