// Unit tests for profile capture/apply + validation against a fake keyboard
// that models the dynamic-keymap buffer AND the lighting channel. No hardware.
// Run:  node --test test-profiles.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureProfile, applyProfile, validateProfile, slugify, PROFILE_VERSION } from './src/profiles.js';
import { LIGHT_VALUE, RGB_MATRIX_CHANNEL } from './src/lighting.js';

const ROWS = 2, COLS = 3, LAYERS = 2;
const KM_BYTES = ROWS * COLS * LAYERS * 2;

// Fake keyboard: a keymap byte buffer + the five lighting values, answering the
// VIA commands profiles touch (0x11/0x12/0x13 keymap, 0x07/0x08/0x09 lighting).
function fakeKeeb({ keymap, light } = {}) {
  const km = Buffer.from(keymap ?? Buffer.alloc(KM_BYTES));
  const L = { brightness: 50, effect: 2, speed: 100, hue: 30, sat: 200, ...light };
  let req = null;
  const reply = (bytes) => { const b = Buffer.alloc(32); Buffer.from(bytes).copy(b); return b; };
  const V = LIGHT_VALUE;
  return {
    km, L,
    write(bytes) { req = bytes.slice(1); },
    readTimeout() {
      const cmd = req[0];
      if (cmd === 0x11) return reply([cmd, LAYERS]);
      if (cmd === 0x12) { // GET_BUFFER [cmd, off_hi, off_lo, size]
        const off = (req[1] << 8) | req[2], size = req[3];
        return reply([cmd, req[1], req[2], size, ...km.subarray(off, off + size)]);
      }
      if (cmd === 0x13) { // SET_BUFFER [cmd, off_hi, off_lo, size, ...data]
        const off = (req[1] << 8) | req[2], size = req[3];
        Buffer.from(req.slice(4, 4 + size)).copy(km, off);
        return reply(req);
      }
      // lighting: [cmd, channel, valueId, ...]
      const valueId = req[2];
      if (cmd === 0x08) {
        const data = valueId === V.color ? [L.hue, L.sat]
          : valueId === V.brightness ? [L.brightness]
          : valueId === V.effect ? [L.effect] : [L.speed];
        return reply([cmd, RGB_MATRIX_CHANNEL, valueId, ...data]);
      }
      if (cmd === 0x07) {
        const d = req.slice(3);
        if (valueId === V.color) { L.hue = d[0]; L.sat = d[1]; }
        else if (valueId === V.brightness) L.brightness = d[0];
        else if (valueId === V.effect) L.effect = d[0];
        else if (valueId === V.speed) L.speed = d[0];
        return reply(req);
      }
      if (cmd === 0x09) return reply([cmd, RGB_MATRIX_CHANNEL]);
      throw new Error(`unexpected cmd 0x${cmd.toString(16)}`);
    },
    close() {},
  };
}

// A keymap buffer with distinct codes so a round-trip is meaningful.
function sampleKeymap() {
  const buf = Buffer.alloc(KM_BYTES);
  for (let i = 0; i < KM_BYTES / 2; i++) buf.writeUInt16BE(0x1000 + i, i * 2);
  return buf;
}

test('captureProfile snapshots keymap + lighting with correct shape', () => {
  const dev = fakeKeeb({ keymap: sampleKeymap(), light: { brightness: 77, effect: 9, speed: 11, hue: 40, sat: 180 } });
  const p = captureProfile(dev, { rows: ROWS, cols: COLS }, { name: 'Gaming Setup' });
  assert.equal(p.schema, 'keeb-control/profile');
  assert.equal(p.version, PROFILE_VERSION);
  assert.equal(p.name, 'Gaming Setup');
  assert.deepEqual(p.device, { rows: ROWS, cols: COLS, layerCount: LAYERS });
  assert.equal(p.keymap.length, ROWS * COLS * LAYERS);
  assert.equal(p.keymap[0], 0x1000);
  assert.deepEqual(p.lighting, { brightness: 77, effect: 9, speed: 11, hue: 40, sat: 180 });
});

test('applyProfile writes the keymap and lighting back to the device', () => {
  const src = fakeKeeb({ keymap: sampleKeymap(), light: { brightness: 77, effect: 9, speed: 11, hue: 40, sat: 180 } });
  const profile = captureProfile(src, { rows: ROWS, cols: COLS }, { name: 'p' });

  const dst = fakeKeeb(); // blank keymap + default lighting
  const res = applyProfile(dst, profile, { rows: ROWS, cols: COLS });
  assert.equal(res.keymap, ROWS * COLS * LAYERS);
  assert.ok(res.lightingApplied);
  assert.deepEqual(dst.km, src.km); // keymap bytes match
  assert.deepEqual(dst.L, src.L);   // lighting matches
});

test('captureProfile tolerates a board with no lighting channel', () => {
  // Simulate a board that NAKs the lighting GET: capture should still yield a
  // keymap-only profile (lighting === null) instead of failing.
  const dev = fakeKeeb({ keymap: sampleKeymap() });
  const realRead = dev.readTimeout.bind(dev);
  dev.readTimeout = () => {
    const r = realRead();
    if (r[0] === 0x08) throw new Error('no lighting channel');
    return r;
  };
  const p = captureProfile(dev, { rows: ROWS, cols: COLS }, { name: 'km-only' });
  assert.equal(p.lighting, null);
  assert.equal(p.keymap.length, ROWS * COLS * LAYERS);
});

test('validateProfile rejects a mismatched matrix', () => {
  const p = { schema: 'keeb-control/profile', version: PROFILE_VERSION, device: { rows: 6, cols: 21, layerCount: 2 }, keymap: [] };
  assert.throws(() => validateProfile(p, { rows: ROWS, cols: COLS }), /matrix/);
});

test('validateProfile rejects a non-profile object and bad length', () => {
  assert.throws(() => validateProfile({ foo: 1 }, { rows: ROWS, cols: COLS }), /Not a Keeb Control profile/);
  const bad = { schema: 'keeb-control/profile', version: PROFILE_VERSION, device: { rows: ROWS, cols: COLS, layerCount: LAYERS }, keymap: [1, 2, 3] };
  assert.throws(() => validateProfile(bad, { rows: ROWS, cols: COLS }), /expected/);
});

test('slugify makes safe file bases', () => {
  assert.equal(slugify('Gaming Setup!'), 'gaming-setup');
  assert.equal(slugify('  '), 'profile');
  assert.equal(slugify('WASD/Arrows'), 'wasd-arrows');
});
