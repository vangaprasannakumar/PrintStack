// Bump CACHE_NAME (v5 -> v6 -> ...) whenever index.html, manifest.json, or any
// cached asset changes — the fetch handler below is pure cache-first with no
// revalidation, so returning visitors keep getting whatever was cached under
// the current name until the name itself changes.
const CACHE_NAME = 'printstack-v5';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './print-logic.js',
  'https://i.postimg.cc/dt3WWdVR/Print-Stack-192x192.png',
  'https://i.postimg.cc/L65yyf8V/Print-Stack-512x512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js'
];

// Install Event: pre-cache the app shell. Each asset is cached individually so
// a single failure (e.g. a transient CDN hiccup on the PDF.js files) can't
// take the whole install step down with it.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        ASSETS_TO_CACHE.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('PrintStack SW: failed to cache', url, err);
          })
        )
      );
    })
  );
  self.skipWaiting();
});

// Activate Event: clear older cache versions.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event: offline-first cache strategy, GET requests only.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).catch(() => {
        // Fallback for document requests if network fails
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
