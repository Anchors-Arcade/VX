/*
 * OptionWheel — vanilla ES-module port of the React <OptionWheel /> control.
 *
 *   import OptionWheel from './option-wheel.js'
 *
 *   const wheel = OptionWheel(el, {
 *     items: ['Ambient', 'House', 'Techno'],
 *     defaultSelected: 1,
 *     side: 'right',
 *     onChange: (index, item) => {}
 *   })
 *
 *   wheel.setItems(['A', 'B', 'C'], { selected: 0 })
 *   wheel.setSelected(2)
 *   wheel.getSelected()   // { index, item }
 *   wheel.destroy()
 *
 * The motion model is the original one: a single rAF loop eases the current
 * position toward its target with frame-rate independent smoothing, then lays
 * every option along a circle whose radius keeps neighbours exactly one row
 * apart — so `tilt` decides how tightly the list curls, `curve` how far the
 * arc bows away from the row axis, and `fade`/`blur` how the far options sink.
 * Wheel scrolling, dragging, arrow keys and item clicks all feed the same
 * target, and the list snaps to a whole option when the gesture ends.
 *
 * Styling lives in css/option-wheel.css; the element only carries its own CSS
 * variables, exactly like the component's inline style object did.
 */

const DEFAULT_ITEMS = [
  'Ambient',
  'House',
  'Techno',
  'Jazz',
  'Lo-Fi',
  'Synthwave',
  'Trance',
  'Funk',
  'Disco',
  'Hip-Hop',
  'Chillwave',
  'Drum & Bass'
]

const DEFAULTS = {
  items: DEFAULT_ITEMS,
  defaultSelected: 3,
  onChange: null,
  /** Called with (index, item) when an option is clicked or confirmed with Enter. */
  onItemClick: null,
  textColor: '#a6a6a6',
  activeColor: '#ffffff',
  side: 'left',
  fontSize: 3,
  spacing: 1.4,
  curve: 1,
  tilt: 6,
  blur: 2,
  fade: 0.25,
  minOpacity: 0.05,
  smoothing: 200,
  inset: 80,
  loop: false,
  draggable: true,
  soundUrl: '',
  soundVolume: 0.5,
  className: '',
  ariaLabel: 'Option wheel'
}

const DRAG_THRESHOLD = 4
const TICK_GAP_MS = 70
const WHEEL_SETTLE_MS = 140

function labelOf(item) {
  return typeof item === 'string' ? item : (item && item.label) || ''
}

