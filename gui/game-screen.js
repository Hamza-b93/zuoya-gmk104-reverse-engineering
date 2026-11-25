// Live game stats on the keyboard screen, via Game State Integration (GSI).
// Supported games: Dota 2 and Counter-Strike 2.
//
//   node game-screen.js --game cs2 --print-config   # print the GSI config + setup
//   node game-screen.js --game cs2                   # listen + stream to the screen
//   node game-screen.js                              # defaults to dota2
//   node game-screen.js --game dota2 --port 3200     # custom GSI port
//
// Setup once per game: run --print-config and follow it. Then run without
// --print-config and start a match.
import { homedir } from 'node:os';
import {
  createDota2Provider, dota2ConfigFile, DOTA2_CONFIG_FILENAME,
} from './src/providers/dota2.js';
import { createCs2Provider, cs2ConfigFile, CS2_CONFIG_FILENAME } from './src/providers/cs2.js';
import { renderGameStats } from './src/render.js';
import { ScreenStream } from './src/screen-stream.js';

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
}

// --- Per-game wiring: default port, config, idle frame, and stat mapping. ---
const GAMES = {
  dota2: {
    title: 'DOTA 2',
    defaultPort: 3200,
    configFile: dota2ConfigFile,
    createProvider: createDota2Provider,
    configPath: (fn) => `<Steam>/steamapps/common/dota 2 beta/game/dota/cfg/gamestate_integration/${fn}`,
    configFilename: DOTA2_CONFIG_FILENAME,
    launchNote: 'Add  -gamestateintegration  to Dota 2 launch options (Properties → General).',
    toStats: (gs) => gs.hasPlayer && ({
      title: gs.hero ? gs.hero.toUpperCase() : 'DOTA 2',
      kills: gs.kills ?? 0, deaths: gs.deaths ?? 0, assists: gs.assists ?? 0,
      sub: gs.inGame ? (gs.netWorth != null ? `${gs.netWorth} net worth` : 'in game') : 'in lobby',
      accent: gs.inGame ? '#5b9dff' : '#f0a63c',
    }),
  },
  cs2: {
    title: 'CS2',
    defaultPort: 3201,
    configFile: cs2ConfigFile,
    createProvider: createCs2Provider,
    configPath: (fn) => `<Steam>/steamapps/common/Counter-Strike Global Offensive/game/csgo/cfg/${fn}`,
    configFilename: CS2_CONFIG_FILENAME,
    launchNote: 'No launch option needed — CS2 auto-loads the config on start.',
    toStats: (gs) => gs.hasPlayer && ({
      title: gs.name ? gs.name.slice(0, 14).toUpperCase() : 'CS2',
      kills: gs.kills ?? 0, deaths: gs.deaths ?? 0, assists: gs.assists ?? 0,
      sub: gs.inGame
        ? [gs.mapName, gs.health != null ? `${gs.health} HP` : null, gs.money != null ? `$${gs.money}` : null].filter(Boolean).join(' · ')
        : (gs.mapPhase ?? 'warmup'),
      accent: gs.team === 'CT' ? '#5b9dff' : gs.team === 'T' ? '#f0a63c' : '#2a3647',
    }),
  },
};

const gameId = (arg('--game', 'dota2') || '').toLowerCase();
const game = GAMES[gameId];
if (!game) {
  console.error(`Unknown --game "${gameId}". Options: ${Object.keys(GAMES).join(', ')}`);
  process.exit(1);
}
const PORT = Number(arg('--port', game.defaultPort));

if (process.argv.includes('--print-config')) {
  console.log(`1) Save this file as:\n   ${game.configPath(game.configFilename)}`);
  console.log(`   (Linux Steam, usually under: ${homedir()}/.steam/steam/...)\n`);
  console.log(game.configFile({ port: PORT }));
  console.log(`2) ${game.launchNote}`);
  console.log(`3) Run:  node game-screen.js --game ${gameId}   then start a match.`);
  process.exit(0);
}

// --- Live mode ---
const stream = new ScreenStream({ delayMs: 1 });
let last = '';
async function show(opts) {
  const key = JSON.stringify(opts);
  if (key === last) return; // only re-render on change
  last = key;
  stream.push(await renderGameStats(opts));
}

await show({ title: game.title, kills: 0, deaths: 0, assists: 0, sub: 'waiting…', accent: '#2a3647' });

const provider = game.createProvider({
  port: PORT,
  onUpdate: (gs) => {
    const stats = game.toStats(gs);
    if (stats) show(stats).catch((e) => console.error('render/push failed:', e.message));
  },
  onError: (e) => console.error('GSI parse error:', e.message),
});

console.log(`Listening for ${game.title} GSI on http://127.0.0.1:${PORT}/  (Ctrl-C to stop)`);
console.log('If nothing changes: re-check the config file, the launch note above, and that a match is live.');

function shutdown() {
  console.log('\nstopping…');
  provider.close().finally(() => {
    stream.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
