/**
 * Decoding runs in a worker so that the camera preview stays smooth. The
 * WebAssembly binary is bundled with the app; the library's default of
 * loading it from a CDN is overridden (no external requests, see
 * Architecture.md A4).
 */
import { prepareZXingModule, readBarcodes, type ReaderOptions } from 'zxing-wasm/reader';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? new URL(wasmUrl, self.location.href).href : prefix + path),
  },
});

export interface DecodeRequest {
  id: number;
  image: ImageData;
  /** `QRCode` only for verification; everything for scanning. */
  qrOnly: boolean;
  /** Spend more time (still images) or less (camera frames). */
  thorough: boolean;
}

export interface DecodedCode {
  text: string;
  format: string;
  version: string;
  ecLevel: string;
  mask: string;
  /** Unused error-correction margin 0..1, or -1 if not reported. */
  uec: number;
  isMirrored: boolean;
  isInverted: boolean;
  position: { x: number; y: number }[];
}

export type DecodeResponse =
  | { id: number; ok: true; codes: DecodedCode[] }
  | { id: number; ok: false; error: string };

function parseExtra(extra: string): Record<string, unknown> {
  try {
    return extra ? (JSON.parse(extra) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

self.onmessage = async (event: MessageEvent<DecodeRequest>) => {
  const { id, image, qrOnly, thorough } = event.data;
  const options: ReaderOptions = {
    formats: qrOnly ? ['QRCode'] : [],
    tryHarder: thorough,
    tryRotate: true,
    tryInvert: true,
    tryDownscale: true,
    maxNumberOfSymbols: thorough ? 16 : 4,
  };
  try {
    const results = await readBarcodes(image, options);
    const codes: DecodedCode[] = results.filter((r) => r.isValid).map((r) => {
      const extra = parseExtra(r.extra);
      const uec = typeof extra.UEC === 'number' ? extra.UEC : Number(extra.UEC ?? -1);
      const p = r.position;
      return {
        text: r.text,
        format: r.format,
        version: String(extra.Version ?? r.version ?? ''),
        ecLevel: String(extra.ECLevel ?? r.ecLevel ?? ''),
        mask: String(extra.DataMask ?? ''),
        uec: Number.isFinite(uec) ? uec : -1,
        isMirrored: r.isMirrored,
        isInverted: r.isInverted,
        position: [p.topLeft, p.topRight, p.bottomRight, p.bottomLeft],
      };
    });
    self.postMessage({ id, ok: true, codes } satisfies DecodeResponse);
  } catch (error) {
    self.postMessage({ id, ok: false, error: error instanceof Error ? error.message : String(error) } satisfies DecodeResponse);
  }
};
