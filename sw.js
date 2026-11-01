// Dark Battle service worker — network-first (always fresh when online), cache fallback offline.
const CACHE = 'db-v1';
const FILES = ['./', 'index.html', 'style.css', 'manifest.json', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png',
  'js/main.js', 'js/net.js', 'js/audio.js', 'js/arenas.js', 'js/boss.js', 'js/world.js', 'js/hero.js', 'js/forms.js',
  'vendor/three.module.min.js', 'vendor/peerjs.min.js', 'vendor/nostr.bundle.js'];
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).catch(() => {})); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req, { cache: 'no-cache' }).then(r => { if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); } return r; }).catch(() => caches.match(req).then(r => r || caches.match('index.html'))));
});
