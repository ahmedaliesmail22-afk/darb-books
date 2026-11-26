const APP_SHELL_CACHE = 'darb-app-shell-v1';
const APP_SHELL_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './editions/catalog.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_URLS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('darb-app-shell-') && k !== APP_SHELL_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

async function serveRangeFromCache(request, cachedResponse) {
  const rangeHeader = request.headers.get('range');
  if (!rangeHeader) return cachedResponse;

  const buf = await cachedResponse.arrayBuffer();
  const match = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
  if (!match) return cachedResponse;

  const start = Number(match[1]);
  const end = match[2] ? Math.min(Number(match[2]), buf.byteLength - 1) : buf.byteLength - 1;
  if (start >= buf.byteLength || start > end) {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${buf.byteLength}` },
    });
  }

  return new Response(buf.slice(start, end + 1), {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': cachedResponse.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Range': `bytes ${start}-${end}/${buf.byteLength}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // ملفات الكتب والصوتيات المخزنة عند الطلب: الأولوية للكاش إن وُجد، وإلا الشبكة بدون فرض تنزيل مسبق
  if (url.pathname.includes('/audio/') || url.pathname.includes('/editions/')) {
    event.respondWith(
      caches.match(req, { ignoreVary: true }).then(async (cached) => {
        if (cached) {
          return serveRangeFromCache(req, cached);
        }
        try {
          const networkRes = await fetch(req);
          if (url.pathname.endsWith('catalog.json') && networkRes.ok) {
            const shellCache = await caches.open(APP_SHELL_CACHE);
            shellCache.put(req, networkRes.clone());
          }
          return networkRes;
        } catch (err) {
          return caches.match(req, { ignoreSearch: true }) || Response.error();
        }
      })
    );
    return;
  }

  // هيكل التطبيق (HTML / JS / CSS / Icons): Network-First مع تحديث الكاش
  if (
    req.mode === 'navigate' ||
    url.pathname.includes('/assets/') ||
    url.pathname.endsWith('.webmanifest') ||
    url.pathname.includes('/icons/')
  ) {
    event.respondWith(
      fetch(req)
        .then(async (networkRes) => {
          if (networkRes.ok) {
            const cache = await caches.open(APP_SHELL_CACHE);
            cache.put(req, networkRes.clone());
          }
          return networkRes;
        })
        .catch(async () => {
          const cached = await caches.match(req, { ignoreSearch: true });
          if (cached) return cached;
          if (req.mode === 'navigate') {
            return (await caches.match('./index.html')) || Response.error();
          }
          return Response.error();
        })
    );
  }
});
