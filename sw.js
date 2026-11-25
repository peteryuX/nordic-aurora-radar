const CACHE_NAME = 'aurora-radar-shell-v34';
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

// Conservative network-first strategy strictly for same-origin app shell;
// never intercepts third-party live APIs (NOAA, MET Norway, Open-Meteo, Windy, sky cams).
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isNav = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  const cacheKey = isNav ? './index.html' : req;

  event.respondWith(
    fetchWithTimeout(req, FETCH_TIMEOUT_MS)
      .then(res => {
        if (res && res.ok) {
          const clone = res.clone();
          event.waitUntil(caches.open(CACHE_NAME).then(c => c.put(cacheKey, clone)).catch(() => {}));
          return res;
        }
        // Fallback to cached shell on 5xx upstream errors
        return caches.match(cacheKey, { ignoreSearch: true }).then(hit => hit || res);
      })
      .catch(() => {
        if (isNav) {
          return caches.match('./index.html').then(hit => hit || new Response('Offline', { status: 503, statusText: 'Offline' }));
        }
        // Never serve index.html as a fallback for .js/.css/.json/.svg (prevents MIME corruption)
        return caches.match(req, { ignoreSearch: true }).then(hit => hit || new Response('', { status: 503, statusText: 'Offline' }));
      })
  );
});
