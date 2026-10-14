// Video backend: Samsung AVPlay (hardware decode, plays straight to the video
// plane under the web layer) on the TV, <video> in a desktop browser.
//
// listener: { onTime(ms), onBuffering(bool), onEnd(), onError(msg), onSubtitle(text, durationMs) }

function avplayBackend(container, listener) {
  const av = webapis.avplay;
  const obj = document.createElement('object');
  obj.type = 'application/avplayer';
  obj.className = 'av-object';
  container.appendChild(obj);
  let opened = false;
  let generation = 0;
  let pendingPrepareFail = null;

  const api = {
    open(url, { uhd = false } = {}) {
      api.close();
      const currentGeneration = ++generation;
      av.open(url);
      opened = true;
      av.setDisplayRect(0, 0, 1920, 1080);
      av.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');
      if (uhd) {
        try { av.setStreamingProperty('SET_MODE_4K', 'TRUE'); } catch (e) { /* not a UHD panel */ }
      }
      // Callbacks already queued by a previous stream may arrive during
      // stop()/close()/open(). Never let those mutate the new player state.
      const valid = () => opened && currentGeneration === generation;
      av.setListener({
        onbufferingstart: () => { if (valid()) listener.onBuffering(true); },
        onbufferingprogress: () => {},
        onbufferingcomplete: () => { if (valid()) listener.onBuffering(false); },
        oncurrentplaytime: ms => { if (valid()) listener.onTime(ms); },
        onstreamcompleted: () => { if (valid()) listener.onEnd(); },
        onerror: e => {
          if (!valid()) return;
          // Handle errors during prepare through the same Promise rather
          // than starting another playback transition concurrently.
          if (pendingPrepareFail) pendingPrepareFail(new Error(String(e)));
          else listener.onError(String(e));
        },
        onevent: () => {},
        onsubtitlechange: (duration, text) => {
          if (valid()) listener.onSubtitle(text, Number(duration));
        },
        ondrmevent: () => {},
      });
    },
    prepare() {
      const currentGeneration = generation;
      return new Promise((resolve, reject) => {
        let completed = false;
        const finish = err => {
          if (completed) return;
          completed = true;
          clearTimeout(timer);
          if (pendingPrepareFail === fail) pendingPrepareFail = null;
          if (currentGeneration !== generation) {
            reject(new Error('Playback preparation interrupted'));
            return;
          }
          if (err) reject(err); else resolve();
        };
        const fail = err => finish(err);
        // A stuck native prepare must not leave the user on a spinner
        // indefinitely; image subtitle burn-in may legitimately take time.
        const timer = setTimeout(() => fail(new Error('Playback preparation timed out after 60 seconds')), 60000);
        pendingPrepareFail = fail;
        try {
          av.prepareAsync(() => finish(null),
            e => fail(new Error(String(e && e.name || e))));
        } catch (e) { fail(e); }
      });
    },
    play() { av.play(); },
    pause() { av.pause(); },
    seek(ms) {
      return new Promise((resolve, reject) => av.seekTo(Math.max(0, Math.floor(ms)), resolve, e => reject(new Error(String(e && e.name || e)))));
    },
    time() {
      try { return av.getCurrentTime(); } catch (e) { return 0; }
    },
    state() {
      try { return av.getState(); } catch (e) { return 'NONE'; }
    },
    tracks() {
      let info = [];
      try { info = av.getTotalTrackInfo() || []; } catch (e) {}
      return {
        audio: info.filter(t => t.type === 'AUDIO').map(t => t.index),
        text: info.filter(t => t.type === 'TEXT').map(t => t.index),
      };
    },
    audioTracks() {
      try { return (av.getTotalTrackInfo() || []).filter(t => t.type === 'AUDIO'); }
      catch (e) { return []; }
    },
    currentAudioTrack() {
      try { return (av.getCurrentStreamInfo() || []).find(t => t.type === 'AUDIO') || null; }
      catch (e) { return null; }
    },
    selectAudio(avIndex) {
      try { av.setSelectTrack('AUDIO', avIndex); return true; }
      catch (e) { console.warn('AVPlay audio switch failed', e); return false; }
    },
    selectText(avIndex) {
      try {
        if (avIndex == null) { av.setSilentSubtitle(true); return true; }
        av.setSelectTrack('TEXT', avIndex);
        av.setSilentSubtitle(false);
        return true;
      } catch (e) { return false; }
    },
    suspend() { try { av.suspend(); } catch (e) {} },
    restore() { try { av.restore(); } catch (e) {} },
    close() {
      if (pendingPrepareFail) pendingPrepareFail(new Error('Playback preparation interrupted'));
      generation++; // Immediately invalidate callbacks from the stopped stream.
      if (!opened) return;
      opened = false;
      try { av.stop(); } catch (e) {}
      try { av.close(); } catch (e) {}
    },
    destroy() {
      api.close();
      if (obj.parentNode) obj.parentNode.removeChild(obj);
    },
  };
  return api;
}

function videoBackend(container, listener) {
  const v = document.createElement('video');
  v.className = 'av-object';
  container.appendChild(v);
  v.addEventListener('timeupdate', () => listener.onTime(v.currentTime * 1000));
  v.addEventListener('waiting', () => listener.onBuffering(true));
  v.addEventListener('playing', () => listener.onBuffering(false));
  v.addEventListener('ended', () => listener.onEnd());
  v.addEventListener('error', () => listener.onError('video error ' + (v.error && v.error.code)));
  return {
    open(url) { v.src = url; },
    prepare() {
      return new Promise((resolve, reject) => {
        v.addEventListener('loadedmetadata', resolve, { once: true });
        v.addEventListener('error', () => reject(new Error('load failed')), { once: true });
        v.load();
      });
    },
    play() { v.play(); },
    pause() { v.pause(); },
    seek(ms) { v.currentTime = ms / 1000; return Promise.resolve(); },
    time() { return v.currentTime * 1000; },
    state() { return v.paused ? 'PAUSED' : 'PLAYING'; },
    tracks() { return { audio: [], text: [] }; },
    audioTracks() { return []; },
    currentAudioTrack() { return null; },
    selectAudio() { return false; },
    selectText() { return false; },
    suspend() {},
    restore() {},
    close() { v.removeAttribute('src'); v.load(); },
    destroy() { v.removeAttribute('src'); if (v.parentNode) v.parentNode.removeChild(v); },
  };
}

export function createPlayer(container, listener) {
  if (typeof webapis !== 'undefined' && webapis.avplay) return avplayBackend(container, listener);
  return videoBackend(container, listener);
}
