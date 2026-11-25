// Screen widgets: each renders a 180x180 RGB888 frame from host data, on an
// interval. The screen has no RTC/sensors, so everything is computed on the PC
// and streamed. Pure-ish (data from node:os / sysfs); no device I/O here.
import os from 'node:os';
import { readFileSync } from 'node:fs';
import { svgFrame, clockSvg, statsSvg, renderSvg, svgToPngDataUrl } from './render.js';

const pct = (n) => Math.round(n);

// --- CPU usage: delta between two os.cpus() snapshots ---
let prevCpu = sampleCpu();
function sampleCpu() {
  let idle = 0;
  let total = 0;
  for (const c of os.cpus()) {
    for (const t of Object.values(c.times)) total += t;
    idle += c.times.idle;
  }
  return { idle, total };
}
function cpuPercent() {
  const cur = sampleCpu();
  const dt = cur.total - prevCpu.total;
  const di = cur.idle - prevCpu.idle;
  prevCpu = cur;
  if (dt <= 0) return 0;
  return pct((1 - di / dt) * 100);
}

// --- Optional CPU temperature (Linux thermal zone) ---
function cpuTempC() {
  try {
    const raw = Number(readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8').trim());
    if (Number.isFinite(raw) && raw > 0) return Math.round(raw / 1000);
  } catch { /* not available */ }
  return null;
}

function fmtUptime(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Each widget: { id, name, defaultIntervalMs, scene(now) -> inner SVG, background }.
export const WIDGETS = [
  {
    id: 'clock',
    name: 'Clock',
    defaultIntervalMs: 1000,
    background: '#0b0f17',
    scene() {
      const now = new Date();
      const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const date = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
      return clockSvg({ time, date });
    },
  },
  {
    id: 'sysmon',
    name: 'System monitor',
    defaultIntervalMs: 2000,
    background: '#0b0f17',
    scene() {
      const cpu = cpuPercent();
      const memUsed = os.totalmem() - os.freemem();
      const memPct = pct((memUsed / os.totalmem()) * 100);
      const temp = cpuTempC();
      const rows = [
        { label: 'CPU', value: `${cpu}%`, pct: cpu },
        { label: 'RAM', value: `${(memUsed / 1e9).toFixed(1)} GB`, pct: memPct },
      ];
      if (temp != null) rows.push({ label: 'Temp', value: `${temp}°C`, pct: Math.min(100, temp) });
      rows.push({ label: 'Up', value: fmtUptime(os.uptime()) });
      return statsSvg({ title: os.hostname().slice(0, 18).toUpperCase(), rows });
    },
  },
];

export function getWidget(id) {
  return WIDGETS.find((w) => w.id === id) ?? null;
}

// Render a widget to a 180x180 RGB888 buffer right now.
export function renderWidget(id) {
  const w = getWidget(id);
  if (!w) throw new Error(`unknown widget "${id}"`);
  return renderSvg(svgFrame(w.scene(), { background: w.background }));
}

export function listWidgets() {
  return WIDGETS.map(({ id, name, defaultIntervalMs }) => ({ id, name, defaultIntervalMs }));
}

// A PNG data URL of a widget's current frame, for in-GUI previews.
export function widgetPreview(id) {
  const w = getWidget(id);
  if (!w) throw new Error(`unknown widget "${id}"`);
  return svgToPngDataUrl(svgFrame(w.scene(), { background: w.background }));
}
