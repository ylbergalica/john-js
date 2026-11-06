// Procedural sprite art: every sprite, animation frame and aspect icon is drawn here
// with Canvas 2D at load time, so there are no image files. The look is simple and
// a little astral: crisp shapes over soft glows, deep-space fills and four-point
// star glints, each keeping its original silhouette and colour.
// Drawing happens in normalised units (1 = canvas width) unless noted otherwise.
import { SWINGS, swingFrames, chopFrames, parryFrames, parryConnectFrames, hitImpactFrames, spark, glint, ring, wardRing, mistRing } from './combat.js';
import { cleaveSlash, cleaveIcon } from './aspects/cleave.js';
import { mist, flame, ribbon, feathers, feather } from './exalted.js';
import { riftFrames, riftIcon } from './aspects/rift.js';
import { VOIDS, voidFill } from './enemies/common.js';
import { goblinPath, goblinOutline } from './enemies/goblin.js';
import { strikerPath, strikerOutline } from './enemies/striker.js';
import { shadePath, shadeOutline, shadeBlade } from './enemies/shade.js';
import { seerPath, seerOutline } from './enemies/seer.js';
import { maulerPath, maulerOutline, starMaul } from './enemies/mauler.js';
import { seraphOutline, seraphBody } from './enemies/seraph.js';
import { lemurOutline, lemurVoid, lemurSpade } from './enemies/lemur.js';
import { boxerPath, boxerOutline, boxerFist } from './enemies/boxer.js';
import { gunnerPath, gunnerOutline } from './enemies/gunner.js';
import { corsairOutline, corsairVoid, scimitar } from './enemies/corsair.js';
import { weaverOutline, weaverVoid, silkDew, silkKnot } from './enemies/weaver.js';
import { bulwarkOutline, bulwarkVoid, bulwarkShield } from './enemies/bulwark.js';
import { jetPath, jetOutline } from './enemies/jet.js';
import { morayPath, morayOutline, morayFang } from './enemies/moray.js';
import { tyrantPath, tyrantOutline, tyrantBarrel } from './enemies/tyrant.js';
import { COLLAPSAR_BODY, collapsarOutline, collapsarDisc, collapsarWisps, collapsarStrands, collapsarWell } from './enemies/collapsar.js';
import { revenantPath, revenantOutline, revenantNeedle } from './enemies/revenant.js';
import { razorPath, razorOutline, razorDisc, razorBlades } from './enemies/razor.js';
import { cometPath, cometOutline, cometTail, cometWake } from './enemies/comet.js';
import { BINARY_ART, binaryPath, binaryOutline } from './enemies/binary.js';
import { novaOutline, novaVoid } from './enemies/nova.js';
import { blightOutline, blightVoid, blightPartSprites } from './enemies/blight.js';
import { tail, dashGhost, orb, crescent, comet, core, hexFlat, hexPointed, exitPortal, hexFrame } from './player.js';
import { anchorObject, anchorIcon } from './aspects/anchor.js';
import { propSprites, angerSign, shard } from './props.js';
import { circlePath } from './paint.js';
import { swiftGlyph, wardGlyph, hasteGlyph, furyGlyph } from './buffs.js';
import { flashIcon } from './aspects/flash.js';
import { predatorIcon } from './aspects/predator.js';
import { wraithForm, wraithIcon } from './aspects/wraith.js';
import { ASTRAL_EXALTED, astralBlade, astralIcon } from './aspects/astral.js';
import { needleIcon } from './aspects/needle.js';
import { momentumIcon } from './aspects/momentum.js';
import { afterimageIcon } from './aspects/afterimage.js';
import { feralIcon } from './aspects/feral.js';
import { LOTUS_RINGS, bloomOuter, bloomInner, lotusPetalSprite, bloomWisp, lotusCore, bloomWave, bloomPetal, gravebloomIcon } from './aspects/gravebloom.js';
import { wardingIcon } from './aspects/warding.js';
import { bloodthirstIcon } from './aspects/bloodthirst.js';
import { antlersIcon } from './aspects/antlers.js';
import { ORACLE, oracleDisc, oracleGlow, oracleIcon } from './aspects/oracle.js';
import { blackRoseIcon } from './aspects/blackrose.js';
import { nebulaIcon } from './aspects/nebula.js';
import { thunderIcon } from './aspects/thunder.js';
import { phoenixIcon } from './aspects/phoenix.js';
import { coinIcon, GEM_CUTS, gemIcon } from './ui.js';

// Frame-based animations play at FX.animFps (48); each has the frame count below.
export function animations() {
  return {
    first_swing: swingFrames(SWINGS.first),
    second_swing: swingFrames(SWINGS.second),
    third_swing: swingFrames(SWINGS.third),
    fourth_swing: swingFrames(SWINGS.fourth),
    momentum_chop: chopFrames(),
    parry: parryFrames(),
    parry_connect: parryConnectFrames(),
    hit_impact: hitImpactFrames(),
    rift_open: riftFrames('open'),
    rift_close: riftFrames('close'),
  };
}

