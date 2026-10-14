import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPlayer } from '../app/js/platform/player.js';

const listeners = [];
const setupCallbacks = [];
const stage = {
  appendChild(el) { el.parentNode = this; },
  removeChild(el) { el.parentNode = null; },
};
globalThis.document = { createElement() { return { parentNode: null }; } };
globalThis.webapis = {
  avplay: {
    open() {}, stop() {}, close() {},
    setDisplayRect() {}, setDisplayMethod() {}, setStreamingProperty() {},
    setListener(x) { listeners.push(x); },
    prepareAsync(success, error) { setupCallbacks.push({ success, error }); },
    getState() { return 'IDLE'; },
  },
};
const errors = [];
const player = createPlayer(stage, { onError: msg => errors.push(msg) });
player.open('http://example.invalid/pgs-hls');
const failedPrepare = player.prepare();
listeners[0].onerror('PLAYER_ERROR_NOT_SUPPORTED_FILE');
await assert.rejects(failedPrepare, /PLAYER_ERROR_NOT_SUPPORTED_FILE/);
assert.deepEqual(errors, [], 'Preparation error should reject its Promise without a second player error');
player.close();

player.open('http://example.invalid/next');
const abortedPrepare = player.prepare();
player.close();
await assert.rejects(abortedPrepare, /interrupted/);
setupCallbacks[1].success(); // Late native callback may not restart closed playback.
assert.deepEqual(errors, []);
player.destroy();

// Check the two PGS/HLS guards that avoid overlapping transcodes and forcing
// 4K decoding on a 1080p transcoded HLS stream.
const source = readFileSync(new URL('../app/js/screens/player.js', import.meta.url), 'utf8');
assert.match(source, /if \(opening\) throw new Error\('Playback is still preparing'\)/);
assert.match(source, /if \(transcodes\.active\) \{\s*player\.close\(\);\s*await transcodes\.close\(\);/);
assert.match(source, /uhd:\s*playbackMode === 'direct'/);
assert.match(source, /finally \{\s*opening = false;/);
const menu = readFileSync(new URL('../app/js/screens/playback-options.js', import.meta.url), 'utf8');
assert.match(menu, /function renderFocus\(\)/);
assert.match(menu, /optionElements = \[\[\], \[\], \[\]\]/);
console.log('AVPlay prepare failure / cancellation and PGS transition guards passed');
