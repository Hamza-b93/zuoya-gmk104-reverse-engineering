// Sends screen reports to the GMK104 screen interface (usage page 0xFF1C).
import { openInterface, USAGE } from './device.js';
import { imageToReports } from './screen.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Upload a 180x180 RGB888 image (Uint8Array, row-major, top-left origin) to the screen.
export async function uploadImage(rgb, { delayMs = 10 } = {}) {
  const reports = imageToReports(rgb);
  const hid = openInterface(USAGE.SCREEN);
  try {
    for (const report of reports) {
      hid.write(Array.from(report));
      if (delayMs > 0) await sleep(delayMs);
    }
  } finally {
    hid.close();
  }
  return reports.length;
}
