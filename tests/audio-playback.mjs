import assert from 'node:assert/strict';
import { matchAudioTrack } from '../app/js/player/audio-tracks.js';
import { TranscodeSessions } from '../app/js/player/transcode-sessions.js';

const plexTracks = [
  { id: 11, index: 1, codec: 'truehd', languageCode: 'en', channels: 8 },
  { id: 12, index: 2, codec: 'ac3', languageCode: 'en', channels: 6 },
  { id: 13, index: 3, codec: 'eac3', languageCode: 'fr', channels: 6 },
];
const samsungTracks = [
  { type: 'AUDIO', index: 5, extra_info: '{"fourCC":"AC-3","language":"eng","channels":"6"}' },
  { type: 'AUDIO', index: 3, extra_info: '{"fourCC":"TRUEHD","language":"eng","channels":"8"}' },
  { type: 'AUDIO', index: 8, extra_info: '{"fourCC":"EAC3","language":"fra","channels":"6"}' },
];
// AVPlay order and indices do not match Plex source order.
assert.equal(matchAudioTrack(plexTracks, plexTracks[1], samsungTracks).index, 5);
assert.equal(matchAudioTrack(plexTracks, plexTracks[0], samsungTracks).index, 3);
assert.equal(matchAudioTrack(plexTracks, plexTracks[2], samsungTracks).index, 8);
const samsungMimeTracks = [
  { type: 'AUDIO', index: 1, extra_info: '{"fourCC":"audio/x-truehd","language":"eng","channels":"8"}' },
  { type: 'AUDIO', index: 2, extra_info: '{"fourCC":"audio/x-ac3","language":"eng","channels":"6"}' },
  { type: 'AUDIO', index: 3, extra_info: '{"fourCC":"audio/x-eac3","language":"fra","channels":"6"}' },
];
assert.equal(matchAudioTrack(plexTracks, plexTracks[0], samsungMimeTracks).index, 1);
assert.equal(matchAudioTrack(plexTracks, plexTracks[1], samsungMimeTracks).index, 2);
assert.equal(matchAudioTrack(plexTracks, plexTracks[2], samsungMimeTracks).index, 3);
assert.equal(matchAudioTrack(plexTracks, plexTracks[1], samsungTracks.slice(1)), null);
assert.equal(matchAudioTrack(
  [{ id: 20, codec: 'ac3', languageCode: 'en', channels: 6 }],
  { id: 20, codec: 'ac3', languageCode: 'en', channels: 6 },
  [{ type:'AUDIO', index: 2, extra_info: '{"fourCC":"AC3","language":"fra","channels":"6"}' }]
), null);

// Fallback to ordinal is allowed only if both lists have matching lengths.
const opaque = [{ type:'AUDIO', index:6 }, { type:'AUDIO', index:7 }, { type:'AUDIO', index:10 }];
assert.equal(matchAudioTrack(plexTracks, plexTracks[1], opaque).index, 7);
assert.equal(matchAudioTrack(plexTracks, plexTracks[1], opaque.slice(0, 2)), null);

const stopped = [];
const sessions = new TranscodeSessions(async id => { stopped.push(id); });
await sessions.replace('hls-a');
assert.deepEqual(stopped, []);
await sessions.replace('hls-b');
assert.deepEqual(stopped, ['hls-a']);
await sessions.replace(null); // Return to Direct Play
assert.deepEqual(stopped, ['hls-a', 'hls-b']);
await sessions.discard('failed-manifest');
assert.deepEqual(stopped, ['hls-a', 'hls-b', 'failed-manifest']);
await sessions.replace('hls-c');
await sessions.close();
await sessions.close(); // Idempotent cleanup
assert.deepEqual(stopped, ['hls-a', 'hls-b', 'failed-manifest', 'hls-c']);

// AVPlay track index switches are checked against the active track reported
// by the hardware API rather than treating the void return as success.
let activeIndex = 3;
const avListeners = [];
const playerErrors = [];
globalThis.webapis = {
  avplay: {
    open() {}, stop() {}, close() {}, setDisplayRect() {}, setDisplayMethod() {},
    setListener(callbacks) { avListeners.push(callbacks); },
    prepareAsync(yes) { yes(); }, play() {}, pause() {},
    getTotalTrackInfo() { return samsungTracks; },
    getCurrentStreamInfo() {
      return [{ type: 'VIDEO', index: 0 }, { type: 'AUDIO', index: activeIndex }];
    },
    setSelectTrack(type, index) {
      assert.equal(type, 'AUDIO');
      activeIndex = index;
    },
    getState() { return 'PLAYING'; },
    getCurrentTime() { return 0; },
  },
};
globalThis.document = {
  createElement() { return { parentNode: null }; },
};
const stage = {
  appendChild(el) { el.parentNode = this; },
  removeChild(el) { el.parentNode = null; },
};
const { createPlayer } = await import('../app/js/platform/player.js');
const backend = createPlayer(stage, { onError: value => playerErrors.push(value) });
assert.equal(backend.audioTracks().length, 3);
assert.equal(backend.currentAudioTrack().index, 3);
assert.equal(backend.selectAudio(5), true);
assert.equal(backend.currentAudioTrack().index, 5);
backend.open('http://example.invalid/first');
backend.open('http://example.invalid/second');
avListeners[0].onerror('old failure');
assert.deepEqual(playerErrors, []);
avListeners[1].onerror('current failure');
assert.deepEqual(playerErrors, ['current failure']);
backend.close();
avListeners[1].onerror('late failure');
assert.deepEqual(playerErrors, ['current failure']);
backend.destroy();

console.log('Audio-track mapping, AVPlay verification and transcode session cleanup passed');
