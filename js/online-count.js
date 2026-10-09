(function () {
  'use strict';

  var ENDPOINT = 'https://stelena.plutoniumnet.work/online';
  var POLL_MS = 30000;

  var el = document.getElementById('online-count');
  var valueEl = document.getElementById('online-count-value');
  if (!el || !valueEl) return;

  var timer = null;

  function renderCount(n) {
    valueEl.textContent = Number.isFinite(n) ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '—';
    el.classList.toggle('is-offline', !Number.isFinite(n));
  }

  function parseCount(data) {
    if (typeof data === 'number') return data;
    if (data && typeof data === 'object') {
      if (typeof data.online === 'number') return data.online;
      if (typeof data.count === 'number') return data.count;
      if (typeof data.users === 'number') return data.users;
    }
    return null;
  }

  function refresh() {
    return fetch(ENDPOINT, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        var n = parseCount(data);
        renderCount(typeof n === 'number' ? n : null);
      })
      .catch(function () {
        renderCount(null);
      });
  }

  function start() {
    el.hidden = false;
    refresh();
    if (timer) clearInterval(timer);
    timer = setInterval(function () {
      if (document.hidden) return;
      refresh();
    }, POLL_MS);
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) refresh();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
