// Service Worker：让线上站点在离线/弱网下仍可打开。
//
// 注意：站点部署在 GitHub Pages 的子路径下（/HIAS-CSAdeepseek/），
// 因此所有地址都必须基于 self.registration.scope 计算，不能写死 '/'。
const CACHE_PREFIX = 'hias-course-planner-';
const CACHE_NAME = `${CACHE_PREFIX}v16`;

const SCOPE = self.registration.scope;
const scoped = (relativePath) => new URL(relativePath, SCOPE).href;
const INDEX_URL = scoped('./');
const CORE_ASSETS = ['./manifest.webmanifest', './favicon.svg'].map(scoped);

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const response = await fetch(INDEX_URL, { cache: 'no-cache' });
  const html = await response.clone().text();

  await cache.put(INDEX_URL, response);

  const discoveredAssets = [...html.matchAll(/(?:src|href)=["']([^"'#]+)["']/g)]
    .map((match) => match[1])
    .filter((url) => !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url))
    .map((url) => new URL(url, SCOPE).href)
    .filter((url) => url.startsWith(SCOPE));
  const assets = [...new Set([...CORE_ASSETS, ...discoveredAssets])];

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
  // 只接管本站范围内的请求
  if (!url.href.startsWith(SCOPE)) return;

  if (request.mode === 'navigate') {
    // 导航优先走网络，保证每次打开都是最新版本；失败时回退到缓存。
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(INDEX_URL, response.clone());
          }
          return response;
        })
        .catch(
          async () =>
            (await caches.match(request)) ||
            (await caches.match(INDEX_URL)) ||
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
