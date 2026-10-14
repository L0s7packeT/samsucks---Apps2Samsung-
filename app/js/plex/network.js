// Local Plex endpoint handling. Manual overrides must stay on private LAN addresses.
export function privateIPv4(host) {
  const parts = String(host || '').split('.');
  if (parts.length !== 4 || parts.some(p => !/^\d{1,3}$/.test(p) || Number(p) > 255)) return false;
  const [a, b] = parts.map(Number);
  return a === 10 || a === 127 || a === 192 && b === 168 ||
    a === 172 && b >= 16 && b <= 31 || a === 169 && b === 254;
}

export function normalizeLanAddress(value) {
  let input = String(value || '').trim();
  if (!input) throw new Error('Enter a LAN address, for example 10.10.30.70:32400');
  if (!/^https?:\/\//i.test(input)) input = 'http://' + input;
  let u;
  try { u = new URL(input); } catch (e) { throw new Error('Invalid server address'); }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password ||
      (u.pathname !== '/' && u.pathname !== '') || u.search || u.hash) {
    throw new Error('Enter only a local host and optional port');
  }
  if (!privateIPv4(u.hostname)) throw new Error('Use a private LAN IPv4 address (10.x, 192.168.x, or 172.16–31.x)');
  return u.protocol + '//' + u.hostname + ':' + (u.port || (u.protocol === 'https:' ? '32400' : '32400'));
}

export function isLocalUri(uri) {
  try {
    const u = new URL(uri);
    return privateIPv4(u.hostname) || /\.(?:lan|local|home\.arpa)$/i.test(u.hostname) ||
      /^(?:10|127|172|192)-\d+-\d+-\d+\.[^.]+\.plex\.direct$/i.test(u.hostname);
  } catch (e) { return false; }
}

export function connectionLabel(uri, localHint) {
  if (!uri) return 'Disconnected';
  let host = uri;
  try { host = new URL(uri).host; } catch (e) {}
  return (localHint || isLocalUri(uri) ? 'Local' : 'Remote / unknown') + ' · ' + host;
}
