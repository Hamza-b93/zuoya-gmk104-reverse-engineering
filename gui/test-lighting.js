// Unit tests for the VIA lighting codec against a fake keyboard that models the
// custom-channel commands (0x07 set / 0x08 get / 0x09 save). No hardware needed.
// Run:  node --test test-lighting.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getLighting, setLighting, saveLighting, RGB_MATRIX_CHANNEL, LIGHT_VALUE } from './src/lighting.js';

// Fake node-hid device: holds the four RGB-Matrix values and answers VIA
// custom-lighting transactions. write() stashes the request (minus report id),
// readTimeout() returns the matching 32-byte reply.
function fakeKeeb(initial = {}) {
  const store = { brightness: 0, effect: 0, speed: 0, hue: 0, sat: 0, ...initial };
  let saved = null;
  let req = null;
  const reply = (bytes) => { const b = Buffer.alloc(32); Buffer.from(bytes).copy(b); return b; };
  const V = LIGHT_VALUE;
  return {
    store,
    get saved() { return saved; },
    write(bytes) { req = bytes.slice(1); }, // strip the leading report id
    readTimeout() {
      const [cmd, channel, valueId] = req;
      assert.equal(channel, RGB_MATRIX_CHANNEL, 'channel must be RGB-Matrix (3)');
      if (cmd === 0x08) { // GET -> [cmd, ch, valueId, ...data]
        const data = valueId === V.color ? [store.hue, store.sat]
          : valueId === V.brightness ? [store.brightness]
          : valueId === V.effect ? [store.effect]
          : valueId === V.speed ? [store.speed] : [0];
        return reply([cmd, channel, valueId, ...data]);
      }
      if (cmd === 0x07) { // SET
        const data = req.slice(3);
        if (valueId === V.color) { store.hue = data[0]; store.sat = data[1]; }
        else if (valueId === V.brightness) store.brightness = data[0];
        else if (valueId === V.effect) store.effect = data[0];
        else if (valueId === V.speed) store.speed = data[0];
        return reply(req); // firmware echoes the request
      }
      if (cmd === 0x09) { saved = { ...store }; return reply([cmd, channel]); }
      throw new Error(`unexpected cmd 0x${cmd.toString(16)}`);
    },
    close() {},
  };
}

test('getLighting reads all four global values', () => {
  const dev = fakeKeeb({ brightness: 200, effect: 5, speed: 120, hue: 85, sat: 255 });
  assert.deepEqual(getLighting(dev), { brightness: 200, effect: 5, speed: 120, hue: 85, sat: 255 });
});

test('setLighting writes a subset and leaves other fields untouched', () => {
  const dev = fakeKeeb({ brightness: 10, effect: 1, speed: 1, hue: 1, sat: 1 });
  const written = setLighting(dev, { brightness: 128, effect: 7 });
  assert.deepEqual(written, ['brightness', 'effect']);
  assert.equal(dev.store.brightness, 128);
  assert.equal(dev.store.effect, 7);
  assert.equal(dev.store.speed, 1); // unchanged
  assert.equal(dev.store.hue, 1);
});

test('a hue-only color patch preserves the current saturation', () => {
  const dev = fakeKeeb({ hue: 10, sat: 222 });
  setLighting(dev, { hue: 90 });
  assert.equal(dev.store.hue, 90);
  assert.equal(dev.store.sat, 222); // read back and kept
});

test('values are clamped to the 0-255 byte range', () => {
  const dev = fakeKeeb();
  setLighting(dev, { brightness: 999, speed: -5 });
  assert.equal(dev.store.brightness, 255);
  assert.equal(dev.store.speed, 0);
});

test('setLighting + getLighting round-trips every field', () => {
  const dev = fakeKeeb();
  setLighting(dev, { brightness: 64, effect: 12, speed: 200, hue: 170, sat: 140 });
  assert.deepEqual(getLighting(dev), { brightness: 64, effect: 12, speed: 200, hue: 170, sat: 140 });
});

test('saveLighting issues the custom-save command', () => {
  const dev = fakeKeeb({ brightness: 99 });
  saveLighting(dev);
  assert.deepEqual(dev.saved, dev.store);
});
