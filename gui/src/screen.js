// Screen (usage page 0xFF1C) image codec for the GMK104 color panel.
// Pure functions only: no device I/O. Protocol reference: docs/08-screen-protocol.md.

export const SCREEN_SIZE = 180;
export const PIXEL_BYTES = SCREEN_SIZE * SCREEN_SIZE * 2; // 64 800 displayed bytes
export const FRAMEBUFFER_BYTES = 0x10000; // padded; bytes past PIXEL_BYTES are not displayed

const REPORT_ID = 0x04;
const REPORT_LEN = 64;
const PIXEL_CHUNK = 56;

const OP = {
  BEGIN: 0x01,
  METADATA: 0x06,
  SYNC: 0x02,
  PREPARE: 0x23,
  WRITE_PIXELS: 0x21,
};

// Metadata body (report bytes 4..63) captured for a still 180x180 image; constant for stills.
const METADATA_BODY = Buffer.from(
  '30000000000104020001ffffff0000000000000000000000ff000000000000ff000902ff000101061506032511260064000000000000000000000000',
  'hex',
);

export function withChecksum(report) {
  let sum = 0;
  for (let i = 3; i < REPORT_LEN; i++) sum += report[i];
  report.writeUInt16LE(sum & 0xffff, 1);
  return report;
}

function makeReport(opcode, body = Buffer.alloc(0)) {
  const report = Buffer.alloc(REPORT_LEN);
  report[0] = REPORT_ID;
  report[3] = opcode;
  body.copy(report, 4);
  return withChecksum(report);
}

// Convert packed RGB888 (180*180*3 bytes, row-major) to a 65 536-byte RGB565-BE framebuffer.
export function buildFramebuffer(rgb) {
  const pixels = SCREEN_SIZE * SCREEN_SIZE;
  if (rgb.length !== pixels * 3) {
    throw new Error(`expected ${pixels * 3} RGB bytes, got ${rgb.length}`);
  }
  const fb = Buffer.alloc(FRAMEBUFFER_BYTES);
  for (let p = 0; p < pixels; p++) {
    const r = rgb[p * 3];
    const g = rgb[p * 3 + 1];
    const b = rgb[p * 3 + 2];
    const v = ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
    fb.writeUInt16BE(v, p * 2);
  }
  return fb;
}

// Full ordered report sequence for one still image: prologue, pixel stream, epilogue.
export function buildReports(framebuffer) {
  if (framebuffer.length !== FRAMEBUFFER_BYTES) {
    throw new Error(`framebuffer must be ${FRAMEBUFFER_BYTES} bytes`);
  }
  const reports = [
    makeReport(OP.BEGIN),
    makeReport(OP.METADATA, METADATA_BODY),
    makeReport(OP.SYNC),
    makeReport(OP.PREPARE),
    makeReport(OP.BEGIN),
  ];
  for (let off = 0; off < FRAMEBUFFER_BYTES; off += PIXEL_CHUNK) {
    const len = Math.min(PIXEL_CHUNK, FRAMEBUFFER_BYTES - off);
    const body = Buffer.alloc(4 + len);
    body[0] = len;
    body[1] = off & 0xff;
    body[2] = (off >> 8) & 0xff;
    body[3] = (off >> 16) & 0xff;
    framebuffer.copy(body, 4, off, off + len);
    reports.push(makeReport(OP.WRITE_PIXELS, body));
  }
  reports.push(makeReport(OP.SYNC));
  return reports;
}

export function imageToReports(rgb) {
  return buildReports(buildFramebuffer(rgb));
}
