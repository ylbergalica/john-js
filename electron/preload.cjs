// Exposes the few desktop-only actions the UI needs as `window.desktop`.
// In the browser build `window.desktop` is undefined, so the UI hides those controls.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  quit: () => ipcRenderer.send('quit'),
  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),
  isFullscreen: () => ipcRenderer.invoke('is-fullscreen'),
  onFullscreen: (fn) => ipcRenderer.on('fullscreen', (_e, on) => fn(on)), // after any change
  setPresence: (activity) => ipcRenderer.send('presence', activity), // Discord Rich Presence
});
