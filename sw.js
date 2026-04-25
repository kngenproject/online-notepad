// ── Service Worker — Notepad PWA ──────────────────────────────
// v2 — Robust caching: aman untuk icon belum ada, font CORS-safe,
//       stale-while-revalidate untuk HTML agar selalu segar.

const CACHE_NAME    = 'notepad-v2';
const RUNTIME_CACHE = 'notepad-runtime-v2';

// Aset WAJIB ada saat install (jangan masukkan ikon dulu kalau belum pasti ada)
const PRECACHE_CORE = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Aset opsional — dicoba cache, gagal diabaikan (icon, dll)
const PRECACHE_OPTIONAL = [
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// ── Helpers ───────────────────────────────────────────────────
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
  // gstatic (Firebase SDK CDN) dan Google Fonts — biarkan browser handle
  return (
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  );
}

function isNavigateRequest(request) {
  return request.mode === 'navigate';
}

// ── Install ───────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // Core — gagal install jika salah satu tidak bisa di-fetch
      await cache.addAll(PRECACHE_CORE);

      // Optional — gagal diabaikan satu per satu
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

// ── Activate ──────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== RUNTIME_CACHE)
          .map(k => {
            console.log('[SW] Hapus cache lama:', k);
            return caches.delete(k);
          })
      );
      await self.clients.claim();
    })()
  );
});

// ── Fetch ─────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;

  // Lewati non-GET
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return; // URL tidak valid
  }

  // 1. Firebase & googleapis data → network only (jangan cache)
  if (isFirebaseUrl(url)) return;

  // 2. Font & Firebase SDK CDN (gstatic) → network only
  //    Cache font menyebabkan masalah CORS opaque response
  if (isGstaticOrFont(url)) return;

  // 3. Hanya handle same-origin dan https
  if (url.origin !== self.location.origin && !url.protocol.startsWith('https')) return;

  // 4. HTML navigasi → Stale-While-Revalidate
  //    Tampilkan cache dulu (cepat), update di background
  if (isNavigateRequest(request)) {
    event.respondWith(staleWhileRevalidate(request, CACHE_NAME));
    return;
  }

  // 5. Aset statis lain (JS, CSS, gambar) → Cache-first
  event.respondWith(cacheFirst(request));
});

// ── Strategi: Stale-While-Revalidate ─────────────────────────
async function staleWhileRevalidate(request, cacheName) {
  const cache    = await caches.open(cacheName);
  const cached   = await cache.match(request);

  const fetchPromise = fetch(request)
    .then(response => {
      if (response && response.status === 200) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  // Kembalikan cache dulu, biarkan fetch jalan di background
  return cached || fetchPromise || caches.match('/index.html');
}

// ── Strategi: Cache-First ─────────────────────────────────────
async function cacheFirst(request) {
  const cache  = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.status === 200 && response.type !== 'opaque') {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline dan tidak ada cache → kembalikan index.html sebagai fallback
    return caches.match('/index.html');
  }
}
