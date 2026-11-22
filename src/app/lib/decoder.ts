/** Promise API around the decoder worker; one shared worker per page. */
import type { DecodeRequest, DecodeResponse, DecodedCode } from './decoder.worker.ts';

export type { DecodedCode } from './decoder.worker.ts';

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (c: DecodedCode[]) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./decoder.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<DecodeResponse>) => {
    const p = pending.get(event.data.id);
    if (!p) return;
    pending.delete(event.data.id);
    if (event.data.ok) p.resolve(event.data.codes);
    else p.reject(new Error(event.data.error));
  };
  worker.onerror = (event) => {
    for (const p of pending.values()) p.reject(new Error(event.message || 'worker error'));
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

export function decode(image: ImageData, opts: { qrOnly?: boolean; thorough?: boolean } = {}): Promise<DecodedCode[]> {
  const id = nextId++;
  const request: DecodeRequest = { id, image, qrOnly: opts.qrOnly ?? false, thorough: opts.thorough ?? true };
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage(request, [image.data.buffer]);
  });
}

/** Max edge for still images; larger photos are scaled down first. */
const MAX_EDGE = 2400;

/** Decodes an image file (photo, screenshot) - respects EXIF orientation. */
export async function decodeFile(file: Blob): Promise<DecodedCode[]> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return decode(ctx.getImageData(0, 0, w, h), { thorough: true });
}
