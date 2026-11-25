// VIA "custom lighting" codec for the GMK104's RGB.
//
// VIA exposes lighting through the custom-channel commands (0x07/0x08/0x09),
// each carrying a channel id + a value id. The GMK104's stock firmware answers
// on the QMK RGB-Matrix channel (3); a probe of channels 0-7 found no per-key
// channel, so only these four GLOBAL values are addressable:
//
//   brightness  (0-255)   effect index (firmware-defined mode)
//   effect speed (0-255)  color = [hue, sat]  (each 0-255; value is brightness)
//
// This is exactly what usevia.app's lighting menu drives. Nothing here is
// per-key or ARGB — the firmware does not expose those over VIA.
import { openInterface, USAGE } from './device.js';
import { transact } from './via.js';

// VIA custom-lighting command ids.
const CUSTOM_SET_VALUE = 0x07;
const CUSTOM_GET_VALUE = 0x08;
const CUSTOM_SAVE = 0x09;

// Channel id: QMK RGB Matrix. (See file header for why this one.)
export const RGB_MATRIX_CHANNEL = 3;

// Value ids within the RGB-Matrix channel.
export const LIGHT_VALUE = {
  brightness: 1,
  effect: 2,
  speed: 3,
  color: 4, // 2 bytes: [hue, sat]
};

const clampByte = (n) => Math.max(0, Math.min(255, Math.round(Number(n) || 0)));

// Read `n` data bytes of one value. Reply layout: [cmd, channel, valueId, ...data].
function getValue(dev, valueId, n = 1) {
  const r = transact(dev, CUSTOM_GET_VALUE, [RGB_MATRIX_CHANNEL, valueId]);
  return [...r.subarray(3, 3 + n)];
}

function setValue(dev, valueId, data) {
  transact(dev, CUSTOM_SET_VALUE, [RGB_MATRIX_CHANNEL, valueId, ...data]);
}

// Read the full global lighting state from the keyboard.
export function getLighting(dev) {
  const [brightness] = getValue(dev, LIGHT_VALUE.brightness);
  const [effect] = getValue(dev, LIGHT_VALUE.effect);
  const [speed] = getValue(dev, LIGHT_VALUE.speed);
  const [hue, sat] = getValue(dev, LIGHT_VALUE.color, 2);
  return { brightness, effect, speed, hue, sat };
}

// Apply any subset of {brightness, effect, speed, hue, sat}. Unspecified fields
// are left untouched. Values are clamped to 0-255. Returns the fields written.
export function setLighting(dev, patch = {}) {
  const written = [];
  if (patch.brightness != null) { setValue(dev, LIGHT_VALUE.brightness, [clampByte(patch.brightness)]); written.push('brightness'); }
  if (patch.effect != null) { setValue(dev, LIGHT_VALUE.effect, [clampByte(patch.effect)]); written.push('effect'); }
  if (patch.speed != null) { setValue(dev, LIGHT_VALUE.speed, [clampByte(patch.speed)]); written.push('speed'); }
  if (patch.hue != null || patch.sat != null) {
    // Color is a single 2-byte value; read the current pair to fill any gap.
    let { hue, sat } = patch;
    if (hue == null || sat == null) {
      const [curHue, curSat] = getValue(dev, LIGHT_VALUE.color, 2);
      hue = hue ?? curHue;
      sat = sat ?? curSat;
    }
    setValue(dev, LIGHT_VALUE.color, [clampByte(hue), clampByte(sat)]);
    written.push('color');
  }
  return written;
}

// Persist the current lighting to the keyboard's flash (survives a replug).
export function saveLighting(dev) {
  transact(dev, CUSTOM_SAVE, [RGB_MATRIX_CHANNEL]);
}

// Convenience: open the VIA interface, run fn(dev), always close.
export function withLighting(fn) {
  const dev = openInterface(USAGE.VIA);
  try {
    return fn(dev);
  } finally {
    dev.close();
  }
}
