// Desktop shell: runs the Vite build (dist/) in a frameless-menu Electron window.
// Fullscreen by default; F11 or Alt+Enter toggles and the choice is remembered.
import { app, BrowserWindow, Menu, ipcMain } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const settingsPath = () => join(app.getPath('userData'), 'window.json');

function loadSettings() {
  try { return { fullscreen: true, ...JSON.parse(readFileSync(settingsPath(), 'utf8')) }; } catch { return { fullscreen: true }; }
}

function saveSettings(s) {
  try { writeFileSync(settingsPath(), JSON.stringify(s)); } catch { /* read-only profile */ }
}

// One copy at a time: a second launch focuses the running window.
if (!app.requestSingleInstanceLock()) app.quit();

let win = null;

function createWindow() {
  const settings = loadSettings();
  win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 960,
    minHeight: 540,
    fullscreen: settings.fullscreen,
    backgroundColor: '#000000',
    title: 'Starspite',
    show: false, // shown once the first frame is ready, so there's no white flash
    webPreferences: {
      preload: join(root, 'electron', 'preload.cjs'),
      devTools: !app.isPackaged,
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.once('ready-to-show', () => win.show());

  const toggleFullscreen = () => {
    settings.fullscreen = !win.isFullScreen();
    win.setFullScreen(settings.fullscreen);
    saveSettings(settings);
  };
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown' || input.isAutoRepeat) return;
    if (input.key === 'F11' || (input.alt && input.key === 'Enter')) { e.preventDefault(); toggleFullscreen(); }
    else if (!app.isPackaged && input.key === 'F12') win.webContents.toggleDevTools();
  });
  ipcMain.on('toggle-fullscreen', toggleFullscreen);

  // The game never navigates or opens windows; refuse anything that tries.
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  win.loadFile(join(root, 'dist', 'index.html'));
}

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

ipcMain.on('quit', () => app.quit());

Menu.setApplicationMenu(null); // no File/Edit bar, and no Ctrl+R reload mid-run
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
