/* Talk-mode orb, powered by thinking-orbs (https://libraries.dev/orbs)
 * Vendored engine: js/orbs-engine.js (MIT © Jakub Antalik).
 *
 * The engine renders hand-tuned dotted animations on a plain 2D canvas.
 * Talk states map to library states:
 *   listening -> "listening"  (a waveform rolls through latitude rings)
 *   thinking  -> "searching"  (a scan meridian sweeps a dotted globe)
 *   voicing   -> "composing"  (an undulating multi-band sash)
 *   speaking  -> "connecting" (a constellation wiring itself, packets on edges)
 * Mic / TTS loudness drives the orb's tempo and dot energy via setPulse().
 *
 * API kept compatible with the previous shader orb:
 *   PlutoniumOrb.attach(canvas, opts) -> boolean
 *   PlutoniumOrb.setState(0|1|2|3 | 'listening'|'thinking'|'voicing'|'speaking')
 *   PlutoniumOrb.setPulse(0..1)
 *   PlutoniumOrb.detach()
 */
window.PlutoniumOrb = (function () {
  'use strict';

  var Engine = window.PlutoniumOrbsEngine;
  if (!Engine) return { attach: function () { return false; }, setState: function () {}, setPulse: function () {}, detach: function () {} };

  // Talk state -> thinking-orbs state. The engine resolves each (state, size)
  // pair to a hand-tuned preset (mode, speed, dot counts/sizes).
  var STATE_KEYS = ['listening', 'thinking', 'voicing', 'speaking'];
  var ORB_STATES = ['listening', 'searching', 'composing', 'connecting'];

  var canvas = null;
  var ctx = null;
  var size = 190;          // CSS px render size
  var dpr = 1;
  var stateIdx = 0;
  var resolved = null;     // { mode, speed, opts } for the current state
  var running = false;
  var raf = 0;
  var lastNow = 0;
  var tAccum = 0;          // engine-phase accumulator (tempo-modulated dt)
  var pulse = 0;           // smoothed 0..1 loudness from mic / TTS output
  var pulseTarget = 0;
  var staticFrame = false; // prefers-reduced-motion: draw one frame, no loop

  function resolveFor(stateKey) {
    try {
      return Engine.resolvePreset(stateKey, 64); // preset geometry is size-independent; we draw at `size`
    } catch (e) {
      return { mode: 'orbits', speed: 1.8, opts: Engine.BASE_PROFILES ? Engine.BASE_PROFILES.orbits : {} };
    }
  }

  function resize() {
    if (!canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = canvas.clientWidth || 190;
    var h = canvas.clientHeight || 190;
    size = Math.max(1, Math.min(w, h));
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
  }

  function draw() {
    if (!ctx || !resolved) return;
    var modeDraw = Engine.MODE_DRAWS[resolved.mode];
    if (!modeDraw) return;
    // Draw in the engine's native 64px "avatar" coordinate space, scaled up to
    // the canvas, keeps the library's exact hand-tuned dot proportions at
    // talk-overlay scale. Pulse swells the whole orb a touch.
    var s = 64 * (1 + 0.06 * pulse);
    var k = dpr * (size / 64);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, 64, 64);
    // Dark app theme: light ink. Pulse lifts tempo (folded into tAccum) and
    // brightens scan dots for an alive, voice-reactive feel.
    var opts = resolved.opts;
    var drawOpts = pulse > 0.02 ? Object.assign({}, opts, { rBoost: (opts.rBoost || 0) + pulse * 1.6 }) : opts;
    modeDraw(ctx, s, tAccum, true, drawOpts);
  }

  function frame(now) {
    if (!running) return;
    if (document.hidden) { raf = requestAnimationFrame(frame); lastNow = now; return; }
    var dt = lastNow ? Math.min(0.05, (now - lastNow) / 1000) : 0;
    lastNow = now;

    pulse += (pulseTarget - pulse) * (dt > 0 ? Math.min(1, dt * 9) : 1);
    var tempo = resolved ? resolved.speed * (1 + 0.45 * pulse) : 1;
    tAccum += dt * tempo;
    draw();
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running || staticFrame) return;
    running = true;
    lastNow = 0;
    if (!raf) raf = requestAnimationFrame(frame);
  }

  function stopLoop() {
    running = false;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  try {
    var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    staticFrame = !!(mq && mq.matches);
    if (mq && mq.addEventListener) mq.addEventListener('change', function (e) {
      staticFrame = e.matches;
      if (staticFrame) { stopLoop(); tAccum = 0.6; draw(); }
      else if (canvas) start();
    });
  } catch (_) {}

  return {
    attach: function (c, opts) {
      if (!c || !Engine) return false;
      canvas = c;
      ctx = c.getContext && c.getContext('2d');
      if (!ctx) return false;
      resize();
      resolved = resolveFor(ORB_STATES[stateIdx]);
      tAccum = 0;
      pulse = 0;
      if (staticFrame) { tAccum = 0.6; draw(); }
      else start();
      return true;
    },
    setState: function (s) {
      var idx = typeof s === 'number' ? s : STATE_KEYS.indexOf(s);
      if (idx < 0 || idx > 3) idx = 0;
      if (idx === stateIdx && resolved) { if (staticFrame) draw(); return; }
      stateIdx = idx;
      resolved = resolveFor(ORB_STATES[stateIdx]);
      if (staticFrame) draw();
    },
    setPulse: function (v) {
      pulseTarget = Math.max(0, Math.min(1, v || 0));
    },
    detach: function () {
      stopLoop();
      canvas = null;
      ctx = null;
      resolved = null;
      pulse = 0;
      pulseTarget = 0;
    },
  };
})();
