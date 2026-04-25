// ── Service Worker — Notepad PWA (diperbaiki) ─────────────────
const CACHE_NAME    = 'notepad-v3';
const RUNTIME_CACHE = 'notepad-runtime-v3';

const PRECACHE_CORE = [
  '/',
  '/index.html',
  '/manifest.json'
];

const PRECACHE_OPTIONAL = [
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

function isFirebaseUrl(url) {
  return (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebase.googleapis.com') ||
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    (url.hostname.includes('googleapis.com') && url.pathname.includes('/google.firestore'))
  );
}

function isGstaticOrFont(url) {
  return (
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  );
}

function isNavigateRequest(request) {
  return request.mode === 'navigate';
}

self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(PRECACHE_CORE);
      await Promise.allSettled(
        PRECACHE_OPTIONAL.map(url =>
          cache.add(url).catch(err =>
            console.warn('[SW] Optional precache gagal:', url, err.message)
          )
        )
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== RUNTIME_CACHE)
          .map(k => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;

  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Jangan cache Firebase atau gstatic/font
  if (isFirebaseUrl(url)) return;
  if (isGstaticOrFont(url)) return;

  // Hanya handle same-origin atau https
  if (url.origin !== self.location.origin && !url.protocol.startsWith('https')) return;

  // Navigasi (HTML) → stale-while-revalidate
  if (isNavigateRequest(request)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Aset statis → cache-first
  event.respondWith(cacheFirst(request));
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  // Jalankan fetch di background untuk update cache
  const fetchPromise = fetch(request).then(response => {
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(err => {
    console.warn('[SW] fetch gagal untuk', request.url, err);
    return null;
  });

  // Kembalikan cache dulu jika ada, atau tunggu fetch, atau fallback ke index.html
  if (cachedResponse) {
    return cachedResponse;
  }

  const fresh = await fetchPromise;
  if (fresh) return fresh;

  // Offline total → fallback ke index.html
  return caches.match('/index.html');
}

async function cacheFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.status === 200 && response.type !== 'opaque') {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Jika request gambar/font/JS gagal dan tidak ada cache, return fallback (optional)
    if (request.destination === 'image') {
      return new Response('', { status: 404, statusText: 'Gambar tidak tersedia offline' });
    }
    return new Response('Offline', { status: 503 });
  }
}