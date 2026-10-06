// Meta progression: banked coins, aspect unlocks (tier boxes) and the equipped loadout.
// The save is the single source of truth.
import { ASPECTS, TIERS, MAX_EQUIPPED_ASPECTS } from '../data/config.js';
import { randInt } from '../engine/math.js';
import { save } from './save.js';

const byId = new Map(ASPECTS.map((a) => [a.id, a]));
const tierInfo = (tier) => TIERS.find((t) => t.tier === tier) ?? TIERS[TIERS.length - 1];
const lockedInTier = (tier) => ASPECTS.filter((a) => a.tier === tier && !profile.isUnlocked(a.id));

export const profile = {
  get coins() { return save.data.totalCoins; },

  bankCoins(amount) {
    if (amount <= 0) return;
    save.data.totalCoins += amount;
    save.write();
  },

  getAspect: (id) => byId.get(id) ?? null,
  isUnlocked: (id) => save.data.unlockedAspectIds.includes(id),
  isEquipped: (id) => save.data.equippedAspectIds.includes(id),
  canEquipMore: () => save.data.equippedAspectIds.length < MAX_EQUIPPED_ASPECTS,
  equippedAspects: () => save.data.equippedAspectIds.map((id) => byId.get(id)).filter(Boolean),

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

  equip(id) {
    if (!profile.isUnlocked(id)) return false;
    const eq = save.data.equippedAspectIds;
    if (eq.includes(id)) return true;
    if (eq.length >= MAX_EQUIPPED_ASPECTS) return false;
    eq.push(id);
    save.write();
    return true;
  },

  unequip(id) {
    const eq = save.data.equippedAspectIds;
    const i = eq.indexOf(id);
    if (i < 0) return false;
    eq.splice(i, 1);
    save.write();
    return true;
  },

  toggleEquip(id) { return profile.isEquipped(id) ? profile.unequip(id) : profile.equip(id); },

  reset() { save.reset(); },
};
