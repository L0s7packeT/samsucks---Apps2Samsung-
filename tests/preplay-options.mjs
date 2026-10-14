import assert from 'node:assert/strict';
import {
  QUALITY, validQuality, selectedPlayback, resolvePlayback, requiresSubtitleBurnIn,
  streamsOf,
} from '../app/js/player/playback-options.js';

const part = { id: 99, Stream: [
  { id: 101, streamType: 2, codec: 'truehd', selected: true },
  { id: 102, streamType: 2, codec: 'ac3' },
  { id: 201, streamType: 3, codec: 'pgs' },
  { id: 202, streamType: 3, codec: 'srt', key: '/library/streams/202' },
]};
const defaults = selectedPlayback(part, 0);
assert.deepEqual(defaults, { audioStreamID: 101, subtitleStreamID: 0, qualityKbps: 0 });
assert.equal(QUALITY.find(x => x.kbps === 10000).label, '10 Mbps');
assert.equal(validQuality(10000), 10000);
assert.equal(validQuality(10001), 0);
assert.equal(streamsOf(part, 2).length, 2);

const ac3WithPgs = { ratingKey: 42, audioStreamID: 102, subtitleStreamID: 201, qualityKbps: 0 };
const choice = resolvePlayback(part, ac3WithPgs);
assert.equal(choice.audio.id, 102);
assert.equal(choice.subtitle.id, 201);
assert.equal(requiresSubtitleBurnIn(choice.subtitle), true);
assert.equal(requiresSubtitleBurnIn(null), false);
assert.equal(requiresSubtitleBurnIn(part.Stream[3]), false);
assert.equal(requiresSubtitleBurnIn({ codec: 'ass', index: 3 }), true);
assert.equal(requiresSubtitleBurnIn({ codec: 'vobsub' }), true);
const off = resolvePlayback(part, { audioStreamID: 102, subtitleStreamID: 0 });
assert.equal(off.audio.id, 102);
assert.equal(off.subtitle, null);

// Selected track IDs are stable even when the latest Plex metadata still
// marks a different track as selected.
const initial = resolvePlayback(part, null);
assert.equal(initial.audio.id, 101);
assert.equal(initial.subtitle, null);
assert.equal(resolvePlayback(part, { audioStreamID: 102, subtitleStreamID: 202 }).audio.id, 102);

// Ensure every detail-screen playback entry point goes through the same
// preplay-aware wrapper, not just the Resume and From Start buttons.
const { readFileSync } = await import('node:fs');
const detailSource = readFileSync(new URL('../app/js/screens/detail.js', import.meta.url), 'utf8');
assert.equal((detailSource.match(/playItem\s*\(/g) || []).length, 1,
  'All detail-screen play actions must use the preplay-aware wrapper');
assert.match(detailSource, /Play'\s*,\s*\(\)\s*=>\s*playSelected\(t,\s*0\)/);
assert.match(detailSource, /onSelect:\s*ep\s*=>\s*playSelected\(ep,/);
assert.match(detailSource, /if\s*\(t\)\s*playSelected\(t,\s*t\.viewOffset/);

console.log('Preplay track choices and forced subtitle burn decisions passed');
