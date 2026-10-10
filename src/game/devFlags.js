// Dev-tool switches, flipped from the dev menu (`) and read by gameplay code. Kept
// across reloads in dev builds; always off in production.
const STORAGE_KEY = 'john.devFlags';

export const devFlags = {
  combatReadout: false, // health over enemies, floating numbers, stats panel (devOverlay.js)
  fullResistance: false, // the player takes no damage
  noDamage: false, // nothing the player does damages enemies
  noclip: false, // the player walks through walls, 3× as fast
  allEnemies: false, // every enemy type is spawnable, killed or not
  gameSpeed: 1, // scales the world's clock (gameScene.js); 0 freezes it
};

if (import.meta.env.DEV) {
  try { Object.assign(devFlags, JSON.parse(localStorage.getItem(STORAGE_KEY))); } catch { /* none saved */ }
}

export function setDevFlag(name, on) {
  devFlags[name] = on;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(devFlags)); } catch { /* storage unavailable */ }
}
