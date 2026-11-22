/**
 * Turns the master SVG into files: raster formats via canvas, PDF via the
 * dependency-free writer in core. Also download, clipboard and Web Share.
 */
import { buildPdf } from '../../core/pdf.ts';

export type ExportFormat = 'svg' | 'png' | 'jpeg' | 'webp' | 'pdf';
export const EXPORT_FORMATS: ExportFormat[] = ['png', 'svg', 'pdf', 'jpeg', 'webp'];

const MIME: Record<ExportFormat, string> = {
  svg: 'image/svg+xml',
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  pdf: 'application/pdf',
};
const EXT: Record<ExportFormat, string> = { svg: 'svg', png: 'png', jpeg: 'jpg', webp: 'webp', pdf: 'pdf' };

export const svgDataUrl = (svg: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

async function loadSvg(svg: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = 'async';
  img.src = svgDataUrl(svg);
  await img.decode();
  return img;
}

/**
 * Rasterises the SVG. `width` is the output width in pixels; `opaque` paints
 * white underneath (JPEG and PDF have no alpha channel).
 */
export async function rasterize(svg: string, aspect: number, width: number, opaque: boolean): Promise<HTMLCanvasElement> {
  const img = await loadSvg(svg);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width);
  canvas.height = Math.round(width * aspect);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  if (opaque) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(`${type} not supported`))), type, quality);
  });
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export interface ExportOptions {
  format: ExportFormat;
  /** Raster width in pixels. */
  width: number;
  /** Printed width for PDF in millimetres. */
  printMm: number;
  /** height / width of the SVG. */
  aspect: number;
  title: string;
}

export async function exportBlob(svg: string, o: ExportOptions): Promise<Blob> {
  if (o.format === 'svg') {
    return new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${svg}`], { type: MIME.svg });
  }
  if (o.format === 'pdf') {
    // 600 dpi equivalent is plenty for crisp module edges.
    const px = Math.min(4000, Math.max(600, Math.round((o.printMm / 25.4) * 600)));
    const canvas = await rasterize(svg, o.aspect, px, true);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const rgb = new Uint8Array((rgba.length / 4) * 3);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
      rgb[j] = rgba[i] ?? 0;
      rgb[j + 1] = rgba[i + 1] ?? 0;
      rgb[j + 2] = rgba[i + 2] ?? 0;
    }
    const pdf = buildPdf({ data: await deflate(rgb), width: canvas.width, height: canvas.height }, { widthMm: o.printMm, title: o.title });
    return new Blob([pdf as BlobPart], { type: MIME.pdf });
  }
  const canvas = await rasterize(svg, o.aspect, o.width, o.format === 'jpeg');
  return canvasBlob(canvas, MIME[o.format], o.format === 'png' ? undefined : 0.95);
}

export function fileName(base: string, format: ExportFormat, now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`;
  return `qr-${base}-${stamp}.${EXT[format]}`;
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const canShareFiles = (): boolean => {
  try {
    return typeof navigator.canShare === 'function'
      && navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] });
  } catch {
    return false;
  }
};

export const canShare = (): boolean => typeof navigator.share === 'function';

/** Shares a file if possible, otherwise text. Resolves false when cancelled. */
export async function share(data: { file?: File; text?: string; title?: string }): Promise<boolean> {
  try {
    if (data.file && navigator.canShare?.({ files: [data.file] })) {
      await navigator.share({ files: [data.file], title: data.title });
    } else {
      await navigator.share({ text: data.text, title: data.title });
    }
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return false;
    throw error;
  }
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

export const canCopyImage = (): boolean => typeof ClipboardItem !== 'undefined' && Boolean(navigator.clipboard?.write);

export async function copyImage(blob: Promise<Blob>): Promise<void> {
  // Pass the promise directly - Safari requires the write in the same task as the click.
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

/** Downscales a user-picked logo to a small PNG data URL (keeps storage small). */
export async function logoToDataUrl(file: Blob, max = 256): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, max / Math.max(img.naturalWidth || max, img.naturalHeight || max));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round((img.naturalWidth || max) * scale));
    canvas.height = Math.max(1, Math.round((img.naturalHeight || max) * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Plain download of a text file (vcf, ics). */
export function downloadText(text: string, name: string, type: string): void {
  downloadBlob(new Blob([text], { type }), name);
}
