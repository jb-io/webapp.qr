/* Service worker for QR lokal - generated into dist/sw.js at build time.
 *
 * - Precaches the complete app so that it works offline.
 * - Serves everything cache-first; there is nothing remote to fetch anyway.
 * - Receives Android share-target POSTs, parks the shared data in a cache
 *   entry for the page and redirects to the app (POST cannot reach a
 *   static host such as GitHub Pages).
 */
const VERSION = '__VERSION__';
const CACHE = `qr-lokal-${VERSION}`;
const SHARE_CACHE = 'qr-lokal-share';
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE && k !== SHARE_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

async function handleShare(request) {
  const form = await request.formData();
  const files = [];
  for (const file of form.getAll('files')) {
    if (typeof file === 'string') continue;
    files.push({ name: file.name, type: file.type, data: await file.arrayBuffer() });
  }
  const payload = {
    title: String(form.get('title') ?? ''),
    text: String(form.get('text') ?? ''),
    url: String(form.get('url') ?? ''),
    files: files.map((f) => ({ name: f.name, type: f.type, size: f.data.byteLength })),
  };
  const cache = await caches.open(SHARE_CACHE);
  await cache.put('shared/meta', new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json' } }));
  await Promise.all(files.map((f, i) => cache.put(`shared/file/${i}`, new Response(f.data, { headers: { 'Content-Type': f.type || 'application/octet-stream' } }))));
  return Response.redirect(new URL('./?shared=1#/shared', self.registration.scope).href, 303);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    event.respondWith(handleShare(request));
    return;
  }
  if (request.method !== 'GET') return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (request.mode === 'navigate') {
      return (await cache.match('./')) ?? fetch(request);
    }
    const hit = await cache.match(request, { ignoreSearch: true });
    return hit ?? fetch(request);
  })());
});
