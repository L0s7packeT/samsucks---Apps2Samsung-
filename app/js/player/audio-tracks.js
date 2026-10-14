// Match Plex audio streams to Samsung AVPlay tracks. The AVPlay index can
// include video/text streams and is not necessarily the Plex audio ordinal.
function details(track) {
  if (!track) return {};
  try { return typeof track.extra_info === 'string' ? JSON.parse(track.extra_info) : (track.extra_info || {}); }
  catch (e) { return {}; }
}

function codec(value) {
  const c = String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (['ac3', 'a52'].includes(c)) return 'ac3';
  if (['eac3', 'ec3'].includes(c)) return 'eac3';
  if (['truehd', 'mlp', 'mlpa', 'trhd'].includes(c)) return 'truehd';
  if (['aac', 'aacl', 'mp4a'].includes(c) || c.startsWith('aac')) return 'aac';
  return c;
}

function language(value) {
  const s = String(value || '').toLowerCase().split(/[-_]/)[0].trim();
  const aliases = { eng: 'en', english: 'en', fra: 'fr', fre: 'fr', french: 'fr',
    deu: 'de', ger: 'de', german: 'de', spa: 'es', spanish: 'es',
    ita: 'it', italian: 'it', por: 'pt', portuguese: 'pt',
    nld: 'nl', dut: 'nl', dan: 'da', nor: 'no', swe: 'sv',
    fin: 'fi', pol: 'pl', ron: 'ro', rum: 'ro' };
  if (['und', 'unknown', 'undefined', 'null'].includes(s)) return '';
  return aliases[s] || s;
}

export function matchAudioTrack(plexStreams, selectedStream, avTracks) {
  if (!selectedStream || !avTracks || !avTracks.length) return null;
  const streams = plexStreams || [];
  const ordinal = streams.findIndex(s => s === selectedStream || s.id === selectedStream.id);
  if (ordinal < 0) return null;
  const selectedCodec = codec(selectedStream.codec);
  const selectedLang = language(selectedStream.languageCode || selectedStream.languageTag ||
    selectedStream.language || selectedStream.languageISOCode);
  const selectedChannels = Number(selectedStream.channels) || 0;

  const candidates = avTracks.map((track, i) => {
    const d = details(track);
    const avCodec = codec(d.fourCC || d.codec);
    const avLang = language(d.language || d.track_lang);
    const avChannels = Number(d.channels) || 0;
    // Disqualify positively identified codec mismatches: selecting the
    // ordinal anyway can switch from AC3 back to TrueHD.
    if (selectedCodec && avCodec && selectedCodec !== avCodec) return null;
    if (selectedLang && avLang && selectedLang !== avLang) return null;
    let score = 0;
    if (selectedCodec && avCodec) score += 100;
    if (selectedLang && avLang) score += selectedLang === avLang ? 30 : -25;
    if (selectedChannels && avChannels) score += selectedChannels === avChannels ? 15 : -12;
    if (i === ordinal) score += 3;
    return { track, index: Number(track.index), score, i, codecKnown: !!avCodec };
  }).filter(c => c && Number.isFinite(c.index) && c.index >= 0);
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  if (candidates.length > 1 && candidates[0].score === candidates[1].score) return null;
  // Metadata is not available on all firmware. In that case positional
  // selection is only safe when Plex and AVPlay expose the same track count.
  if (candidates[0].score < 15 && streams.length !== avTracks.length) return null;
  return candidates[0].track;
}
