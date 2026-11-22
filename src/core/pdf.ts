/**
 * Minimal single-page PDF writer that embeds one lossless image. The pixel
 * data must already be zlib-compressed RGB (the browser's
 * `CompressionStream('deflate')` yields exactly that), so this module stays
 * dependency-free and testable.
 */

export interface PdfImage {
  /** zlib stream of `width * height * 3` RGB bytes. */
  data: Uint8Array;
  width: number;
  height: number;
}

export interface PdfOptions {
  /** Edge length of the printed image in millimetres (width). */
  widthMm: number;
  /** Page size; the image is centred. Default A4 portrait. */
  pageMm?: [number, number];
  title?: string;
}

const MM_TO_PT = 72 / 25.4;

/** PDF text string with the required escapes (ASCII only, rest replaced). */
export function pdfString(value: string): string {
  const ascii = value.replace(/[^\x20-\x7e]/g, '?');
  return `(${ascii.replace(/([\\()])/g, '\\$1')})`;
}

export function buildPdf(image: PdfImage, options: PdfOptions): Uint8Array {
  const [pageW, pageH] = (options.pageMm ?? [210, 297]).map((v) => v * MM_TO_PT) as [number, number];
  const w = Math.min(options.widthMm * MM_TO_PT, pageW - 20 * MM_TO_PT);
  const h = (w * image.height) / image.width;
  const x = (pageW - w) / 2;
  const y = Math.max(0, (pageH - h) / 2);
  const f = (n: number) => n.toFixed(2);

  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === 'string' ? enc.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, body: string | (string | Uint8Array)[]) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    for (const part of Array.isArray(body) ? body : [body]) push(part);
    push('\nendobj\n');
  };

  const content = `q ${f(w)} 0 0 ${f(h)} ${f(x)} ${f(y)} cm /Im0 Do Q`;

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(pageW)} ${f(pageH)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  object(4, [
    `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${image.data.length} >>\nstream\n`,
    image.data,
    '\nendstream',
  ]);
  object(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  object(6, `<< /Producer (webapp.qr)${options.title ? ` /Title ${pdfString(options.title)}` : ''} >>`);

  const xref = length;
  const count = offsets.length;
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let i = 1; i < count; i++) table += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}
