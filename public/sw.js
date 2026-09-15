// Cache version is auto-set by the app on first load via BUILD_VERSION message
let CACHE_VERSION = '';
const STATIC_CACHE_PREFIX = 'iftin-static-';
const DYNAMIC_CACHE_PREFIX = 'iftin-dynamic-';
const API_CACHE_PREFIX = 'iftin-api-';
const IMAGE_CACHE_PREFIX = 'iftin-images-';

const getCacheName = (prefix) => prefix + (CACHE_VERSION || 'default');

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html'
];

// Notify all clients about new version
const notifyClientsOfUpdate = async () => {
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(client => {
    client.postMessage({ type: 'NEW_VERSION_AVAILABLE' });
  });
};

// Delete all caches except current version and images
const clearOldCaches = async () => {
  const cacheNames = await caches.keys();
  const currentCaches = [
    getCacheName(STATIC_CACHE_PREFIX),
    getCacheName(DYNAMIC_CACHE_PREFIX),
    getCacheName(API_CACHE_PREFIX),
    getCacheName(IMAGE_CACHE_PREFIX),
  ];
  await Promise.all(
    cacheNames
      .filter(name => !currentCaches.includes(name))
      .map(name => {
        console.log('[SW] Deleting old cache:', name);
        return caches.delete(name);
      })
  );
};

self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(getCacheName(STATIC_CACHE_PREFIX))
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    clearOldCaches()
      .then(() => {
        console.log('[SW] Service worker activated');
        return self.clients.claim();
      })
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip Vite dev modules
  if (
    url.pathname.startsWith('/@vite') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.includes('/node_modules/') ||
    url.pathname.endsWith('.ts') ||
    url.pathname.endsWith('.tsx')
  ) return;

  // NETWORK-FIRST for Supabase Storage images. Admins may replace an image at
  // the same object URL; cache-first would keep showing the deleted artwork.
  // The saved response remains the offline fallback.
  if (url.hostname.includes('supabase') && url.pathname.includes('/storage/')) {
    event.respondWith(
      fetch(request, { cache: 'no-store' }).then(response => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(getCacheName(IMAGE_CACHE_PREFIX)).then(cache => cache.put(request, clone));
          }
          return response;
        }).catch(() => caches.match(request).then(cachedResponse => cachedResponse || new Response(null, { status: 404 })))
    );
    return;
  }

  // Network-first for Supabase API calls
  if (url.hostname.includes('supabase') && !url.pathname.includes('/storage/')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(getCacheName(API_CACHE_PREFIX)).then(cache => cache.put(request, responseClone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then(cachedResponse => {
            if (cachedResponse) return cachedResponse;
            return new Response(
              JSON.stringify({ error: 'Offline', message: 'Internetka lama xidhiidhayo.' }),
              { status: 503, headers: { 'Content-Type': 'application/json' } }
            );
          });
        })
    );
    return;
  }

  // NETWORK-FIRST for HTML — always get the latest, fallback to cache
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then(async (networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const cache = await caches.open(getCacheName(DYNAMIC_CACHE_PREFIX));
            await cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(request).then(cached => cached || caches.match('/offline.html'));
        })
    );
    return;
  }

  // Hashed assets (JS/CSS with content hash in filename) — cache-first (hash changes = new URL)
  // Non-hashed assets — network-first
  const hasContentHash = /\.[a-f0-9]{8,}\.(js|css)$/i.test(url.pathname);
  
  if (hasContentHash) {
    // Cache-first for hashed assets (immutable by definition)
    event.respondWith(
      caches.match(request).then(cachedResponse => {
        if (cachedResponse) return cachedResponse;
        return fetch(request).then(response => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(getCacheName(DYNAMIC_CACHE_PREFIX)).then(cache => cache.put(request, clone));
          }
          return response;
        }).catch(() => new Response(null, { status: 404 }));
      })
    );
  } else {
    // Network-first for non-hashed assets
    event.respondWith(
      fetch(request)
        .then(async (networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const cache = await caches.open(getCacheName(DYNAMIC_CACHE_PREFIX));
            await cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        })
        .catch(() => caches.match(request).then(cached => cached || new Response(null, { status: 404 })))
    );
  }
});

// Listen for messages from client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'SET_VERSION') {
    const newVersion = event.data.version;
    if (!newVersion) return;
    const versionChanged = CACHE_VERSION !== newVersion;
    CACHE_VERSION = newVersion;
    if (versionChanged) {
      console.log('[SW] Build version activated:', newVersion);
      event.waitUntil(clearOldCaches().then(() => notifyClientsOfUpdate()));
    }
  }
});