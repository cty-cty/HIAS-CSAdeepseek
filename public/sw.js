const CACHE_PREFIX = 'hias-course-planner-';
const CACHE_NAME = `${CACHE_PREFIX}v15`;
const CORE_ASSETS = ['/', '/manifest.webmanifest', '/favicon.svg'];

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const response = await fetch('/', { cache: 'no-cache' });
  const html = await response.clone().text();

  await cache.put('/', response);

  const discoveredAssets = [...html.matchAll(/(?:src|href)=["']([^"'#]+)["']/g)]
    .map((match) => match[1])
    .filter((url) => url.startsWith('/') && !url.startsWith('/__'));
  const assets = [...new Set([...CORE_ASSETS.slice(1), ...discoveredAssets])];

  await Promise.allSettled(
    assets.map(async (asset) => {
      const assetResponse = await fetch(asset, { cache: 'no-cache' });
      if (assetResponse.ok) await cache.put(asset, assetResponse);
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
            await cache.put(request, response.clone());
          }
          return response;
        })
        .catch(
          async () =>
            (await caches.match(request)) ||
            (await caches.match('/')) ||
            Response.error(),
        ),
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
