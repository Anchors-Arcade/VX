// Anchors Arcade X network stack.
//
// One browsing engine only: Scramjet. The engine code (client bundle, wasm
// and sync worker) ships with the site in scramjet/ and the service worker at
// the app root, so proxied pages always load from THIS site's own URLs —
// `scramjet/service/<encoded-url>` on the same origin. The engine's outbound
// traffic is tunneled over the wisp WebSocket to the proxy server.

// The app can be deployed at a domain root or under a subpath
// (user.github.io/repo/), so engine endpoints are resolved from this script's
// own URL instead of being hard-coded from the origin. Every page that loads
// net.js lives in the app root, and js/ always sits one level below it, so
// '../' is the app root in every deployment.
const APP_ROOT = (document.currentScript && document.currentScript.src)
  ? new URL('../', document.currentScript.src).href
  : new URL('./', location.href).href

// Full URLs for what is registered, fetched or imported directly: service
// worker scripts and scopes, workers, and dynamic imports inside them.
function appUrl(path) {
  return new URL(path, APP_ROOT).href
}

// Origin-absolute paths for engine configs that are compared against URL
// pathnames or joined onto the origin (Scramjet's prefix and its file paths).
function appPath(path) {
  return new URL(path, APP_ROOT).pathname
}

// Bare-mux keeps retrying its worker ping without ever settling when the
// worker never came up (404 script, blocked host). Everything the transport
// init awaits goes through here so a dead worker costs one bounded wait
// instead of hanging initNetStack() — and with it every navigate() — forever.
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label)), ms))
  ])
}

// The wisp endpoint of the proxy backend. Proxied pages are served from this
// origin by the service worker; only their network traffic flows through here.
const WISP_URL = 'wss://anchors-arcade-proxeyy.onrender.com/wisp/'

// Where the service worker serves proxied pages from, and where the engine's
// static assets live. The prefix must stay inside the service worker's scope,
// so it is resolved relative to the app root rather than the domain root.
const SCRAMJET_PREFIX = appPath('scramjet/service/')
const SCRAMJET_FILES = {
  wasm: appPath('scramjet/wasm.wasm'),
  all:  appPath('scramjet/all.js'),
  sync: appPath('scramjet/sync.js'),
}

const TRANSPORT_CONNECT_TIMEOUT_MS = 15000

// Single entry for the connection status bar and the lock-icon popup.
const PROXY_SERVER = { id: 'scramjet', label: 'Scramjet', location: 'Proxy server', flagSrc: '' }

const RELAY_TIER_THRESHOLDS = [
  { max: 80,        level: 0, label: 'Excellent', cls: 'tier-0' },
  { max: 180,       level: 1, label: 'Good',      cls: 'tier-1' },
  { max: 350,       level: 2, label: 'Fair',      cls: 'tier-2' },
  { max: Infinity,  level: 3, label: 'Poor',      cls: 'tier-3' },
]
const RELAY_HISTORY_MAX = 30
const relayLatencyHistory = []

function relayLatencyTier(latencyMs) {
  if (!Number.isFinite(latencyMs)) return { level: -1, label: 'Unknown', cls: '' }
  return RELAY_TIER_THRESHOLDS.find(t => latencyMs <= t.max) || RELAY_TIER_THRESHOLDS[RELAY_TIER_THRESHOLDS.length - 1]
}

function recordRelayLatency(latencyMs) {
  if (!Number.isFinite(latencyMs)) return
  relayLatencyHistory.push({ ms: latencyMs, t: Date.now() })
  if (relayLatencyHistory.length > RELAY_HISTORY_MAX) relayLatencyHistory.shift()
}

