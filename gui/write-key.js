// Headless check of the VIA keymap write path — no GUI, no switches needed.
// Reads a matrix cell, optionally writes a new keycode, and reads it back to
// confirm the firmware stored it.
//
// Usage:
//   node write-key.js <layer> <row> <col>            # read the current keycode
//   node write-key.js <layer> <row> <col> <code>     # write, then confirm
//
// <code> is a 16-bit VIA keycode: 0x-hex (0x001d), bare hex (1d), or decimal.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { withVia, getBuffer, setBuffer } from './src/via.js';
import { buildLayout, keyOffset } from './src/layout.js';
import { keycodeName } from './src/keycodes.js';

const DEF_PATH = fileURLToPath(new URL('../ZUOYA-GMK104-USB.json', import.meta.url));

function parseCode(text) {
  const t = text.trim();
  const isHex = /^0x[0-9a-f]+$/i.test(t) || /^[0-9a-f]*[a-f][0-9a-f]*$/i.test(t);
  const n = isHex ? Number.parseInt(t.replace(/^0x/i, ''), 16) : Number.parseInt(t, 10);
  if (!Number.isInteger(n) || n < 0 || n > 0xffff) return null;
  return n;
}

const fmt = (code) => `0x${code.toString(16).padStart(4, '0')} (${keycodeName(code)})`;

function main() {
  const [layerS, rowS, colS, codeS] = process.argv.slice(2);
  if (layerS === undefined || rowS === undefined || colS === undefined) {
    console.error('Usage: node write-key.js <layer> <row> <col> [code]');
    process.exit(2);
  }
  const layer = Number(layerS);
  const row = Number(rowS);
  const col = Number(colS);
  const { rows, cols } = buildLayout(JSON.parse(readFileSync(DEF_PATH, 'utf8')));
  if (![layer, row, col].every(Number.isInteger) || row < 0 || row >= rows || col < 0 || col >= cols) {
    console.error(`row/col must be inside the ${rows}x${cols} matrix; layer >= 0.`);
    process.exit(2);
  }

  let code;
  if (codeS !== undefined) {
    code = parseCode(codeS);
    if (code == null) {
      console.error(`bad code "${codeS}" — use 0x0000..0xffff (hex or decimal).`);
      process.exit(2);
    }
  }
  const offset = keyOffset({ layer, row, col, rows, cols });

  withVia((dev) => {
    const read = () => {
      const b = getBuffer(dev, offset, 2);
      return (b[0] << 8) | b[1];
    };

    const before = read();
    console.log(`L${layer} ${row},${col} (offset ${offset}): ${fmt(before)}`);

    if (code === undefined) return; // read-only

    console.log(`writing ${fmt(code)}...`);
    setBuffer(dev, offset, [(code >> 8) & 0xff, code & 0xff]);
    const after = read();
    if (after === code) {
      console.log(`✅ confirmed: now ${fmt(after)}`);
    } else {
      console.log(`❌ read back ${fmt(after)} — the firmware did not store ${fmt(code)}.`);
      process.exitCode = 1;
    }
  });
}

try {
  main();
} catch (e) {
  console.error(`❌ ${e.message}`);
  process.exit(1);
}
