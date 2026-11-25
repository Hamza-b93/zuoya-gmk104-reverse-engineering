// De-risking probe: prove two-way VIA comms with the GMK104 from Node.
// Run:  node test-handshake.js
import { describe, USAGE } from './src/device.js';
import { withVia, getProtocolVersion, getLayerCount, getKeycode } from './src/via.js';

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
  console.log(`  ${d.path}  pid=${d.productId}  usagePage=${d.usagePage}  usage=${d.usage}${tag}`);
}

console.log('\nVIA handshake:');
try {
  withVia((dev) => {
    const proto = getProtocolVersion(dev);
    console.log(`  protocol version : 0x${proto.toString(16)} (${proto})`);
    const layers = getLayerCount(dev);
    console.log(`  layer count      : ${layers}`);
    const kc = getKeycode(dev, 0, 0, 0);
    console.log(`  keycode (L0,r0,c0): 0x${kc.toString(16).padStart(4, '0')}`);
    console.log('\n  ✅ Two-way VIA comms confirmed.');
  });
} catch (e) {
  console.error('  ❌', e.message);
  process.exit(2);
}