export default function OptionWheel(root, options = {}) {
  if (!root) throw new Error('OptionWheel: a root element is required')

  const cfg = { ...DEFAULTS, ...options }
  const itemEls = []

  let items = Array.isArray(cfg.items) ? cfg.items.slice() : []
  let pos = Number(cfg.defaultSelected) || 0
  let target = pos
  let selected = Math.round(pos)
  let rowH = 0
  let raf = null
  let lastFrame = 0
  let wheelTimer = null
  let drag = null
  let dragMoved = false
  let audio = null
  let audioUrl = ''
  let lastTick = 0

  root.classList.add('option-wheel')
  if (cfg.side === 'right') root.classList.add('option-wheel--right')
  if (cfg.className) root.classList.add(...String(cfg.className).split(/\s+/).filter(Boolean))
  root.setAttribute('role', 'listbox')
  root.setAttribute('aria-label', cfg.ariaLabel)
  if (!root.hasAttribute('tabindex')) root.tabIndex = 0
  applyThemeVars()

  function remPx() {
    const value = parseFloat(getComputedStyle(document.documentElement).fontSize)
    return Number.isFinite(value) && value > 0 ? value : 16
  }

  function applyThemeVars() {
    root.style.setProperty('--ow-text-color', cfg.textColor)
    root.style.setProperty('--ow-active-color', cfg.activeColor)
    root.style.setProperty('--ow-font-size', cfg.fontSize + 'rem')
    root.style.setProperty('--ow-inset', cfg.inset + 'px')
  }

  function measure() {
    rowH = Math.max(cfg.fontSize * cfg.spacing * remPx(), 1)
  }

  function buildItems() {
    for (const el of itemEls) el.remove()
    itemEls.length = 0
    items.forEach((item, index) => {
      const el = document.createElement('div')
      el.className = 'option-wheel__item'
      el.setAttribute('role', 'option')
      el.textContent = labelOf(item)
      el.addEventListener('click', () => handleItemClick(index))
      root.appendChild(el)
      itemEls.push(el)
    })
    paintSelection()
  }

  function paintSelection() {
    itemEls.forEach((el, index) => {
      const isSelected = index === selected
      el.classList.toggle('option-wheel__item--selected', isSelected)
      el.setAttribute('aria-selected', isSelected ? 'true' : 'false')
    })
  }

  // Single rAF loop: ease toward the target, then place every option along the
  // curve based on its distance from the current position.
  function runFrame(now) {
    const dt = Math.min((now - lastFrame) / 1000, 0.05)
    lastFrame = now
    const count = items.length
    const tau = Math.max(cfg.smoothing, 1) / 1000
    const k = 1 - Math.exp(-dt / tau)

    let next = pos + (target - pos) * k
    const settled = Math.abs(target - next) < 0.001
    if (settled) next = target
    pos = next

    const mirror = cfg.side === 'right' ? -1 : 1
    // A radius that keeps one row between neighbours, so tilt sets the curl.
    const tiltRad = (cfg.tilt * Math.PI) / 180
    const radius = tiltRad > 0.0005 ? rowH / tiltRad : 0

    for (let i = 0; i < count; i++) {
      const el = itemEls[i]
      if (!el) continue
      let d = i - next
      if (cfg.loop && count > 1) {
        d = ((d % count) + count) % count
        if (d > count / 2) d -= count
      }
      const dist = Math.abs(d)
      let x = 0
      let y = d * rowH
      let rot = 0
      if (radius > 0) {
        const ang = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, d * tiltRad))
        y = radius * Math.sin(ang)
        x = -mirror * radius * (1 - Math.cos(ang)) * cfg.curve
        rot = (mirror * ang * 180) / Math.PI
      }
      const opacity = Math.max(cfg.minOpacity, 1 - dist * cfg.fade)
      el.style.transform = `translate(${x.toFixed(2)}px, calc(${y.toFixed(2)}px - 50%)) rotate(${rot.toFixed(3)}deg)`
      el.style.opacity = String(opacity)
      // A row that has faded out must not stay clickable.
      el.style.pointerEvents = opacity <= 0.02 ? 'none' : ''
      el.style.filter = cfg.blur > 0 ? `blur(${(dist * cfg.blur).toFixed(2)}px)` : 'none'
      el.style.zIndex = String(Math.round(1000 - dist * 10))
    }

    raf = settled ? null : requestAnimationFrame(runFrame)
  }

  function startLoop() {
    if (raf != null) cancelAnimationFrame(raf)
    lastFrame = performance.now()
    raf = requestAnimationFrame(runFrame)
  }

  // Optional tick on selection change, throttled so fast scrolling can't spam
  // it, with playback failures (autoplay policies) silently ignored.
  function playTick() {
    if (!cfg.soundUrl) return
    const now = performance.now()
    if (now - lastTick < TICK_GAP_MS) return
    lastTick = now
    if (!audio || audioUrl !== cfg.soundUrl) {
      audio = new Audio(cfg.soundUrl)
      audio.preload = 'auto'
      audioUrl = cfg.soundUrl
    }
    audio.volume = Math.min(Math.max(cfg.soundVolume, 0), 1)
    try {
      audio.currentTime = 0
    } catch (_) {}
    const played = audio.play()
    if (played && typeof played.catch === 'function') played.catch(() => {})
  }

  function applyTarget(value, snap) {
    const count = items.length
    if (!count) return
    let v = value
    if (!cfg.loop) v = Math.min(Math.max(v, 0), count - 1)
    if (snap) v = Math.round(v)
    target = v
    const idx = ((Math.round(v) % count) + count) % count
    if (idx !== selected) {
      selected = idx
      paintSelection()
      if (typeof cfg.onChange === 'function') cfg.onChange(idx, items[idx])
      playTick()
    }
    startLoop()
  }

  function onWheel(e) {
    e.preventDefault()
    const delta = e.deltaMode === 1 ? e.deltaY * 24 : e.deltaY
    // Cap each event at one step so notchy mouse wheels move exactly one
    // option per click, while touchpads still scroll continuously.
    const step = Math.max(-1, Math.min(1, delta / rowH))
    applyTarget(target + step, false)
    if (wheelTimer) clearTimeout(wheelTimer)
    wheelTimer = setTimeout(() => applyTarget(target, true), WHEEL_SETTLE_MS)
  }

  function onPointerDown(e) {
    if (!cfg.draggable) return
    drag = { y: e.clientY, start: target, id: e.pointerId }
    dragMoved = false
    root.classList.add('option-wheel--dragging')
  }

  function onPointerMove(e) {
    if (!drag) return
    const dy = e.clientY - drag.y
    if (!dragMoved && Math.abs(dy) > DRAG_THRESHOLD) {
      dragMoved = true
      // Capture only once a real drag starts, so plain clicks still reach the
      // options and can open them.
      try {
        root.setPointerCapture(drag.id)
      } catch (_) {}
    }
    if (dragMoved) applyTarget(drag.start - dy / rowH, false)
  }

  function onPointerEnd() {
    if (!drag) return
    drag = null
    root.classList.remove('option-wheel--dragging')
    if (dragMoved) applyTarget(target, true)
  }

  function handleItemClick(index) {
    if (dragMoved) return
    const count = items.length
    if (!count) return
    const cur = target
    let d = index - (((cur % count) + count) % count)
    if (cfg.loop && count > 1) {
      if (d > count / 2) d -= count
      else if (d < -count / 2) d += count
    }
    applyTarget(cur + d, true)
    if (typeof cfg.onItemClick === 'function') cfg.onItemClick(index, items[index])
  }

  function onKeyDown(e) {
    let delta = null
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') delta = -1
    else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') delta = 1
    if (delta == null) {
      if (e.key === 'Enter' && typeof cfg.onItemClick === 'function') {
        e.preventDefault()
        cfg.onItemClick(selected, items[selected])
      }
      return
    }
    e.preventDefault()
    applyTarget(Math.round(target) + delta, true)
  }

  root.addEventListener('wheel', onWheel, { passive: false })
  root.addEventListener('pointerdown', onPointerDown)
  root.addEventListener('pointermove', onPointerMove)
  root.addEventListener('pointerup', onPointerEnd)
  root.addEventListener('pointercancel', onPointerEnd)
  root.addEventListener('keydown', onKeyDown)

  const onResize = () => {
    measure()
    applyTarget(target, false)
  }
  window.addEventListener('resize', onResize)

  measure()
  buildItems()
  applyTarget(target, false)

  return {
    root,

    /** Replace the option list, optionally landing on a given index. */
    setItems(next, { selected: initial } = {}) {
      items = Array.isArray(next) ? next.slice() : []
      buildItems()
      if (items.length) {
        const wanted = initial == null ? cfg.loop ? selected : 0 : Number(initial) || 0
        selected = ((Math.round(wanted) % items.length) + items.length) % items.length
        pos = selected
        target = selected
        paintSelection()
      } else {
        selected = 0
        pos = 0
        target = 0
      }
      startLoop()
      return this
    },

    /** Move the wheel to an index (snaps by default). */
    setSelected(index, { snap = true } = {}) {
      applyTarget(Number(index) || 0, snap)
      return this
    },

    getSelected() {
      return { index: selected, item: items[selected] }
    },

    getItems() {
      return items.slice()
    },

    /** Merge new props (fontSize, side, colors, …) and re-lay the wheel out. */
    setProps(next = {}) {
      Object.assign(cfg, next)
      if (Array.isArray(next.items)) {
        this.setItems(next.items, { selected: cfg.defaultSelected })
        return this
      }
      applyThemeVars()
      measure()
      applyTarget(target, false)
      return this
    },

    refresh() {
      measure()
      applyTarget(target, false)
      return this
    },

    destroy() {
      if (raf != null) cancelAnimationFrame(raf)
      raf = null
      if (wheelTimer) clearTimeout(wheelTimer)
      wheelTimer = null
      window.removeEventListener('resize', onResize)
      root.removeEventListener('wheel', onWheel)
      root.removeEventListener('pointerdown', onPointerDown)
      root.removeEventListener('pointermove', onPointerMove)
      root.removeEventListener('pointerup', onPointerEnd)
      root.removeEventListener('pointercancel', onPointerEnd)
      root.removeEventListener('keydown', onKeyDown)
      if (audio) {
        try {
          audio.pause()
        } catch (_) {}
        audio = null
      }
      for (const el of itemEls) el.remove()
      itemEls.length = 0
      items = []
    }
  }
}

export { DEFAULT_ITEMS }
