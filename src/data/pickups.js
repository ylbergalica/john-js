// Things the player picks up: adrenaline orbs, chaser cores and the floor exit.

export const PICKUPS = {
  adrenalineOrb: { adrenalineValue: 1, radius: 0.5 * 0.2, magneticRange: 3, magneticSpeed: 10, size: 0.2, color: 0xa60000, scatter: 0.5 },
  chaserCore: { radius: 0.2 * 0.8, magneticRange: 1, magneticSpeed: 10, width: 0.8, height: 1.0 },
  exit: { radius: 0.5, width: 0.89, height: 1, color: 0x606060 },
};
