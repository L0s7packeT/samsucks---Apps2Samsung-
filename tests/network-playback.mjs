import assert from 'node:assert/strict';

// Pure checks for the shipping browser bundle (no Plex credentials or TV needed).
globalThis.window = {};
const { privateIPv4, normalizeLanAddress, isLocalUri, connectionLabel } =
  await import('../app/js/plex/network.js');
const { candidateUris } = await import('../app/js/plex/auth.js');
const { Server } = await import('../app/js/plex/server.js');

assert.equal(privateIPv4('192.168.1.10'), true);
assert.equal(privateIPv4('172.16.0.1'), true);
assert.equal(privateIPv4('172.31.255.255'), true);
assert.equal(privateIPv4('192.168.1.1'), true);
assert.equal(privateIPv4('203.0.113.10'), false);
assert.equal(privateIPv4('172.32.1.1'), false);
assert.equal(privateIPv4('192.168.999.1'), false);
assert.equal(normalizeLanAddress('192.168.1.10'), 'http://192.168.1.10:32400');
assert.equal(normalizeLanAddress('http://192.168.1.10:32401'), 'http://192.168.1.10:32401');
assert.throws(() => normalizeLanAddress('203.0.113.10'), /private LAN/);
assert.throws(() => normalizeLanAddress('http://192.168.1.10:32400/path'), /local host/);
assert.throws(() => normalizeLanAddress('http://user:pass@192.168.1.10'), /local host/);
assert.equal(isLocalUri('http://192.168.1.10:32400'), true);
assert.equal(isLocalUri('http://203.0.113.10:32400'), false);
assert.match(connectionLabel('http://192.168.1.10:32400'), /^Local/);

const resource = {
  httpsRequired: false,
  connections: [
    { uri: 'https://remote.example:32400', local: false, relay: false },
    { uri: 'https://192-168-1-10.abc.plex.direct:32400', address: '192.168.1.10', port: 32400, local: true, relay: false },
    { uri: 'https://relay.example', local: false, relay: true },
  ],
};
const tiers = candidateUris(resource);
assert.deepEqual(tiers[0], ['http://192.168.1.10:32400']);
assert.deepEqual(tiers[1], ['https://192-168-1-10.abc.plex.direct:32400']);
assert.deepEqual(tiers[2], ['https://remote.example:32400']);
assert.equal(candidateUris(resource, { localOnly: true }).length, 2);

const server = new Server({ uri: 'http://192.168.1.10:32400', token: 'test', name: 'Test', id: 'test', local: true });
const original = new URL(server.transcodeUrl({ ratingKey: 25 }, { session: 'testing' }));
assert.equal(original.searchParams.get('maxVideoBitrate'), '200000');
assert.equal(original.searchParams.get('directStream'), '1');
assert.equal(original.searchParams.get('videoQuality'), '100');
assert.equal(original.searchParams.get('videoBitrate'), null);
assert.equal(original.searchParams.get('location'), 'lan');

const limited = new URL(server.transcodeUrl({ ratingKey: 25 }, {
  session: 'testing', maxBitrate: 10000, forceVideoTranscode: true,
}));
assert.equal(limited.searchParams.get('maxVideoBitrate'), '10000');
assert.equal(limited.searchParams.get('videoBitrate'), '10000');
assert.equal(limited.searchParams.get('directStream'), '0');
assert.equal(limited.searchParams.get('directStreamAudio'), '1');
// Each manifest can use an independent transcode worker without changing
// the stable Plex client playback session identity.
const split = new URL(server.transcodeUrl({ ratingKey: 25 }, {
  session: 'transcode-2', clientSession: 'playback-1',
  maxBitrate: 10000, forceVideoTranscode: true,
}));
assert.equal(split.searchParams.get('session'), 'transcode-2');
assert.equal(split.searchParams.get('X-Plex-Session-Identifier'), 'playback-1');
assert.equal(split.searchParams.get('directStreamAudio'), '1');

// Original + PGS must encode the video to burn subtitles, but must NOT
// inherit the bitrate limit reserved for 10/20/40 Mbps quality presets.
const pgs = new URL(server.transcodeUrl({ ratingKey: 25 }, {
  session: 'pgs-original', forceVideoTranscode: true, limitBitrate: false,
  audioStreamID: 12, subtitleStreamID: 35, burnSubtitles: true,
}));
assert.equal(pgs.searchParams.get('directStream'), '0');
assert.equal(pgs.searchParams.get('videoQuality'), '100');
assert.equal(pgs.searchParams.get('maxVideoBitrate'), '200000');
assert.equal(pgs.searchParams.get('videoBitrate'), null);
assert.equal(pgs.searchParams.get('audioStreamID'), '12');
assert.equal(pgs.searchParams.get('subtitleStreamID'), '35');
assert.equal(pgs.searchParams.get('subtitles'), 'burn');
assert.equal(pgs.searchParams.get('directStreamAudio'), '1');


const remote = new Server({ uri: 'http://203.0.113.10:32400', token: 'test', name: 'Test', id: 'test' });
const remoteUrl = new URL(remote.transcodeUrl({ ratingKey: 25 }, { session: 'testing' }));
assert.equal(remoteUrl.searchParams.get('location'), 'wan');

console.log('LAN selection, manual URL and transcoding tests passed');
