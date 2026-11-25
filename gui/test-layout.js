// Offline test of the KLE layout parser and keymap offset math against the
// real VIA definition (no keyboard needed).  Run:  node --test test-layout.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildLayout, keyOffset, parseKle } from './src/layout.js';

const def = JSON.parse(
  readFileSync(fileURLToPath(new URL('../ZUOYA-GMK104-USB.json', import.meta.url)), 'utf8'),
);

test('buildLayout reports the 8x15 matrix and places every key inside it', () => {
  const layout = buildLayout(def);
  assert.equal(layout.rows, 8);
  assert.equal(layout.cols, 15);
  assert.ok(layout.keys.length > 80, `expected a full board, got ${layout.keys.length} keys`);
  for (const k of layout.keys) {
    assert.ok(k.row >= 0 && k.row < 8 && k.col >= 0 && k.col < 15, `key ${k.row},${k.col} in matrix`);
  }
});

test('matrix positions are unique except known layout-option alternates', () => {
  const counts = new Map();
  for (const k of buildLayout(def).keys) {
    const id = `${k.row},${k.col}`;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  // This definition reuses 7,13 twice (an ANSI/ISO alternate cap). Both caps
  // edit the same matrix cell, which the editor handles. Flag any OTHER dup.
  const dups = [...counts].filter(([, n]) => n > 1).map(([id]) => id);
  assert.deepEqual(dups, ['7,13'], `unexpected duplicate matrix positions: ${dups}`);
});

test('parseKle honors widths: x advances by the preceding key width', () => {
  const { keys } = parseKle([
    [{ w: 2 }, '0,0', '0,1', { x: 1 }, '0,2'],
  ]);
  assert.deepEqual(keys.map((k) => k.x), [0, 2, 4]); // 2u key, then 1u, then +1 gap
});

test('keyOffset is layer-major, row-major, 2 bytes per key', () => {
  const dims = { rows: 8, cols: 15 };
  assert.equal(keyOffset({ layer: 0, row: 0, col: 0, ...dims }), 0);
  assert.equal(keyOffset({ layer: 0, row: 0, col: 1, ...dims }), 2);
  assert.equal(keyOffset({ layer: 0, row: 1, col: 0, ...dims }), 30);
  assert.equal(keyOffset({ layer: 1, row: 0, col: 0, ...dims }), 240); // 8*15*2
});
