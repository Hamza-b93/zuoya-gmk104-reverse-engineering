// Decode an image file to the 180x180 RGB888 buffer the screen codec expects.
// Pure-ish: file in, raw pixels out. No device I/O. Uses sharp for format + resize.
import sharp from 'sharp';
import { SCREEN_SIZE } from './screen.js';

// fit: 'cover' fills the square and crops overflow; 'contain' letterboxes (no crop).
export async function loadImage(path, { fit = 'cover', background = '#000000' } = {}) {
  const { data, info } = await sharp(path)
    .resize(SCREEN_SIZE, SCREEN_SIZE, { fit, background })
    .flatten({ background }) // drop alpha onto a solid background (screen has no transparency)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.channels !== 3) {
    throw new Error(`expected 3 channels after decode, got ${info.channels}`);
  }
  const expected = SCREEN_SIZE * SCREEN_SIZE * 3;
  if (data.length !== expected) {
    throw new Error(`expected ${expected} RGB bytes, got ${data.length}`);
  }
  return data; // Buffer of RGB888, row-major, top-left origin
}
