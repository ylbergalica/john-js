# John (JS)

Top-down 2D roguelite for the browser: procedurally generated floors, melee + parry combat, a boss that gates each exit, adrenaline "Exalted" mode, and a meta shop of aspects. Built with [PixiJS 8](https://pixijs.com/) and [Vite](https://vitejs.dev/), no game engine.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/
npm run desktop  # build and run in the Electron desktop shell
npm run dist:win # Windows build: release/win-unpacked/John.exe (+ a zip)
```

## Desktop build

The game ships as a Windows app via [Electron](https://www.electronjs.org/) (`electron/main.js`), packaged with electron-builder (config under `build` in `package.json`). It opens fullscreen; F11 or Alt+Enter toggles windowed mode and the choice is kept in `%APPDATA%\John\window.json`. The main menu gets a Quit button only in the desktop build (`window.desktop`, exposed by `electron/preload.cjs`). Saves use the same `localStorage` keys, stored in `%APPDATA%\John`.

For Steam, upload the whole `release/win-unpacked/` folder as a depot with `John.exe` as the launch executable.

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
| Mute sound | M |
| Spawn menu (playground only) | Tab |

The playground is a fixed test map (an arena with cover, a wide corridor and a 2-tile one to a side room) with no enemies of its own: spawn them from its menu. An enemy type becomes spawnable once you've killed one in a run (saved as `killedEnemyTypes`). Playground kills earn nothing.

Dev builds only (`npm run dev`): `` ` `` opens the dev tools menu at the top left: heal, refresh cooldowns, fill adrenaline, collect a core, next floor, kill player, spawn enemies (in runs too), and switches for the combat readout, 100% resistance, dealing no damage, noclip (also 3× move speed) and unlocking every enemy in the spawn menu (switches persist as `john.devFlags`). H heal, R refresh cooldowns and G noclip also work as hotkeys. Console helpers: `john.addCoins(10000)`, `john.resetSave()`, `john.start('run' | 'playground')` and `john.advance(seconds)`.

## Architecture

```
src/
  main.js            boot, scene switching, game loop on Pixi's ticker
  data/config.js     all gameplay tuning
  engine/            math, input (presses latched per sim step), physics, events
  game/              World (entities, floors, services), GameScene (fixed-step loop,
                     pause, tool menus), RunSession (per-run state), adrenaline,
                     pickups, dev flags
  player/            Player logic, PlayerView visuals, input buffering
  enemies/           Enemy, EnemyAI state machine, ability phase machines, hitboxes, projectile
  aspects/           one module per aspect + the controller that routes slots/events
  level/             generator, playground map, difficulty curve, shared flow-field
                     navigation, teleport search
  render/            procedural sprite art + textures, camera, level view (wall shader),
                     effects, star fields
  audio/             synthesized sound effects (Web Audio)
  meta/              save (localStorage) and profile (coins, unlocks, loadout)
  ui/                HUD, main menu, spawn and dev tool menus, DOM helpers
```

- **One clock.** Gameplay runs in a deterministic 50 Hz fixed step (`World.step`): entities `step()`, then physics, then `afterPhysics()` overlap tests. Rendering interpolates between steps. All timers are timestamps on `world.time`; pausing just stops stepping.
- **State machines, not coroutines.** Enemy abilities (`ready → windup → active → recovery`, plus a parry `stunned` phase), the Anchor teleport and the AI are explicit states.
- **Scoped state.** `RunSession` holds what lives for one run (floor, adrenaline, unbanked coins, event channels); `World` holds one floor's contents. Only the save/profile is global.
- **Navigation.** One Dijkstra flow field toward the player per actor footprint (1 tile for regular enemies, 3 for the Warden), rebuilt when the player changes cell, shared by every enemy.
- **Rendering.** Wall outlines wobble and wall sparkles twinkle in a GLSL vertex shader over static 16×16-tile chunk meshes; off-screen chunks and entities are hidden. Particles are pooled in a `ParticleContainer`. Hit flashes swap to pre-baked white silhouettes instead of using filters.

The save lives in `localStorage` (`john.save`: `totalCoins`, `unlockedAspectIds`, `equippedAspectIds`, `killedEnemyTypes`); aspect ids are save keys.

There are no image files: every sprite, animation frame and aspect icon is drawn with Canvas 2D at startup in `src/render/sprites.js` (crisp shapes over soft glows, deep-space fills, four-point star glints) and uploaded as mipmapped textures. Frame animations are generated at 48 fps.

There are no audio files either: every sound effect in `src/audio/sfx.js` is a short recipe of oscillators and filtered noise synthesized with Web Audio when it plays. `World.sound(name, pos)` pans and fades sounds by their offset from the camera; the mute toggle (M) is stored in `localStorage` as `john.muted`.
