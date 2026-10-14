// Who is signed in and which server we're talking to. Persisted so a restart
// goes straight to the home screen.
import * as store from './util/store.js';
import { Server } from './plex/server.js';
import { getServers, connect, candidateUris } from './plex/auth.js';
import { isLocalUri } from './plex/network.js';
import { log } from './util/log.js';

export const session = {
  token: store.get('token'),
  user: store.get('user'),
  server: null,
};

const saved = store.get('server');
if (saved) session.server = new Server(saved);

export function signIn(token, user) {
  session.token = token;
  session.user = { title: user.title || user.username, thumb: user.thumb, uuid: user.uuid };
  store.set('token', token);
  store.set('user', session.user);
}

export function useServer(resource, uri) {
  const local = isLocalUri(uri) || candidateUris(resource, { localOnly: true }).some(tier => tier.indexOf(uri) !== -1);
  const data = { uri, token: resource.accessToken, name: resource.name, id: resource.clientIdentifier, local };
  session.server = new Server(data);
  store.set('server', data);
}

export function signOut() {
  session.token = null;
  session.user = null;
  session.server = null;
  store.set('token', undefined);
  store.set('user', undefined);
  store.set('server', undefined);
  store.set('homeCache', undefined);
}

// The saved URI can go stale (DHCP, remote vs. home). Re-resolve it from plex.tv.
export async function reconnect({ localOnly = false, ignoreOverride = false } = {}) {
  const previous = session.server;
  const servers = await getServers(session.token);
  const current = session.server && servers.find(s => s.clientIdentifier === session.server.id);
  const resource = current || servers[0];
  if (!resource) throw new Error('No Plex servers on this account');
  const uri = await connect(resource, { localOnly, ignoreOverride });
  // Do not override a server manually selected while discovery was running.
  if (session.server !== previous) return session.server;
  useServer(resource, uri);
  log('reconnected', resource.name, uri);
  return session.server;
}
