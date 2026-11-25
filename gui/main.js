// Electron main process. Owns all device I/O (node-hid / sharp run here, never
// in the renderer) and exposes it over a small, typed IPC surface.
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import { readFileSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile, unlink, copyFile } from 'node:fs/promises';

import { describe } from './src/device.js';
import {
  withVia, getProtocolVersion, getLayerCount, getBuffer, decodeKeycodes,
  readKeymapBuffer, setBuffer,
  getMacroCount, getMacroBufferSize, readMacroBuffer, writeMacroBuffer, resetMacros,
} from './src/via.js';
import { decodeMacros, encodeMacros, macrosByteLength } from './src/macros.js';
import { getLighting, setLighting, saveLighting, withLighting } from './src/lighting.js';
import { captureProfile, applyProfile, slugify } from './src/profiles.js';
import { keycodeName, KEYCODE_GROUPS } from './src/keycodes.js';
import { buildLayout, keyOffset } from './src/layout.js';
import { loadImage, previewDataUrl } from './src/image.js';
import { uploadImage } from './src/screen-device.js';
import { listWidgets, widgetPreview } from './src/widgets.js';
import { WidgetRunner } from './src/widget-runner.js';

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

// --- Dynamic macros ---
// Read the macro count + buffer, decoded into editable step lists. If the stock
// firmware doesn't implement the macro commands, report that instead of failing.
handle('macros:read', () =>
  withVia((dev) => {
    let count, size;
    try {
      count = getMacroCount(dev);
      size = getMacroBufferSize(dev);
    } catch (e) {
      return { supported: false, reason: e.message };
    }
    if (!count || !size) return { supported: false, reason: 'This firmware exposes no macro slots.' };
    const buf = readMacroBuffer(dev, size);
    return { supported: true, count, size, used: macrosUsed(buf, count), macros: decodeMacros(buf, count) };
  }),
);

// Encode + write the macro set; refuse if it overflows the device buffer.
handle('macros:write', ({ macros }) =>
  withVia((dev) => {
    const size = getMacroBufferSize(dev);
    const need = macrosByteLength(macros);
    if (need > size) throw new Error(`Macros need ${need} bytes but the buffer is ${size}. Shorten them.`);
    const buf = Buffer.alloc(size); // zero-filled: clears trailing old data
    encodeMacros(macros).copy(buf);
    writeMacroBuffer(dev, buf);
    return { used: need, size };
  }),
);

handle('macros:reset', () => withVia((dev) => {
  resetMacros(dev);
  const count = getMacroCount(dev);
  return { count };
}));

// Bytes consumed up to and including the last macro's terminator.
function macrosUsed(buf, count) {
  let seen = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0 && ++seen === count) return i + 1;
  }
  return buf.length;
}

// --- RGB lighting (VIA custom channel 3: global effect/brightness/speed/color) ---
handle('lighting:read', () => withLighting((dev) => getLighting(dev)));

// Apply a subset of {brightness, effect, speed, hue, sat} live (not persisted).
handle('lighting:set', (patch) =>
  withLighting((dev) => ({ written: setLighting(dev, patch) })),
);

// Persist the current lighting to the keyboard's flash.
handle('lighting:save', () => withLighting((dev) => {
  saveLighting(dev);
  return { saved: true };
}));

// --- Profiles (save/load the full keymap + lighting) ---
function profilesDir() {
  return join(app.getPath('userData'), 'profiles');
}

async function listProfiles() {
  const dir = profilesDir();
  await mkdir(dir, { recursive: true });
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
  const out = [];
  for (const file of files) {
    try {
      const p = JSON.parse(await readFile(join(dir, file), 'utf8'));
      out.push({
        file,
        name: p.name ?? file.replace(/\.json$/, ''),
        created: p.created ?? null,
        layerCount: p.device?.layerCount ?? null,
        hasLighting: !!p.lighting,
      });
    } catch {
      out.push({ file, name: file.replace(/\.json$/, ''), created: null, broken: true });
    }
  }
  out.sort((a, b) => String(b.created).localeCompare(String(a.created)));
  return out;
}

handle('profiles:list', () => listProfiles());

// Capture the current device state into a new profile file.
handle('profiles:save', async ({ name }) => {
  const { rows, cols } = getLayout();
  const profile = withVia((dev) => captureProfile(dev, { rows, cols }, { name }));
  const dir = profilesDir();
  await mkdir(dir, { recursive: true });
  const file = `${slugify(name)}.json`;
  await writeFile(join(dir, file), JSON.stringify(profile, null, 2));
  return { file, profiles: await listProfiles() };
});

// Write a saved profile back to the keyboard.
handle('profiles:apply', async ({ file }) => {
  const { rows, cols } = getLayout();
  const profile = JSON.parse(await readFile(join(profilesDir(), basename(file)), 'utf8'));
  const result = withVia((dev) => applyProfile(dev, profile, { rows, cols }));
  return { name: profile.name, ...result };
});

handle('profiles:delete', async ({ file }) => {
  await unlink(join(profilesDir(), basename(file)));
  return { profiles: await listProfiles() };
});

// Export a profile to a user-chosen location.
handle('profiles:export', async ({ file }) => {
  const src = join(profilesDir(), basename(file));
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Export profile',
    defaultPath: basename(file),
    filters: [{ name: 'Keeb Control profile', extensions: ['json'] }],
  });
  if (canceled || !filePath) return { canceled: true };
  await copyFile(src, filePath);
  return { canceled: false, path: filePath };
});

// Import a profile file into the profiles directory (validated on apply).
handle('profiles:import', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Import a Keeb Control profile',
    properties: ['openFile'],
    filters: [{ name: 'Keeb Control profile', extensions: ['json'] }],
  });
  if (canceled || filePaths.length === 0) return { canceled: true };
  const parsed = JSON.parse(await readFile(filePaths[0], 'utf8'));
  if (parsed.schema !== 'keeb-control/profile') throw new Error('Not a Keeb Control profile file.');
  const dir = profilesDir();
  await mkdir(dir, { recursive: true });
  const file = `${slugify(parsed.name ?? basename(filePaths[0], '.json'))}.json`;
  await writeFile(join(dir, file), JSON.stringify(parsed, null, 2));
  return { canceled: false, file, profiles: await listProfiles() };
});

// --- Screen widgets (live content) ---
const widgetRunner = new WidgetRunner();
handle('widgets:list', () => listWidgets());
handle('widgets:preview', ({ id }) => widgetPreview(id));
handle('widgets:status', () => widgetRunner.status);
handle('widgets:start', ({ id }) => widgetRunner.start(id));
handle('widgets:stop', () => widgetRunner.stop());

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => widgetRunner.stop());

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
