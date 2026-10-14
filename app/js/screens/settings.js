// Account, server connection and diagnostics.
import { DEV, VERSION } from '../config.js';
import { h, toggleClass, setText } from '../util/dom.js';
import { session, signOut, useServer, reconnect } from '../session.js';
import { getServers, connect, getLanOverride, setLanOverride } from '../plex/auth.js';
import { normalizeLanAddress, connectionLabel } from '../plex/network.js';
import { setHud, hudEnabled } from '../ui/hud.js';
import * as router from '../router.js';
import { ServerPicker } from './login.js';
import { error } from '../util/log.js';
import { useAmbience, setLegacyGradients, legacyGradients } from '../ui/backdrop.js';

export function SettingsScreen() {
  const el = h('div', 'screen settings');
  const ambience = useAmbience();
  h('h1', 'settings-title', el).textContent = 'Settings';
  const list = h('div', 'settings-list', el);
  const status = h('div', 'settings-status', el);
  const foot = h('div', 'settings-foot', el);
  foot.textContent = 'SamSUCKS ' + VERSION + (DEV ? ' (dev)' : '');

  let index = 0;
  let items = [];
  let alive = true;

  function build() {
    if (!alive) return;
    list.innerHTML = '';
    const server = session.server;
    items = [
      { label: 'Server', value: server ? server.name : '—', run: switchServer },
      { label: 'Connection', value: server ? connectionLabel(server.uri, server.local) : '—', run: retryLan },
      { label: 'Use local connection', value: 'Retry LAN discovery', run: retryLan },
      { label: 'Manual LAN address', value: server ? getLanOverride(server.id) || 'Automatic' : '—',
        run: () => router.push(LanAddressScreen()) },
      { label: 'Signed in as', value: session.user ? session.user.title : '—', run: doSignOut, action: 'Sign out' },
      { label: 'Performance overlay', value: hudEnabled() ? 'On' : 'Off',
        run: () => { setHud(!hudEnabled()); build(); } },
      { label: 'Demo: original slow renderer', value: legacyGradients() ? 'On' : 'Off',
        run: () => { setLegacyGradients(!legacyGradients()); build(); } },
    ];
    items.forEach(it => {
      it.el = h('div', 'setting', list);
      h('span', 'setting-label', it.el).textContent = it.label;
      h('span', 'setting-value', it.el).textContent = it.value + (it.action ? ' · ' + it.action : '');
    });
    render();
  }

  function render() {
    items.forEach((it, i) => toggleClass(it.el, 'focus', i === index));
  }

  async function retryLan() {
    setText(status, 'Checking local Plex addresses…');
    try {
      await reconnect({ localOnly: true });
      if (!alive) return;
      setText(status, 'Local connection selected.');
      build();
    } catch (e) {
      if (!alive) return;
      setText(status, 'LAN discovery failed: ' + e.message + '. Try a manual LAN address.');
    }
  }

  async function switchServer() {
    try {
      setText(status, 'Finding servers…');
      const servers = await getServers(session.token);
      if (!alive) return;
      if (servers.length === 1) {
        const uri = await connect(servers[0]);
        if (!alive) return;
        useServer(servers[0], uri);
        restart();
        return;
      }
      router.push(ServerPicker({ servers, onDone: restart }));
    } catch (e) {
      error('server list failed', e);
      if (alive) setText(status, 'Server selection failed: ' + e.message);
    }
  }

  function doSignOut() {
    signOut();
    restart();
  }

  function restart() {
    window.dispatchEvent(new Event('samsucks:restart'));
  }

  build();

  return {
    el,
    name: 'settings',
    onShow() { ambience.restore(); build(); },
    onKey(action) {
      if (action === 'up') { index = Math.max(0, index - 1); render(); return true; }
      if (action === 'down') { index = Math.min(items.length - 1, index + 1); render(); return true; }
      if (action === 'enter' && items[index]) { items[index].run(); return true; }
      return false;
    },
    destroy() { alive = false; },
  };
}

// On-screen TV keyboard, followed by an explicit test-and-save operation.
function LanAddressScreen() {
  const el = h('div', 'screen settings');
  const ambience = useAmbience();
  h('h1', 'settings-title', el).textContent = 'Manual LAN server';
  const help = h('p', 'lan-help', el);
  help.textContent = 'Enter a private IP address and port for the selected Plex server.';
  const input = h('input', 'lan-input', el);
  input.type = 'text';
  input.value = getLanOverride(session.server.id);
  input.placeholder = '10.10.30.70:32400';
  input.setAttribute('autocomplete', 'off');
  const hint = h('p', 'lan-hint', el);
  hint.textContent = 'OK to edit · Down for Save / Clear / Cancel';
  const actions = h('div', 'lan-actions', el);
  const buttons = ['Test & save', 'Clear override', 'Cancel'].map(label => {
    const button = h('div', 'btn lan-button', actions);
    button.textContent = label;
    return button;
  });
  const status = h('div', 'lan-status', el);
  let editing = true;
  let buttonIndex = 0;
  let busy = false;
  let alive = true;

  function render() {
    toggleClass(input, 'focus', editing);
    buttons.forEach((b, i) => toggleClass(b, 'focus', !editing && i === buttonIndex));
  }

  function focusEditor() {
    editing = true;
    render();
    input.focus();
  }

  function focusActions() {
    editing = false;
    input.blur();
    render();
  }

  async function save() {
    if (busy) return;
    let url;
    try { url = normalizeLanAddress(input.value); }
    catch (e) { setText(status, e.message); focusEditor(); return; }
    busy = true;
    setText(status, 'Testing connection to ' + url + '…');
    try {
      const servers = await getServers(session.token);
      const selected = servers.find(s => s.clientIdentifier === session.server.id);
      if (!selected) throw new Error('Selected server not found in Plex account');
      const connectedUrl = await connect(selected, { localOnly: true, manualUrl: url });
      if (!alive) return;
      setLanOverride(selected.clientIdentifier, connectedUrl);
      useServer(selected, connectedUrl);
      router.back();
      window.dispatchEvent(new Event('samsucks:restart'));
    } catch (e) {
      if (alive) setText(status, 'Could not use LAN address: ' + e.message);
    } finally { busy = false; }
  }

  function clear() {
    setLanOverride(session.server.id, '');
    router.back();
  }

  input.addEventListener('keydown', e => {
    if (e.keyCode === 65376 || e.keyCode === 65385 || e.keyCode === 13) {
      focusActions();
    }
  });

  render();
  return {
    el,
    name: 'lan-address',
    onShow() { ambience.restore(); setTimeout(() => { if (alive) focusEditor(); }, 50); },
    onHide() { input.blur(); },
    onKey(action) {
      if (busy) return true;
      if (editing) {
        if (action === 'down' || action === 'enter') { focusActions(); return true; }
        if (action === 'back') { focusActions(); return true; }
        return true;
      }
      if (action === 'up') { focusEditor(); return true; }
      if (action === 'left') { buttonIndex = Math.max(0, buttonIndex - 1); render(); return true; }
      if (action === 'right') { buttonIndex = Math.min(buttons.length - 1, buttonIndex + 1); render(); return true; }
      if (action === 'back') { router.back(); return true; }
      if (action === 'enter') {
        if (buttonIndex === 0) save();
        if (buttonIndex === 1) clear();
        if (buttonIndex === 2) router.back();
        return true;
      }
      return true;
    },
    destroy() { alive = false; },
  };
}
