// GümrükPortal Service Worker v4
const CACHE_NAME = 'gumrukportal-v4';

self.addEventListener('install', event => {
  console.log('[SW] v4 Yüklendi');
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log('[SW] v4 Aktif');
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

self.addEventListener('fetch', event => {
  const url = event.request.url;
  
  // Bu URL'leri ASLA cache'leme - her zaman ağdan al
  if (
    url.includes('script.google.com') ||
    url.includes('firebase') ||
    url.includes('firebaseio.com') ||
    url.includes('googleapis.com') ||
    url.includes('tcmb.gov.tr') ||
    url.includes('codetabs.com') ||
    url.includes('corsproxy.io') ||
    url.includes('ui-avatars.com')
  ) {
    return; // Cache bypass
  }

  // POST isteklerini cache'leme
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
