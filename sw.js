const CACHE_NAME = 'ict-master-v2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './ict-mc.xml'
];

// 1. 安裝 Service Worker 並寫入初始快取
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

// 2. 啟動並清除舊版快取
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

// 3. 攔截請求策略：Network First, Cache Fallback (非常重要！)
self.addEventListener('fetch', event => {
  // 只攔截 GET 請求
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // 如果網路請求成功，將最新的檔案存入快取 (動態更新)
        // 確保未來在無網路環境下，使用者看到的是最後一次成功連線的版本
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // 如果網路連線失敗 (Offline)，則從快取中讀取檔案
        return caches.match(event.request);
      })
  );
});