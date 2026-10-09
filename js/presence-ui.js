/*
 * PlutoniumPresenceUI: the on-screen pieces of the presence system.
 *
 * Split from js/client-presence.js purely so each file stays small. All styling
 * is inline and namespaced: this must not depend on the site's stylesheet, and
 * it must never be hidden by a page-level layout rule.
 */

(function () {
  'use strict';

  var Z = 2147483700;

  function make(tag, css, text) {
    var node = document.createElement(tag);
    if (css) node.style.cssText = css;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function body() {
    return document.body || document.documentElement;
  }

  function remove(id) {
    var node = document.getElementById(id);
    if (node) node.remove();
  }

  /* ------------------------------------------------------------------ *
   * Identify: show this client's own number, briefly.
   *
   * This is the whole point of the feature: the operator reads the number off
   * the console and the person tells them what they see. So it has to be
   * unmissable and it has to disappear on its own.
   * ------------------------------------------------------------------ */

  function identify(number, durationMs) {
    remove('plu-identify');

    var box = make('div', [
      'position:fixed', 'top:18px', 'right:18px', 'z-index:' + (Z + 100),
      'display:flex', 'flex-direction:column', 'align-items:center', 'gap:2px',
      'padding:14px 22px', 'border-radius:14px',
      'background:rgba(8,8,12,.92)', 'border:2px solid #e8175d',
      'box-shadow:0 12px 40px rgba(0,0,0,.55)',
      'font-family:inherit', 'color:#fff',
      'opacity:0', 'transform:translateY(-8px)',
      'transition:opacity .25s ease, transform .25s ease',
      'pointer-events:none',
    ].join(';'));
    box.id = 'plu-identify';

    box.appendChild(make('div', 'font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#8b8b9c', 'You are'));
    box.appendChild(make('div', 'font-size:40px;font-weight:800;line-height:1.05;letter-spacing:-.02em;color:#e8175d', number));

    body().appendChild(box);

    requestAnimationFrame(function () {
      box.style.opacity = '1';
      box.style.transform = 'translateY(0)';
    });

    var life = Math.max(1000, Number(durationMs) || 5000);
    setTimeout(function () {
      box.style.opacity = '0';
      box.style.transform = 'translateY(-8px)';
      setTimeout(function () { box.remove(); }, 300);
    }, life);
  }

  /* ------------------------------------------------------------------ *
   * Message: an operator talking to this one client.
   * ------------------------------------------------------------------ */

  function message(payload) {
    remove('plu-operator-message');

    var wrap = make('div', [
      'position:fixed', 'inset:0', 'z-index:' + (Z + 200),
      'display:flex', 'align-items:center', 'justify-content:center',
      'background:rgba(4,4,7,.72)', 'padding:24px',
      'font-family:inherit', 'color:#e8e8ef',
    ].join(';'));
    wrap.id = 'plu-operator-message';

    var card = make('div', [
      'max-width:440px', 'width:100%', 'box-sizing:border-box',
      'background:#101018', 'border:1px solid #23232f',
      'border-top:3px solid #7C5CFF', 'border-radius:14px',
      'padding:22px', 'box-shadow:0 20px 60px rgba(0,0,0,.6)',
    ].join(';'));

    card.appendChild(make('div', 'font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8b8b9c;margin-bottom:8px', 'Message from Anchors Arcade X'));
    card.appendChild(make('div', 'font-size:17px;font-weight:700;margin-bottom:8px', payload.title || 'Message'));
    card.appendChild(make('div', 'font-size:14px;line-height:1.65;color:#b9b9c7;white-space:pre-wrap', payload.body || ''));

    var ok = make('button', [
      'margin-top:18px', 'padding:9px 18px', 'border-radius:9px', 'border:0',
      'background:#e8175d', 'color:#fff', 'font-size:13px', 'font-weight:700',
      'cursor:pointer', 'font-family:inherit',
    ].join(';'), 'Dismiss');
    ok.type = 'button';
    ok.addEventListener('click', function () { wrap.remove(); });
    card.appendChild(ok);

    wrap.appendChild(card);
    body().appendChild(wrap);
  }

  /* ------------------------------------------------------------------ *
   * Block: this client has been disabled.
   * ------------------------------------------------------------------ */

  function block(reason, onRetry) {
    if (document.getElementById('plu-blocked')) return;

    var wrap = make('div', [
      'position:fixed', 'inset:0', 'z-index:' + (Z + 300),
      'background:#07070a', 'color:#e8e8ef',
      'display:flex', 'align-items:center', 'justify-content:center',
      'padding:32px', 'text-align:center', 'font-family:inherit',
    ].join(';'));
    wrap.id = 'plu-blocked';

    var card = make('div', 'max-width:400px');

    card.appendChild(make('h1', 'margin:0 0 10px;font-size:21px;font-weight:700;letter-spacing:-.01em', 'This device has been blocked'));
    card.appendChild(make('p', 'margin:0;color:#9a9aab;line-height:1.65;font-size:14px',
      reason || 'An administrator has disabled access from this browser.'));

    if (onRetry) {
      var retry = make('button', [
        'margin-top:20px', 'padding:9px 18px', 'border-radius:9px',
        'border:1px solid #23232f', 'background:transparent', 'color:#8b8b9c',
        'font-size:13px', 'cursor:pointer', 'font-family:inherit',
      ].join(';'), 'Check again');
      retry.type = 'button';
      retry.addEventListener('click', onRetry);
      card.appendChild(retry);
    }

    wrap.appendChild(card);
    body().appendChild(wrap);
  }

  function unblock() {
    remove('plu-blocked');
  }

  function isBlocked() {
    return !!document.getElementById('plu-blocked');
  }

  window.PlutoniumPresenceUI = {
    identify: identify,
    message: message,
    block: block,
    unblock: unblock,
    isBlocked: isBlocked,
  };
})();
