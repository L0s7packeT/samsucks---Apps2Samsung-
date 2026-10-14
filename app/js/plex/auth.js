// Plex account login and server discovery.
import { request, clientId, PRODUCT, query } from './client.js';
import * as store from '../util/store.js';
import { log, warn } from '../util/log.js';

const TV = 'https://plex.tv/api/v2';

export async function createPin() {
  return request(TV + '/pins', { method: 'POST', params: { strong: 'false' } });
}

export async function checkPin(id) {
  const pin = await request(TV + '/pins/' + id);
  return pin.authToken || null;
}

export function authAppUrl(code) {
  return 'https://app.plex.tv/auth#?' + query({
    clientID: clientId, code, 'context[device][product]': PRODUCT,
  });
}

export async function getUser(token) {
  return request(TV + '/user', { token });
}

export async function getServers(token) {
  const resources = await request(TV + '/resources', {
    token, params: { includeHttps: 1, includeRelay: 1, includeIPv6: 0 },
  });
  return resources.filter(r => (r.provides || '').indexOf('server') !== -1);
}

export function getLanOverride(serverId) {
  const overrides = store.get('lanOverrides', {});
  return overrides && overrides[serverId] || '';
}

export function setLanOverride(serverId, uri) {
  const overrides = store.get('lanOverrides', {}) || {};
  if (uri) overrides[serverId] = uri;
  else delete overrides[serverId];
  store.set('lanOverrides', overrides);
}

async function probe(uri, token, timeout, expectedId) {
  const started = Date.now();
  const response = await request(uri + '/identity', { token, timeout });
  const identity = response.MediaContainer || response;
  if (identity.machineIdentifier && expectedId && identity.machineIdentifier !== expectedId) {
    throw new Error('Address belongs to a different Plex server');
  }
  return { uri, ms: Date.now() - started };
}

// Do not send requests to the public endpoint until every advertised local
// endpoint has failed. The manual override is tested first, when configured.
export function candidateUris(resource, { localOnly = false } = {}) {
  const conns = resource.connections || [];
  const local = conns.filter(c => c.local && !c.relay);
  const remote = conns.filter(c => !c.local && !c.relay);
  const relay = conns.filter(c => c.relay);
  const tiers = [];
  if (resource.httpsRequired !== true) {
    tiers.push(local.filter(c => c.address && c.port).map(c => 'http://' + c.address + ':' + c.port));
  }
  tiers.push(local.map(c => c.uri));
  if (!localOnly) {
    tiers.push(remote.map(c => c.uri));
    tiers.push(relay.map(c => c.uri));
  }
  return tiers.map(t => Array.from(new Set(t.filter(Boolean)))).filter(t => t.length);
}

function firstSuccess(promises) {
  return new Promise((resolve, reject) => {
    let pending = promises.length;
    if (!pending) { reject(new Error('No server addresses')); return; }
    promises.forEach(p => p.then(resolve, () => {
      if (--pending === 0) reject(new Error('All addresses failed'));
    }));
  });
}

export async function connect(resource, { localOnly = false, ignoreOverride = false, manualUrl = '' } = {}) {
  const token = resource.accessToken;
  const override = manualUrl || (!ignoreOverride && getLanOverride(resource.clientIdentifier));
  if (override) {
    try {
      const hit = await probe(override, token, 4500, resource.clientIdentifier);
      log('connected using manual LAN address', hit.uri);
      return hit.uri;
    } catch (e) {
      // A chosen manual address must not silently fall back to a remote connection.
      throw new Error('Manual LAN address unavailable: ' + e.message);
    }
  }
  for (const tier of candidateUris(resource, { localOnly })) {
    try {
      const hit = await firstSuccess(tier.map(uri => probe(uri, token, 4000, resource.clientIdentifier)));
      log('connected to', resource.name, 'via', hit.uri, hit.ms + 'ms');
      return hit.uri;
    } catch (e) {
      warn('connection tier failed', tier.join(', '));
    }
  }
  throw new Error(localOnly ? 'No local server address was reachable' : 'Could not reach ' + resource.name);
}
