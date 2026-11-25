// Render a 180x180 RGB888 frame from a scene description, for live screen
// widgets (clock, game stats, ...). SVG is composed as text, then rasterized by
// sharp. Pure: scene in, pixels out. No device I/O.
import sharp from 'sharp';
import { SCREEN_SIZE } from './screen.js';

const S = SCREEN_SIZE; // 180

export function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]),
  );
}

// Wrap inner SVG markup in a full 180x180 document with a solid background.
export function svgFrame(innerSvg, { background = '#0b0f17' } = {}) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">` +
    `<rect width="${S}" height="${S}" fill="${background}"/>` +
    innerSvg +
    `</svg>`
  );
}

// Rasterize an SVG string (full document) to a 180x180 RGB888 buffer.
export async function renderSvg(svg) {
  const { data, info } = await sharp(Buffer.from(svg))
    .resize(S, S, { fit: 'cover' })
    .flatten({ background: '#000000' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (data.length !== S * S * 3) {
    throw new Error(`render produced ${data.length} bytes, expected ${S * S * 3}`);
  }
  return data;
}

// Rasterize a full SVG document to a PNG data URL (for in-GUI previews).
export async function svgToPngDataUrl(svg) {
  const png = await sharp(Buffer.from(svg)).resize(S, S, { fit: 'cover' }).flatten({ background: '#000000' }).png().toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}

export function text(x, y, s, { size = 20, fill = '#e6ecf5', weight = 400, anchor = 'middle', family = 'sans-serif' } = {}) {
  return (
    `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" ` +
    `fill="${fill}" text-anchor="${anchor}">${escapeXml(s)}</text>`
  );
}

// A game-stats widget: a title bar, a big K / D / A line, and an optional sub line.
export function gameStatsSvg({ title = '', kills = 0, deaths = 0, assists = 0, sub = '', accent = '#5b9dff' } = {}) {
  const kda = `${kills}/${deaths}/${assists}`;
  return (
    `<rect x="0" y="0" width="${S}" height="34" fill="${accent}"/>` +
    text(S / 2, 24, title, { size: 18, weight: 700, fill: '#0b0f17' }) +
    text(S / 2, 58, 'K / D / A', { size: 14, fill: '#8a97ab' }) +
    text(S / 2, 108, kda, { size: 48, weight: 700, fill: '#e6ecf5' }) +
    (sub ? text(S / 2, 150, sub, { size: 16, fill: '#8a97ab' }) : '')
  );
}

// A simple clock widget (host clock; the panel has no RTC).
export function clockSvg({ time = '', date = '', accent = '#5b9dff' } = {}) {
  return (
    text(S / 2, 96, time, { size: 46, weight: 700, fill: '#e6ecf5' }) +
    (date ? text(S / 2, 132, date, { size: 16, fill: accent }) : '')
  );
}

// A labeled stat list with little bar meters. rows: [{ label, value, pct? }].
// `pct` (0..100) draws a meter under the row; omit it for plain value rows.
export function statsSvg({ title = '', rows = [], accent = '#5b9dff' } = {}) {
  let svg =
    `<rect x="0" y="0" width="${S}" height="30" fill="${accent}"/>` +
    text(S / 2, 21, title, { size: 15, weight: 700, fill: '#0b0f17' });
  const top = 48;
  const rowH = Math.min(34, (S - top - 8) / Math.max(rows.length, 1));
  rows.forEach((r, i) => {
    const y = top + i * rowH;
    svg += text(10, y, r.label, { size: 13, fill: '#8a97ab', anchor: 'start' });
    svg += text(S - 10, y, String(r.value), { size: 15, weight: 700, fill: '#e6ecf5', anchor: 'end' });
    if (typeof r.pct === 'number') {
      const w = S - 20;
      const p = Math.max(0, Math.min(100, r.pct)) / 100;
      svg +=
        `<rect x="10" y="${y + 6}" width="${w}" height="5" rx="2.5" fill="#1b2433"/>` +
        `<rect x="10" y="${y + 6}" width="${(w * p).toFixed(1)}" height="5" rx="2.5" fill="${accent}"/>`;
    }
  });
  return svg;
}

// Convenience: render a game-stats frame straight to RGB888.
export function renderGameStats(opts) {
  return renderSvg(svgFrame(gameStatsSvg(opts), { background: opts?.background ?? '#0b0f17' }));
}
