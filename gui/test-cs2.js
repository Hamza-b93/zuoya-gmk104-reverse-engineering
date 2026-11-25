// Unit tests for the CS2 GSI parser. Pure — no network. Run: node --test test-cs2.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCs2, cs2ConfigFile, CS2_CONFIG_FILENAME } from './src/providers/cs2.js';

const liveBody = {
  provider: { name: 'Counter-Strike: Global Offensive', appid: 730 },
  map: { name: 'de_mirage', phase: 'live', team_ct: { score: 7 }, team_t: { score: 5 } },
  round: { phase: 'live' },
  player: {
    name: 'player1', team: 'CT',
    state: { health: 84, armor: 100, money: 3200, round_kills: 2 },
    match_stats: { kills: 18, assists: 4, deaths: 11, mvps: 2, score: 41 },
  },
};

test('parses a live CS2 round into stable fields', () => {
  const gs = parseCs2(liveBody);
  assert.equal(gs.provider, 'cs2');
  assert.equal(gs.inGame, true);
  assert.equal(gs.mapName, 'Mirage'); // de_ stripped + capitalized
  assert.equal(gs.team, 'CT');
  assert.deepEqual([gs.kills, gs.assists, gs.deaths], [18, 4, 11]);
  assert.equal(gs.mvps, 2);
  assert.equal(gs.health, 84);
  assert.equal(gs.money, 3200);
  assert.equal(gs.ctScore, 7);
  assert.equal(gs.tScore, 5);
  assert.equal(gs.hasPlayer, true);
});

test('warmup is not inGame', () => {
  const gs = parseCs2({ map: { name: 'de_nuke', phase: 'warmup' }, player: { state: { health: 100 } } });
  assert.equal(gs.inGame, false);
  assert.equal(gs.mapName, 'Nuke');
  assert.equal(gs.hasPlayer, true); // has state
});

test('an empty / menu body yields no player and no crash', () => {
  const gs = parseCs2({ provider: { appid: 730 } });
  assert.equal(gs.hasPlayer, false);
  assert.equal(gs.inGame, false);
  assert.equal(gs.kills, null);
  assert.equal(gs.mapName, null);
});

test('non-numeric stats degrade to null', () => {
  const gs = parseCs2({ player: { match_stats: { kills: 'x' }, state: {} } });
  assert.equal(gs.kills, null);
});

test('config file carries the port and the keeb-control block + filename', () => {
  const cfg = cs2ConfigFile({ port: 3201 });
  assert.match(cfg, /"keeb-control"/);
  assert.match(cfg, /127\.0\.0\.1:3201/);
  assert.match(cfg, /"player_match_stats" "1"/);
  assert.equal(CS2_CONFIG_FILENAME, 'gamestate_integration_keeb-control.cfg');
});
