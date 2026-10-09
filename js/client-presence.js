/*
 * PlutoniumPresence: tells the console this browser exists, and obeys it.
 *
 * Transport: one POST on page load, then one long-lived SSE connection that
 * carries commands back. There is no polling and no database use, so presence
 * costs zero Firestore reads, which is why it can exist at all on the free
 * plan. Do not "improve" this into a polling loop.
 *
 * What the console can do to this client:
 *   identify: show this browser its own number in the corner for 5 seconds
 *   message:  put a message on this screen
 *   disable:  replace the page with a block screen (and remember it)
 *
 * Honest limitation: `disable` here is a convenience control, not a security
 * boundary. Clearing storage, blocking this request, or running a modified copy
 * of the site gets around it. The authoritative ban is the account-level
 * disable on the server, which the console also offers.
 */

(function () {
  'use strict';

  function metaContent(name) {
    var el = document.querySelector('meta[name="' + name + '"]');
    return el ? (el.getAttribute('content') || '') : '';
  }

  var BASE = String(window.PLU_PRESENCE_URL || metaContent('plu-presence') || '').replace(/\/+$/, '');
  if (!BASE) {
    console.info('[presence] disabled: set window.PLU_PRESENCE_URL or <meta name="plu-presence" content="https://...">');
    return;
  }

  var UI = window.PlutoniumPresenceUI;
  if (!UI) {
    console.warn('[presence] js/presence-ui.js must be loaded first.');
    return;
  }

  var KEY_ID = 'plu_client_id';
  var KEY_TAB = 'plu_client_tab';
  var KEY_BLOCKED = 'plu_client_disabled';

  var stream = null;
  var pollTimer = null;
  var number = null;
  var blocked = false;

  /* ------------------------------------------------------------------ *
   * Identity
   * ------------------------------------------------------------------ */

  function randomId() {
    try {
      if (window.crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '');
    } catch (err) { /* fall through */ }
    var out = '';
    var chars = 'abcdef0123456789';
    for (var i = 0; i < 32; i++) out += chars[Math.floor(Math.random() * 16)];
    return out;
  }

  function readKey(store, key) {
    try { return store.getItem(key); } catch (err) { return null; }
  }

  function writeKey(store, key, value) {
    try { store.setItem(key, value); } catch (err) { /* private mode */ }
  }

  /**
   * One id per BROWSER, not per tab: "who is on the site" means people, and a
   * person with three tabs open is still one client.
   */
  function clientId() {
    var existing = readKey(localStorage, KEY_ID);
    if (existing && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) return existing;
    var fresh = randomId();
    writeKey(localStorage, KEY_ID, fresh);
    return fresh;
  }

  function tabId() {
    var existing = readKey(sessionStorage, KEY_TAB);
    if (existing) return existing;
    var fresh = randomId().slice(0, 16);
    writeKey(sessionStorage, KEY_TAB, fresh);
    return fresh;
  }

  function buildNumber() {
    var meta = document.querySelector('meta[name="plu-build"]');
    var value = meta ? parseInt(meta.getAttribute('content'), 10) : 0;
    return Number.isFinite(value) ? value : 0;
  }

  function currentUser() {
    try {
      return (window.PlutoniumStore && PlutoniumStore.currentUser) || null;
    } catch (err) { return null; }
  }

  function payload() {
    var user = currentUser();
    return {
      clientId: clientId(),
      tabId: tabId(),
      path: location.pathname + location.hash,
      build: buildNumber(),
      uid: user ? user.uid : null,
      idToken: user ? user.idToken : null,
      displayName: user ? user.displayName : null,
    };
  }

  /* ------------------------------------------------------------------ *
   * Blocking
   * ------------------------------------------------------------------ */

  function rememberBlocked(on) {
    try {
      if (on) localStorage.setItem(KEY_BLOCKED, '1');
      else localStorage.removeItem(KEY_BLOCKED);
    } catch (err) { /* ignore */ }
  }

  function applyBlock(reason) {
    blocked = true;
    closeStream();
    UI.block(reason, function () { checkState(); });
    startPolling();
  }

  function clearBlock() {
    if (!blocked) return;
    blocked = false;
    UI.unblock();
    stopPolling();
  }

  function startPolling() {
    if (pollTimer) return;
    // While blocked, this is the only traffic: one request every 30s so an
    // operator's "enable" is noticed without the client hammering anything.
    pollTimer = setInterval(checkState, 30000);
  }

  function stopPolling() {
    if (!pollTimer) return;
    clearInterval(pollTimer);
    pollTimer = null;
  }

  function checkState() {
    fetch(BASE + '/rt/presence/state?clientId=' + encodeURIComponent(clientId()), { cache: 'no-store' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (out) {
        if (!out) return;
        if (out.disabled) {
          applyBlock(out.reason);
        } else {
          clearBlock();
          rememberBlocked(false);
          register();
        }
      })
      .catch(function () { /* stay as we are and try again on the next tick */ });
  }

  /* ------------------------------------------------------------------ *
   * Commands
   * ------------------------------------------------------------------ */

  function handleCommand(raw) {
    var event;
    try { event = JSON.parse(raw); } catch (err) { return; }
    if (!event || !event.type) return;

    if (event.type === 'identify') {
      number = event.number;
      UI.identify(event.number, event.durationMs || 5000);
      return;
    }
    if (event.type === 'message') {
      UI.message(event);
      return;
    }
    if (event.type === 'disabled') {
      rememberBlocked(true);
      applyBlock(event.reason);
      return;
    }
    if (event.type === 'enabled') {
      rememberBlocked(false);
      clearBlock();
      return;
    }
    if (event.type === 're-register') {
      closeStream();
      register();
    }
  }

  function closeStream() {
    if (!stream) return;
    try { stream.close(); } catch (err) { /* ignore */ }
    stream = null;
  }

  function openStream() {
    if (stream || blocked) return;
    if (typeof EventSource !== 'function') return;

    try {
      stream = new EventSource(BASE + '/rt/presence/stream?clientId=' + encodeURIComponent(clientId()));
    } catch (err) {
      stream = null;
      return;
    }

    stream.onmessage = function (event) { handleCommand(event.data); };

    stream.onerror = function () {
      // EventSource reconnects on its own. If the whole service is unreachable
      // we simply have no presence; the site keeps working regardless.
      if (stream && stream.readyState === 2) {
        stream = null;
        setTimeout(openStream, 15000);
      }
    };
  }

  /* ------------------------------------------------------------------ *
   * Registration
   * ------------------------------------------------------------------ */

  function register() {
    return fetch(BASE + '/rt/presence/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload()),
    })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (out) {
        if (!out || !out.ok) return;
        number = out.number;
        if (out.disabled) {
          rememberBlocked(true);
          applyBlock(out.reason);
        } else {
          rememberBlocked(false);
          clearBlock();
          openStream();
        }
      })
      .catch(function (err) {
        console.warn('[presence] register failed:', err.message);
      });
  }

  /* ------------------------------------------------------------------ *
   * Boot
   * ------------------------------------------------------------------ */

  function start() {
    // Paint the block immediately if this browser was blocked last time, then
    // let the server confirm or lift it. Never leaves a blocked user staring at
    // a working page for a round trip.
    if (readKey(localStorage, KEY_BLOCKED) === '1') {
      applyBlock('');
    }

    register();

    // Signing in or out changes who this client is, so tell the console.
    try {
      if (window.PlutoniumStore && typeof PlutoniumStore.onAuthChange === 'function') {
        var lastUid = currentUser() ? currentUser().uid : null;
        PlutoniumStore.onAuthChange(function (user) {
          var uid = user ? user.uid : null;
          if (uid === lastUid) return;
          lastUid = uid;
          register();
        });
      }
    } catch (err) { /* ignore */ }

    // Keep the reported page current without re-registering on every SPA jump.
    window.addEventListener('hashchange', function () { register(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  window.PlutoniumPresence = {
    clientId: clientId,
    number: function () { return number; },
    isBlocked: function () { return blocked; },
    refresh: register,
    /** Local testing helper: ask the console to identify this browser. */
    _selfTest: function () { return clientId(); },
  };
})();
