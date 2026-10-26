/* Qoria — offline shell only (static assets). Never caches /api/* (auth/chat). */
const CACHE = 'qoria-shell-v8';
const PRECACHE = [
  '/',
  '/index.html',
  '/app.html',
  '/pricing.html',
  '/login.html',
  '/signup.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/i18n.js',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/logo.jpg',
  '/logo-mark.svg',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
];

// Always try network first for these (avoid stale i18n/HTML flash)
function isNetworkFirst(pathname) {
  if (pathname === '/' || pathname.endsWith('.html')) return true;
  if (pathname === '/js/i18n.js' || pathname === '/js/app.js' || pathname === '/sw.js') return true;
  if (pathname === '/css/styles.css') return true;
  return false;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return;

  if (isNetworkFirst(url.pathname)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => hit);
      return hit || fetchPromise;
    })
  );
});
