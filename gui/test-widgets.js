// Offline tests for screen widgets: each renders a codec-ready 180x180 frame,
// the registry is sane, and previews are valid data URLs. No device.
// Run:  node --test test-widgets.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listWidgets, getWidget, renderWidget, widgetPreview } from './src/widgets.js';
import { statsSvg, svgFrame } from './src/render.js';
import { SCREEN_SIZE, buildFramebuffer, imageToReports } from './src/screen.js';

test('listWidgets exposes clock and sysmon with intervals', () => {
  const ids = listWidgets().map((w) => w.id);
  assert.ok(ids.includes('clock'));
  assert.ok(ids.includes('sysmon'));
  for (const w of listWidgets()) assert.ok(w.defaultIntervalMs > 0, `${w.id} has an interval`);
});

test('each widget renders a codec-ready 180x180 RGB888 frame', async () => {
  for (const { id } of listWidgets()) {
    const rgb = await renderWidget(id);
    assert.equal(rgb.length, SCREEN_SIZE * SCREEN_SIZE * 3, `${id} frame size`);
    assert.equal(buildFramebuffer(rgb).length, 0x10000, `${id} framebuffer`);
    assert.equal(imageToReports(rgb).length, 1177, `${id} report count`);
  }
});

test('widgetPreview returns a PNG data URL', async () => {
  const url = await widgetPreview('clock');
  assert.match(url, /^data:image\/png;base64,/);
});

test('unknown widget id throws', () => {
  assert.equal(getWidget('nope'), null);
  assert.throws(() => renderWidget('nope'), /unknown widget/);
});

test('statsSvg renders rows with and without meters', () => {
  const svg = svgFrame(statsSvg({ title: 'HOST', rows: [
    { label: 'CPU', value: '42%', pct: 42 },
    { label: 'Up', value: '3h 10m' },
  ] }));
  assert.match(svg, /CPU/);
  assert.match(svg, /42%/);
  assert.match(svg, /3h 10m/);
});
