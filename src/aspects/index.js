// Aspect id → runtime class.
import { AnchorAspect } from './anchor.js';
import { CleaveAspect } from './cleave.js';
import { FlashAspect } from './flash.js';
import { PredatorAspect } from './predator.js';
import { RiftAspect } from './rift.js';
import { WraithAspect } from './wraith.js';
import { AstralAspect } from './astral.js';
import { ThunderAspect } from './thunder.js';
import { PhoenixAspect } from './phoenix.js';
import { NeedleAspect } from './needle.js';
import { MomentumAspect } from './momentum.js';
import { AfterimageAspect } from './afterimage.js';

const ASPECT_TYPES = {
  anchor: AnchorAspect,
  assassin: PredatorAspect,
  crescent: CleaveAspect,
  flash: FlashAspect,
  rift: RiftAspect,
  wraith: WraithAspect,
  astral: AstralAspect,
  thunder: ThunderAspect,
  phoenix: PhoenixAspect,
  needle: NeedleAspect,
  momentum: MomentumAspect,
  afterimage: AfterimageAspect,
};

export function createAspect(player, data) {
  const Type = ASPECT_TYPES[data.id];
  if (!Type) throw new Error(`Unknown aspect "${data.id}"`);
  return new Type(player, data);
}
