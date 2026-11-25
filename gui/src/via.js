// Minimal VIA protocol codec over a node-hid device (usage page 0xFF60).
// VIA uses 32-byte reports; on hidraw we prepend report ID 0x00 on write.
import { openInterface, USAGE } from './device.js';

export const VIA_CMD = {
  GET_PROTOCOL_VERSION: 0x01,
  GET_KEYBOARD_VALUE: 0x02,
  DYNAMIC_KEYMAP_GET_KEYCODE: 0x04,
  DYNAMIC_KEYMAP_GET_LAYER_COUNT: 0x11,
  DYNAMIC_KEYMAP_GET_BUFFER: 0x12,
};

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

export function getKeycode(dev, layer, row, col) {
  const r = transact(dev, VIA_CMD.DYNAMIC_KEYMAP_GET_KEYCODE, [layer, row, col]);
  // reply: [cmd, layer, row, col, kc_hi, kc_lo]
  return (r[4] << 8) | r[5];
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
