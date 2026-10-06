// Boot: Pixi application, assets, input, and switching between the menu and a run.
// The game loop rides Pixi's ticker so simulation runs right before each render.
import { Application } from 'pixi.js';
import { Input } from './engine/input.js';
import { loadAssets } from './render/assets.js';
import { GameScene } from './game/gameScene.js';
import { RunMode } from './game/session.js';
import { MenuScene } from './ui/menu.js';
import { profile } from './meta/profile.js';
import { h } from './ui/dom.js';
import './style.css';

const MAX_FRAME_TIME = 0.1; // clamp long stalls (tab switches, debugger) to one hitch

const app = new Application();
await app.init({
  resizeTo: window,
  background: '#000000',
  antialias: true,
  autoDensity: true,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  preference: 'webgl', // the wall shader is GLSL
});
document.getElementById('game').append(app.canvas);
const uiRoot = document.getElementById('ui');
uiRoot.append(h('div', { class: 'vignette' }));
const input = new Input(app.canvas);
await loadAssets();

let scene = null;

function show(next) {
  scene?.destroy();
  scene = next();
}

function showMenu() {
  show(() => new MenuScene(uiRoot, {
    onStartRun: () => startGame(RunMode.Run),
    onPlayground: () => startGame(RunMode.Playground),
  }));
}

function startGame(mode) {
  show(() => new GameScene({ app, input, uiRoot, mode, onExit: showMenu }));
}

app.ticker.add((ticker) => scene?.frame(Math.min(ticker.deltaMS / 1000, MAX_FRAME_TIME)));

if (import.meta.env.DEV) {
  // Console helpers for testing: john.addCoins(), john.resetSave(), john.advance(seconds).
  window.john = {
    addCoins(n = 10000) { profile.bankCoins(n); showMenu(); },
    resetSave() { profile.reset(); showMenu(); },
    get scene() { return scene; },
    start: startGame,
    // Steps the game manually (e.g. while the tab is in the background).
    advance(seconds, fps = 60) { for (let i = 0; i < Math.round(seconds * fps); i++) scene?.frame(1 / fps); },
  };
}

showMenu();
