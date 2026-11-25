// Sends a four-quadrant test pattern to the keyboard screen to check orientation.
// Top-left is white, top-right red, bottom-left green, bottom-right blue.
// If the panel shows them elsewhere, the image is flipped or rotated.
import { uploadImage } from './src/screen-device.js';
import { SCREEN_SIZE } from './src/screen.js';

const COLORS = {
  topLeft: [255, 255, 255],
  topRight: [255, 0, 0],
  bottomLeft: [0, 255, 0],
  bottomRight: [0, 0, 255],
};

const half = SCREEN_SIZE / 2;
const rgb = new Uint8Array(SCREEN_SIZE * SCREEN_SIZE * 3);
for (let y = 0; y < SCREEN_SIZE; y++) {
  for (let x = 0; x < SCREEN_SIZE; x++) {
    const top = y < half;
    const left = x < half;
    const key = top ? (left ? 'topLeft' : 'topRight') : left ? 'bottomLeft' : 'bottomRight';
    rgb.set(COLORS[key], (y * SCREEN_SIZE + x) * 3);
  }
}

const count = await uploadImage(rgb);
console.log(`Sent ${count} reports.`);
