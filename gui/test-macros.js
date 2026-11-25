// Unit tests for the VIA dynamic-macro codec (byte format <-> step lists).
// Pure encode/decode — no hardware. Run:  node --test test-macros.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeMacro, encodeMacro, decodeMacros, encodeMacros, macrosByteLength,
  SS_QMK_PREFIX, SS, MAX_DELAY_MS,
} from './src/macros.js';

test('text steps encode to raw ASCII bytes and back', () => {
  const steps = [{ type: 'text', value: 'hi!' }];
  assert.deepEqual(encodeMacro(steps), [0x68, 0x69, 0x21]);
  assert.deepEqual(decodeMacro(Buffer.from([0x68, 0x69, 0x21])), steps);
});

test('tap/down/up encode with the QMK prefix + tag + keycode', () => {
  assert.deepEqual(encodeMacro([{ type: 'tap', code: 0x04 }]), [SS_QMK_PREFIX, SS.TAP, 0x04]);
  assert.deepEqual(encodeMacro([{ type: 'down', code: 0xe1 }]), [SS_QMK_PREFIX, SS.DOWN, 0xe1]);
  assert.deepEqual(encodeMacro([{ type: 'up', code: 0xe1 }]), [SS_QMK_PREFIX, SS.UP, 0xe1]);
});

test('a Ctrl+C macro round-trips through bytes', () => {
  const steps = [
    { type: 'down', code: 0xe0 }, // LCtrl down
    { type: 'tap', code: 0x06 },  // C
    { type: 'up', code: 0xe0 },   // LCtrl up
  ];
  const bytes = encodeMacro(steps);
  assert.deepEqual(decodeMacro(Buffer.from(bytes)), steps);
});

test('delay encodes without any 0x00 byte and decodes exactly', () => {
  for (const ms of [0, 1, 100, 254, 255, 500, 1000, MAX_DELAY_MS]) {
    const bytes = encodeMacro([{ type: 'delay', ms }]);
    assert.equal(bytes[0], SS_QMK_PREFIX);
    assert.equal(bytes[1], SS.DELAY);
    assert.ok(!bytes.includes(0x00), `delay ${ms} must not contain a 0x00 byte`);
    assert.deepEqual(decodeMacro(Buffer.from(bytes)), [{ type: 'delay', ms }]);
  }
});

test('delay is clamped to the representable range', () => {
  assert.deepEqual(decodeMacro(Buffer.from(encodeMacro([{ type: 'delay', ms: 99999 }]))), [{ type: 'delay', ms: MAX_DELAY_MS }]);
  assert.deepEqual(decodeMacro(Buffer.from(encodeMacro([{ type: 'delay', ms: -5 }]))), [{ type: 'delay', ms: 0 }]);
});

test('mixed text + actions coalesce text runs on decode', () => {
  const steps = [
    { type: 'text', value: 'ab' },
    { type: 'tap', code: 0x28 }, // Enter
    { type: 'text', value: 'cd' },
  ];
  assert.deepEqual(decodeMacro(Buffer.from(encodeMacro(steps))), steps);
});

test('the full buffer splits into exactly `count` macros, padding empties', () => {
  const macros = [
    [{ type: 'text', value: 'x' }],
    [], // empty slot
    [{ type: 'tap', code: 0x04 }],
  ];
  const buf = encodeMacros(macros);
  // ('x' + \0) + (\0) + (prefix tap A + \0) = 2 + 1 + 4 = 7 bytes
  assert.equal(buf.length, 7);
  assert.deepEqual(decodeMacros(buf, 3), macros);
  // Asking for more slots than terminators pads with empty arrays.
  assert.deepEqual(decodeMacros(buf, 5), [...macros, [], []]);
});

test('macrosByteLength counts every macro + its terminator', () => {
  const macros = [[{ type: 'text', value: 'hey' }], [{ type: 'delay', ms: 50 }]];
  // (3 + 1) + (4 + 1) = 9
  assert.equal(macrosByteLength(macros), 9);
  assert.equal(encodeMacros(macros).length, 9);
});

test('encoding refuses an un-typeable text byte', () => {
  assert.throws(() => encodeMacro([{ type: 'text', value: 'a\u0001b' }]), /can't contain/);
  assert.throws(() => encodeMacro([{ type: 'text', value: 'null\u0000here' }]), /can't contain/);
});

test('an unknown prefix tag is skipped rather than corrupting the rest', () => {
  // [prefix, 0x09 (bogus tag), 'A']: the stray prefix is dropped, then 0x09 and
  // 0x41 decode as ordinary text bytes ("\tA").
  assert.deepEqual(decodeMacro(Buffer.from([SS_QMK_PREFIX, 0x09, 0x41])), [{ type: 'text', value: '\tA' }]);
});
