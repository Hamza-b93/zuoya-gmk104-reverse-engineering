// Electron main process. Owns all device I/O (node-hid / sharp run here, never
// in the renderer) and exposes it over a small, typed IPC surface.
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

import { describe } from './src/device.js';
import {
  withVia, getProtocolVersion, getLayerCount, getBuffer, decodeKeycodes,
  readKeymapBuffer, setBuffer,
} from './src/via.js';
import { keycodeName, KEYCODE_GROUPS } from './src/keycodes.js';
import { buildLayout, keyOffset } from './src/layout.js';
import { loadImage, previewDataUrl } from './src/image.js';
import { uploadImage } from './src/screen-device.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The VIA definition lives at the repo root in dev, and is bundled as an
// extraResource when packaged. Try both.
function viaDefPath() {
  const candidates = [
    join(__dirname, '..', 'ZUOYA-GMK104-USB.json'), // dev: repo root
    join(process.resourcesPath ?? '', 'ZUOYA-GMK104-USB.json'), // packaged
  ];
  for (const p of candidates) {
    try {
      if (readFileSync(p)) return p;
    } catch { /* try next */ }
  }
  throw new Error('ZUOYA-GMK104-USB.json not found (dev root or packaged resources)');
}

// Parse the VIA definition once; it never changes at runtime.
let layoutCache;
function getLayout() {
  if (!layoutCache) {
    layoutCache = buildLayout(JSON.parse(readFileSync(viaDefPath(), 'utf8')));
  }
  return layoutCache;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 980,
    height: 720,
    backgroundColor: '#0b0f17',
    title: 'Keeb Control',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload needs Node's require for the electron bridge
    },
  });
  win.removeMenu();
  win.loadFile(join(__dirname, 'renderer', 'index.html'));
  return win;
}

// Wrap a handler so the renderer always gets { ok, data } or { ok:false, error }.
function handle(channel, fn) {
  ipcMain.handle(channel, async (_evt, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      return { ok: false, error: err?.message ?? String(err) };
    }
  });
}

// --- Device discovery ---
handle('device:list', () => describe());

// --- VIA handshake + top-row keymap read ---
handle('via:handshake', () =>
  withVia((dev) => {
    const row = decodeKeycodes(getBuffer(dev, 0, 28)).map(keycodeName);
    return {
      protocolVersion: getProtocolVersion(dev),
      layerCount: getLayerCount(dev),
      topRow: row,
    };
  }),
);

// --- Screen upload: pick → preview → push ---
// Open a file dialog; return the chosen path (no decode yet).
handle('screen:pickFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Pick an image for the 180×180 screen',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
  });
  if (canceled || filePaths.length === 0) return { canceled: true };
  return { canceled: false, path: filePaths[0] };
});

// Render the exact 180×180 as a PNG data URL (what the panel will show).
handle('screen:preview', ({ path, fit = 'cover', background = '#000000' }) =>
  previewDataUrl(path, { fit, background }),
);

// Decode the given file and push it to the screen.
handle('screen:uploadPath', async ({ path, fit = 'cover', background = '#000000' }) => {
  const rgb = await loadImage(path, { fit, background });
  const reports = await uploadImage(rgb);
  return { reports, name: path.split(/[\\/]/).pop() };
});

// --- Keymap editor ---
// Static layout + keycode palette (no device needed).
handle('keymap:layout', () => ({ ...getLayout(), palette: KEYCODE_GROUPS }));

// Read every layer's keycodes into a flat array (layer-major).
handle('keymap:read', () => {
  const { rows, cols } = getLayout();
  return withVia((dev) => {
    const layerCount = getLayerCount(dev);
    const buf = readKeymapBuffer(dev, layerCount * rows * cols * 2);
    return { layerCount, rows, cols, keycodes: decodeKeycodes(buf) };
  });
});

// Write one key (layer,row,col -> 16-bit code) and read it back to confirm.
handle('keymap:writeKey', ({ layer, row, col, code }) => {
  const { rows, cols } = getLayout();
  const offset = keyOffset({ layer, row, col, rows, cols });
  return withVia((dev) => {
    setBuffer(dev, offset, [(code >> 8) & 0xff, code & 0xff]);
    const back = getBuffer(dev, offset, 2);
    const confirmed = (back[0] << 8) | back[1];
    return { code: confirmed, label: keycodeName(confirmed), ok: confirmed === code };
  });
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
