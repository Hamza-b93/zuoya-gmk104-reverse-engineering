// Unit tests for the Kanata config generator. Pure — no kanata binary, no
// device. Run: node --test test-kanata.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hidToKanata, generateKanataConfig } from './src/kanata.js';

test('hidToKanata maps the common key groups', () => {
  assert.equal(hidToKanata(0x04), 'a');
  assert.equal(hidToKanata(0x1d), 'z');
  assert.equal(hidToKanata(0x1e), '1');
  assert.equal(hidToKanata(0x27), '0');
  assert.equal(hidToKanata(0x29), 'esc');
  assert.equal(hidToKanata(0x2c), 'spc');
  assert.equal(hidToKanata(0x3a), 'f1');
  assert.equal(hidToKanata(0xe1), 'lsft');
  assert.equal(hidToKanata(0xa9), 'volu');
  assert.equal(hidToKanata(0x62), 'kp0');
});

test('hidToKanata returns null for codes it should not guess', () => {
  assert.equal(hidToKanata(0x5201), null); // MO(1) layer code
  assert.equal(hidToKanata(0x00), null);   // KC_NO
});

test('generates aligned defsrc + identical base layer', () => {
  const keys = [
    { x: 0, y: 0, code: 0x29 }, // esc
    { x: 1, y: 0, code: 0x1e }, // 1
    { x: 0, y: 1, code: 0x14 }, // q
    { x: 1, y: 1, code: 0x1a }, // w
  ];
  const { config, mapped, skipped } = generateKanataConfig(keys, { name: 'TEST' });
  assert.equal(mapped, 4);
  assert.equal(skipped.length, 0);
  assert.match(config, /\(defsrc/);
  assert.match(config, /\(deflayer base/);
  // Both blocks present and identical in content.
  const defsrc = config.match(/\(defsrc\n([\s\S]*?)\n\)/)[1];
  const base = config.match(/\(deflayer base\n([\s\S]*?)\n\)/)[1];
  assert.equal(defsrc, base);
  // Row grouping: esc and 1 on one line, q and w on the next.
  assert.match(defsrc, /esc\s+1/);
  assert.match(defsrc, /q\s+w/);
});

test('skips unmappable codes and records them, keeping blocks aligned', () => {
  const keys = [
    { x: 0, y: 0, code: 0x04 },   // a
    { x: 1, y: 0, code: 0x5201 }, // MO(1) -> unmapped, skipped
  ];
  const { config, mapped, skipped } = generateKanataConfig(keys);
  assert.equal(mapped, 1);
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].reason, 'unmapped code');
  assert.match(config, /Not managed by Kanata/);
});

test('deduplicates a repeated physical key (e.g. the RC(7,13) clash)', () => {
  const keys = [
    { x: 0, y: 0, code: 0x29, row: 0, col: 0 }, // esc
    { x: 9, y: 4, code: 0x29, row: 7, col: 13 }, // esc again -> duplicate
  ];
  const { mapped, skipped } = generateKanataConfig(keys);
  assert.equal(mapped, 1);
  assert.equal(skipped.length, 1);
  assert.match(skipped[0].reason, /duplicate esc/);
});
