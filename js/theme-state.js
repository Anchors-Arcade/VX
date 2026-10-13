const BrowserThemeState = (() => {
  const THEME_KEY = 'plu_theme'
  const SETTINGS_KEY = 'plu_settings'
  const DEFAULT_THEME_STATE = {
    mode: 'dark',
    accentColor: '#7C5CFF',
    bgPreset: 'minimal',
    bgEffect: 'particles',
    bgImage: '',
    bgSource: 'default',
  }

  // `default` renders bg-default.html with the stock theme; `custom` renders bg.html with the
  // effect/wallpaper/preset the user picks.
  const BG_SOURCES = {
    default: { label: 'Default', icon: 'fa-solid fa-circle-half-stroke' },
    custom:  { label: 'Custom',  icon: 'fa-solid fa-sliders' },
  }

  const BG_EFFECTS = {
    particles: { label: 'Particles', icon: 'fa-circle-nodes' },
    birds:     { label: 'Birds',     icon: 'fa-dove' },
    fog:       { label: 'Fog',       icon: 'fa-smog' },
    waves:     { label: 'Waves',     icon: 'fa-water' },
    clouds:    { label: 'Clouds',    icon: 'fa-cloud' },
    globe:     { label: 'Globe',     icon: 'fa-earth-americas' },
    net:       { label: 'Net',       icon: 'fa-border-all' },
    trunk:     { label: 'Trunk',     icon: 'fa-tree' },
    topology:  { label: 'Topology',  icon: 'fa-share-nodes' },
    dots:      { label: 'Dots',      icon: 'fa-ellipsis' },
    rings:     { label: 'Rings',     icon: 'fa-ring' },
    halo:      { label: 'Halo',      icon: 'fa-circle-half-stroke' },
    none:      { label: 'None',      icon: 'fa-ban' },
  }

  const BACKGROUND_IMAGES = [
    { id: 'none',              label: 'None',              file: '',                                tint: '#000000', tintOpacity: 0.15 },
    { id: 'coast',             label: 'Coast',             file: 'img/backgrounds/coast.jpg',            tint: '#0a1a28', tintOpacity: 0.14 },
    { id: 'color-burst',       label: 'Color Burst',       file: 'img/backgrounds/color-burst.jpg',     tint: '#4a1a00', tintOpacity: 0.3 },
    { id: 'desert',            label: 'Desert',            file: 'img/backgrounds/desert.jpg',           tint: '#5c3a00', tintOpacity: 0.16 },
    { id: 'galaxy',            label: 'Galaxy',            file: 'img/backgrounds/galaxy.jpg',           tint: '#0a1628', tintOpacity: 0.45 },
    { id: 'lake-dusk',         label: 'Lake Dusk',         file: 'img/backgrounds/lake-dusk.jpg',        tint: '#3a1a00', tintOpacity: 0.7 },
    { id: 'lake-twilight',     label: 'Lake Twilight',     file: 'img/backgrounds/lake-twilight.jpg',    tint: '#1a0a30', tintOpacity: 0.7 },
    { id: 'light-stream',      label: 'Light Stream',      file: 'img/backgrounds/light-stream.jpg',     tint: '#0a2e1a', tintOpacity: 0.70 },
    { id: 'lightning',         label: 'Lightning',         file: 'img/backgrounds/lightning.jpg',        tint: '#0a0a20', tintOpacity: 0.4 },
    { id: 'lines',             label: 'Lines',             file: 'img/backgrounds/lines.png',            tint: '#1a1a1a', tintOpacity: 0.7 },
    { id: 'mojave',            label: 'Mojave',            file: 'img/backgrounds/mojave.jpg',           tint: '#2a1040', tintOpacity: 0.20 },
    { id: 'refraction-green',  label: 'Refraction Green',  file: 'img/backgrounds/refraction-green.png', tint: '#2a2a2a', tintOpacity: 0.65 },
    { id: 'refraction-purple', label: 'Refraction Purple', file: 'img/backgrounds/refraction-purple.png', tint: '#1a1a1a', tintOpacity: 0.65 },
    { id: 'swirls',            label: 'Swirls',            file: 'img/backgrounds/swirls.png',           tint: '#1a1a2e', tintOpacity: 0.14 },
  ]

  function normalizeBgImage(value) {
    if (typeof value !== 'string') return ''
    if (value === '') return ''
    const match = BACKGROUND_IMAGES.find(img => img.id === value || img.file === value)
    return match ? match.id : ''
  }

  function normalizeBgSource(value, fallback) {
    const source = typeof value === 'string' ? value.trim().toLowerCase() : ''
    if (BG_SOURCES[source]) return source
    return fallback && BG_SOURCES[fallback] ? fallback : DEFAULT_THEME_STATE.bgSource
  }

  function formatDateParam(d) {
    const pad = n => String(n).padStart(2, '0')
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
  }

  // Versioned so a changed background page isn't served from cache; the date rides along so a
  // simulated day reaches the background page too.
  const BG_SOURCE_VERSION = 3

  function getBackgroundSourceURL(source) {
    const page = normalizeBgSource(source) === 'custom' ? 'bg.html' : 'bg-default.html'
    const base = page + '?v=' + BG_SOURCE_VERSION
    return _dateOverride ? base + '&date=' + formatDateParam(_dateOverride) : base
  }

  // The default background page and its stock accent live in data/bg-default.json so they can change
  // without a code edit. Everything falls back to the built-in defaults when the file is unavailable.
  const DEFAULT_CONFIG_URL = 'data/bg-default.json'
  let _defaultConfig = null

  // Testing hook: a host page can pin "today" so another day's background/theme can be previewed
  // without changing the system clock. Pass null to go back to the real clock.
  let _dateOverride = null
  function overrideDate(date) {
    _dateOverride = date == null ? null : (date instanceof Date ? date : new Date(date))
    if (_dateOverride && isNaN(_dateOverride.getTime())) _dateOverride = null
    return _dateOverride
  }
  function currentDate() {
    return _dateOverride || new Date()
  }

  // Today's image + accent + darkening tint from data/bg-default.json. Months split into weeks
  // (days 1-7, 8-14, ...) carrying the accent colour, and days carrying the image shown full-bleed.
  // Each resolves through a day override -> its week / the config's `default` block -> the built-in
  // stock values. `tint` is per-day so a single day can be darkened without touching its week.
  function resolveDailyBackground(config, date) {
    const cfg = config && typeof config === 'object' ? config : {}
    const fallback = cfg.default && typeof cfg.default === 'object' ? cfg.default : {}
    const d = date instanceof Date ? date : currentDate()
    const months = cfg.months && typeof cfg.months === 'object' ? cfg.months : {}
    const month = months[String(d.getMonth() + 1)]
    const days = month && month.days && typeof month.days === 'object' ? month.days : {}
    const weeks = month && month.weeks && typeof month.weeks === 'object' ? month.weeks : {}
    const entry = days[String(d.getDate())] || {}
    const week = weeks[String(Math.ceil(d.getDate() / 7))] || {}
    const pick = (value, fallbackValue) => {
      const chosen = value || fallbackValue
      return typeof chosen === 'string' ? chosen : (chosen && chosen.src) || ''
    }
    return {
      image: pick(entry.image, fallback.image),
      accentColor: pick(entry.accentColor, week.accentColor || fallback.accentColor),
      tint: normalizeTint(entry.tint == null ? fallback.tint : entry.tint),
      // First *valid* name wins, so a typo in a day falls through to its week rather than blanking
      // the logo. A day listing its own accent keeps that accent's colourway, so an explicit
      // per-day colour (the white ones, say) still brands the app accordingly.
      logo: normalizeLogoId(entry.logo) || logoForAccent(entry.accentColor) ||
            normalizeLogoId(week.logo) || normalizeLogoId(fallback.logo),
    }
  }

  function defaultThemeAccent() {
    const resolved = resolveDailyBackground(_defaultConfig)
    return isHexColor(resolved.accentColor) ? resolved.accentColor.trim().toLowerCase() : DEFAULT_THEME_STATE.accentColor
  }

  // Today's logo colourway from the config, or '' when the day's entry names none.
  function defaultThemeLogo() {
    return normalizeLogoId(resolveDailyBackground(_defaultConfig).logo)
  }

  // The logo the accent colour implies on its own, or '' when that accent has no colourway.
  function logoForAccent(accentColor) {
    return normalizeLogoId(ACCENT_ICON_MAP[isHexColor(accentColor) ? accentColor.trim().toLowerCase() : ''])
  }

  function loadDefaultBackgroundConfig() {
    if (_defaultConfig || !window.fetch) return Promise.resolve(_defaultConfig)
    return fetch(DEFAULT_CONFIG_URL, { cache: 'no-cache' })
      .then(res => (res.ok ? res.json() : null))
      .then(cfg => {
        if (cfg && typeof cfg === 'object') {
          _defaultConfig = cfg
          // The daily palette arrives late, and it owns both the accent and the logo. Tell the
          // page to repaint so nothing is left showing the pre-config stock branding. Fires once,
          // because _defaultConfig is now set and later calls return before reaching here.
          try {
            window.dispatchEvent(new MessageEvent('message', { data: { type: 'plu_theme_refresh' } }))
          } catch (_) {}
        }
        return _defaultConfig
      })
      .catch(() => null)
  }

  const BACKGROUND_PRESETS = {
    minimal: {
      label: 'Minimal',
      preview: 'linear-gradient(135deg,#080B18,#151D35)',
      dark: { base: '#080B18', surface: '#151D35', surface2: '#10162A', accent: '#7C5CFF' },
      light: { base: '#eef2f7', surface: '#ffffff', surface2: '#e8edf4', accent: '#3b82f6' },
    },
    aurora: {
      label: 'Aurora',
      preview: 'linear-gradient(135deg,#080B18,#1d1040)',
      dark: { base: '#080B18', surface: '#151D35', surface2: '#1a2140', accent: '#28D7C5' },
      light: { base: '#ecf8f5', surface: '#ffffff', surface2: '#dff4ec', accent: '#1c9c88' },
    },
    dusk: {
      label: 'Dusk',
      preview: 'linear-gradient(135deg,#1a0533,#2d1b69)',
      dark: { base: '#1c1232', surface: '#2a1d4d', surface2: '#22173f', accent: '#b794f6' },
      light: { base: '#f4effd', surface: '#ffffff', surface2: '#ece4fb', accent: '#7c3aed' },
    },
    ember: {
      label: 'Ember',
      preview: 'linear-gradient(135deg,#1a0800,#3d1a00)',
      dark: { base: '#20110b', surface: '#332018', surface2: '#2a1812', accent: '#fb923c' },
      light: { base: '#fff3eb', surface: '#ffffff', surface2: '#fde7d7', accent: '#ea580c' },
    },
    ocean: {
      label: 'Ocean',
      preview: 'linear-gradient(135deg,#001a2c,#003554)',
      dark: { base: '#081c2d', surface: '#11314a', surface2: '#0c253a', accent: '#38bdf8' },
      light: { base: '#edf7ff', surface: '#ffffff', surface2: '#dbeefe', accent: '#0284c7' },
    },
    ash: {
      label: 'Ash',
      preview: 'linear-gradient(135deg,#111111,#222222)',
      dark: { base: '#141414', surface: '#212121', surface2: '#1a1a1a', accent: '#d4d4d8' },
      light: { base: '#f5f5f5', surface: '#ffffff', surface2: '#ebebeb', accent: '#6b7280' },
    },
    rose: {
      label: 'Rose',
      preview: 'linear-gradient(135deg,#1a0010,#2d0020)',
      dark: { base: '#1d0d19', surface: '#321727', surface2: '#27121f', accent: '#f9a8d4' },
      light: { base: '#fff0f6', surface: '#ffffff', surface2: '#fde2ef', accent: '#db2777' },
    },
    none: {
      label: 'None',
      preview: 'linear-gradient(135deg,#080B18,#10162A)',
      dark: { base: '#080B18', surface: '#151D35', surface2: '#10162A', accent: '#7C5CFF' },
      light: { base: '#eef2f7', surface: '#ffffff', surface2: '#e8edf4', accent: '#3b82f6' },
    },
  }

  // Brand logo colourways that ship in img/logos (icon-<id>.png). The daily background config
  // names one of these per entry so the logo can follow the season's palette.
  const LOGO_IDS = [
    'violet', 'teal', 'blue', 'emerald', 'amber', 'red', 'cyan', 'fuchsia', 'white',
  ]

  // An unknown or missing name returns '' so callers can fall back to the accent-derived logo.
  function normalizeLogoId(value) {
    const id = typeof value === 'string' ? value.trim().toLowerCase() : ''
    return LOGO_IDS.indexOf(id) === -1 ? '' : id
  }

  // How much the daily background image should be darkened. 0 leaves the art untouched,
  // 100 is solid black; anything else is clamped into that range.
  function normalizeTint(value) {
    const n = typeof value === 'string' ? parseFloat(value) : value
    if (typeof n !== 'number' || !isFinite(n)) return 0
    return Math.min(100, Math.max(0, n))
  }

  function isHexColor(value) {
    return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value.trim())
  }

  function normalizeAccentColor(value) {
    return isHexColor(value) ? value.trim().toLowerCase() : DEFAULT_THEME_STATE.accentColor
  }

  function normalizeMode(value) {
    const mode = typeof value === 'string' ? value.trim().toLowerCase() : ''
    return ['dark', 'light'].includes(mode) ? mode : DEFAULT_THEME_STATE.mode
  }

  function normalizeBgPreset(value) {
    const preset = typeof value === 'string' ? value.trim().toLowerCase() : ''
    return BACKGROUND_PRESETS[preset] ? preset : DEFAULT_THEME_STATE.bgPreset
  }

  function getBackgroundImageURL(id) {
    const match = BACKGROUND_IMAGES.find(img => img.id === id)
    return match ? match.file : ''
  }

  function getBackgroundImageTint(id) {
    const match = BACKGROUND_IMAGES.find(img => img.id === id)
    return match ? { color: match.tint || '#000000', opacity: match.tintOpacity || 0.15 } : { color: '#000000', opacity: 0.15 }
  }

  function normalizeBgEffect(value) {
    const effect = typeof value === 'string' ? value.trim().toLowerCase() : ''
    return BG_EFFECTS[effect] ? effect : DEFAULT_THEME_STATE.bgEffect
  }

  function normalizeThemeState(raw) {
    const next = raw && typeof raw === 'object' ? raw : {}
    const effect = normalizeBgEffect(next.bgEffect)
    const image  = normalizeBgImage(next.bgImage)
    return {
      mode: normalizeMode(next.mode),
      accentColor: normalizeAccentColor(next.accentColor),
      bgPreset: normalizeBgPreset(next.bgPreset),
      bgEffect: image ? 'none' : effect,
      bgImage: effect !== 'none' ? '' : image,
      bgSource: normalizeBgSource(next.bgSource),
    }
  }

  // A theme saved before background sources existed belongs to the custom system. A brand-new
  // visitor has no stored theme at all and should start on the default background.
  function inferBgSource(rawTheme, extra) {
    if (rawTheme && rawTheme.bgSource !== undefined) return rawTheme.bgSource
    if (extra && extra.bgSource !== undefined) return extra.bgSource
    if (rawTheme && Object.keys(rawTheme).length) return 'custom'
    if (extra && Object.keys(extra).length) return 'custom'
    return DEFAULT_THEME_STATE.bgSource
  }

  const LEGACY_THEME_KEY = 'cg_theme'
  const LEGACY_SETTINGS_KEY = 'cg_settings'

  function loadRawThemeState() {
    try {
      const raw = localStorage.getItem(THEME_KEY)
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  }

  function loadRawLegacyThemeState() {
    try {
      const raw = localStorage.getItem(LEGACY_THEME_KEY)
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  }

  function loadRawSettingsState() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY)
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  }

  function loadRawLegacySettingsState() {
    try {
      const raw = localStorage.getItem(LEGACY_SETTINGS_KEY)
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  }

  function getLegacyMode(rawTheme, rawSettings) {
    if (rawTheme.mode !== undefined) {
      return normalizeMode(rawTheme.mode)
    }

    const legacyPreset = String(rawTheme.preset || '').trim().toLowerCase()
    if (legacyPreset === 'light') return 'light'

    if (rawSettings.theme !== undefined) {
      return normalizeMode(rawSettings.theme)
    }

    return DEFAULT_THEME_STATE.mode
  }

  function loadThemeState() {
    const rawTheme = loadRawThemeState()
    const rawSettings = loadRawSettingsState()

    const hasOwn = Object.keys(rawTheme).length || Object.keys(rawSettings).length

    if (!hasOwn) {
      const legacyTheme = loadRawLegacyThemeState()
      const legacySettings = loadRawLegacySettingsState()
    return normalizeThemeState({
      mode: getLegacyMode(legacyTheme, legacySettings),
      accentColor: legacyTheme.accentColor || legacySettings.accentColor,
      bgPreset: legacyTheme.bgPreset || legacyTheme.bgStyle || legacySettings.bgPreset || legacySettings.bgStyle,
      bgEffect: legacyTheme.bgEffect || legacySettings.bgStyle,
      bgImage: legacyTheme.bgImage || legacySettings.bgImage,
      bgSource: inferBgSource(legacyTheme, legacySettings),
    })
    }

    return normalizeThemeState({
      mode: getLegacyMode(rawTheme, rawSettings),
      accentColor: rawTheme.accentColor || rawSettings.accentColor,
      bgPreset: rawTheme.bgPreset || rawTheme.bgStyle || rawSettings.bgPreset || rawSettings.bgStyle,
      bgEffect: rawTheme.bgEffect || rawSettings.bgStyle,
      bgImage: rawTheme.bgImage || rawSettings.bgImage,
      bgSource: inferBgSource(rawTheme),
    })
  }

  // In default mode the stock background and colour theme are in use, so the rendered look ignores
  // any previously customised accent/preset without discarding it (switching back to custom restores it).
  function getEffectiveThemeState(state) {
    const current = state && typeof state === 'object' ? state : loadThemeState()
    if (normalizeBgSource(current.bgSource) !== DEFAULT_THEME_STATE.bgSource) return current
    return {
      ...current,
      accentColor: defaultThemeAccent(),
      bgPreset: DEFAULT_THEME_STATE.bgPreset,
    }
  }

  function getDefaultAccent(mode, presetKey) {
    const preset = getBackgroundPreset(presetKey)
    if (mode === 'light') return preset.light.accent
    return preset.dark.accent
  }

  function saveThemeState(patch) {
    const current = loadThemeState()
    const requestedMode = patch && patch.mode !== undefined ? patch.mode : current.mode
    const requestedPreset = patch && patch.bgPreset !== undefined ? patch.bgPreset : current.bgPreset
    const normalizedMode = normalizeMode(requestedMode)
    const normalizedPreset = normalizeBgPreset(requestedPreset)
    const shouldUsePresetAccent = patch && patch.accentColor === undefined && patch && (patch.mode !== undefined || patch.bgPreset !== undefined)
    const next = normalizeThemeState({
      ...current,
      ...patch,
      mode: normalizedMode,
      bgPreset: normalizedPreset,
      bgImage: patch && patch.bgImage !== undefined ? patch.bgImage : current.bgImage,
      accentColor: patch && patch.accentColor !== undefined
        ? patch.accentColor
        : (shouldUsePresetAccent
          ? getDefaultAccent(normalizedMode, normalizedPreset)
          : current.accentColor),
    })
    localStorage.setItem(THEME_KEY, JSON.stringify(next))

    const settings = loadRawSettingsState()
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      ...settings,
      theme: next.mode,
      accentColor: next.accentColor,
      bgStyle: next.bgEffect,
      bgPreset: next.bgPreset,
      bgImage: next.bgImage || '',
      bgSource: next.bgSource,
    }))

    if (window.accountManager && typeof window.accountManager.scheduleSettingsSync === 'function') {
      window.accountManager.scheduleSettingsSync()
    }

    return next
  }

  function getBackgroundPreset(key) {
    const presetKey = normalizeBgPreset(key)
    return { key: presetKey, ...BACKGROUND_PRESETS[presetKey] }
  }

  const ACCENT_ICON_MAP = {
    '#7C5CFF': 'violet',
    '#28D7C5': 'teal',
    '#7c3aed': 'violet',
    '#3c5085': 'blue',
    '#059669': 'emerald',
    '#d97706': 'amber',
    '#dc2626': 'red',
    '#0891b2': 'cyan',
    '#c026d3': 'fuchsia',
    '#ffffff': 'white',
    // Legacy upstream accents keep resolving to a shipped colourway.
    '#e8175d': 'violet',
  }

  function getAccentIconFile() {
    const state = getEffectiveThemeState()
    // With the stock background the day's entry owns the palette, so let it pick the logo too;
    // a custom background keeps following the accent the user chose.
    if (normalizeBgSource(state.bgSource) === DEFAULT_THEME_STATE.bgSource) {
      const daily = defaultThemeLogo()
      if (daily) return daily
    }
    return ACCENT_ICON_MAP[normalizeAccentColor(state.accentColor)] || 'violet'
  }

  function getAccentIconPath() {
    return `img/logos/icon-${getAccentIconFile()}.png`
  }

  return {
    THEME_KEY,
    SETTINGS_KEY,
    DEFAULT_THEME_STATE,
    BACKGROUND_PRESETS,
    BACKGROUND_IMAGES,
    BG_EFFECTS,
    BG_SOURCES,
    loadThemeState,
    saveThemeState,
    getDefaultAccent,
    normalizeThemeState,
    getEffectiveThemeState,
    getBackgroundSourceURL,
    getBackgroundPreset,
    getBackgroundImageURL,
    getBackgroundImageTint,
    getAccentIconFile,
    getAccentIconPath,
    loadDefaultBackgroundConfig,
    resolveDailyBackground,
    normalizeTint,
    normalizeLogoId,
    LOGO_IDS,
    getDefaultThemeAccent: defaultThemeAccent,
    getDefaultThemeLogo: defaultThemeLogo,
    overrideDate,
    formatDateParam,
  }
})()

window.BrowserThemeState = BrowserThemeState
