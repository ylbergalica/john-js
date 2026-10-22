// Boot: Pixi application, assets, input, menu keyboard navigation, and switching between the
// menu and a run (through the launch into one).
// The game loop rides Pixi's ticker so simulation runs right before each render. Display
// settings (frame rate limit and readout, render resolution, reduced flashing) are applied here.
import { Application } from 'pixi.js';
import { Input } from './engine/input.js';
import { loadAssets } from './render/assets.js';
import { GameScene } from './game/gameScene.js';
import { RunMode } from './game/session.js';
import { MenuScene } from './ui/menu.js';
import { profile } from './meta/profile.js';
import { h } from './ui/dom.js';
import { sfx } from './audio/sfx.js';
import { setPresence } from './ui/presence.js';
import { installMenuNav } from './ui/nav.js';
import { settings, onSettingsChange } from './meta/settings.js';
import '@fontsource/cinzel/latin-600.css'; // the logo's face (ui/common.js logo)
import './style.css';

const MAX_FRAME_TIME = 0.1; // clamp long stalls (tab switches, debugger) to one hitch
const FPS_REFRESH = 0.5; // seconds between frame rate readouts
const LAUNCH_TIME = 0.8; // seconds from Start Run to the run (matches .launch-veil)
const LAUNCH_FADE = 0.6; // seconds the black veil takes to lift off the run (matches .launch-veil.out)
const renderResolution = () => Math.min(window.devicePixelRatio || 1, settings.resolutionCap);

const app = new Application();
const uiRoot = document.getElementById('ui');
const fpsReadout = h('div', { class: 'fps hidden' });
uiRoot.append(h('div', { class: 'vignette' }), fpsReadout);
installMenuNav(uiRoot); // arrows or the movement keys, and Enter, through every menu
let input = null; // created in boot(), once the canvas exists

// Audio can only start inside a user gesture.
window.addEventListener('pointerdown', sfx.unlock);
window.addEventListener('keydown', sfx.unlock);
// Every menu button ticks on hover and clicks when pressed.
uiRoot.addEventListener('pointerover', (e) => {
  const b = e.target.closest('button:not(:disabled)');
  if (b && !b.contains(e.relatedTarget)) sfx.play('hover');
});
uiRoot.addEventListener('click', (e) => { if (e.target.closest('button:not(:disabled)')) sfx.play('click'); });

let scene = null;

function show(next) {
  scene?.destroy();
  scene = next();
}

function showMenu() {
  setPresence('In the menus');
  show(() => new MenuScene(uiRoot, {
    onStartRun: () => launch(RunMode.Run),
    onPlayground: () => launch(RunMode.Playground),
  }));
}

// Leaving the menu for a run: the stars rush past and the screen blooms and sinks to black
// (CSS: .launching, .launch-veil), then the run starts underneath as the black lifts.
let launching = false;
function launch(mode) {
  if (launching) return;
  launching = true;
  sfx.play('warp');
  scene.el.classList.add('launching');
  const veil = h('div', { class: 'launch-veil' });
  uiRoot.append(veil);
  setTimeout(() => {
    startGame(mode);
    veil.classList.add('out');
    setTimeout(() => { veil.remove(); launching = false; }, LAUNCH_FADE * 1000);
  }, LAUNCH_TIME * 1000);
}

function startGame(mode) {
  show(() => new GameScene({ app, input, uiRoot, mode, onExit: showMenu }));
}

if (import.meta.env.DEV) {
  // Console helpers for testing: john.addCoins(), john.lock(aspectId), john.resetSave(), john.tutorial(), john.advance(seconds).
  window.john = {
    addCoins(n = 10000) { profile.bankCoins(n); showMenu(); },
    lock(id) { profile.lock(id); showMenu(); },
    resetSave() { profile.reset(); showMenu(); },
    tutorial() { profile.forgetTutorial(); startGame(RunMode.Run); }, // a run as if it were the first
    get scene() { return scene; },
    start: startGame,
    // Steps the game manually (e.g. while the tab is in the background).
    advance(seconds, fps = 60) { for (let i = 0; i < Math.round(seconds * fps); i++) scene?.frame(1 / fps); },
  };
}

// Not top-level await: Pixi lazy-loads renderer chunks that import shared code back from
// this entry chunk, so awaiting them while this module is still evaluating deadlocks the
// production build (dev serves modules unbundled and never hits it).
async function boot() {
  await app.init({
    resizeTo: window,
    background: '#000000',
    antialias: true,
    autoDensity: true,
    resolution: renderResolution(),
    preference: 'webgl', // the wall shader is GLSL
  });
  document.getElementById('game').append(app.canvas);
  input = new Input(app.canvas);
  await loadAssets();
  app.ticker.add((ticker) => scene?.frame(Math.min(ticker.deltaMS / 1000, MAX_FRAME_TIME)));
  let fpsTime = 0, fpsFrames = 0;
  app.ticker.add((ticker) => {
    if (!settings.showFps) return;
    fpsTime += ticker.deltaMS / 1000;
    fpsFrames++;
    if (fpsTime < FPS_REFRESH) return;
    fpsReadout.textContent = `${Math.round(fpsFrames / fpsTime)} FPS`;
    fpsTime = fpsFrames = 0;
  });
  const applyDisplay = () => {
    app.ticker.maxFPS = settings.fpsLimit;
    if (app.renderer.resolution !== renderResolution()) app.renderer.resolution = renderResolution();
    fpsReadout.classList.toggle('hidden', !settings.showFps);
    document.body.classList.toggle('reduce-flashing', settings.reduceFlashing);
  };
  onSettingsChange(applyDisplay);
  applyDisplay();
  showMenu();
}

boot();
