// Persistent save in localStorage. Field names match the original save file, plus
// killedEnemyTypes: enemy type keys killed in a run, which the playground can spawn, and
// aspectFloors: aspect id → run floors cleared with it equipped (how much it's been used).
const KEY = 'john.save';

const defaults = () => ({ totalCoins: 0, unlockedAspectIds: [], equippedAspectIds: [], killedEnemyTypes: [], aspectFloors: {} });
const stringSet = (list) => [...new Set(list.filter((id) => typeof id === 'string'))];
const countMap = (obj) => Object.fromEntries(
  Object.entries(obj).filter(([, n]) => Number.isFinite(n) && n > 0).map(([id, n]) => [id, Math.floor(n)]),
);

function sanitize(raw) {
  const s = defaults();
  if (raw && typeof raw === 'object') {
    if (Number.isFinite(raw.totalCoins)) s.totalCoins = Math.max(0, Math.floor(raw.totalCoins));
    if (Array.isArray(raw.unlockedAspectIds)) s.unlockedAspectIds = stringSet(raw.unlockedAspectIds);
    if (Array.isArray(raw.equippedAspectIds)) s.equippedAspectIds = stringSet(raw.equippedAspectIds);
    if (Array.isArray(raw.killedEnemyTypes)) s.killedEnemyTypes = stringSet(raw.killedEnemyTypes);
    if (raw.aspectFloors && typeof raw.aspectFloors === 'object' && !Array.isArray(raw.aspectFloors)) s.aspectFloors = countMap(raw.aspectFloors);
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
