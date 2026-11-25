// Unit tests for the Now Playing provider's pure parsers + scene builder.
// The detect* functions touch the real system and aren't tested here.
// Run: node --test test-nowplaying.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRunningAppId, parseAcfField, appIdFromCmdline, parseLutrisExe,
  titleizeSlug, nowPlayingSvg,
} from './src/providers/nowplaying.js';

test('parseRunningAppId reads Steam registry.vdf', () => {
  assert.equal(parseRunningAppId('"Steam" {\n  "RunningAppID"  "730"\n}'), 730);
  assert.equal(parseRunningAppId('"RunningAppID"  "0"'), null); // 0 = nothing running
  assert.equal(parseRunningAppId('no key here'), null);
});

test('parseAcfField pulls a field out of an appmanifest', () => {
  const acf = '"AppState"\n{\n  "appid"  "570"\n  "name"  "Dota 2"\n}';
  assert.equal(parseAcfField(acf, 'name'), 'Dota 2');
  assert.equal(parseAcfField(acf, 'appid'), '570');
  assert.equal(parseAcfField(acf, 'missing'), null);
});

test('appIdFromCmdline extracts the Steam AppId from a game process', () => {
  assert.equal(appIdFromCmdline('/home/u/.steam/.../reaper SteamLaunch AppId=730 -- /game/cs2'), 730);
  assert.equal(appIdFromCmdline('wine\0SteamAppId=570\0game.exe'), 570); // NUL-separated
  assert.equal(appIdFromCmdline('AppId=7'), null); // 7 = Steam client itself
  assert.equal(appIdFromCmdline('/usr/bin/firefox'), null);
});

test('parseLutrisExe handles wine exe and native main_file', () => {
  assert.equal(parseLutrisExe('game:\n  exe: /games/Doom/doom.exe\n'), '/games/Doom/doom.exe');
  assert.equal(parseLutrisExe('game:\n  main_file: "/games/quake/quake"\n'), '/games/quake/quake');
  assert.equal(parseLutrisExe('system:\n  env: {}\n'), null);
});

test('titleizeSlug makes a display name from a slug', () => {
  assert.equal(titleizeSlug('half-life-2'), 'Half Life 2'); // trailing number kept
  assert.equal(titleizeSlug('celeste'), 'Celeste');
});

test('nowPlayingSvg: nothing playing shows an idle message', () => {
  const svg = nowPlayingSvg(null);
  assert.match(svg, /Nothing playing/);
});

test('nowPlayingSvg: with no art on disk, falls back to the name text', () => {
  const svg = nowPlayingSvg({ source: 'steam', id: 570, name: 'Dota 2', artPath: null });
  assert.match(svg, /Dota 2/);
  assert.match(svg, /STEAM/);
  assert.doesNotMatch(svg, /<image/); // no art -> no image element
});

test('nowPlayingSvg: a long name is truncated with an ellipsis', () => {
  const svg = nowPlayingSvg({ source: 'lutris', id: 'x', name: 'A Very Long Game Title Indeed', artPath: null });
  assert.match(svg, /…/);
  assert.match(svg, /LUTRIS/);
});
