/* ============================================================
   Sphere Academy — Service Worker (PWA shell)
   ============================================================
   Purpose: enables "Add to Home Screen" / installability and a
   minimal app shell so the user lands instantly when they tap
   the icon. We intentionally keep the cache strategy LIGHT to
   avoid serving stale Firestore/auth state — most data still
   flows through the network and Firebase SDK.

   Caching strategy:
   - Pre-cache the bare app shell: index.html, dashboard.html,
     styles.css, logo, manifest, favicon. So launching offline
     shows the shell instantly.
   - Network-first for everything else (HTML, JS, images): try
     the network, fall back to cache, fall back to a friendly
     offline page.
   - We DO NOT cache Firebase SDK URLs or Firestore traffic —
     those go straight through.

   Cache version bumps on every release so old caches get
   evicted when we ship updates.
   ============================================================ */
const CACHE_VERSION = 'sphere-pwa-2025-05-21-pwa';
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
  // Pre-cache the shell on install. addAll fails if ANY url 404s,
  // so we use individual .add()s wrapped in catch to tolerate
  // missing optional files.
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
  // Activate this SW as soon as install finishes (don't wait for
  // existing tabs to close).
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Clean up old caches from previous versions.
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k.startsWith('sphere-pwa-'))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GETs. Skip POST/PUT/DELETE so Firestore writes
  // and auth flows go straight through.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // SKIP the SW entirely for Firebase / Firestore / Storage /
  // Google / external CDN traffic — those have their own caching
  // and we don't want to interfere with auth or real-time sync.
  const skipHosts = [
    'firebaseapp.com',
    'firebaseio.com',
    'firestore.googleapis.com',
    'googleapis.com',
    'gstatic.com',
    'meet.jit.si'
  ];
  if (skipHosts.some((host) => url.hostname.indexOf(host) !== -1)) return;

  // Network-first for navigation requests (HTML pages); falls back
  // to cached shell when offline.
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') !== -1) {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          // Cache the successful response for next time.
          const copy = resp.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return resp;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./404.html')))
    );
    return;
  }

  // Cache-first for static assets (CSS/JS/images). Updates in
  // the background so the next load picks up changes.
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((resp) => {
          if (resp && resp.status === 200 && resp.type === 'basic') {
            const copy = resp.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return resp;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// Listen for messages from the page (e.g. "skip waiting" trigger
// when the user clicks Update in a future update banner).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
