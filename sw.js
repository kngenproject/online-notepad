// sw.js — Service Worker untuk Notepad PWA
const CACHE_NAME = 'notepad-v1';

// File yang di-cache saat install (app shell)
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=JetBrains+Mono:wght@400;500&family=Lora:ital,wght@0,400;0,600;1,400&display=swap'
];

// ── Install: cache app shell ──────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Pre-cache non-opaque resources only
      return cache.addAll(['/index.html', '/manifest.json'])
        .catch(() => {}); // Jangan gagal install karena font CDN
    })
  );
  self.skipWaiting();
});

// ── Activate: bersihkan cache lama ───────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: strategi cache ─────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Firebase & gstatic: network only (jangan cache, butuh auth/realtime)
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('firestore') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('googleapis.com')
  ) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response('', { status: 503, statusText: 'Offline' })
      )
    );
    return;
  }

  // App shell: Cache First, fallback network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cache response baru untuk file lokal
        if (
          response.ok &&
          event.request.method === 'GET' &&
          (url.pathname.endsWith('.html') ||
           url.pathname.endsWith('.json') ||
           url.pathname.endsWith('.js') ||
           url.pathname === '/')
        ) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback: kembalikan index.html
        return caches.match('/index.html') ||
               caches.match('/') ||
               new Response('<h1>Sedang Offline</h1><p>Buka kembali saat ada koneksi internet.</p>', {
                 headers: { 'Content-Type': 'text/html; charset=utf-8' }
               });
      });
    })
  );
});
