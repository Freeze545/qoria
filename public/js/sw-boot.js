/* Qoria — aggressive SW update + one soft reload on new shell */
(function () {
  if (!('serviceWorker' in navigator)) return;
  var SHELL = 'qoria-shell-v10';
  var reloading = false;

  function onceReload(reason) {
    if (reloading) return;
    try {
      var k = 'qoria-sw-reload:' + SHELL;
      if (sessionStorage.getItem(k) === '1') return; // already refreshed for this shell
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
    // Re-check often so old PWAs pick the new shell without manual hard-refresh
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) return;
      navigator.serviceWorker.getRegistration().then(function (reg) {
        if (reg) watchReg(reg);
      }).catch(function () {});
    });
    window.addEventListener('focus', function () {
      navigator.serviceWorker.getRegistration().then(function (reg) {
        if (reg) try { reg.update(); } catch (_) {}
      }).catch(function () {});
    });
  });

  navigator.serviceWorker.addEventListener('controllerchange', function () {
    onceReload('controllerchange');
  });

  navigator.serviceWorker.addEventListener('message', function (ev) {
    var d = ev && ev.data;
    if (d && d.type === 'SW_ACTIVATED') onceReload('activated');
  });
})();
