/* K-OS Files — Service Worker
   Phase 2 (v4): nur App-Shell-Cache, damit die App offline startet.
   Der große Offline-Ausbau (Metadaten + Thumbnails in IndexedDB)
   folgt in Phase 3 (v11–v13). */

const CACHE = 'kosfiles-shell-v7';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Dropbox-API + OAuth niemals cachen — immer live
  if (url.hostname.endsWith('dropboxapi.com') || url.hostname.endsWith('dropbox.com')) {
    return; // Browser-Standardverhalten
  }

  // Nur GET behandeln
  if (e.request.method !== 'GET') return;

  // App-Shell: Cache-first mit Netzwerk-Fallback und Nachlegen
  e.respondWith(
    caches.match(e.request).then(hit => {
      if (hit) return hit;
      return fetch(e.request).then(res => {
        if (res.ok && url.origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => hit);
    })
  );
});
