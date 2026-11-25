// Stream frames to the screen for live/dynamic content. Keeps the 0xFF1C handle
// open across frames and serializes uploads with "latest wins": while a frame is
// uploading, only the most recent queued frame is kept, so a fast data source
// never backs up a queue of stale frames.
//
// A full 180x180 frame is ~1177 HID reports; USB HID caps near 1 report/ms, so
// expect ~1-1.5 s per frame. Fine for clocks and game stats (slow-changing),
// not for video. `delayMs` is the inter-report delay (keep it small for streaming).
import { openInterface, USAGE } from './device.js';
import { buildReports, buildFramebuffer } from './screen.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class ScreenStream {
  constructor({ delayMs = 1 } = {}) {
    this.delayMs = delayMs;
    this.hid = null;
    this.busy = false;
    this.pending = null; // latest RGB888 frame waiting to go out
    this.closed = false;
  }

  open() {
    if (!this.hid) this.hid = openInterface(USAGE.SCREEN);
    return this;
  }

  // Queue a 180x180 RGB888 frame. Returns immediately; the newest frame wins.
  push(rgb) {
    if (this.closed) throw new Error('ScreenStream is closed');
    this.pending = rgb;
    if (!this.busy) this.#drain();
  }

  async #drain() {
    this.busy = true;
    try {
      this.open();
      while (this.pending && !this.closed) {
        const rgb = this.pending;
        this.pending = null;
        await this.#upload(rgb);
      }
    } finally {
      this.busy = false;
    }
  }

  async #upload(rgb) {
    const reports = buildReports(buildFramebuffer(rgb));
    for (const report of reports) {
      if (this.closed) return;
      this.hid.write(Array.from(report));
      if (this.delayMs > 0) await sleep(this.delayMs);
    }
  }

  // Wait until no frame is in flight or queued.
  async idle() {
    while (this.busy || this.pending) await sleep(5);
  }

  close() {
    this.closed = true;
    this.pending = null;
    if (this.hid) {
      try { this.hid.close(); } catch { /* already gone */ }
      this.hid = null;
    }
  }
}
