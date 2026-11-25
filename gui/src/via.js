// Minimal VIA protocol codec over a node-hid device (usage page 0xFF60).
// VIA uses 32-byte reports; on hidraw we prepend report ID 0x00 on write.
import { openInterface, USAGE } from './device.js';

export const VIA_CMD = {
  GET_PROTOCOL_VERSION: 0x01,
  GET_KEYBOARD_VALUE: 0x02,
  DYNAMIC_KEYMAP_GET_KEYCODE: 0x04, // NOTE: non-standard on this firmware; use the buffer cmds
  DYNAMIC_KEYMAP_SET_KEYCODE: 0x05,
  DYNAMIC_KEYMAP_GET_LAYER_COUNT: 0x11,
  DYNAMIC_KEYMAP_GET_BUFFER: 0x12,
  DYNAMIC_KEYMAP_SET_BUFFER: 0x13,
};

// Largest keymap chunk per report: 32 data bytes - 4 header bytes = 28.
export const BUFFER_CHUNK = 28;

const REPORT_LEN = 32; // VIA RAW_EPSIZE

// Send one VIA command and read the reply. `args` are the bytes after the
// command id. Returns the 32-byte reply as a Buffer (reply[0] echoes the cmd).
function transact(dev, cmd, args = [], timeoutMs = 500) {
  const payload = Buffer.alloc(REPORT_LEN, 0);
  payload[0] = cmd;
  for (let i = 0; i < args.length && i + 1 < REPORT_LEN; i++) payload[i + 1] = args[i];

  // hidraw: first byte is the report ID (0x00 = unnumbered).
  dev.write([0x00, ...payload]);

  const reply = dev.readTimeout(timeoutMs);
  if (!reply || reply.length === 0) throw new Error(`VIA cmd 0x${cmd.toString(16)}: no reply (timeout)`);
  const buf = Buffer.from(reply);
  if (buf[0] !== cmd) {
    throw new Error(
      `VIA cmd 0x${cmd.toString(16)}: reply echoed 0x${buf[0].toString(16)} (unexpected)`,
    );
  }
  return buf;
}

export function getProtocolVersion(dev) {
  const r = transact(dev, VIA_CMD.GET_PROTOCOL_VERSION);
  return (r[1] << 8) | r[2];
}

export function getLayerCount(dev) {
  const r = transact(dev, VIA_CMD.DYNAMIC_KEYMAP_GET_LAYER_COUNT);
  return r[1];
}

export function getKeyboardValue(dev, valueId) {
  const r = transact(dev, VIA_CMD.GET_KEYBOARD_VALUE, [valueId]);
  return r.slice(2);
}

// Read `size` (<=28) bytes of the dynamic keymap buffer at byte `offset`.
// Reply: [0x12, off_hi, off_lo, size, ...data].
export function getBuffer(dev, offset, size) {
  const r = transact(dev, VIA_CMD.DYNAMIC_KEYMAP_GET_BUFFER, [
    (offset >> 8) & 0xff,
    offset & 0xff,
    size,
  ]);
  return r.slice(4, 4 + size);
}

// Write up to 28 bytes into the dynamic keymap buffer at `offset`.
export function setBuffer(dev, offset, data) {
  const args = [(offset >> 8) & 0xff, offset & 0xff, data.length, ...data];
  transact(dev, VIA_CMD.DYNAMIC_KEYMAP_SET_BUFFER, args);
}

// Read the whole keymap buffer (layers*rows*cols*2 bytes) in 28-byte chunks.
export function readKeymapBuffer(dev, totalBytes) {
  const out = Buffer.alloc(totalBytes);
  for (let off = 0; off < totalBytes; off += BUFFER_CHUNK) {
    const n = Math.min(BUFFER_CHUNK, totalBytes - off);
    getBuffer(dev, off, n).copy(out, off);
  }
  return out;
}

// Decode a buffer of big-endian 16-bit keycodes into an array of numbers.
export function decodeKeycodes(buf) {
  const kc = [];
  for (let i = 0; i + 1 < buf.length; i += 2) kc.push((buf[i] << 8) | buf[i + 1]);
  return kc;
}

// Convenience: open the VIA interface, run `fn(dev)`, always close.
export function withVia(fn) {
  const dev = openInterface(USAGE.VIA);
  try {
    return fn(dev);
  } finally {
    dev.close();
  }
}
