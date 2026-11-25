// Upload an image file to the GMK104 180x180 color screen.
// Usage: node upload-image.js <path> [--fit cover|contain] [--bg '#rrggbb'] [--delay ms]
import { loadImage } from './src/image.js';
import { uploadImage } from './src/screen-device.js';

function parseArgs(argv) {
  const opts = { fit: 'cover', background: '#000000', delayMs: 10 };
  let path;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--fit') opts.fit = argv[++i];
    else if (a === '--bg') opts.background = argv[++i];
    else if (a === '--delay') opts.delayMs = Number(argv[++i]);
    else if (!a.startsWith('--')) path = a;
    else throw new Error(`unknown flag: ${a}`);
  }
  if (!path) throw new Error('no image path given');
  if (!['cover', 'contain'].includes(opts.fit)) throw new Error(`--fit must be cover or contain`);
  return { path, opts };
}

const USAGE = `Usage: node upload-image.js <image> [--fit cover|contain] [--bg '#rrggbb'] [--delay ms]
  --fit cover    (default) fill the 180x180 square, cropping overflow
  --fit contain  fit the whole image, letterboxing with --bg
  --bg '#000000' background/letterbox color
  --delay 10     ms between HID reports (lower = faster, raise if the upload stalls)`;

async function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`${err.message}\n\n${USAGE}`);
    process.exit(2);
  }

  const { path, opts } = parsed;
  console.log(`Decoding ${path} -> 180x180 (${opts.fit})...`);
  const rgb = await loadImage(path, opts);

  console.log('Uploading to screen (close the Windows tool / Wine first if open)...');
  const count = await uploadImage(rgb, { delayMs: opts.delayMs });
  console.log(`Done. Sent ${count} reports.`);
}

main().catch((err) => {
  console.error(`\nUpload failed: ${err.message}`);
  process.exit(1);
});
