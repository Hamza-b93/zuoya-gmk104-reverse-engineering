// Counter-Strike 2 Game State Integration (GSI) provider.
//
// CS2 pushes live match state to a local HTTP endpoint when a config file is
// installed under the game's cfg folder. Unlike Dota 2, CS2 needs NO launch
// option — it auto-loads any gamestate_integration_*.cfg on start.
//
// parseCs2() is pure (testable without the network). createCs2Provider() runs
// the endpoint. `player` is the local player when playing, or the observed slot
// when spectating; both carry match_stats, so parsing is the same.
import { createGsiServer } from './gsi-server.js';

export function parseCs2(body) {
  const player = body?.player ?? null;
  const ms = player?.match_stats ?? {};
  const st = player?.state ?? {};
  const map = body?.map ?? {};
  const round = body?.round ?? {};

  return {
    provider: 'cs2',
    inGame: (map.phase ?? '') === 'live',
    mapPhase: map.phase ?? null,
    roundPhase: round.phase ?? null,
    mapName: cleanMap(map.name),
    team: player?.team ?? null, // "CT" | "T"
    name: typeof player?.name === 'string' ? player.name : null,
    kills: num(ms.kills),
    deaths: num(ms.deaths),
    assists: num(ms.assists),
    mvps: num(ms.mvps),
    score: num(ms.score),
    health: num(st.health),
    armor: num(st.armor),
    money: num(st.money),
    roundKills: num(st.round_kills),
    ctScore: num(map?.team_ct?.score),
    tScore: num(map?.team_t?.score),
    hasPlayer: player != null && (player.match_stats != null || player.state != null),
  };
}

function num(v) {
  return typeof v === 'number' ? v : null;
}

// "de_dust2" -> "Dust2", "cs_office" -> "Office".
function cleanMap(name) {
  if (typeof name !== 'string' || !name) return null;
  const base = name.replace(/^(de|cs|ar|dz|gd)_/, '');
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export function createCs2Provider({ port = 3201, host = '127.0.0.1', token, onUpdate, onError } = {}) {
  return createGsiServer({
    port, host, token,
    onBody: (body) => onUpdate?.(parseCs2(body), body),
    onError,
  });
}

// The config file CS2 needs. Drop it in (no launch option required):
//   <Steam>/steamapps/common/Counter-Strike Global Offensive/game/csgo/cfg/
//     gamestate_integration_keeb-control.cfg
export function cs2ConfigFile({ port = 3201, token } = {}) {
  const auth = token ? `\n    "auth"\n    {\n        "token" "${token}"\n    }` : '';
  return (
    `"keeb-control"\n` +
    `{\n` +
    `    "uri"       "http://127.0.0.1:${port}/"\n` +
    `    "timeout"   "5.0"\n` +
    `    "buffer"    "0.1"\n` +
    `    "throttle"  "0.25"\n` +
    `    "heartbeat" "30.0"${auth}\n` +
    `    "data"\n` +
    `    {\n` +
    `        "provider"           "1"\n` +
    `        "map"                "1"\n` +
    `        "round"              "1"\n` +
    `        "player_id"          "1"\n` +
    `        "player_state"       "1"\n` +
    `        "player_match_stats" "1"\n` +
    `    }\n` +
    `}\n`
  );
}

export const CS2_CONFIG_FILENAME = 'gamestate_integration_keeb-control.cfg';
