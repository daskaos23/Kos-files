/* K-OS Files — Service Worker
   v10: App-Shell-Cache + Share-Target-Empfang (Android "Teilen mit → K-OS Files").
   Geteilte Dateien landen in IndexedDB (store "shared"); die App bietet danach
   die Ablage in ein Projekt an. Dropbox-Aufrufe werden NIE gecacht. */

const CACHE = 'kosfiles-shell-v10';
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

/* Mini-IDB (gleiche DB wie die App: "kosfiles", Store "shared") */
function idbPutShared(key, val) {
  return new Promise((res, rej) => {
    const req = indexedDB.open('kosfiles', 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      ['kv', 'thumbs', 'files', 'oplog', 'shared'].forEach(s => {
        if (!d.objectStoreNames.contains(s)) d.createObjectStore(s);
      });
    };
    req.onsuccess = () => {
      const d = req.result;
      const t = d.transaction('shared', 'readwrite');
      t.objectStore('shared').put(val, key);
      t.oncomplete = () => { d.close(); res(); };
      t.onerror = () => { d.close(); rej(t.error); };
    };
    req.onerror = () => rej(req.error);
  });
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  /* Share-Target: POST mit Dateien entgegennehmen */
  if (e.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      try {
        const form = await e.request.formData();
        const files = form.getAll('files') || [];
        let i = 0;
        for (const f of files) {
          if (f && f.name) {
            await idbPutShared('s' + Date.now() + '_' + (i++), {
              name: f.name, type: f.type || '', ts: Date.now(), blob: f
            });
          }
        }
      } catch (err) { /* still weiterleiten */ }
      return Response.redirect('./?share=1', 303);
    })());
    return;
  }

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
