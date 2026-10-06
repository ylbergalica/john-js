# John (JS)

Top-down 2D roguelite for the browser: procedurally generated floors, melee + parry combat, a boss that gates each exit, adrenaline "Exalted" mode, and a meta shop of aspects. Built with [PixiJS 8](https://pixijs.com/) and [Vite](https://vitejs.dev/), no game engine.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/
```

## Controls

| Action | Input |
|---|---|
| Move | W A S D |
| Aim | Mouse |
| Attack | Left mouse |
| Parry | Right mouse |
| Dash | Left Shift (in move direction) |
| Activate Exalted (full adrenaline) | X |
| Aspect slots | 1 / 2 / 3 |
| Pause | Esc (also pauses when the window loses focus) |

Dev builds only (`npm run dev`): K kill · H heal · L max adrenaline · C add core · N next floor · R refresh aspect cooldowns, plus console helpers `john.addCoins(10000)`, `john.resetSave()`, `john.start('run' | 'playground')` and `john.advance(seconds)`.

## Architecture

```
src/
  main.js            boot, scene switching, game loop on Pixi's ticker
  data/config.js     all gameplay tuning
  engine/            math, input (presses latched per sim step), physics, events
  game/              World (entities, floors, services), GameScene (fixed-step loop,
                     pause), RunSession (per-run state), adrenaline, pickups
  player/            Player logic, PlayerView visuals, input buffering
  enemies/           Enemy, EnemyAI state machine, ability phase machines, hitboxes, projectile
  aspects/           one module per aspect + the controller that routes slots/events
  level/             generator, difficulty curve, shared flow-field navigation, teleport search
  render/            assets, camera, level view (wall shader), effects, star fields
  meta/              save (localStorage) and profile (coins, unlocks, loadout)
  ui/                HUD, main menu, DOM helpers
```

- **One clock.** Gameplay runs in a deterministic 50 Hz fixed step (`World.step`): entities `step()`, then physics, then `afterPhysics()` overlap tests. Rendering interpolates between steps. All timers are timestamps on `world.time`; pausing just stops stepping.
- **State machines, not coroutines.** Enemy abilities (`ready → windup → active → recovery`, plus a parry `stunned` phase), the Anchor teleport and the AI are explicit states.
- **Scoped state.** `RunSession` holds what lives for one run (floor, adrenaline, unbanked coins, event channels); `World` holds one floor's contents. Only the save/profile is global.
- **Navigation.** One Dijkstra flow field toward the player per actor footprint (1 tile for regular enemies, 3 for the Warden), rebuilt when the player changes cell, shared by every enemy.
- **Rendering.** Wall outlines wobble and wall sparkles twinkle in a GLSL vertex shader over static 16×16-tile chunk meshes; off-screen chunks and entities are hidden. Particles are pooled in a `ParticleContainer`. Hit flashes swap to pre-baked white silhouettes instead of using filters.

The save lives in `localStorage` (`john.save`: `totalCoins`, `unlockedAspectIds`, `equippedAspectIds`); aspect ids are save keys.

Sprites live in `src/assets/` and are bundled by Vite. `npm run assets` re-imports them from the original Unity project (set `UNITY_PROJECT` if it isn't at `../Unity Projects/John`).
