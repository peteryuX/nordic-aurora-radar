const CACHE_NAME = 'aurora-radar-shell-v58';
const FETCH_TIMEOUT_MS = 3500;
const SHELL_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './src/glossary.js',
  './src/aurora-engine.js',
  './src/charts.js',
  './src/storage.js',
  './src/i18n.js',
  './src/data-client.js',
  './src/analytics.js',
  './src/share-card.js',
  './src/spot-live.js',
  './src/app.js',
  './manifest.json',
  './icon.svg',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.all(
        SHELL_ASSETS.map(url => fetch(new Request(url, { cache: 'reload' })).then(res => {
          if (!res.ok) throw new Error(`Shell asset HTTP ${res.status}: ${url}`);
          return cache.put(url, res);
        }))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function fetchWithTimeout(req, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(req, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

// Versioned app-shell SW:
// - Root HTML navigation: network-first (3.5s cap) with safe ./index.html fallback; NEVER caches /spots/* into ./index.html.
// - Versioned static shell assets (.js/.css/.svg/.png/.json): stale-while-revalidate (instant boot on blackholed 1-bar LTE).
// - Never intercepts third-party live APIs (NOAA, MET Norway, Open-Meteo, Windy, sky cams).
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isNav = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  const isSpotsPage = url.pathname.includes('/spots/');

  if (isNav) {
    if (isSpotsPage) {
      // Let static SEO landing pages pass through network-first under their own URL (never overwrite ./index.html!)
      event.respondWith(
        fetchWithTimeout(req, FETCH_TIMEOUT_MS)
          .catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || new Response('Offline', { status: 503, statusText: 'Offline' })))
      );
      return;
    }
    event.respondWith(
      fetchWithTimeout(req, FETCH_TIMEOUT_MS)
        .then(res => {
          if (res && res.ok) {
            const clone = res.clone();
            event.waitUntil(caches.open(CACHE_NAME).then(c => c.put('./index.html', clone)).catch(() => {}));
            return res;
          }
          return caches.match('./index.html').then(hit => hit || res);
        })
        .catch(() => caches.match('./index.html').then(hit => hit || new Response('Offline', { status: 503, statusText: 'Offline' })))
    );
    return;
  }

  // Static versioned shell assets: serve immediately from versioned cache (SWR) to eliminate 10s blackhole stalls
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(cached => {
      const netFetch = fetchWithTimeout(req, FETCH_TIMEOUT_MS).then(res => {
        if (res && res.ok) {
          const clone = res.clone();
          event.waitUntil(caches.open(CACHE_NAME).then(c => c.put(req, clone)).catch(() => {}));
        }
        return res;
      }).catch(() => null);
      if (cached) {
        event.waitUntil(netFetch);
        return cached;
      }
      return netFetch.then(res => res || new Response('', { status: 503, statusText: 'Offline' }));
    })
  );
});
