// Drives screen widgets onto the panel: renders the active widget on its
// interval and streams frames (ScreenStream drops stale frames, so a slow panel
// never backs up). Optional rotation cycles through widgets every rotateMs.
import { ScreenStream } from './screen-stream.js';
import { getWidget, listWidgets, renderWidget } from './widgets.js';

export class WidgetRunner {
  constructor() {
    this.stream = null;
    this.timer = null;
    this.rotateTimer = null;
    this.activeId = null;
    this.rotate = false;
  }

  get status() {
    return { running: this.timer != null, active: this.activeId, rotate: this.rotate };
  }

  async #tick() {
    if (!this.activeId) return;
    try {
      this.stream.push(await renderWidget(this.activeId));
    } catch (e) {
      this.onError?.(e);
    }
  }

  #schedule() {
    clearInterval(this.timer);
    const w = getWidget(this.activeId);
    const interval = w?.defaultIntervalMs ?? 1000;
    this.#tick(); // render immediately
    this.timer = setInterval(() => this.#tick(), interval);
  }

  // Start a single widget (id) or rotation (id='rotate'). rotateMs: cycle period.
  start(id, { rotateMs = 8000 } = {}) {
    this.stop();
    this.stream = new ScreenStream({ delayMs: 1 }).open();
    this.rotate = id === 'rotate';
    if (this.rotate) {
      const ids = listWidgets().map((w) => w.id);
      let i = 0;
      this.activeId = ids[0];
      this.#schedule();
      this.rotateTimer = setInterval(() => {
        i = (i + 1) % ids.length;
        this.activeId = ids[i];
        this.#schedule();
      }, rotateMs);
    } else {
      if (!getWidget(id)) throw new Error(`unknown widget "${id}"`);
      this.activeId = id;
      this.#schedule();
    }
    return this.status;
  }

  stop() {
    clearInterval(this.timer);
    clearInterval(this.rotateTimer);
    this.timer = this.rotateTimer = null;
    this.rotate = false;
    this.activeId = null;
    if (this.stream) {
      this.stream.close();
      this.stream = null;
    }
    return this.status;
  }
}
