/**
 * sw.js - Service Worker for ICT Past Paper Learning Platform
 * Robust offline-first asset caching, background update synchronization,
 * and high-performance Cache-First strategy for past paper images.
 */

const CACHE_NAME = 'ict-master-v8';
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './js/store.js',
  './js/quiz.js',
  './js/ui.js',
  './js/app.js',
  './data/papers.json',
  './data/answers.json',
  './data/ocr.json',
  './icons/icon.svg'
];

// 1. Install & precache essential assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_ASSETS).catch(err => {
        console.warn('[SW] Precache partial failure:', err);
      });
    })
  );
  self.skipWaiting();
});

// 2. Activate & cleanup stale caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Purging stale cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 3. Intercept requests with domain-appropriate caching strategies
self.addEventListener('fetch', event => {
  const req = event.request;

  // Intercept only GET requests over HTTP/HTTPS
  if (req.method !== 'GET' || !req.url.startsWith('http')) return;

  const url = new URL(req.url);

  // Strategy A: Cache-First for static past paper exam images
  if (url.pathname.includes('/Paper/') || /\.(png|jpg|jpeg|webp|svg)$/i.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(cachedResponse => {
        if (cachedResponse) return cachedResponse;

        return fetch(req)
          .then(networkResponse => {
            if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(req, clone)).catch(() => {});
            }
            return networkResponse;
          })
          .catch(async () => {
            const fallback = await caches.match(req);
            return fallback || new Response('', { status: 504, statusText: 'Offline' });
          });
      })
    );
    return;
  }

  // Strategy B: Network-First with Cache Fallback for HTML, JS, CSS, and JSON data
  event.respondWith(
    fetch(req)
      .then(networkResponse => {
        if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone)).catch(() => {});
        }
        return networkResponse;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(req);
        if (cachedResponse) return cachedResponse;

        // If navigation request and offline, fallback to root index.html
        if (req.mode === 'navigate') {
          const navFallback = await caches.match('./index.html');
          if (navFallback) return navFallback;
        }
        return new Response('Offline', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      })
  );
});

// 4. Message event for instant updates
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
