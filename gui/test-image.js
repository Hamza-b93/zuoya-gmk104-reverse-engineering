// Offline check of the image decoder (no keyboard needed): a known image decodes to
// 180x180 RGB888 that the screen codec accepts and encodes to the right colors.
// Run:  node --test test-image.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { loadImage } from './src/image.js';
import { SCREEN_SIZE, buildFramebuffer, imageToReports } from './src/screen.js';

const RGB_BYTES = SCREEN_SIZE * SCREEN_SIZE * 3;

// A solid-color PNG of arbitrary size, to prove decode + resize + format handling.
function solidPng(r, g, b, w = 64, h = 40) {
  return sharp({ create: { width: w, height: h, channels: 3, background: { r, g, b } } })
    .png()
    .toBuffer();
}

test('decodes and resizes an off-size PNG to exactly 180x180 RGB888', async () => {
  const rgb = await loadImage(await solidPng(10, 20, 30));
  assert.equal(rgb.length, RGB_BYTES);
  // Solid input stays solid after resize; spot-check a few pixels.
  for (const p of [0, 1234, SCREEN_SIZE * SCREEN_SIZE - 1]) {
    assert.deepEqual([rgb[p * 3], rgb[p * 3 + 1], rgb[p * 3 + 2]], [10, 20, 30], `pixel ${p}`);
  }
});

test('decoded output feeds the screen codec and encodes the expected RGB565', async () => {
  const rgb = await loadImage(await solidPng(255, 0, 0));
  assert.equal(buildFramebuffer(rgb).readUInt16BE(0), 0xf800); // pure red
  assert.equal(imageToReports(rgb).length, 1177); // full report sequence
});

test('flattens alpha (transparent PNG) onto the background color', async () => {
  const transparent = await sharp({
    create: { width: 32, height: 32, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .png()
    .toBuffer();
  const rgb = await loadImage(transparent, { background: '#ffffff' });
  assert.deepEqual([rgb[0], rgb[1], rgb[2]], [255, 255, 255]);
});
