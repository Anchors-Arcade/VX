/*
 * Apps — a launcher grid for proxied web apps, plus an in-section iframe
 * viewer. Each card opens its app in a fullscreen frame inside the section,
 * routed through whichever server is picked in the header switcher.
 *
 * Data:
 *   data/apps.json         the catalog (id, name, url, icon, color, category)
 *   data/app-servers.json  the server list ({url} token, default id)
 *
 * Route: pluto://apps#<appId> opens an app, pluto://apps?q=<query> seeds search.
 */
(function () {
  'use strict';

  const APPS_URL = 'data/apps.json';
  const SERVERS_URL = 'data/app-servers.json';
  const SERVER_KEY = 'plu_app_server';
  // Cover art, named after each app's id (img/apps/youtube.png). Cards with no
  // file fall back to the icon tile automatically, so art can be added a bit
  // at a time.
  const APP_IMAGE_BASE = 'img/apps/';

  const grid = document.getElementById('apps-grid');
  const emptyEl = document.getElementById('apps-empty');
  const searchInput = document.getElementById('apps-search');
  const searchClear = document.getElementById('apps-search-clear');
  const countEl = document.getElementById('apps-count');
  const catsEl = document.getElementById('apps-cats');

  const serverWrap = document.getElementById('apps-server');
  const serverBtn = document.getElementById('apps-server-btn');
  const serverLabel = document.getElementById('apps-server-label');
  const serverIcon = document.getElementById('apps-server-icon');
  const serverMenu = document.getElementById('apps-server-menu');

  const viewerServerWrap = document.getElementById('apps-viewer-server');
  const viewerServerBtn = document.getElementById('apps-viewer-server-btn');
  const viewerServerLabel = document.getElementById('apps-viewer-server-label');
  const viewerServerMenu = document.getElementById('apps-viewer-server-menu');
  const viewerServerIcon = document.getElementById('apps-viewer-server-icon');

  const viewer = document.getElementById('apps-viewer');
  const frame = document.getElementById('apps-frame');
  const viewerBack = document.getElementById('apps-viewer-back');
  const viewerReload = document.getElementById('apps-viewer-reload');
  const viewerOpen = document.getElementById('apps-viewer-open');
  const viewerFull = document.getElementById('apps-viewer-full');
  const viewerTitle = document.getElementById('apps-viewer-title');
  const viewerIcon = document.getElementById('apps-viewer-icon');
  const viewerNotice = document.getElementById('apps-viewer-notice');

  if (!grid || !viewer) return;

  let apps = [];
  let servers = [];
  let currentServerId = '';
  let activeCat = '';
  let query = '';
  let currentApp = null;
  let openMenu = null;

  /* ---------- helpers ---------- */

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function getServer(id) {
    return servers.find(s => s.id === id) || null;
  }

  // A template we can actually route through. Anything still holding a
  // CHANGE-ME/example.com host is an unconfigured placeholder, so flag it
  // instead of silently loading a dead frame.
  function serverReady(server) {
    if (!server) return false;
    const template = server.urlTemplate || '';
    if (!template || (template.indexOf('{url}') === -1 && template.indexOf('{url_enc}') === -1)) return false;
    return !/CHANGE-ME|example\.com/i.test(template);
  }

  // {url} inserts the target as-is; {url_enc} inserts it percent-encoded, which
  // is what a proxy host expecting the address in a query string needs.
  function buildFrameUrl(server, rawUrl) {
    const template = (server && server.urlTemplate) || '{url}';
    return template
      .replace(/\{url_enc\}/g, encodeURIComponent(rawUrl))
      .replace(/\{url\}/g, rawUrl);
  }

  function historyLog(app) {
    if (typeof historyManager === 'undefined' || !historyManager.record) return;
    historyManager.record({
      type: 'app',
      title: app.name || 'App',
      href: 'pluto://apps#' + encodeURIComponent(app.id),
    });
  }

  function parentPins() {
    try { return window.Pins || (window.parent && window.parent.Pins); } catch (_) { return null; }
  }

  function pinId(app) { return 'app:' + app.id; }

  function togglePin(app) {
    const P = parentPins();
    if (!P) return;
    const id = pinId(app);
    if (P.find(id)) {
      P.remove(id);
    } else {
      P.add({ id, appId: app.id, name: app.name, icon: app.icon, color: app.color, type: 'app' });
    }
  }

  /* ---------- server switcher ---------- */

  function persistServer(id) {
    try { localStorage.setItem(SERVER_KEY, id); } catch (_) {}
  }

  // Servers may carry a flag image (like the home relay picker) or a Font
  // Awesome icon; both render into the same slot.
  function serverIconMarkup(server) {
    if (server && server.flagSrc) {
      return '<span class="relay-flag" aria-hidden="true" style="background-image:url(\'' + esc(server.flagSrc) + '\')"></span>';
    }
    return '<i class="' + esc((server && server.icon) || 'fa-solid fa-server') + '"></i>';
  }

  function paintServerIcon(el, server, baseClass) {
    if (!el) return;
    const cls = baseClass || '';
    if (server && server.flagSrc) {
      el.className = (cls + ' relay-flag').trim();
      el.style.backgroundImage = "url('" + server.flagSrc + "')";
      el.innerHTML = '';
    } else {
      el.className = cls;
      el.style.backgroundImage = '';
      el.innerHTML = serverIconMarkup(server);
    }
  }

  function updateServerButton() {
    const server = getServer(currentServerId) || servers[0] || null;
    if (serverLabel) serverLabel.textContent = server ? server.name : 'No servers';
    paintServerIcon(serverIcon, server, 'apps-server__icon');
    paintServerIcon(viewerServerIcon, server, 'apps-viewer__server-icon');
    if (serverWrap) serverWrap.classList.toggle('is-placeholder', !!server && !serverReady(server));
    if (viewerServerLabel) viewerServerLabel.textContent = server ? server.name : '—';
  }

  function buildServerMenu(menuEl) {
    if (!menuEl) return;
    menuEl.innerHTML = servers.map(server => {
      const active = server.id === currentServerId;
      return '<button class="apps-server__item' + (active ? ' is-active' : '') + '" type="button" role="option" data-server-id="' + esc(server.id) + '" aria-selected="' + active + '">' +
        '<span class="apps-server__item-icon">' + serverIconMarkup(server) + '</span>' +
        '<span class="apps-server__item-copy">' +
          '<span class="apps-server__item-name">' + esc(server.name) + '</span>' +
          '<span class="apps-server__item-loc">' + esc(server.location || '') + '</span>' +
        '</span>' +
        (active ? '<i class="fa-solid fa-check apps-server__item-check"></i>' : '') +
      '</button>';
    }).join('');

    menuEl.querySelectorAll('[data-server-id]').forEach(item => {
      item.addEventListener('click', () => {
        selectServer(item.getAttribute('data-server-id'));
        closeServerMenu();
      });
    });
  }

  function openServerMenu(menuEl, btn) {
    if (!menuEl) return;
    if (openMenu && openMenu.menu === menuEl) { closeServerMenu(); return; }
    closeServerMenu();
    buildServerMenu(menuEl);
    menuEl.hidden = false;
    void menuEl.offsetHeight;
    menuEl.classList.add('is-open');
    if (btn) btn.setAttribute('aria-expanded', 'true');
    openMenu = { menu: menuEl, btn };
  }

  function closeServerMenu() {
    if (!openMenu) return;
    const menu = openMenu.menu;
    const btn = openMenu.btn;
    openMenu = null;
    menu.classList.remove('is-open');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    setTimeout(() => { if (!openMenu || openMenu.menu !== menu) menu.hidden = true; }, 160);
  }

  function toggleServerMenu() { openServerMenu(serverMenu, serverBtn); }
  function toggleViewerServerMenu() { openServerMenu(viewerServerMenu, viewerServerBtn); }

  function selectServer(id) {
    if (!getServer(id) || id === currentServerId) return;
    currentServerId = id;
    persistServer(id);
    updateServerButton();
    if (openMenu) buildServerMenu(openMenu.menu);
    // Re-point a live view at the new server without losing the open app.
    if (currentApp) launch(currentApp, { silent: true });
  }

  function wireServerToggle(btn, handler) {
    if (!btn) return;
    btn.addEventListener('click', e => {
      e.stopPropagation();
      handler();
    });
    btn.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      handler();
    });
  }
  wireServerToggle(serverBtn, toggleServerMenu);
  wireServerToggle(viewerServerBtn, toggleViewerServerMenu);

  document.addEventListener('click', e => {
    if (!openMenu) return;
    const inHeader = serverWrap && serverWrap.contains(e.target);
    const inViewer = viewerServerWrap && viewerServerWrap.contains(e.target);
    if (inHeader || inViewer) return;
    closeServerMenu();
  });

  /* ---------- grid ---------- */

  function renderCategories() {
    if (!catsEl) return;
    const cats = [];
    apps.forEach(app => {
      if (app.category && cats.indexOf(app.category) === -1) cats.push(app.category);
    });
    cats.sort();
    const all = ['', ...cats];
    catsEl.innerHTML = all.map(cat => {
      const label = cat === '' ? 'All' : cat;
      const active = cat === activeCat;
      return '<button class="apps-cat' + (active ? ' active' : '') + '" type="button" role="tab" data-cat="' + esc(cat) + '" aria-selected="' + active + '">' + esc(label) + '</button>';
    }).join('');
    catsEl.querySelectorAll('[data-cat]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeCat = btn.getAttribute('data-cat') || '';
        renderCategories();
        renderGrid();
      });
    });
  }

  function renderGrid() {
    if (!grid) return;
    const q = query.trim().toLowerCase();
    const filtered = apps.filter(app => {
      const matchCat = !activeCat || app.category === activeCat;
      const matchSearch = !q ||
        String(app.name || '').toLowerCase().includes(q) ||
        String(app.description || '').toLowerCase().includes(q) ||
        String(app.category || '').toLowerCase().includes(q);
      return matchCat && matchSearch;
    });

    if (countEl) countEl.textContent = filtered.length + ' app' + (filtered.length !== 1 ? 's' : '');

    grid.querySelectorAll('.apps-card').forEach(el => el.remove());
    if (emptyEl) emptyEl.hidden = filtered.length !== 0;
    if (!filtered.length) return;

    const frag = document.createDocumentFragment();
    filtered.forEach(app => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'apps-card';
      card.dataset.appId = app.id;
      card.style.setProperty('--app-color', app.color || 'var(--workspace-accent)');
      card.title = app.name + (app.description ? ' — ' + app.description : '');
      card.setAttribute('aria-label', 'Launch ' + app.name);
      card.innerHTML =
        '<img class="apps-card__img" src="' + APP_IMAGE_BASE + esc(app.id) + '.png" alt="" loading="lazy" decoding="async">' +
        '<span class="apps-card__fallback"><span class="apps-card__icon"><i class="' + esc(app.icon || 'fa-solid fa-cube') + '"></i></span></span>' +
        '<span class="apps-card__name">' + esc(app.name) + '</span>';
      const img = card.querySelector('.apps-card__img');
      if (img) img.addEventListener('error', () => card.classList.add('apps-card--no-art'));
      card.addEventListener('click', () => launch(app));
      card.addEventListener('contextmenu', e => showCardMenu(e, app));
      frag.appendChild(card);
    });
    grid.appendChild(frag);
  }

  function showCardMenu(e, app) {
    e.preventDefault();
    if (typeof ContextMenu === 'undefined' || !ContextMenu.show) return;
    const P = parentPins();
    const pinned = P ? !!P.find(pinId(app)) : false;
    ContextMenu.show([
      { label: 'Launch', icon: 'fa-solid fa-play', onClick: () => launch(app) },
      { label: 'Open in Browser', icon: 'fa-solid fa-up-right-from-square', onClick: () => openInBrowser(app) },
      { label: 'Open in New Tab', icon: 'fa-solid fa-plus', onClick: () => { if (typeof openNewTab === 'function') openNewTab(); navigate('pluto://apps#' + encodeURIComponent(app.id)); } },
      '-',
      { label: pinned ? 'Unpin from Home' : 'Pin to Home', icon: 'fa-solid fa-thumbtack', onClick: () => togglePin(app) },
      { label: 'Copy Link', icon: 'fa-solid fa-link', onClick: () => { if (typeof copyToClipboard === 'function') copyToClipboard('pluto://apps#' + encodeURIComponent(app.id)); } },
    ], e.clientX, e.clientY);
  }

  /* ---------- viewer ---------- */

  function positionViewer() {
    if (!viewer) return;
    const chrome = document.querySelector('.chrome');
    if (!chrome) return;
    const bottom = Math.max(0, Math.round(chrome.getBoundingClientRect().bottom));
    viewer.style.top = bottom + 'px';
  }

  function showViewerNotice(server) {
    if (!viewerNotice) return;
    if (!server) {
      viewerNotice.hidden = true;
      return;
    }
    if (!serverReady(server)) {
      viewerNotice.textContent = 'This server still has its placeholder host. Edit data/app-servers.json to point “' + server.name + '” at a real app proxy.';
      viewerNotice.hidden = false;
    } else if ((server.urlTemplate || '') === '{url}') {
      viewerNotice.textContent = 'Direct mode embeds the site without a proxy, so sites that block framing will not load. Pick another server if an app stays blank.';
      viewerNotice.hidden = false;
    } else {
      viewerNotice.hidden = true;
    }
  }

  function launch(app, options) {
    if (!app) return;
    currentApp = app;
    const server = getServer(currentServerId) || servers[0] || null;

    if (viewerTitle) viewerTitle.textContent = app.name;
    if (viewerIcon) {
      viewerIcon.innerHTML = '<i class="' + esc(app.icon || 'fa-solid fa-cube') + '"></i>';
      viewerIcon.style.color = app.color || '';
    }

    showViewerNotice(server);
    updateServerButton();

    if (!options || !options.silent) {
      historyLog(app);
      if (window.accountManager && typeof accountManager.recordRecent === 'function') {
        accountManager.recordRecent({ type: 'app', title: app.name, href: 'pluto://apps#' + encodeURIComponent(app.id) });
      }
    }

    positionViewer();
    viewer.hidden = false;
    void viewer.offsetHeight;
    viewer.classList.add('is-open');
    viewer.setAttribute('aria-hidden', 'false');

    if (frame) {
      frame.src = getUserFrameUrl(server, app);
    }
  }

  function getUserFrameUrl(server, app) {
    if (!server) return 'about:blank';
    if (!serverReady(server)) return 'about:blank';
    return buildFrameUrl(server, app.url);
  }

  function closeViewer() {
    if (!viewer) return;
    viewer.classList.remove('is-open');
    viewer.setAttribute('aria-hidden', 'true');
    currentApp = null;
    if (frame) frame.src = 'about:blank';
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    }
    setTimeout(() => { if (!currentApp) viewer.hidden = true; }, 190);
  }

  function openInBrowser(app) {
    closeViewer();
    if (typeof navigate === 'function') navigate(app.url);
  }

  if (viewerBack) viewerBack.addEventListener('click', closeViewer);
  if (viewerReload) viewerReload.addEventListener('click', () => {
    if (!currentApp) return;
    const server = getServer(currentServerId) || servers[0] || null;
    if (frame) frame.src = getUserFrameUrl(server, currentApp);
  });
  if (viewerOpen) viewerOpen.addEventListener('click', () => { if (currentApp) openInBrowser(currentApp); });
  if (viewerFull) {
    viewerFull.addEventListener('click', () => {
      if (!document.fullscreenElement) (viewer.requestFullscreen || viewer.webkitRequestFullscreen).call(viewer);
      else (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    });
    document.addEventListener('fullscreenchange', () => {
      const icon = viewerFull.querySelector('i');
      if (!icon) return;
      const on = !!document.fullscreenElement;
      icon.className = on ? 'fa-solid fa-compress' : 'fa-solid fa-expand';
    });
  }
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (openMenu) { closeServerMenu(); return; }
    if (currentApp) closeViewer();
  });
  window.addEventListener('resize', () => { if (currentApp) positionViewer(); });

  /* ---------- search ---------- */

  if (searchInput) {
    let timer = null;
    searchInput.addEventListener('input', () => {
      if (searchClear) searchClear.hidden = !searchInput.value;
      clearTimeout(timer);
      timer = setTimeout(() => {
        query = searchInput.value;
        renderGrid();
      }, 90);
    });
    document.addEventListener('keydown', e => {
      if (e.key !== '/') return;
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (typeof Workspaces !== 'undefined' && Workspaces.active !== 'apps') return;
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    });
  }
  if (searchClear) {
    searchClear.addEventListener('click', () => {
      if (!searchInput) return;
      searchInput.value = '';
      query = '';
      searchClear.hidden = true;
      renderGrid();
      searchInput.focus();
    });
  }

  /* ---------- routing ---------- */

  function consumeRoute() {
    const suffix = window.PluWorkspaceRouteSuffix || '';
    if (!suffix) return;
    const hash = (suffix.match(/#(.*)$/) || [, ''])[1];
    const qs = (suffix.match(/\?(.*?)(?:#|$)/) || [, ''])[1];
    const q = new URLSearchParams(qs).get('q') || '';
    if (hash) {
      let key = decodeURIComponent(hash);
      if (key.indexOf('app:') === 0) key = key.slice(4);
      const target = apps.find(a => a.id === key);
      if (target) {
        window.PluWorkspaceRouteSuffix = '';
        if (location.search) history.replaceState(null, '', location.pathname);
        launch(target);
        return;
      }
    }
    if (q) {
      window.PluWorkspaceRouteSuffix = '';
      if (searchInput) {
        searchInput.value = q;
        if (searchClear) searchClear.hidden = false;
      }
      query = q;
      renderGrid();
    }
  }

  window.addEventListener('plu-workspace-route', () => {
    if (window.PluWorkspaceRouteSuffix) consumeRoute();
  });

  /* ---------- boot ---------- */

  function loadServers() {
    return fetch(SERVERS_URL)
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : (data && data.servers) || [];
        servers = list.filter(s => s && s.id);
        const fallback = (data && data.default) || (servers[0] && servers[0].id) || '';
        let saved = '';
        try { saved = localStorage.getItem(SERVER_KEY) || ''; } catch (_) {}
        currentServerId = getServer(saved) ? saved : (getServer(fallback) ? fallback : (servers[0] && servers[0].id) || '');
        updateServerButton();
      })
      .catch(() => {
        servers = [{ id: 'direct', name: 'Direct', icon: 'fa-solid fa-globe', urlTemplate: '{url}' }];
        currentServerId = 'direct';
        updateServerButton();
      });
  }

  function loadApps() {
    return fetch(APPS_URL)
      .then(r => r.json())
      .then(list => {
        apps = (Array.isArray(list) ? list : []).filter(a => a && a.id && a.url);
        renderCategories();
        renderGrid();
      })
      .catch(() => {
        grid.innerHTML = '<div class="apps-empty"><i class="fa-solid fa-triangle-exclamation"></i><span>Failed to load apps.</span></div>';
      });
  }

  Promise.all([loadServers(), loadApps()]).then(consumeRoute);

  // Home-rail option wheel hook: open the header switcher from the wheel.
  window.openAppsServerMenu = function () {
    if (typeof Workspaces !== 'undefined' && Workspaces.active !== 'apps') return false;
    openServerMenu(serverMenu, serverBtn);
    return true;
  };
})();
