// Aspect id → runtime class.
import { AnchorAspect } from './anchor.js';
import { CleaveAspect } from './cleave.js';
import { FlashAspect } from './flash.js';
import { PredatorAspect } from './predator.js';
import { RiftAspect } from './rift.js';

const ASPECT_TYPES = {
  anchor: AnchorAspect,
  assassin: PredatorAspect,
  crescent: CleaveAspect,
  flash: FlashAspect,
  rift: RiftAspect,
};

export function createAspect(player, data) {
  const Type = ASPECT_TYPES[data.id];
  if (!Type) throw new Error(`Unknown aspect "${data.id}"`);
  return new Type(player, data);
}
