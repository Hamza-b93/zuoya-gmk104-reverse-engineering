// Profiles: a snapshot of the keyboard's configurable state (full keymap for
// every layer + global RGB lighting) that can be saved to disk and re-applied.
//
// The capture/apply logic lives here (pure, device-facing); file I/O and the
// profiles directory live in the main process. A profile is portable JSON.
import {
  getLayerCount, readKeymapBuffer, writeKeymapBuffer, decodeKeycodes, encodeKeycodes,
} from './via.js';
import { getLighting, setLighting, saveLighting } from './lighting.js';

export const PROFILE_VERSION = 1;

// Read the whole device state into a plain object (keymap + lighting). Lighting
// is best-effort: a board without the RGB channel still yields a keymap profile.
export function captureProfile(dev, { rows, cols }, meta = {}) {
  const layerCount = getLayerCount(dev);
  const buf = readKeymapBuffer(dev, layerCount * rows * cols * 2);
  const keymap = decodeKeycodes(buf);

  let lighting = null;
  try {
    lighting = getLighting(dev);
  } catch {
    lighting = null; // board doesn't expose VIA lighting — keymap-only profile
  }

  return {
    schema: 'keeb-control/profile',
    version: PROFILE_VERSION,
    name: meta.name ?? 'profile',
    created: new Date().toISOString(),
    device: { rows, cols, layerCount },
    keymap,
    lighting,
  };
}

// Validate a parsed profile against the connected board's geometry. Throws a
// clear error on any mismatch, so a profile from another board can't be written.
export function validateProfile(profile, { rows, cols }) {
  if (!profile || profile.schema !== 'keeb-control/profile') {
    throw new Error('Not a Keeb Control profile file.');
  }
  if (profile.version !== PROFILE_VERSION) {
    throw new Error(`Unsupported profile version ${profile.version} (expected ${PROFILE_VERSION}).`);
  }
  const d = profile.device ?? {};
  if (d.rows !== rows || d.cols !== cols) {
    throw new Error(`Profile is for a ${d.rows}×${d.cols} matrix; this board is ${rows}×${cols}.`);
  }
  const expected = d.layerCount * rows * cols;
  if (!Array.isArray(profile.keymap) || profile.keymap.length !== expected) {
    throw new Error(`Profile keymap has ${profile.keymap?.length ?? 0} codes; expected ${expected}.`);
  }
  return true;
}

// Write a profile back to the device: the full keymap, then lighting (if the
// profile carries any and the board accepts it), persisted to flash.
export function applyProfile(dev, profile, { rows, cols }) {
  validateProfile(profile, { rows, cols });
  writeKeymapBuffer(dev, encodeKeycodes(profile.keymap));

  let lightingApplied = false;
  if (profile.lighting) {
    try {
      setLighting(dev, profile.lighting);
      saveLighting(dev);
      lightingApplied = true;
    } catch {
      lightingApplied = false; // keymap still applied; lighting just couldn't
    }
  }
  return { keymap: profile.keymap.length, lightingApplied };
}

// A filesystem-safe base name derived from a user-supplied profile name.
export function slugify(name) {
  const slug = String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'profile';
}
