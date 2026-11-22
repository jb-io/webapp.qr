/**
 * Picks up data that Android shared into the installed app. The service
 * worker parked it in Cache Storage (see src/sw/sw-template.js); we read it
 * once and delete it immediately.
 */
const SHARE_CACHE = 'qr-lokal-share';

export interface SharedFile { name: string; type: string; blob: Blob }
export interface SharedData { title: string; text: string; url: string; files: SharedFile[] }

export async function takeSharedData(): Promise<SharedData | null> {
  if (!('caches' in window)) return null;
  const cache = await caches.open(SHARE_CACHE);
  const metaResponse = await cache.match('shared/meta');
  if (!metaResponse) return null;
  const meta = (await metaResponse.json()) as { title?: string; text?: string; url?: string; files?: { name: string; type: string }[] };
  const files: SharedFile[] = [];
  for (const [i, f] of (meta.files ?? []).entries()) {
    const res = await cache.match(`shared/file/${i}`);
    if (res) files.push({ name: f.name, type: f.type, blob: await res.blob() });
  }
  await caches.delete(SHARE_CACHE);
  return { title: meta.title ?? '', text: meta.text ?? '', url: meta.url ?? '', files };
}

export const isVcard = (f: SharedFile) => /vcard|x-vcard/i.test(f.type) || /\.vcf$/i.test(f.name);
export const isCalendar = (f: SharedFile) => /calendar/i.test(f.type) || /\.ics$/i.test(f.name);
export const isImage = (f: SharedFile) => f.type.startsWith('image/');
export const isText = (f: SharedFile) => f.type.startsWith('text/') || /\.txt$/i.test(f.name);
