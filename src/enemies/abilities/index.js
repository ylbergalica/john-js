// Every enemy ability by its data `type` (data/abilities.js). Enemies whose moves are only
// the shared ones (melee.js, throw.js) have no file of their own.
import { DashAbility, SwingAbility, SmashAbility } from './melee.js';
import { RamAbility, LaserAbility, MissilesAbility } from './seraph.js';
import { PunchAbility, GroundPoundAbility, SlamAbility } from './warden.js';
import { SlashesAbility } from './shade.js';
import { HookAbility, FlurryAbility } from './boxer.js';
import { ScimitarAbility, RushAbility } from './corsair.js';
import { BashAbility, PlantAbility } from './bulwark.js';
import { JetDashAbility, SwoopAbility } from './jet.js';
import { ThrowAbility, CannonsAbility } from './throw.js';
import { LobAbility } from './seer.js';
import { SpinThrowAbility, VolleyAbility } from './lemur.js';
import { TyrantGunsAbility } from './tyrant.js';
import { WeaveAbility, ReelAbility } from './weaver.js';
import { FlareAbility } from './nova.js';
import { RingAbility, CanistersAbility, SpewAbility, GlobsAbility } from './blight.js';
import { OrbitPairAbility, LashAbility } from './binary.js';
import { BladeDiscAbility, BladeDashAbility } from './razor.js';
import { WallLurkAbility, MorayBiteAbility, MorayLeapAbility, MoraySpitAbility } from './moray.js';
import { WakeAbility, CometStreakAbility, CometNooseAbility, CometSlingAbility } from './comet.js';
import { InhaleAbility, WellAbility, EjectaAbility } from './collapsar.js';
import { AfterimageAbility, RevenantThrustAbility, RevenantCrossAbility, RevenantRecallAbility } from './revenant.js';

const TYPES = {
  dash: DashAbility, ram: RamAbility, laser: LaserAbility, punch: PunchAbility, swing: SwingAbility, slashes: SlashesAbility, smash: SmashAbility, groundPound: GroundPoundAbility,
  slam: SlamAbility, hook: HookAbility, flurry: FlurryAbility, throw: ThrowAbility, lob: LobAbility, missiles: MissilesAbility, spin: SpinThrowAbility, volley: VolleyAbility,
  cannons: CannonsAbility, scimitar: ScimitarAbility, rush: RushAbility, ring: RingAbility, canisters: CanistersAbility, spew: SpewAbility,
  globs: GlobsAbility, weave: WeaveAbility, reel: ReelAbility, flare: FlareAbility, bash: BashAbility, plant: PlantAbility, jetDash: JetDashAbility,
  swoop: SwoopAbility, binaryOrbit: OrbitPairAbility, binaryLash: LashAbility, bladeDisc: BladeDiscAbility, bladeDash: BladeDashAbility, tyrantGuns: TyrantGunsAbility,
  wallLurk: WallLurkAbility, morayBite: MorayBiteAbility, morayLeap: MorayLeapAbility, moraySpit: MoraySpitAbility,
  cometWake: WakeAbility, cometStreak: CometStreakAbility, cometNoose: CometNooseAbility, cometSling: CometSlingAbility,
  inhale: InhaleAbility, well: WellAbility, ejecta: EjectaAbility,
  afterimage: AfterimageAbility, revenantThrust: RevenantThrustAbility, revenantCross: RevenantCrossAbility, revenantRecall: RevenantRecallAbility,
};

export function createAbility(enemy, data) {
  const Type = TYPES[data.type];
  if (!Type) throw new Error(`Unknown ability type "${data.type}"`);
  return new Type(enemy, data);
}
