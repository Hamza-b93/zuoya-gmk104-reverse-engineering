// Preload: the only bridge between the sandboxed renderer and the main process.
// Exposes a minimal, explicit API on window.zuoya — no raw ipcRenderer, no Node.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('zuoya', {
  listDevices: () => ipcRenderer.invoke('device:list'),
  viaHandshake: () => ipcRenderer.invoke('via:handshake'),
  pickAndUpload: (opts) => ipcRenderer.invoke('screen:pickAndUpload', opts),
});
