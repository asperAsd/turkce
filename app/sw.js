// Offline support for the app. build-web.js replaces 315e0de842 and 5146607226 with hashes of the build,
// so every release installs a new worker and old caches are removed on activation.
//   page (navigation)  — network first, the last good copy is used offline;
//   audio packs        — from the cache, refreshed in the background; a new audio version empties the old cache;
//   icons, fonts, images, manifest — from the cache (fonts are fetched at install, so the first offline start has them).
// Never cached: anything that is not a GET to our own site, /api/, /auth/, /pay/, /admin, responses with errors
// or with Cache-Control: no-store. Progress and personal data live in the page's storage, not here.
const SHELL = 'turkce-shell-315e0de842', AUDIO = 'turkce-audio-5146607226';
const PRIVATE = /\/(api|auth|pay|admin)(\/|$)/;
const cacheable = r => r && r.ok && r.status === 200 && r.type === 'basic' && !/no-store|private/i.test(r.headers.get('Cache-Control') || '');

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(['./', './manifest.webmanifest', './icon-192.png', './fonts/inter-400.woff2', './fonts/inter-600.woff2', './fonts/inter-700.woff2'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith('turkce-') && k !== SHELL && k !== AUDIO).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== 'GET' || u.origin !== location.origin || PRIVATE.test(u.pathname)) return;
  if (u.pathname.includes('/audio/')) {
    e.respondWith(caches.open(AUDIO).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (cacheable(r)) c.put(req, r.clone()); return r; });
      if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
      return net.catch(() => new Response('{}', { status: 503, headers: { 'Content-Type': 'application/json' } }));
    }));
    return;
  }
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => {
      if (cacheable(r)) { const cp = r.clone(); e.waitUntil(caches.open(SHELL).then(c => c.put('./', cp))); }
      return r;
    }).catch(async () => (await caches.match('./', { cacheName: SHELL })) || new Response('<!doctype html><meta charset="utf-8"><p style="font:18px sans-serif;padding:24px">Нет подключения к интернету. Откройте приложение, когда сеть появится.</p>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
    return;
  }
  if (/\.(png|webp|avif|woff2|webmanifest)$/.test(u.pathname)) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { if (cacheable(res)) { const cp = res.clone(); e.waitUntil(caches.open(SHELL).then(c => c.put(req, cp))); } return res; })));
  }
});
