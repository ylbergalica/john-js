// Meta progression: banked coins, aspect unlocks (tier boxes), the equipped loadout and
// the enemy types killed so far, and how much each aspect has been played with.
// The save is the single source of truth.
import { ASPECTS, TIERS, MAX_EQUIPPED_ASPECTS } from '../data/config.js';
import { randInt } from '../engine/math.js';
import { save } from './save.js';

const byId = new Map(ASPECTS.map((a) => [a.id, a]));
const tierInfo = (tier) => TIERS.find((t) => t.tier === tier) ?? TIERS[TIERS.length - 1];
const lockedInTier = (tier) => ASPECTS.filter((a) => a.tier === tier && !profile.isUnlocked(a.id));
const slots = () => save.data.equippedAspectIds; // one per loadout slot, null where empty

export const profile = {
  get coins() { return save.data.totalCoins; },

  bankCoins(amount) {
    if (amount <= 0) return;
    save.data.totalCoins += amount;
    save.write();
  },

  getAspect: (id) => byId.get(id) ?? null,
  isUnlocked: (id) => save.data.unlockedAspectIds.includes(id),
  isEquipped: (id) => slots().includes(id),
  canEquipMore: () => profile.loadout().includes(null),
  // Aspect per loadout slot (null where empty); slot i is key i + 1 in a run.
  loadout: () => slots().map((id) => byId.get(id) ?? null),
  equippedAspects: () => profile.loadout().filter(Boolean),

  priceForTier: (tier) => tierInfo(tier).price,
  hasLockedInTier: (tier) => lockedInTier(tier).length > 0,
  canBuyTier: (tier) => profile.hasLockedInTier(tier) && profile.coins >= profile.priceForTier(tier),

  // → { ok: true, aspect } | { ok: false, reason }
  buyTierBox(tier) {
    const candidates = lockedInTier(tier);
    if (candidates.length === 0) return { ok: false, reason: 'No aspects left in this tier.' };
    const price = profile.priceForTier(tier);
    if (profile.coins < price) return { ok: false, reason: 'Not enough coins.' };
    const aspect = candidates[randInt(0, candidates.length)];
    save.data.unlockedAspectIds.push(aspect.id);
    save.data.totalCoins -= price;
    save.write();
    return { ok: true, aspect };
  },

  // Puts an aspect in a slot, by default the first empty one. An aspect already equipped
  // swaps places with whatever is in that slot; a new one replaces it.
  equip(id, slot) {
    if (!profile.isUnlocked(id)) return false;
    const eq = slots();
    const from = eq.indexOf(id);
    if (slot === undefined) {
      if (from >= 0) return true;
      slot = profile.loadout().indexOf(null);
    }
    if (!(slot >= 0 && slot < MAX_EQUIPPED_ASPECTS)) return false;
    if (from >= 0) eq[from] = eq[slot];
    eq[slot] = id;
    save.write();
    return true;
  },

  unequip(id) {
    const eq = slots();
    const i = eq.indexOf(id);
    if (i < 0) return false;
    eq[i] = null;
    save.write();
    return true;
  },

  toggleEquip(id) { return profile.isEquipped(id) ? profile.unequip(id) : profile.equip(id); },

  // Enemy types killed in a run; the playground can spawn these.
  hasKilled: (type) => save.data.killedEnemyTypes.includes(type),
  recordKill(type) {
    if (profile.hasKilled(type)) return;
    save.data.killedEnemyTypes.push(type);
    save.write();
  },

  // Run floors cleared with each aspect equipped: how much it's been played with.
  floorsWithAspect: (id) => save.data.aspectFloors[id] ?? 0,
  recordFloorCleared() {
    const floors = save.data.aspectFloors;
    for (const id of slots()) if (id) floors[id] = (floors[id] ?? 0) + 1;
    save.write();
  },

  reset() { save.reset(); },
};
