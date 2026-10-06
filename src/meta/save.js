// Persistent save in localStorage. Field names match the original save file.
const KEY = 'john.save';

const defaults = () => ({ totalCoins: 0, unlockedAspectIds: [], equippedAspectIds: [] });

function sanitize(raw) {
  const s = defaults();
  if (raw && typeof raw === 'object') {
    if (Number.isFinite(raw.totalCoins)) s.totalCoins = Math.max(0, Math.floor(raw.totalCoins));
    if (Array.isArray(raw.unlockedAspectIds)) s.unlockedAspectIds = [...new Set(raw.unlockedAspectIds.filter((id) => typeof id === 'string'))];
    if (Array.isArray(raw.equippedAspectIds)) s.equippedAspectIds = [...new Set(raw.equippedAspectIds.filter((id) => typeof id === 'string'))];
  }
  return s;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? sanitize(JSON.parse(raw)) : defaults();
  } catch {
    return defaults(); // corrupt or blocked storage
  }
}

let data = load();

export const save = {
  get data() { return data; },
  write() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* storage unavailable */ }
  },
  reset() {
    data = defaults();
    save.write();
  },
};
