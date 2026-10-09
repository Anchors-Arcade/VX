(function () {
  'use strict';

  /*
   * Device gating.
   *
   * Detection stays local: nothing about the user is transmitted. What changed
   * is that the *decision* now comes from the global config rather than being
   * hardcoded, so an operator can turn mobile access on or off without a
   * deploy.
   *
   * Two things keep this behaviour-compatible:
   *   - `PlutoniumConfig` hydrates its cached copy synchronously and defaults
   *     `devices.blockMobile` to true, so the first-paint decision matches the
   *     old behaviour even before any network call returns.
   *   - The `device-blocked` class and the `device-block-overlay` element are
   *     unchanged, so js/onboarding-redirect.js keeps working untouched.
   */

  function looksMobile () {
    var ua = (navigator.userAgent || '').toLowerCase();
    var uaData = navigator.userAgentData;
    var isMobile = uaData && typeof uaData.mobile === 'boolean' ? uaData.mobile : false;

    if (!isMobile) {
      isMobile = /android|iphone|ipod|ipad|windows phone|iemobile|blackberry|kindle|silk|opera mini|fennec|mobi|playbook|tablet|smart-?tv|googletv|roku/i.test(ua);
    }
    if (!isMobile && /macintosh/.test(ua) && navigator.maxTouchPoints > 1) {
      isMobile = true;
    }
    return isMobile;
  }

  function matchesBlockedUA () {
    var config = window.PlutoniumConfig ? PlutoniumConfig.get() : null;
    var patterns = (config && config.devices && config.devices.blockedUA) || [];
    if (!patterns.length) return false;
    var ua = navigator.userAgent || '';
    for (var i = 0; i < patterns.length; i++) {
      if (patterns[i] && ua.indexOf(patterns[i]) !== -1) return true;
    }
    return false;
  }

  function apply () {
    var config = window.PlutoniumConfig ? PlutoniumConfig.get() : null;
    // Default to blocking when the control plane is unavailable: this is the
    // documented product behaviour, so failing open would be the surprise.
    var blockMobile = !config || !config.devices || config.devices.blockMobile !== false;

    var blocked = (blockMobile && looksMobile()) || matchesBlockedUA();

    document.documentElement.classList.toggle('device-blocked', blocked);
    var overlay = document.getElementById('device-block-overlay');
    if (overlay) overlay.hidden = !blocked;
  }

  apply();

  if (window.PlutoniumConfig) PlutoniumConfig.onChange(apply);
})();