function relaySparklinePath(width = 96, height = 22) {
  if (relayLatencyHistory.length < 2) return ''
  const SCALE_MAX = 400
  const pad = 2
  const usableH = height - pad * 2
  const step = width / (relayLatencyHistory.length - 1)
  return relayLatencyHistory.map((s, i) => {
    const x = i * step
    const ms = Math.min(s.ms, SCALE_MAX)
    const y = pad + usableH - (ms / SCALE_MAX) * usableH
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}

function relaySignalBars(level) {
  const filled = level < 0 ? 0 : Math.max(1, 4 - level)
  const heights = [0.28, 0.48, 0.72, 1]
  const cls = level >= 0 ? ['tier-0', 'tier-1', 'tier-2', 'tier-3'][level] : ''
  let out = `<span class="relay-bars${cls ? ' ' + cls : ''}" aria-hidden="true">`
  for (let i = 1; i <= 4; i++) {
    out += `<span class="relay-bar${i <= filled ? ' on' : ''}" style="height:${Math.round(heights[i - 1] * 100)}%"></span>`
  }
  return out + '</span>'
}

function _relayBar() { return document.getElementById('relay-bar') }
function _relayLabel() { return document.getElementById('relay-bar-label') }

function formatRelayLatency(latencyMs) {
  return Number.isFinite(latencyMs) ? `${Math.round(latencyMs)} ms` : 'pending'
}

let currentRelayLatencyMs = null
let currentRelayStatus = 'connecting'

function setRelayStatus(state, details = {}) {
  const bar = _relayBar()
  const label = _relayLabel()
  const serverLabel = details.serverLabel || PROXY_SERVER.label
  const latency = details.latency ?? currentRelayLatencyMs

  currentRelayStatus = state
  if (state === 'ok' && Number.isFinite(latency)) recordRelayLatency(latency)
  if (!bar) return

  bar.classList.remove('relay-ok', 'relay-err', 'relay-connecting', 'relay-disconnecting')
  if (state === 'connecting') {
    bar.classList.add('relay-connecting')
    if (label) label.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Connecting to ${serverLabel}...`
  } else if (state === 'disconnecting') {
    bar.classList.add('relay-disconnecting')
    if (label) label.innerHTML = `<i class="fa-solid fa-plug"></i> Disconnecting from ${serverLabel}...`
  } else if (state === 'ok') {
    bar.classList.add('relay-ok')
    if (label) label.innerHTML = `<i class="fa-solid fa-circle-check"></i> Connected: ${serverLabel}${Number.isFinite(latency) ? ` (${formatRelayLatency(latency)})` : ''}`
  } else if (state === 'err') {
    bar.classList.add('relay-err')
    if (label) label.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> Couldn't connect to ${serverLabel}`
  }
}

const NET_MODE_KEY = 'plu_net_mode'
const LEGACY_NET_MODE_KEY = 'plu_proxy_engine'

// Every previous engine selection collapses onto the Scramjet engine: an
// account restored on a new device, or an old localStorage value, must not
// leave the browser pointing at an engine that no longer exists.
function loadNetMode() {
  return 'scramjet'
}

let selectedNet = loadNetMode()
let runtimeReady = false
let runtimeController = null

function getNetEngine() { return selectedNet }

function setNetEngine(engine) {
  // Scramjet is the only engine; legacy values are silently folded onto it.
  if (engine !== 'scramjet') return
  selectedNet = engine
  localStorage.setItem(NET_MODE_KEY, engine)
  if (window.accountManager && typeof window.accountManager.scheduleSettingsSync === 'function') {
    window.accountManager.scheduleSettingsSync()
  }
}

window.getNetEngine = getNetEngine
window.setNetEngine = setNetEngine

// The previous engine set stored its Scramjet config in the `$scramjet`
// IndexedDB database under a different prefix. If that stale config (or a
// database with missing stores) is still there, the new engine would read the
// old prefix and route nothing. Purge it once; afterwards the database holds
// live engine data (cookies included) and must be left alone.
const SCRAMJET_DB_NAME = '$scramjet'
const SCRAMJET_DB_STORES = ['config', 'cookies', 'redirectTrackers', 'referrerPolicies', 'publicSuffixList']

function purgeStaleScramjetData() {
  return new Promise(resolve => {
    let req
    try {
      req = indexedDB.open(SCRAMJET_DB_NAME)
    } catch (e) {
      resolve()
      return
    }
    req.onsuccess = () => {
      const db = req.result
      const missing = SCRAMJET_DB_STORES.filter(s => !db.objectStoreNames.contains(s))
      let stale = missing.length > 0
      if (!stale) {
        try {
          const tx = db.transaction('config', 'readonly')
          const get = tx.objectStore('config').get('config')
          get.onsuccess = () => {
            db.close()
            const config = get.result
            const prefix = config && typeof config.prefix === 'string' ? config.prefix : ''
            if (!prefix.endsWith('scramjet/service/')) stale = true
            finish(stale)
          }
          get.onerror = () => { db.close(); finish(true) }
          return
        } catch (e) {
          db.close()
          finish(true)
          return
        }
      }
      db.close()
      finish(stale)
    }
    req.onerror = req.onblocked = () => resolve()

    function finish(stale) {
      if (!stale) { resolve(); return }
      let del
      try {
        del = indexedDB.deleteDatabase(SCRAMJET_DB_NAME)
      } catch (e) {
        resolve()
        return
      }
      del.onsuccess = del.onerror = del.onblocked = () => resolve()
    }
  })
}

async function initRuntime() {
  if (runtimeReady) return true
  if (typeof $scramjetLoadController === 'undefined') return false
  if (!('serviceWorker' in navigator)) return false

  try {
    await purgeStaleScramjetData()
    await navigator.serviceWorker.register(appUrl('sw.js'), { scope: APP_ROOT })

    const { ScramjetController } = $scramjetLoadController()
    runtimeController = new ScramjetController({
      prefix: SCRAMJET_PREFIX,
      files: SCRAMJET_FILES,
    })
    await runtimeController.init()
    runtimeReady = true
    return true
  } catch (e) {
    console.warn('Scramjet init failed:', e)
    return false
  }
}

let bridgeReady = false
let bridgeConnection = null
let pendingInitPromise = null
let netTransportGeneration = 0

async function initBridge() {
  if (bridgeReady) return true
  if (pendingInitPromise) return pendingInitPromise

  const generation = netTransportGeneration
  pendingInitPromise = (async () => {
    if (!window.BareMux) {
      console.warn('BareMux not loaded')
      setRelayStatus('err')
      return false
    }

    try {
      const startedAt = performance.now()
      bridgeConnection = new BareMux.BareMuxConnection(appUrl('bridge/worker.js'))
      await withTimeout(
        bridgeConnection.setTransport(appUrl('mesh/index.mjs'), [{ wisp: WISP_URL }]),
        TRANSPORT_CONNECT_TIMEOUT_MS,
        'proxy transport init timed out'
      )
      if (generation !== netTransportGeneration) return false
      bridgeReady = !!(await withTimeout(
        bridgeConnection.getTransport(),
        TRANSPORT_CONNECT_TIMEOUT_MS,
        'proxy transport check timed out'
      ))
      currentRelayLatencyMs = bridgeReady
        ? Math.max(1, Math.round(performance.now() - startedAt))
        : null
      setRelayStatus(bridgeReady ? 'ok' : 'err', { latency: currentRelayLatencyMs })
      return bridgeReady
    } catch (e) {
      console.warn('Proxy transport initialization failed:', e)
      currentRelayLatencyMs = null
      setRelayStatus('err')
      return false
    } finally {
      pendingInitPromise = null
    }
  })()

  return pendingInitPromise
}

async function initNetStack() {
  await initRuntime()
  await initBridge()
}

function getNetUrl(url) {
  if (runtimeReady && runtimeController) return runtimeController.encodeUrl(url)
  return url
}

function getRealUrlFromNet(maybeNetUrl) {
  if (runtimeReady && runtimeController) {
    try {
      if (maybeNetUrl.includes('scramjet/service/')) return runtimeController.decodeUrl(maybeNetUrl)
    } catch (e) {}
  }
  return maybeNetUrl
}

function getRelayConnectionSummary() {
  return {
    id: PROXY_SERVER.id,
    label: PROXY_SERVER.label,
    latency: currentRelayLatencyMs,
    latencyText: formatRelayLatency(currentRelayLatencyMs),
    status: currentRelayStatus,
  }
}

window.getRelayConnectionSummary = getRelayConnectionSummary

// Remote cloud-browser sessions were part of the removed engine set. Kept as
// a no-op because navigation.js still calls it unconditionally between page
// loads; doing nothing is exactly the right behaviour for them now.
async function endRemoteSession() {}
window.endRemoteSession = endRemoteSession

document.addEventListener('DOMContentLoaded', () => {
  setRelayStatus('connecting')
  initNetStack().catch(() => {})
})
