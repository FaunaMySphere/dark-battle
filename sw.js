// Dark Battle service worker — network-first (always fresh when online), cache fallback offline.
const CACHE = 'db-v2';
const FILES = ['./', 'index.html', 'style.css', 'manifest.json', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png',
  'js/main.js', 'js/net.js', 'js/audio.js', 'js/arenas.js', 'js/boss.js', 'js/world.js', 'js/hero.js', 'js/forms.js', 'js/models.js', 'js/gfx.js', 'js/avatar.js', 'js/quests.js', 'js/questview.js',
  'vendor/three.module.min.js', 'vendor/three-addons.min.js',
  'models/adventurer.glb', 'models/blocky.glb', 'models/dragon.glb', 'models/king.glb', 'models/skeleton.glb', 'models/spider.glb', 'models/trex.glb', 'models/trooper.glb', 'models/vanguard.glb', 'models/wizard.glb', 'models/wolf.glb', 'models/zombie.glb', 'vendor/peerjs.min.js', 'vendor/nostr.bundle.js'];
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).catch(() => {})); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req, { cache: 'no-cache' }).then(r => { if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); } return r; }).catch(() => caches.match(req).then(r => r || caches.match('index.html'))));
});
