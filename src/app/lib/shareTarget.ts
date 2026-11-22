/**
 * Picks up data that Android shared into the installed app. The service
 * worker parked it in Cache Storage (see src/sw/sw-template.js); we read it
 * once and delete it in any case - also when reading fails.
 */
export const SHARE_CACHE = 'qr-lokal-share';

export interface SharedFile { name: string; type: string; blob: Blob }
export interface SharedData { title: string; text: string; url: string; files: SharedFile[] }

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export async function takeSharedData(): Promise<SharedData | null> {
  if (!('caches' in window)) return null;
  try {
    const cache = await caches.open(SHARE_CACHE);
    const metaResponse = await cache.match('shared/meta');
    if (!metaResponse) return null;
    const meta: unknown = await metaResponse.json();
    if (typeof meta !== 'object' || meta === null) return null;
    const m = meta as Record<string, unknown>;
    const files: SharedFile[] = [];
    const list = Array.isArray(m.files) ? m.files.slice(0, 10) : [];
    for (const [i, f] of list.entries()) {
      const res = await cache.match(`shared/file/${i}`);
      const info = (typeof f === 'object' && f !== null ? f : {}) as Record<string, unknown>;
      if (res) files.push({ name: str(info.name), type: str(info.type), blob: await res.blob() });
    }
    return { title: str(m.title), text: str(m.text), url: str(m.url), files };
  } finally {
    await caches.delete(SHARE_CACHE);
  }
}

/** Removes data an earlier share left behind (e.g. the app was closed before pickup). */
export async function discardStaleShare(): Promise<void> {
  if ('caches' in window) await caches.delete(SHARE_CACHE);
}

export const isVcard = (f: SharedFile) => /vcard|x-vcard/i.test(f.type) || /\.vcf$/i.test(f.name);
export const isCalendar = (f: SharedFile) => /calendar/i.test(f.type) || /\.ics$/i.test(f.name);
export const isImage = (f: SharedFile) => f.type.startsWith('image/');
export const isText = (f: SharedFile) => f.type.startsWith('text/') || /\.txt$/i.test(f.name);
