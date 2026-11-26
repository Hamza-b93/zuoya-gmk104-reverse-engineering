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
  // Dynamic macros
  macrosRead: () => ipcRenderer.invoke('macros:read'),
  macrosWrite: (macros) => ipcRenderer.invoke('macros:write', { macros }),
  macrosReset: () => ipcRenderer.invoke('macros:reset'),
  // Kanata (host-side remapping config)
  kanataGenerate: () => ipcRenderer.invoke('kanata:generate'),
  kanataDetect: () => ipcRenderer.invoke('kanata:detect'),
  kanataSave: (config) => ipcRenderer.invoke('kanata:save', { config }),
  // RGB lighting (global effect/brightness/speed/color)
  lightingRead: () => ipcRenderer.invoke('lighting:read'),
  lightingSet: (patch) => ipcRenderer.invoke('lighting:set', patch),
  lightingSave: () => ipcRenderer.invoke('lighting:save'),
  // Profiles (keymap + lighting snapshots)
  profilesList: () => ipcRenderer.invoke('profiles:list'),
  profilesSave: (name) => ipcRenderer.invoke('profiles:save', { name }),
  profilesApply: (file) => ipcRenderer.invoke('profiles:apply', { file }),
  profilesDelete: (file) => ipcRenderer.invoke('profiles:delete', { file }),
  profilesExport: (file) => ipcRenderer.invoke('profiles:export', { file }),
  profilesImport: () => ipcRenderer.invoke('profiles:import'),
  // Live screen widgets
  widgetsList: () => ipcRenderer.invoke('widgets:list'),
  widgetsPreview: (id) => ipcRenderer.invoke('widgets:preview', { id }),
  widgetsStatus: () => ipcRenderer.invoke('widgets:status'),
  widgetsStart: (id) => ipcRenderer.invoke('widgets:start', { id }),
  widgetsStop: () => ipcRenderer.invoke('widgets:stop'),
});
