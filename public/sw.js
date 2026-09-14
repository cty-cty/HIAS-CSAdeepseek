const CACHE_PREFIX = 'hias-course-planner-';
const CACHE_NAME = `${CACHE_PREFIX}v16`;
const SCOPE = self.registration.scope;
const CORE_ASSETS = ['./', './manifest.webmanifest', './icon-192.png'];

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.allSettled(
    CORE_ASSETS.map(async (asset) => {
      const url = new URL(asset, SCOPE).href;
      try {
        const response = await fetch(url, { cache: 'no-cache' });
        if (response.ok) await cache.put(url, response);
      } catch {
        // 离线安装时忽略失败
      }
    }),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheAppShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter(
              (name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME,
            )
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(SCOPE, response.clone());
          }
          return response;
        })
        .catch(async () => (await caches.match(SCOPE)) || Response.error()),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, response.clone());
          }
          return response;
        }),
    ),
  );
});
