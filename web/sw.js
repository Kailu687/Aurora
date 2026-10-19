/* Aurora service worker: offline shell + cloud-update cache ('aurora-live'). */
const BUNDLE_BUILD = 17; // stamped by tools/publish-web.js
const CACHE = 'aurora-v2', LIVE = 'aurora-live';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'config.json', 'css/style.css', 'js/version.js', 'js/util.js', 'js/db.js', 'js/meta.js', 'js/engine.js', 'js/library.js', 'js/player.js', 'js/dj.js', 'js/updater.js', 'js/ui.js', 'js/views.js', 'js/shell.js', 'js/native.js', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE && k !== LIVE).map((k) => caches.delete(k)));
    // A newer app package than the downloaded update? Drop the stale update so the new bundle shows.
    try { const live = await caches.open(LIVE); const m = await live.match('/__live-build'); if (m && parseInt(await m.text(), 10) <= BUNDLE_BUILD) await caches.delete(LIVE); } catch { /* */ }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (e) => {
  const r = e.request, u = new URL(r.url); if (r.method !== 'GET' || u.origin !== location.origin) return;
  // Songs from the Android music folder are served natively by the app, and audio uses Range requests: never touch those here
  if (u.pathname.startsWith('/_media/') || r.headers.has('range') || r.destination === 'audio' || r.destination === 'video') return;
  e.respondWith((async () => {
    try { const live = await caches.open(LIVE); const hit = await live.match(r, { ignoreSearch: true }); if (hit) return hit; } catch { /* */ }
    try { const res = await fetch(r); if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(r, copy)); } return res; }
    catch { return (await caches.match(r, { ignoreSearch: true })) || (await caches.match('index.html')); }
  })());
});
