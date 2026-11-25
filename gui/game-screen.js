// Live game stats on the keyboard screen. Currently: Dota 2 (via GSI).
//
//   node game-screen.js --print-config    # print the Dota 2 GSI config + setup
//   node game-screen.js                    # listen + stream KDA to the screen
//   node game-screen.js --port 3200        # custom GSI port (match the config)
//
// Setup once: run --print-config, follow it, add -gamestateintegration to Dota's
// launch options. Then run without flags and start a match.
import { homedir } from 'node:os';
import { createDota2Provider, dota2ConfigFile, DOTA2_CONFIG_FILENAME } from './src/providers/dota2.js';
import { renderGameStats } from './src/render.js';
import { ScreenStream } from './src/screen-stream.js';

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
}
const PORT = Number(arg('--port', 3200));

if (process.argv.includes('--print-config')) {
  const rel = 'steamapps/common/dota 2 beta/game/dota/cfg/gamestate_integration';
  console.log('1) Save this file as:');
  console.log(`   <Steam>/${rel}/${DOTA2_CONFIG_FILENAME}`);
  console.log(`   (Linux Steam, usually: ${homedir()}/.steam/steam/${rel}/${DOTA2_CONFIG_FILENAME})\n`);
  console.log(dota2ConfigFile({ port: PORT }));
  console.log('2) Add  -gamestateintegration  to Dota 2 launch options (right-click → Properties).');
  console.log('3) Run:  node game-screen.js   then start a match.');
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

// Idle frame until Dota connects.
await show({ title: 'DOTA 2', kills: 0, deaths: 0, assists: 0, sub: 'waiting…', accent: '#2a3647' });

const provider = createDota2Provider({
  port: PORT,
  onUpdate: (gs) => {
    if (!gs.hasPlayer) return;
    show({
      title: gs.hero ? gs.hero.toUpperCase() : 'DOTA 2',
      kills: gs.kills ?? 0,
      deaths: gs.deaths ?? 0,
      assists: gs.assists ?? 0,
      sub: gs.inGame ? (gs.netWorth != null ? `${gs.netWorth} net worth` : 'in game') : 'in lobby',
      accent: gs.inGame ? '#5b9dff' : '#f0a63c',
    }).catch((e) => console.error('render/push failed:', e.message));
  },
  onError: (e) => console.error('GSI parse error:', e.message),
});

console.log(`Listening for Dota 2 GSI on http://127.0.0.1:${PORT}/  (Ctrl-C to stop)`);
console.log('If nothing changes: check the config file, the -gamestateintegration launch option, and that a match is live.');

function shutdown() {
  console.log('\nstopping…');
  provider.close().finally(() => {
    stream.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
