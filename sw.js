const CACHE_NAME = 'ict-master-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './ict-mc.xml'
];

// 安裝 Service Worker 並快取核心檔案
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

// 清除舊版快取
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) return caches.delete(cacheName);
        })
      );
    })
  );
  self.clients.claim();
});

// 攔截網路請求，若有快取則使用快取 (Cache First for offline support)
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // 如果在快取中找到，回傳快取；否則透過網路抓取
        return response || fetch(event.request);
      })
  );
});