// GümrükPortal Service Worker
// Versiyon değiştirince eski cache temizlenir
const CACHE_NAME = 'gumrukportal-v3';

// Install: yüklendiğinde
self.addEventListener('install', event => {
  console.log('[SW] Yüklendi');
  self.skipWaiting();
});

// Activate: aktif olunca eski cache'leri temizle
self.addEventListener('activate', event => {
  console.log('[SW] Aktif');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch: ağ önce, başarısız olursa cache'ten getir
self.addEventListener('fetch', event => {
  // GAS isteklerini cache'leme (her zaman fresh olmalı)
  if (event.request.url.includes('script.google.com')) {
    return;
  }

  // POST isteklerini cache'leme
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Başarılı GET cevabını cache'e koy
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Ağ yoksa cache'ten getir
        return caches.match(event.request);
      })
  );
});
