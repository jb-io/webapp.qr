/* Service worker for QR lokal - generated into dist/sw.js at build time.
 *
 * - Precaches the complete app so that it works offline (bypassing the HTTP
 *   cache, so a fresh deploy never mixes old and new files).
 * - Serves everything cache-first; there is nothing remote to fetch anyway.
 * - Receives Android share-target POSTs, parks the shared data in a cache
 *   entry for the page and redirects to the app (POST cannot reach a
 *   static host such as GitHub Pages).
 * - Only ever touches caches named `qr-lokal-*`: the origin
 *   (jb-io.github.io) is shared with other projects.
 */
const VERSION = '__VERSION__';
const PREFIX = 'qr-lokal-';
const CACHE = `${PREFIX}${VERSION}`;
const SHARE_CACHE = `${PREFIX}share`;
const PRECACHE = __PRECACHE__;
/** Upper bounds for shared files - protects the cache quota. */
const MAX_FILES = 10;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE && k !== SHARE_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

const appUrl = (query) => new URL(`./?${query}#/shared`, self.registration.scope).href;

async function handleShare(request) {
  try {
    const form = await request.formData();
    await caches.delete(SHARE_CACHE);
    const cache = await caches.open(SHARE_CACHE);
    const files = [];
    for (const file of form.getAll('files').slice(0, MAX_FILES)) {
      if (typeof file === 'string' || file.size > MAX_FILE_BYTES) continue;
      await cache.put(`shared/file/${files.length}`, new Response(file, { headers: { 'Content-Type': file.type || 'application/octet-stream' } }));
      files.push({ name: file.name, type: file.type });
    }
    const meta = {
      title: String(form.get('title') ?? ''),
      text: String(form.get('text') ?? ''),
      url: String(form.get('url') ?? ''),
      files,
    };
    await cache.put('shared/meta', new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } }));
    return Response.redirect(appUrl('shared=1'), 303);
  } catch {
    await caches.delete(SHARE_CACHE).catch(() => undefined);
    return Response.redirect(appUrl('shared=error'), 303);
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Only requests inside our own scope - never answer for other projects on the origin.
  if (!url.href.startsWith(self.registration.scope)) return;

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
