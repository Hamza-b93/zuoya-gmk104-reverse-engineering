// CLI for the GMK104's RGB lighting over VIA (global effect/brightness/speed/color).
// Reads current values, or sets any subset and optionally persists to flash.
//
//   node set-light.js                         # read current lighting
//   node set-light.js --brightness 200        # set brightness, live
//   node set-light.js --effect 5 --hue 85 --sat 255 --save
//   node set-light.js --speed 120 --save      # set + persist to flash
import { getLighting, setLighting, saveLighting, withLighting } from './src/lighting.js';

const FIELDS = ['brightness', 'effect', 'speed', 'hue', 'sat'];
const argv = process.argv.slice(2);

const patch = {};
let save = false;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--save') { save = true; continue; }
  const name = a.replace(/^--/, '');
  if (FIELDS.includes(name)) {
    const v = Number(argv[++i]);
    if (!Number.isFinite(v)) { console.error(`✗ ${a} needs a number 0-255`); process.exit(1); }
    patch[name] = v;
  } else {
    console.error(`✗ unknown option: ${a}\n  fields: ${FIELDS.map((f) => '--' + f).join(' ')}  [--save]`);
    process.exit(1);
  }
}

const show = (l) =>
  `  effect ${l.effect} · brightness ${l.brightness} · speed ${l.speed} · hue ${l.hue} · sat ${l.sat}`;

try {
  withLighting((dev) => {
    if (Object.keys(patch).length === 0) {
      console.log('Current lighting:');
      console.log(show(getLighting(dev)));
      return;
    }
    const written = setLighting(dev, patch);
    console.log(`Set ${written.join(', ')}.`);
    if (save) { saveLighting(dev); console.log('Persisted to keyboard flash (survives a replug).'); }
    console.log('Now:');
    console.log(show(getLighting(dev)));
  });
} catch (e) {
  console.error('✗', e.message);
  process.exit(2);
}
