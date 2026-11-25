// "Now playing" provider: detect the game currently running (Steam, or
// best-effort Lutris) and render its LOGO on the screen rather than its name.
//
// Everything stays local — no Steam Web API, no network, no account data leaves
// the machine. Detection reads /proc and Steam's local files; art comes from
// Steam's own on-disk library cache.
//
// The parsers (parse* / appIdFromCmdline) are pure and unit-tested; the detect*
// functions touch the real system and are defensive (any read can fail and the
// widget just shows "Nothing playing").
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';
import { text, escapeXml } from '../render.js';
import { SCREEN_SIZE as S } from '../screen.js';

// ---------- pure parsers ----------

// Steam writes "RunningAppID" into its registry.vdf while a game runs.
export function parseRunningAppId(vdf) {
  const m = /"RunningAppID"\s+"(\d+)"/i.exec(String(vdf ?? ''));
  const id = m ? Number(m[1]) : 0;
  return id > 0 ? id : null;
}

// Pull a top-level string field out of an appmanifest .acf (VDF).
export function parseAcfField(acf, key) {
  const m = new RegExp(`"${key}"\\s+"([^"]*)"`, 'i').exec(String(acf ?? ''));
  return m ? m[1] : null;
}

// Steam launches games via `.../reaper SteamLaunch AppId=<id> -- ...`. Pull the
// app id out of a process cmdline (NUL- or space-separated).
export function appIdFromCmdline(cmdline) {
  const s = String(cmdline ?? '').replace(/\0/g, ' ');
  const m = /(?:SteamLaunch\s+)?(?:Steam)?AppId=(\d+)/i.exec(s);
  const id = m ? Number(m[1]) : 0;
  return id > 0 && id !== 7 ? id : null; // 7 = the Steam client itself
}

// A Lutris game config yml -> its executable path (wine `exe` or native `main_file`).
export function parseLutrisExe(yml) {
  const m = /^\s*(?:exe|main_file):\s*(.+?)\s*$/im.exec(String(yml ?? ''));
  return m ? m[1].replace(/^["']|["']$/g, '') : null;
}

// slug "half-life-2" -> "Half Life 2" (the Lutris id suffix is stripped upstream).
export function titleizeSlug(slug) {
  return String(slug ?? '')
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ---------- Steam detection (reliable) ----------

function steamRoots() {
  const h = homedir();
  return [
    join(h, '.steam', 'steam'),
    join(h, '.local', 'share', 'Steam'),
    join(h, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'),
  ].filter((d) => existsSync(d));
}

function readProcCmdlines() {
  const out = [];
  try {
    for (const pid of readdirSync('/proc')) {
      if (!/^\d+$/.test(pid)) continue;
      try { out.push(readFileSync(`/proc/${pid}/cmdline`, 'utf8')); } catch { /* gone/denied */ }
    }
  } catch { /* not Linux / no /proc */ }
  return out;
}

export function detectSteamAppId() {
  // Primary: a running game process carries AppId= (works for native + Proton).
  for (const cl of readProcCmdlines()) {
    const id = appIdFromCmdline(cl);
    if (id) return id;
  }
  // Fallback: Steam's registry.vdf RunningAppID.
  for (const root of steamRoots()) {
    const reg = join(root, '..', 'registry.vdf'); // ~/.steam/registry.vdf
    for (const p of [join(homedir(), '.steam', 'registry.vdf'), reg]) {
      try { const id = parseRunningAppId(readFileSync(p, 'utf8')); if (id) return id; } catch { /* next */ }
    }
  }
  return null;
}

function steamName(appid) {
  for (const root of steamRoots()) {
    try {
      const acf = readFileSync(join(root, 'steamapps', `appmanifest_${appid}.acf`), 'utf8');
      const name = parseAcfField(acf, 'name');
      if (name) return name;
    } catch { /* next root */ }
  }
  return null;
}

// Prefer the transparent wordmark logo; fall back through the other cached art.
const STEAM_ART_NAMES = ['logo.png', 'library_600x900.jpg', 'header.jpg', 'library_header.jpg'];
function steamArt(appid) {
  for (const root of steamRoots()) {
    const dir = join(root, 'appcache', 'librarycache', String(appid));
    for (const name of STEAM_ART_NAMES) {
      const p = join(dir, name);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

// ---------- Lutris detection (best-effort) ----------

function lutrisGameConfigs() {
  const dir = join(homedir(), '.config', 'lutris', 'games');
  try {
    return readdirSync(dir).filter((f) => f.endsWith('.yml')).map((f) => ({
      slug: f.replace(/-\d+\.yml$/, '').replace(/\.yml$/, ''),
      exe: parseLutrisExe(readFileSync(join(dir, f), 'utf8')),
    }));
  } catch { return []; }
}

function lutrisArt(slug) {
  const h = homedir();
  for (const p of [
    join(h, '.local', 'share', 'lutris', 'coverart', `${slug}.jpg`),
    join(h, '.cache', 'lutris', 'coverart', `${slug}.jpg`),
    join(h, '.local', 'share', 'lutris', 'coverart', `${slug}.png`),
  ]) if (existsSync(p)) return p;
  return null;
}

function detectLutris() {
  const games = lutrisGameConfigs();
  if (!games.length) return null;
  const procs = readProcCmdlines().join('\n');
  for (const g of games) {
    const exe = g.exe && basename(g.exe);
    if (exe && procs.includes(exe)) {
      return { source: 'lutris', id: g.slug, name: titleizeSlug(g.slug), artPath: lutrisArt(g.slug) };
    }
  }
  return null;
}

// ---------- combined detection + scene ----------

export function detectNowPlaying() {
  const appid = detectSteamAppId();
  if (appid) {
    return { source: 'steam', id: appid, name: steamName(appid) ?? `App ${appid}`, artPath: steamArt(appid) };
  }
  return detectLutris();
}

const artCache = new Map(); // path -> data URI
function artDataUri(path) {
  if (!path) return null;
  if (artCache.has(path)) return artCache.get(path);
  try {
    const mime = path.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const uri = `data:${mime};base64,${readFileSync(path).toString('base64')}`;
    artCache.set(path, uri);
    return uri;
  } catch {
    return null;
  }
}

// Build the inner SVG for the Now Playing frame from a detection result.
export function nowPlayingSvg(info) {
  if (!info) {
    return (
      text(S / 2, S / 2 - 6, 'Nothing playing', { size: 18, weight: 700, fill: '#8a97ab' }) +
      text(S / 2, S / 2 + 18, 'Steam / Lutris', { size: 12, fill: '#4a5568' })
    );
  }
  const tag = info.source === 'steam' ? 'STEAM' : 'LUTRIS';
  const accent = info.source === 'steam' ? '#66c0f4' : '#ff9900';
  const uri = artDataUri(info.artPath);
  const badge = text(S / 2, S - 12, `▶ ${tag}`, { size: 11, weight: 700, fill: accent });

  if (uri) {
    // Logo fills the frame; the name is intentionally omitted (logo, not text).
    return (
      `<image href="${uri}" x="8" y="14" width="${S - 16}" height="130" preserveAspectRatio="xMidYMid meet"/>` +
      badge
    );
  }
  // No art on disk: fall back to the game's name.
  const name = info.name.length > 16 ? info.name.slice(0, 15) + '…' : info.name;
  return text(S / 2, S / 2, escapeXml(name), { size: 22, weight: 700, fill: '#e6ecf5' }) + badge;
}

// What a screen widget calls each tick.
export function nowPlayingScene() {
  return nowPlayingSvg(detectNowPlaying());
}
