// Dota 2 Game State Integration (GSI) provider.
//
// Dota 2 pushes live match state to a local HTTP endpoint when (a) a config file
// is installed under the game's gamestate_integration folder and (b) the game is
// launched with -gamestateintegration. This module runs that endpoint, normalizes
// the payload, and emits a GameState on every update.
//
// parseGsi() is pure (testable without the network). createDota2Provider() runs
// the HTTP server. Key names vary slightly across Dota builds/spectator-vs-player,
// so parsing is defensive.
import http from 'node:http';

// Normalize a raw GSI body into a stable GameState shape.
export function parseGsi(body) {
  const player = pickPlayer(body?.player);
  const hero = firstObjectWith(body?.hero, 'name') ?? body?.hero ?? {};
  const map = body?.map ?? {};
  const inGame = (map.game_state ?? '') === 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS';

  return {
    provider: 'dota2',
    inGame,
    gameState: map.game_state ?? null,
    clockTime: typeof map.clock_time === 'number' ? map.clock_time : null,
    kills: num(player?.kills),
    deaths: num(player?.deaths ?? player?.death), // some samples use "death"
    assists: num(player?.assists),
    lastHits: num(player?.last_hits),
    denies: num(player?.denies),
    netWorth: num(player?.net_worth ?? player?.gold),
    hero: cleanHeroName(hero?.name),
    level: num(hero?.level),
    hasPlayer: player != null,
  };
}

function num(v) {
  return typeof v === 'number' ? v : null;
}

// The `player` field is a flat object when you're playing, or nested
// (team2/team3 -> player slots) when spectating. Return the best flat player.
function pickPlayer(playerField) {
  if (!playerField || typeof playerField !== 'object') return null;
  if (typeof playerField.kills === 'number') return playerField; // playing
  return firstObjectWith(playerField, 'kills'); // spectator: dig for a slot
}

// Depth-first search for the first nested object that has `key`.
function firstObjectWith(obj, key, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 4) return null;
  if (key in obj && typeof obj[key] !== 'object') return obj;
  for (const v of Object.values(obj)) {
    const found = firstObjectWith(v, key, depth + 1);
    if (found) return found;
  }
  return null;
}

function cleanHeroName(name) {
  if (typeof name !== 'string') return null;
  return name.replace(/^npc_dota_hero_/, '').replace(/_/g, ' ');
}

// Start the GSI HTTP endpoint. Calls onUpdate(gameState, rawBody) per POST.
// Returns { server, close() }.
export function createDota2Provider({ port = 3200, host = '127.0.0.1', token, onUpdate, onError } = {}) {
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405).end();
      return;
    }
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 1_000_000) req.destroy(); // guard against runaway bodies
    });
    req.on('end', () => {
      res.writeHead(200).end(); // Dota ignores the body; just ack
      try {
        const body = JSON.parse(raw);
        if (token && body?.auth?.token !== token) return; // optional shared secret
        onUpdate?.(parseGsi(body), body);
      } catch (e) {
        onError?.(e);
      }
    });
  });
  server.listen(port, host);
  return { server, close: () => new Promise((r) => server.close(r)) };
}

// The config file Dota 2 needs. Drop it in:
//   <Steam>/steamapps/common/dota 2 beta/game/dota/cfg/gamestate_integration/
//     gamestate_integration_keeb-control.cfg
// and launch Dota 2 with  -gamestateintegration  in its launch options.
export function dota2ConfigFile({ port = 3200, token } = {}) {
  const auth = token ? `\n    "auth"\n    {\n        "token" "${token}"\n    }` : '';
  return (
    `"keeb-control"\n` +
    `{\n` +
    `    "uri"       "http://127.0.0.1:${port}/"\n` +
    `    "timeout"   "5.0"\n` +
    `    "buffer"    "0.1"\n` +
    `    "throttle"  "0.1"\n` +
    `    "heartbeat" "10.0"${auth}\n` +
    `    "data"\n` +
    `    {\n` +
    `        "provider" "1"\n` +
    `        "map"      "1"\n` +
    `        "player"   "1"\n` +
    `        "hero"     "1"\n` +
    `    }\n` +
    `}\n`
  );
}

export const DOTA2_CONFIG_FILENAME = 'gamestate_integration_keeb-control.cfg';
