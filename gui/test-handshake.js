// De-risking probe: prove two-way VIA comms with the GMK104 from Node,
// and read back real keycodes via the dynamic-keymap buffer (0x12).
// Run:  node test-handshake.js
import { describe, USAGE } from './src/device.js';
import {
  withVia, getProtocolVersion, getLayerCount, getBuffer, decodeKeycodes,
} from './src/via.js';
import { keycodeName } from './src/keycodes.js';

console.log('GMK104 interfaces visible to the OS:');
const ifs = describe();
if (ifs.length === 0) {
  console.log('  (none) — plug in the keyboard in wired mode and check /dev/hidraw* permissions.');
  process.exit(1);
}
for (const d of ifs) {
  const tag =
    d.usagePage === `0x${USAGE.VIA.toString(16)}` ? ' <= VIA'
    : d.usagePage === `0x${USAGE.SCREEN.toString(16)}` ? ' <= SCREEN'
    : d.usagePage === `0x${USAGE.OTA.toString(16)}` ? ' <= OTA' : '';
  if (tag) console.log(`  ${d.path}  pid=${d.productId}  usagePage=${d.usagePage}${tag}`);
}

console.log('\nVIA handshake:');
try {
  withVia((dev) => {
    console.log(`  protocol version : 0x${getProtocolVersion(dev).toString(16)}`);
    const layers = getLayerCount(dev);
    console.log(`  layer count      : ${layers}`);

    // Read the first 28 bytes (14 keycodes) of layer 0 = the top row.
    const row = decodeKeycodes(getBuffer(dev, 0, 28));
    console.log('  layer 0, keys 0-13:');
    console.log('    ' + row.map(keycodeName).join('  '));

    console.log('\n  ✅ Two-way VIA comms confirmed; keymap is readable via the buffer protocol.');
  });
} catch (e) {
  console.error('  ❌', e.message);
  process.exit(2);
}
