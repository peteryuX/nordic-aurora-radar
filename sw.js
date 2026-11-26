const CACHE_NAME = 'aurora-radar-shell-v63';
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
  './src/copy-formatters.js',
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

// Atomic versioned app-shell SW:
// - Root HTML + static shell (.js/.css/.svg/.png/.json) ALWAYS serve from the same atomic CACHE_NAME
//   so a deploy NEVER mixes new index.html with stale styles.css / src/app.js (zero split-brain UI!).
// - /spots/* SEO pages pass through network-first under their own URL and NEVER overwrite ./index.html.
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
    // Atomic app-shell cache-first: guarantees index.html matches the exact styles.css & src/*.js in CACHE_NAME
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match('./index.html').then(hit => {
          if (hit) return hit;
          return fetchWithTimeout(req, FETCH_TIMEOUT_MS)
            .then(res => {
              if (res && res.ok) event.waitUntil(cache.put('./index.html', res.clone()).catch(() => {}));
              return res;
            })
            .catch(() => new Response('Offline', { status: 503, statusText: 'Offline' }));
        })
      )
    );
    return;
  }

  // Static versioned shell assets: serve from atomic CACHE_NAME (zero 10s blackhole stalls, zero version skew)
  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(req, { ignoreSearch: true }).then(cached => {
        if (cached) return cached;
        return fetchWithTimeout(req, FETCH_TIMEOUT_MS)
          .then(res => {
            if (res && res.ok) event.waitUntil(cache.put(req, res.clone()).catch(() => {}));
            return res;
          })
          .catch(() => new Response('', { status: 503, statusText: 'Offline' }));
      })
    )
  );
});
