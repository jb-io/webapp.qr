/**
 * Encodes a payload into a QR module matrix plus the figures the quality
 * analysis needs (capacity, codewords). Encoding is done by the `qrcode`
 * package; we only read its result.
 */
import QRCode from 'qrcode';
import Utils from 'qrcode/lib/core/utils.js';
import Ecc from 'qrcode/lib/core/error-correction-code.js';
import Mode from 'qrcode/lib/core/mode.js';
import type { EcLevel, MatrixOptions, QrMatrix, SegmentMode } from './types.ts';

const LEVEL_BITS: Record<number, EcLevel> = { 1: 'L', 0: 'M', 3: 'Q', 2: 'H' };

export class CapacityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CapacityError';
  }
}

export function createMatrix(payload: string, options: MatrixOptions): QrMatrix {
  let qr: QRCode.QRCode;
  try {
    qr = QRCode.create(payload, {
      errorCorrectionLevel: options.ecLevel,
      ...(options.minVersion > 0 ? { version: options.minVersion } : {}),
      ...(options.mask >= 0 ? { maskPattern: options.mask as QRCode.QRCodeMaskPattern } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // A fixed version that is too small: retry with the smallest that fits.
    if (options.minVersion > 0 && /cannot contain/i.test(message)) {
      return createMatrix(payload, { ...options, minVersion: 0 });
    }
    throw new CapacityError(message);
  }

  const size = qr.modules.size;
  const version = qr.version;
  const level = LEVEL_BITS[qr.errorCorrectionLevel.bit] ?? options.ecLevel;
  const levelRef = qr.errorCorrectionLevel;

  const segments = qr.segments.map((s) => ({
    mode: s.mode.id as SegmentMode,
    length: s.getLength(),
  }));
  const usedDataBits = qr.segments.reduce(
    (sum, s) => sum + 4 + Mode.getCharCountIndicator(s.mode, version) + s.getBitsLength(),
    0,
  );
  const totalCodewords = Utils.getSymbolTotalCodewords(version);
  const ecCodewords = Ecc.getTotalCodewordsCount(version, levelRef);

  return {
    size,
    version,
    ecLevel: level,
    mask: qr.maskPattern ?? -1,
    dark: Uint8Array.from(qr.modules.data),
    segments,
    usedDataBits,
    capacityDataBits: (totalCodewords - ecCodewords) * 8,
    totalCodewords,
    ecCodewords,
    ecBlocks: Ecc.getBlocksCount(version, levelRef),
  };
}

export const isDark = (m: QrMatrix, row: number, col: number): boolean =>
  row >= 0 && col >= 0 && row < m.size && col < m.size && m.dark[row * m.size + col] === 1;

/** True for modules that belong to one of the three 7x7 finder patterns. */
export function isFinder(size: number, row: number, col: number): boolean {
  const near = (v: number) => v < 7;
  const far = (v: number) => v >= size - 7;
  return (near(row) && near(col)) || (near(row) && far(col)) || (far(row) && near(col));
}
