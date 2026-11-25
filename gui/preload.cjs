// Preload: the only bridge between the sandboxed renderer and the main process.
// Exposes a minimal, explicit API on window.zuoya — no raw ipcRenderer, no Node.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('zuoya', {
  listDevices: () => ipcRenderer.invoke('device:list'),
  viaHandshake: () => ipcRenderer.invoke('via:handshake'),
  // Screen: pick → preview → push
  pickFile: () => ipcRenderer.invoke('screen:pickFile'),
  screenPreview: (opts) => ipcRenderer.invoke('screen:preview', opts),
  uploadPath: (opts) => ipcRenderer.invoke('screen:uploadPath', opts),
  // Resolve the absolute path of a dropped File (Electron webUtils).
  pathForFile: (file) => webUtils.getPathForFile(file),
  keymapLayout: () => ipcRenderer.invoke('keymap:layout'),
  keymapRead: () => ipcRenderer.invoke('keymap:read'),
  keymapWriteKey: (edit) => ipcRenderer.invoke('keymap:writeKey', edit),
  // Live screen widgets
  widgetsList: () => ipcRenderer.invoke('widgets:list'),
  widgetsPreview: (id) => ipcRenderer.invoke('widgets:preview', { id }),
  widgetsStatus: () => ipcRenderer.invoke('widgets:status'),
  widgetsStart: (id) => ipcRenderer.invoke('widgets:start', { id }),
  widgetsStop: () => ipcRenderer.invoke('widgets:stop'),
});