export function sprites() {
  return {
    goblin_idle: goblinOutline(),
    goblin_idle_void: voidFill(goblinPath(), VOIDS.goblin),
    striker_idle: strikerOutline(),
    striker_idle_void: voidFill(strikerPath(), VOIDS.striker),
    seraph_idle: seraphOutline(),
    seraph_idle_void: seraphBody(),
    mauler_idle: maulerOutline(),
    mauler_idle_void: voidFill(maulerPath(), VOIDS.mauler),
    star_maul: starMaul(),
    shade_idle: shadeOutline(),
    shade_idle_void: voidFill(shadePath(), VOIDS.shade),
    shade_blade: shadeBlade(),
    seer_idle: seerOutline(),
    seer_idle_void: voidFill(seerPath(), VOIDS.seer, 'evenodd'),
    lemur_idle: lemurOutline(),
    lemur_idle_void: lemurVoid(),
    lemur_spade: lemurSpade(),
    lemur_spade_rim: lemurSpade(true),
    boxer_idle: boxerOutline(),
    boxer_idle_void: voidFill(boxerPath(), VOIDS.boxer),
    boxer_fist: boxerFist(),
    gunner_idle: gunnerOutline(),
    gunner_idle_void: voidFill(gunnerPath(), VOIDS.gunner),
    corsair_idle: corsairOutline(),
    corsair_idle_void: corsairVoid(),
    scimitar: scimitar(),
    weaver_idle: weaverOutline(),
    weaver_idle_void: weaverVoid(),
    silk_knot: silkKnot(),
    silk_dew: silkDew(),
    nova_idle: novaOutline(),
    nova_idle_void: novaVoid(),
    bulwark_idle: bulwarkOutline(),
    bulwark_idle_void: bulwarkVoid(),
    bulwark_shield: bulwarkShield(),
    jet_idle: jetOutline(),
    jet_idle_void: voidFill(jetPath(), VOIDS.jet),
    razor_idle: razorOutline(),
    razor_idle_void: voidFill(razorPath(), VOIDS.razor),
    razor_disc: razorDisc(),
    razor_blades: razorBlades(),
    tyrant_idle: tyrantOutline(),
    tyrant_idle_void: voidFill(tyrantPath(), VOIDS.tyrant),
    tyrant_barrel: tyrantBarrel(),
    moray_idle: morayOutline(),
    moray_idle_void: voidFill(morayPath(), VOIDS.moray),
    moray_fang: morayFang(),
    comet_idle: cometOutline(),
    comet_idle_void: voidFill(cometPath(), VOIDS.comet),
    comet_tail: cometTail(),
    comet_wake: cometWake(),
    collapsar_idle: collapsarOutline(),
    collapsar_idle_void: voidFill(circlePath(COLLAPSAR_BODY.r), VOIDS.collapsar),
    collapsar_disc: collapsarDisc(),
    collapsar_wisps: collapsarWisps(),
    collapsar_strands: collapsarStrands(),
    collapsar_well: collapsarWell(),
    revenant_idle: revenantOutline(),
    revenant_idle_void: voidFill(revenantPath(), VOIDS.revenant),
    revenant_needle: revenantNeedle(),
    binary_idle: binaryOutline(BINARY_ART.rims[0]),
    binary_idle_void: voidFill(binaryPath(), VOIDS.binary),
    binary_twin_idle: binaryOutline(BINARY_ART.rims[1]),
    binary_twin_idle_void: voidFill(binaryPath(), VOIDS.binaryTwin),
    blight_idle: blightOutline(),
    blight_idle_void: blightVoid(),
    ...blightPartSprites(),
    tail: tail(),
    dash_ghost: dashGhost(),
    spark: spark(),
    glint: glint(),
    ring: ring(),
    ward_ring: wardRing(),
    mist_ring: mistRing(),
    anchor_object: anchorObject(),
    cleave_slash: cleaveSlash(),
    wraith_form: wraithForm(),
    astral_blade: astralBlade(),
    astral_blade_exalted: astralBlade(ASTRAL_EXALTED),
    orb: orb(),
    crescent: crescent(),
    comet: comet(),
    core: core(),
    hexFlat: hexFlat(),
    hexPointed: hexPointed(),
    exitPortal: exitPortal(),
    hexFrame: hexFrame(),
    mist: mist(),
    flame: flame(),
    ribbon: ribbon(),
    feathers: feathers(),
    feather: feather(),
    bloom_outer: bloomOuter(),
    ...Object.fromEntries(LOTUS_RINGS.map((R, i) => [`lotus_petal_${i}`, lotusPetalSprite(R)])),
    lotus_core: lotusCore(),
    bloom_wisp: bloomWisp(),
    bloom_inner: bloomInner(),
    bloom_wave: bloomWave(),
    bloom_petal: bloomPetal(),
    ...propSprites(),
    shard: shard(),
    oracle_disc: oracleDisc(),
    oracle_disc_exalted: oracleDisc(ORACLE.exalted),
    oracle_glow: oracleGlow(),
  };
}

export function icons() {
  return {
    anchor_icon: anchorIcon(),
    cleave_icon: cleaveIcon(),
    flash_icon: flashIcon(),
    predator_icon: predatorIcon(),
    rift_icon: riftIcon(),
    wraith_icon: wraithIcon(),
    astral_icon: astralIcon(),
    thunder_icon: thunderIcon(),
    phoenix_icon: phoenixIcon(),
    needle_icon: needleIcon(),
    momentum_icon: momentumIcon(),
    afterimage_icon: afterimageIcon(),
    feral_icon: feralIcon(),
    gravebloom_icon: gravebloomIcon(),
    warding_icon: wardingIcon(),
    bloodthirst_icon: bloodthirstIcon(),
    antlers_icon: antlersIcon(),
    oracle_icon: oracleIcon(),
    blackrose_icon: blackRoseIcon(),
    nebula_icon: nebulaIcon(),
    coin_icon: coinIcon(),
    anger_sign: angerSign(),
    buff_swift: swiftGlyph(),
    buff_ward: wardGlyph(),
    buff_fury: furyGlyph(),
    buff_haste: hasteGlyph(),
    ...Object.fromEntries(Object.entries(GEM_CUTS).map(([tier, cut]) => [`gem_${tier}`, gemIcon(cut)])),
  };
}
