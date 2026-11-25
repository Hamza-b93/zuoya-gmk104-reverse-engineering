// Offline check of the screen codec against the captured Windows-tool upload (no keyboard needed).
// Run:  node --test test-screen-codec.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PIXEL_BYTES, SCREEN_SIZE, imageToReports, buildFramebuffer, withChecksum } from './src/screen.js';

const CAPTURE = fileURLToPath(
  new URL('../screen-re/capture/out_reports_hex.txt', import.meta.url),
);
const reference = readFileSync(CAPTURE, 'utf8')
  .trim()
  .split('\n')
  .map((line) => Buffer.from(line.split('\t')[1].trim(), 'hex'));

function solid(r, g, b) {
  const rgb = Buffer.alloc(SCREEN_SIZE * SCREEN_SIZE * 3);
  for (let i = 0; i < rgb.length; i += 3) rgb.set([r, g, b], i);
  return rgb;
}

const pixelOffset = (report) => report[5] | (report[6] << 8) | (report[7] << 16);

test('solid red matches the captured upload byte-for-byte in the displayed area', () => {
  const ours = imageToReports(solid(255, 0, 0));
  assert.equal(ours.length, reference.length);

  ours.forEach((report, i) => {
    const ref = reference[i];
    assert.equal(report[0], 0x04, `report ${i} report ID`);
    assert.equal(report[3], ref[3], `report ${i} opcode`);
    if (report[3] !== 0x21) {
      assert.deepEqual(report, ref, `report ${i} (non-pixel)`);
      return;
    }
    const off = pixelOffset(report);
    const len = report[4];
    assert.equal(ref[4], len, `report ${i} length`);
    assert.equal(off, pixelOffset(ref), `report ${i} offset`);
    if (off + len <= PIXEL_BYTES) {
      assert.deepEqual(report, ref, `report ${i} (pixel, fully displayed)`);
    } else {
      // Capture padding past PIXEL_BYTES is noise; compare only the displayed bytes.
      for (let k = 0; k < len; k++) {
        if (off + k < PIXEL_BYTES) assert.equal(report[8 + k], ref[8 + k], `report ${i} byte ${k}`);
      }
    }
  });
});

test('every report is 64 bytes with a valid checksum', () => {
  for (const report of imageToReports(solid(12, 34, 56))) {
    assert.equal(report.length, 64);
    assert.deepEqual(withChecksum(Buffer.from(report)), report);
  }
});

test('RGB565 is encoded big-endian for primary and extreme colours', () => {
  const cases = [
    [[255, 0, 0], 0xf800],
    [[0, 255, 0], 0x07e0],
    [[0, 0, 255], 0x001f],
    [[255, 255, 255], 0xffff],
    [[0, 0, 0], 0x0000],
  ];
  for (const [[r, g, b], expected] of cases) {
    const fb = buildFramebuffer(solid(r, g, b));
    assert.equal(fb.readUInt16BE(0), expected, `rgb(${r},${g},${b})`);
    assert.equal(fb.readUInt16BE(PIXEL_BYTES - 2), expected, `last pixel rgb(${r},${g},${b})`);
  }
});

test('rejects an image that is not 180x180 RGB888', () => {
  assert.throws(() => buildFramebuffer(Buffer.alloc(10)), /expected/);
});
