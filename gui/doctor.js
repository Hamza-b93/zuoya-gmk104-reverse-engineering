// zuoya-doctor: a read-only diagnostic dump of the HID keyboards on this machine.
// Safe to run on ANY keyboard — it enumerates interfaces, reads HID report
// descriptors (Linux), and does the standard read-only VIA ping where present.
// It writes a redacted report you can paste into a GitHub issue to request
// support for a board this app doesn't know yet.
//
// Usage:  node doctor.js            # print + write zuoya-doctor-report.md
//         node doctor.js --no-via   # skip the VIA ping (pure enumeration)
import HID from 'node-hid';
import os from 'node:os';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { getProtocolVersion, getLayerCount } from './src/via.js';
import { matchKeyboard, usageLabel, USAGE } from './src/registry.js';

const SKIP_VIA = process.argv.includes('--no-via');
const hex = (n, w = 4) => `0x${(n ?? 0).toString(16).padStart(w, '0')}`;
const maskSerial = (s) => (s ? `<redacted:${s.length} chars>` : null);

// Linux only: the kernel report descriptor for a /dev/hidrawN path.
function reportDescriptor(path) {
  const m = /\/dev\/(hidraw\d+)/.exec(path || '');
  if (!m) return null;
  const file = `/sys/class/hidraw/${m[1]}/device/report_descriptor`;
  if (!existsSync(file)) return null;
  try {
    return [...readFileSync(file)].map((b) => b.toString(16).padStart(2, '0')).join(' ');
  } catch {
    return null;
  }
}

// Standard VIA ping (read-only): protocol version + layer count.
function viaPing(path) {
  let dev;
  try {
    dev = new HID.HID(path);
    return { protocolVersion: hex(getProtocolVersion(dev)), layerCount: getLayerCount(dev) };
  } catch (e) {
    return { error: e.message };
  } finally {
    dev?.close();
  }
}

function collect() {
  const all = HID.devices();
  // Group interfaces by keyboard (vid:pid).
  const boards = new Map();
  for (const d of all) {
    // Heuristic: only HID devices that look like keyboards or carry a vendor
    // usage page we care about. Keep it broad so unknown boards still show up.
    const key = `${hex(d.vendorId)}:${hex(d.productId)}`;
    if (!boards.has(key)) {
      const known = matchKeyboard(d.vendorId, d.productId);
      boards.set(key, {
        vendorId: hex(d.vendorId),
        productId: hex(d.productId),
        manufacturer: d.manufacturer ?? null,
        product: d.product ?? null,
        serialNumber: maskSerial(d.serialNumber),
        known: known ? known.name : null,
        interfaces: [],
      });
    }
    const iface = {
      interface: d.interface,
      usagePage: hex(d.usagePage),
      usage: hex(d.usage),
      role: usageLabel(d.usagePage), // VIA / SCREEN / OTA, or null
      reportDescriptor: reportDescriptor(d.path),
    };
    if (!SKIP_VIA && d.usagePage === USAGE.VIA) iface.via = viaPing(d.path);
    boards.get(key).interfaces.push(iface);
  }
  // Mark which app capabilities each board could expose.
  for (const b of boards.values()) {
    const pages = new Set(b.interfaces.map((i) => i.role).filter(Boolean));
    b.capabilities = {
      keymap: pages.has('VIA'),
      screen: pages.has('SCREEN'),
      ota: pages.has('OTA'),
    };
    b.appCandidate = b.capabilities.keymap; // VIA is the minimum bar
  }
  return {
    tool: 'zuoya-doctor',
    generatedAt: new Date().toISOString(),
    host: { platform: os.platform(), arch: os.arch(), node: process.version },
    boards: [...boards.values()],
  };
}

function toMarkdown(report) {
  const lines = ['# Keyboard diagnostic dump', ''];
  lines.push(`- Tool: \`${report.tool}\``);
  lines.push(`- Host: ${report.host.platform}/${report.host.arch}, Node ${report.host.node}`);
  lines.push('');
  for (const b of report.boards) {
    const caps = Object.entries(b.capabilities).filter(([, v]) => v).map(([k]) => k);
    lines.push(`## ${b.product ?? 'Unknown'} — ${b.vendorId}:${b.productId}`);
    lines.push(`- Manufacturer: ${b.manufacturer ?? '?'}`);
    lines.push(`- Known to this app: ${b.known ?? 'no'}`);
    lines.push(`- App candidate (has VIA): ${b.appCandidate ? 'yes' : 'no'}  ·  capabilities: ${caps.join(', ') || 'none detected'}`);
    lines.push('- Interfaces:');
    for (const i of b.interfaces) {
      const tag = i.role ? ` **${i.role}**` : '';
      const via = i.via ? (i.via.error ? ` (VIA ping failed: ${i.via.error})` : ` (VIA proto ${i.via.protocolVersion}, ${i.via.layerCount} layers)`) : '';
      lines.push(`  - usagePage ${i.usagePage}, usage ${i.usage}, iface ${i.interface}${tag}${via}`);
    }
    lines.push('');
  }
  lines.push('<details><summary>Full JSON (includes HID report descriptors)</summary>', '');
  lines.push('```json', JSON.stringify(report, null, 2), '```', '</details>', '');
  return lines.join('\n');
}

const report = collect();
const md = toMarkdown(report);
const outMd = 'zuoya-doctor-report.md';
writeFileSync(outMd, md);

// Console summary.
console.log(`zuoya-doctor — ${report.boards.length} HID device group(s) found\n`);
for (const b of report.boards) {
  const flag = b.known ? `known: ${b.known}` : b.appCandidate ? 'VIA candidate' : 'not a candidate';
  console.log(`• ${b.product ?? 'Unknown'}  ${b.vendorId}:${b.productId}  [${flag}]`);
  for (const i of b.interfaces) {
    const role = i.role ? ` <= ${i.role}` : '';
    console.log(`    usagePage ${i.usagePage}  usage ${i.usage}  iface ${i.interface}${role}`);
  }
}
console.log(`\nWrote ${outMd} — attach it to a GitHub issue to request support for a new board.`);
