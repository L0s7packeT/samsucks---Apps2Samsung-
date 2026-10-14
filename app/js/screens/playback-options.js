// Choose tracks and a quality preset before playback is opened on the TV.
import { h, setText, toggleClass } from '../util/dom.js';
import { useAmbience } from '../ui/backdrop.js';
import { session } from '../session.js';
import * as router from '../router.js';
import * as store from '../util/store.js';
import { QUALITY, streamsOf, selectedPlayback } from '../player/playback-options.js';

export function PlaybackOptionsScreen(item, { onApply } = {}) {
  const el = h('div', 'screen preplay');
  const ambience = useAmbience(item.UltraBlurColors);
  h('h1', 'preplay-title', el).textContent = 'Playback Options';
  const name = h('div', 'preplay-name', el);
  setText(name, item.title || 'Movie');
  const instructions = h('div', 'preplay-help', el);
  setText(instructions, 'Select audio, subtitles and quality before playback · Left/Right between lists · OK to choose');
  const columns = h('div', 'preplay-columns', el);
  const actions = h('div', 'preplay-actions', el);
  const applyButton = h('div', 'btn', actions);
  applyButton.textContent = 'Apply & return';
  const cancelButton = h('div', 'btn', actions);
  cancelButton.textContent = 'Cancel';
  const status = h('div', 'preplay-status', el);
  setText(status, 'Loading media tracks…');

  let rows = [[], [], []];
  let values = [0, 0, 0];
  let indices = [0, 0, 0];
  let col = 0;
  let actionIndex = 0;
  let area = 'tracks';
  let part = null;
  let loaded = false;
  let busy = false;
  let alive = true;

  let optionElements = [[], [], []];
  // Build the columns once. Recreating every subtitle/quality row on each
  // remote key press caused unnecessary layout work on Chromium 76.
  function render() {
    columns.innerHTML = '';
    optionElements = [[], [], []];
    const labels = ['Audio', 'Subtitles', 'Quality'];
    labels.forEach((label, c) => {
      const column = h('div', 'preplay-column', columns);
      setText(h('div', 'preplay-column-title', column), label);
      const list = h('div', 'preplay-list', column);
      rows[c].forEach(option => {
        const row = h('div', 'preplay-option', list);
        setText(row, option.label);
        optionElements[c].push(row);
      });
    });
    renderFocus();
  }

  function renderFocus() {
    optionElements.forEach((list, c) => list.forEach((row, i) => {
      toggleClass(row, 'on', values[c] === i);
      toggleClass(row, 'focus', area === 'tracks' && c === col && indices[c] === i);
    }));
    toggleClass(applyButton, 'focus', area === 'actions' && actionIndex === 0);
    toggleClass(cancelButton, 'focus', area === 'actions' && actionIndex === 1);
    if (area === 'tracks') {
      const row = optionElements[col] && optionElements[col][indices[col]];
      if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
    }
  }

  async function load() {
    try {
      const full = await session.server.metadata(item.ratingKey);
      if (!alive) return;
      part = full && full.Media && full.Media[0] && full.Media[0].Part && full.Media[0].Part[0];
      if (!part) throw new Error('No playable media');
      const audios = streamsOf(part, 2);
      const subtitles = streamsOf(part, 3);
      const chosen = selectedPlayback(part, store.get('qualityKbps', 0));
      rows = [
        audios.map(s => ({ label: s.displayTitle || s.language || s.codec || 'Audio', id: s.id })),
        [{ label: 'Off', id: 0 }].concat(subtitles.map(s => ({
          label: (s.displayTitle || s.language || 'Subtitle') + ' · ' + (s.codec || '').toUpperCase(),
          id: s.id,
        }))),
        QUALITY.map(q => ({ label: q.label, id: q.kbps })),
      ];
      if (!audios.length) rows[0] = [{ label: 'Default audio', id: null }];
      values = [
        Math.max(0, rows[0].findIndex(r => r.id === chosen.audioStreamID)),
        Math.max(0, rows[1].findIndex(r => r.id === chosen.subtitleStreamID)),
        Math.max(0, rows[2].findIndex(r => r.id === chosen.qualityKbps)),
      ];
      indices = values.slice();
      loaded = true;
      setText(status, 'Down past the last item for Apply & return. Back cancels.');
      render();
    } catch (e) {
      if (alive) setText(status, 'Could not load playback options: ' + e.message);
    }
  }

  async function apply() {
    if (!loaded || busy || !part) return;
    busy = true;
    setText(status, 'Applying playback options…');
    const choice = {
      ratingKey: item.ratingKey,
      audioStreamID: rows[0][values[0]].id,
      subtitleStreamID: rows[1][values[1]].id,
      qualityKbps: rows[2][values[2]].id,
    };
    try {
      await session.server.selectStreams(part.id, {
        audioStreamID: choice.audioStreamID == null ? undefined : choice.audioStreamID,
        subtitleStreamID: choice.subtitleStreamID,
      });
      if (!alive) return;
      store.set('qualityKbps', choice.qualityKbps);
      if (onApply) onApply(choice);
      router.back();
    } catch (e) {
      if (alive) setText(status, 'Could not save the selected streams: ' + e.message);
    } finally {
      busy = false;
    }
  }

  load();

  return {
    el,
    name: 'playback-options',
    onShow() { ambience.restore(); },
    onKey(action) {
      if (busy) return true;
      if (action === 'back') { router.back(); return true; }
      if (!loaded) return true;
      if (action === 'green') { apply(); return true; }
      if (area === 'actions') {
        if (action === 'left') actionIndex = Math.max(0, actionIndex - 1);
        if (action === 'right') actionIndex = Math.min(1, actionIndex + 1);
        if (action === 'up') area = 'tracks';
        if (action === 'enter') {
          if (actionIndex === 0) apply(); else router.back();
          return true;
        }
      } else {
        if (action === 'left') col = Math.max(0, col - 1);
        if (action === 'right') col = Math.min(2, col + 1);
        if (action === 'up') indices[col] = Math.max(0, indices[col] - 1);
        if (action === 'down') {
          if (indices[col] >= rows[col].length - 1) area = 'actions';
          else indices[col]++;
        }
        if (action === 'enter') values[col] = indices[col];
      }
      renderFocus();
      return true;
    },
    destroy() { alive = false; },
  };
}
