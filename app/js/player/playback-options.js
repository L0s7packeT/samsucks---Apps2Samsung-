// Shared by the movie details options screen and the player.
export const QUALITY = [
  { label: 'Original', kbps: 0 },
  { label: '40 Mbps', kbps: 40000 },
  { label: '25 Mbps', kbps: 25000 },
  { label: '20 Mbps', kbps: 20000 },
  { label: '15 Mbps', kbps: 15000 },
  { label: '10 Mbps', kbps: 10000 },
  { label: '8 Mbps', kbps: 8000 },
  { label: '5 Mbps', kbps: 5000 },
  { label: '4 Mbps', kbps: 4000 },
  { label: '2 Mbps', kbps: 2000 },
];

export function validQuality(kbps) {
  return QUALITY.some(q => q.kbps === kbps) ? kbps : 0;
}

export function streamsOf(part, type) {
  return (part && part.Stream || []).filter(s => Number(s.streamType) === type);
}

export function selectedPlayback(part, qualityKbps) {
  const audio = streamsOf(part, 2);
  const text = streamsOf(part, 3);
  const activeAudio = audio.find(s => s.selected) || audio[0];
  const activeSubtitle = text.find(s => s.selected);
  return {
    audioStreamID: activeAudio ? activeAudio.id : null,
    subtitleStreamID: activeSubtitle ? activeSubtitle.id : 0,
    qualityKbps: validQuality(qualityKbps),
  };
}

// Pre-play IDs take precedence over stale server metadata, including the
// explicit subtitle "Off" option (0).
export function resolvePlayback(part, choice) {
  const audios = streamsOf(part, 2);
  const subtitles = streamsOf(part, 3);
  const selectedAudio = audios.find(s => s.selected) || audios[0] || null;
  const selectedSubtitle = subtitles.find(s => s.selected) || null;
  if (!choice) return { audio: selectedAudio, subtitle: selectedSubtitle };
  const audio = choice.audioStreamID == null ? selectedAudio :
    audios.find(s => String(s.id) === String(choice.audioStreamID)) || selectedAudio;
  const subtitle = Number(choice.subtitleStreamID) === 0 ? null :
    subtitles.find(s => String(s.id) === String(choice.subtitleStreamID)) || selectedSubtitle;
  return { audio, subtitle };
}

export function requiresSubtitleBurnIn(subtitle) {
  if (!subtitle) return false;
  // Server-side burn is needed for bitmap (PGS/VOBSUB) or other subtitle
  // formats this client cannot render locally.
  const localText = { srt: 1, subrip: 1, ass: 1, ssa: 1, mov_text: 1,
    vtt: 1, webvtt: 1, smi: 1 };
  if (subtitle.key && localText[subtitle.codec]) return false;
  return true;
}
