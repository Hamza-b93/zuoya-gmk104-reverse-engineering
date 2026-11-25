// Offline tests for the game-integration pieces: the GSI parser and the frame
// renderer. No keyboard, no network.  Run:  node --test test-game.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGsi, dota2ConfigFile } from './src/providers/dota2.js';
import { renderGameStats, gameStatsSvg, svgFrame, escapeXml } from './src/render.js';
import { PIXEL_BYTES, SCREEN_SIZE, buildFramebuffer, imageToReports } from './src/screen.js';

// --- GSI parser ---
test('parses a playing-player payload (flat player object)', () => {
  const gs = parseGsi({
    provider: { name: 'Dota 2' },
    map: { game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS', clock_time: 642 },
    player: { kills: 7, deaths: 2, assists: 11, last_hits: 120, denies: 8, net_worth: 9450 },
    hero: { name: 'npc_dota_hero_queenofpain', level: 12 },
  });
  assert.equal(gs.inGame, true);
  assert.deepEqual([gs.kills, gs.deaths, gs.assists], [7, 2, 11]);
  assert.equal(gs.netWorth, 9450);
  assert.equal(gs.hero, 'queenofpain');
  assert.equal(gs.level, 12);
  assert.equal(gs.hasPlayer, true);
});

test('handles the "death" singular key variant', () => {
  const gs = parseGsi({ player: { kills: 1, death: 3, assists: 0 } });
  assert.equal(gs.deaths, 3);
});

test('digs out a player from a nested spectator payload', () => {
  const gs = parseGsi({
    player: { team2: { player0: { kills: 4, deaths: 1, assists: 9 } } },
  });
  assert.deepEqual([gs.kills, gs.deaths, gs.assists], [4, 1, 9]);
  assert.equal(gs.hasPlayer, true);
});

test('tolerates an empty / pre-game payload', () => {
  const gs = parseGsi({ map: { game_state: 'DOTA_GAMERULES_STATE_HERO_SELECTION' } });
  assert.equal(gs.inGame, false);
  assert.equal(gs.hasPlayer, false);
  assert.equal(gs.kills, null);
});

test('config file names the port and the required sections', () => {
  const cfg = dota2ConfigFile({ port: 3333 });
  assert.match(cfg, /http:\/\/127\.0\.0\.1:3333\//);
  assert.match(cfg, /"player"\s+"1"/);
});

// --- Renderer ---
test('escapeXml neutralizes markup in dynamic text', () => {
  assert.equal(escapeXml('<hero> & "you"'), '&lt;hero&gt; &amp; &quot;you&quot;');
});

test('svgFrame is a 180x180 document', () => {
  const svg = svgFrame(gameStatsSvg({ title: 'PA', kills: 1, deaths: 0, assists: 2 }));
  assert.match(svg, /width="180" height="180"/);
  assert.match(svg, /1\/0\/2/);
});

test('renderGameStats produces a codec-ready 180x180 RGB888 frame', async () => {
  const rgb = await renderGameStats({ title: 'INVOKER', kills: 12, deaths: 3, assists: 7, sub: 'in game' });
  assert.equal(rgb.length, SCREEN_SIZE * SCREEN_SIZE * 3);
  // Feeds the screen codec and yields a full upload sequence.
  assert.equal(buildFramebuffer(rgb).length, 0x10000);
  assert.equal(imageToReports(rgb).length, 1177);
  assert.ok(PIXEL_BYTES === SCREEN_SIZE * SCREEN_SIZE * 2);
});
