// An AVPlay player may switch between direct media and several HLS manifests
// during one movie. Every HLS manifest receives its own Plex transcode ID,
// so stopping an old transcode never accidentally kills a new one.
export class TranscodeSessions {
  constructor(stop) {
    this.active = null;
    this.stop = stop;
  }

  replace(nextSession) {
    const previous = this.active;
    this.active = nextSession || null;
    if (previous && previous !== this.active) return this.stop(previous);
    return Promise.resolve();
  }

  discard(session) {
    if (session && session !== this.active) return this.stop(session);
    return Promise.resolve();
  }

  close() {
    return this.replace(null);
  }
}
