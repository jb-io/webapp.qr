/**
 * Static quality analysis of a generated code: contrast, quiet zone, logo
 * coverage versus error-correction budget, capacity, print size. The
 * decoding check with a real reader happens in the app on top of this.
 */
import { computeLayout } from './render.ts';
import { EC_RECOVERY } from './types.ts';
import type { Finding, QrMatrix, QrStyle } from './types.ts';

/** `#rgb` / `#rrggbb` -> [r, g, b] in 0..255, or null. */
export function parseHex(color: string): [number, number, number] | null {
  const m = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(color.trim());
  if (!m || !m[1]) return null;
  const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

/** WCAG 2.x relative luminance. */
export function luminance(color: string): number {
  const rgb = parseHex(color);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export type Quality = 'good' | 'fair' | 'poor';

export interface Analysis {
  findings: Finding[];
  quality: Quality;
  /** Share of the data capacity in use, 0..1. */
  fill: number;
  /** Share of symbol modules hidden by the logo, 0..1. */
  logoCoverage: number;
  /** Suggested minimum printed edge length in millimetres. */
  minPrintMm: number;
}

/** Module edge used for the print-size suggestion (good phone cameras). */
const MIN_MODULE_MM = 0.4;

export function analyze(m: QrMatrix, s: QrStyle, outputPx: number): Analysis {
  const findings: Finding[] = [];
  const layout = computeLayout(m, s);
  const add = (code: string, severity: Finding['severity'], params?: Finding['params']) =>
    findings.push(params ? { code, severity, params } : { code, severity });

  // Background behind the code: for transparent output assume white paper.
  const bg = s.transparentBackground ? '#ffffff' : s.background;
  const ratio = contrastRatio(s.foreground, bg);
  const r1 = Math.round(ratio * 10) / 10;
  if (ratio < 3) add('contrastLow', 'error', { ratio: r1 });
  else if (ratio < 5) add('contrastFair', 'warn', { ratio: r1 });
  else add('contrastGood', 'ok', { ratio: r1 });

  if (s.eyeColor && contrastRatio(s.eyeColor, bg) < 3) add('eyeContrastLow', 'error');

  if (luminance(s.foreground) > luminance(bg)) add('inverted', 'warn');
  if (s.transparentBackground) add('transparent', 'info');

  if (s.quietZone < 2) add('quietZoneSmall', 'error', { modules: s.quietZone });
  else if (s.quietZone < 4) add('quietZoneReduced', 'warn', { modules: s.quietZone });
  else add('quietZoneOk', 'ok', { modules: s.quietZone });

  const fill = m.usedDataBits / m.capacityDataBits;
  add('capacity', fill > 0.95 ? 'info' : 'ok', { percent: Math.round(fill * 100) });

  let logoCoverage = 0;
  if (layout.logoBox) {
    logoCoverage = (layout.logoBox.size * layout.logoBox.size) / (m.size * m.size);
    const budget = EC_RECOVERY[m.ecLevel];
    const params = { percent: Math.round(logoCoverage * 100), budget: Math.round(budget * 100) };
    if (logoCoverage > budget * 0.75) add('logoTooLarge', 'error', params);
    else if (logoCoverage > budget * 0.5) add('logoLarge', 'warn', params);
    else add('logoOk', 'ok', params);
    if (m.ecLevel === 'L' || m.ecLevel === 'M') add('logoLowEc', 'warn');
  }

  if (s.moduleShape === 'dots' || s.moduleShape === 'gapped') add('shapeSparse', 'info');
  if (m.version >= 15) add('dense', 'info', { version: m.version });

  const pxPerModule = outputPx / layout.width;
  if (pxPerModule < 3) add('pixelsLow', 'warn', { px: Math.round(pxPerModule * 10) / 10 });

  const minPrintMm = Math.ceil((layout.width * MIN_MODULE_MM) / 5) * 5;
  add('printSize', 'info', { mm: minPrintMm, cm: Math.round(minPrintMm / 10 * 10) / 10 });

  const errors = findings.filter((f) => f.severity === 'error').length;
  const warns = findings.filter((f) => f.severity === 'warn').length;
  const quality: Quality = errors ? 'poor' : warns ? 'fair' : 'good';
  return { findings, quality, fill, logoCoverage, minPrintMm };
}
