// ── Service Worker — Notepad PWA ──────────────────────────────
// Strategy: Cache-first untuk aset statis, network-first untuk Firebase.

const CACHE_NAME = 'notepad-v1';

// Aset yang di-cache saat install
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap'
];

// ── Install: pre-cache aset utama ─────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_URLS);
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: hapus cache lama ────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: strategi berdasarkan jenis request ─────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Lewati request non-GET
  if (request.method !== 'GET') return;

  // Network-first untuk Firebase / Firestore / googleapis (data dinamis)
  const isFirebase =
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('gstatic.com');

  if (isFirebase) {
    // Biarkan browser menangani langsung (tanpa cache SW)
    return;
  }

  // Cache-first untuk aset statis (HTML, CSS, JS, font, ikon)
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request)
        .then(response => {
          // Hanya cache response yang valid
          if (!response || response.status !== 200 || response.type === 'opaque') {
            return response;
          }
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => {
          // Offline fallback: kembalikan index.html untuk navigasi
          if (request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
    })
  );
});
