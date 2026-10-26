/* Qoria — SW update; soft-reload only when safe (never mid signup/login) */
(function () {
  if (!('serviceWorker' in navigator)) return;
  var SHELL = 'qoria-shell-v12';
  var reloading = false;
  var hadController = !!navigator.serviceWorker.controller;

  function onAuthPage() {
    try {
      var p = (location.pathname || '').toLowerCase();
      return p.indexOf('signup') !== -1 || p.indexOf('login') !== -1;
    } catch (_) { return false; }
  }

  function onceReload(reason) {
    if (reloading) return;
    if (window.__qoriaBusy) return;
    if (onAuthPage()) return;
    // First SW install: don't reload (would interrupt first visit / auth)
    if (!hadController && reason !== 'manual') return;
    try {
      var k = 'qoria-sw-reload:' + SHELL;
      if (sessionStorage.getItem(k) === '1') return;
      sessionStorage.setItem(k, '1');
    } catch (_) {}
    reloading = true;
    try { location.reload(); } catch (_) {}
  }

  function wake(worker) {
    try { if (worker) worker.postMessage({ type: 'SKIP_WAITING' }); } catch (_) {}
  }

  function watchReg(reg) {
    try { reg.update(); } catch (_) {}
    if (reg.waiting) wake(reg.waiting);
    reg.addEventListener('updatefound', function () {
      var w = reg.installing;
      if (!w) return;
      w.addEventListener('statechange', function () {
        if (w.state === 'installed') wake(w);
      });
    });
  }

  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').then(watchReg).catch(function () {});
    document.addEventListener('visibilitychange', function () {
      if (document.hidden || window.__qoriaBusy || onAuthPage()) return;
      navigator.serviceWorker.getRegistration().then(function (reg) {
        if (reg) watchReg(reg);
      }).catch(function () {});
    });
    window.addEventListener('focus', function () {
      if (window.__qoriaBusy || onAuthPage()) return;
      navigator.serviceWorker.getRegistration().then(function (reg) {
        if (reg) try { reg.update(); } catch (_) {}
      }).catch(function () {});
    });
  });

  // Prefer controllerchange only (drop duplicate SW_ACTIVATED reload)
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    onceReload('controllerchange');
  });
})();
