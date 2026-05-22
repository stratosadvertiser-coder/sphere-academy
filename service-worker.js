/* ============================================================
   Sphere Academy — Service Worker (PWA shell)
   ============================================================
   NETWORK-FIRST for everything (CSS/JS/HTML/images). Cache is
   used only as an offline fallback. This guarantees users
   always see the latest code when online — no stale assets
   after a deploy.

   Previously this SW used cache-first for static assets, which
   meant users on Chrome were stuck on the first version they
   loaded until the SW cache was manually cleared. Switched to
   network-first below to fix that.

   Firebase / Firestore / Storage / Jitsi requests are passed
   straight through so realtime sync + auth stay untouched.
   ============================================================ */
const CACHE_VERSION = 'sphere-pwa-2025-05-22-net-first';
const SHELL_CACHE = CACHE_VERSION + '-shell';

const SHELL_URLS = [
  './',
  './index.html',
  './dashboard.html',
  './course.html',
  './profile.html',
  './lesson.html',
  './styles.css',
  './script.js',
  './logo.png',
  './favicon.png',
  './manifest.json',
  './404.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => {
      return Promise.all(
        SHELL_URLS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] failed to pre-cache', url, err && err.message);
          })
        )
      );
    })
  );
  // Activate the new SW immediately, kicking the old one out.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Delete EVERY old cache, not just sphere-pwa-* ones — defensive
  // cleanup in case prior versions left stragglers behind.
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GETs.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // SKIP the SW entirely for third-party / API traffic — Firebase,
  // Google APIs, Jitsi, CDNs. They manage their own caching and
  // we don't want to interfere with auth or real-time sync.
  const skipHosts = [
    'firebaseapp.com',
    'firebaseio.com',
    'firestore.googleapis.com',
    'googleapis.com',
    'gstatic.com',
    'meet.jit.si'
  ];
  if (skipHosts.some((host) => url.hostname.indexOf(host) !== -1)) return;

  // NETWORK-FIRST for everything else (HTML, CSS, JS, images).
  // Try the network, fall back to cache only when offline. This
  // ensures users always see fresh assets after a deploy — the
  // only role of the cache is offline resilience.
  event.respondWith(
    fetch(req)
      .then((resp) => {
        // Update the cache in the background with the fresh response
        // so the offline fallback stays current too.
        if (resp && resp.status === 200 && (resp.type === 'basic' || resp.type === 'opaque')) {
          const copy = resp.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return resp;
      })
      .catch(() => {
        // Offline — try the cache. For HTML navs, fall through to
        // 404.html as a last resort.
        return caches.match(req).then((cached) => {
          if (cached) return cached;
          if (req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') !== -1) {
            return caches.match('./404.html');
          }
          return new Response('', { status: 503, statusText: 'Offline' });
        });
      })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
