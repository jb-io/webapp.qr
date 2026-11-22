/**
 * History of scanned and generated codes, plus user settings. Both live in
 * `localStorage` only. `normalizeHistory` / `normalizeSettings` are the only
 * entry points for stored or imported data - input is `unknown` until they
 * return.
 */
import { CREATE_TYPES, DEFAULT_STYLE, EC_LEVELS } from './types.ts';
import type {
  CreateContent, CreateEntry, HistoryDoc, MatrixOptions, QrStyle, ReadType, ScanEntry, Settings,
} from './types.ts';
import { emptyContent } from './payloads.ts';
import { LOGO_MAX, LOGO_MIN } from './render.ts';

export const HISTORY_KEY = 'webapp.qr.history.v1';
export const SETTINGS_KEY = 'webapp.qr.settings.v1';
/** Keep the store small and predictable; oldest entries drop out. */
export const MAX_ENTRIES = 200;

export const DEFAULT_SETTINGS: Settings = {
  schema: 1, language: 'auto', theme: 'system', saveScans: true, saveCreated: true, vibrate: true,
};

export const DEFAULT_OPTIONS: MatrixOptions = { ecLevel: 'M', minVersion: 0, mask: -1 };

export const emptyHistory = (): HistoryDoc => ({ schema: 1, scans: [], created: [] });

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
const num = (v: unknown, fallback: number, min: number, max: number): number =>
  (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  (allowed.includes(v as T) ? (v as T) : fallback);

const READ_TYPES: readonly ReadType[] = [...CREATE_TYPES, 'otp', 'product', 'uri'];

export function normalizeStyle(raw: unknown): QrStyle {
  const r = isObj(raw) ? raw : {};
  const d = DEFAULT_STYLE;
  const color = (v: unknown, fb: string) => (typeof v === 'string' && /^#[\da-f]{6}$/i.test(v) ? v : fb);
  return {
    foreground: color(r.foreground, d.foreground),
    background: color(r.background, d.background),
    transparentBackground: bool(r.transparentBackground, d.transparentBackground),
    eyeColor: r.eyeColor === '' ? '' : color(r.eyeColor, d.eyeColor),
    moduleShape: oneOf(r.moduleShape, ['square', 'rounded', 'dots', 'gapped'], d.moduleShape),
    eyeFrameShape: oneOf(r.eyeFrameShape, ['square', 'rounded', 'circle'], d.eyeFrameShape),
    eyeBallShape: oneOf(r.eyeBallShape, ['square', 'rounded', 'circle'], d.eyeBallShape),
    quietZone: Math.round(num(r.quietZone, d.quietZone, 0, 10)),
    frame: oneOf(r.frame, ['none', 'border', 'rounded', 'banner'], d.frame),
    frameColor: color(r.frameColor, d.frameColor),
    // Slice by code points - never split a surrogate pair.
    label: Array.from(str(r.label)).slice(0, 60).join(''),
    labelPosition: oneOf(r.labelPosition, ['top', 'bottom'], d.labelPosition),
    labelSize: oneOf(r.labelSize, ['s', 'm', 'l'], d.labelSize),
    labelColor: r.labelColor === '' ? '' : color(r.labelColor, d.labelColor),
    // Only raster data URLs - never remote references.
    logo: /^data:image\/(png|jpeg|webp|gif);base64,[\w+/=]+$/.test(str(r.logo)) ? str(r.logo) : '',
    logoSize: num(r.logoSize, d.logoSize, LOGO_MIN, LOGO_MAX),
    logoExcavate: bool(r.logoExcavate, d.logoExcavate),
    logoPlate: bool(r.logoPlate, d.logoPlate),
  };
}

export function normalizeOptions(raw: unknown): MatrixOptions {
  const r = isObj(raw) ? raw : {};
  return {
    ecLevel: oneOf(r.ecLevel, EC_LEVELS, DEFAULT_OPTIONS.ecLevel),
    minVersion: Math.round(num(r.minVersion, 0, 0, 40)),
    mask: Math.round(num(r.mask, -1, -1, 7)),
  };
}

/** Accepts any object with a known `type` and fills missing fields. */
export function normalizeContent(raw: unknown): CreateContent | null {
  if (!isObj(raw)) return null;
  const type = oneOf(raw.type, CREATE_TYPES, 'text');
  if (raw.type !== type) return null;
  const base = emptyContent(type) as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { ...base };
  for (const [key, fallback] of Object.entries(base)) {
    if (key === 'type') continue;
    out[key] = typeof fallback === 'boolean' ? bool(raw[key], fallback) : str(raw[key], fallback as string);
  }
  if (type === 'wifi') out.security = oneOf(raw.security, ['WPA', 'SAE', 'WEP', 'nopass'], 'WPA');
  return out as unknown as CreateContent;
}

function normalizeScan(raw: unknown): ScanEntry | null {
  if (!isObj(raw) || typeof raw.text !== 'string' || typeof raw.id !== 'string') return null;
  return {
    id: raw.id,
    at: str(raw.at, new Date(0).toISOString()),
    text: raw.text,
    format: str(raw.format, 'QRCode'),
    contentType: oneOf(raw.contentType, READ_TYPES, 'text'),
    source: oneOf(raw.source, ['camera', 'image'], 'camera'),
  };
}

function normalizeCreated(raw: unknown): CreateEntry | null {
  if (!isObj(raw) || typeof raw.id !== 'string') return null;
  const content = normalizeContent(raw.content);
  if (!content) return null;
  return {
    id: raw.id,
    at: str(raw.at, new Date(0).toISOString()),
    content,
    style: normalizeStyle(raw.style),
    options: normalizeOptions(raw.options),
    payload: str(raw.payload),
  };
}

export function normalizeHistory(raw: unknown): HistoryDoc {
  if (!isObj(raw) || raw.schema !== 1) return emptyHistory();
  const list = <T>(v: unknown, f: (x: unknown) => T | null): T[] =>
    (Array.isArray(v) ? v.map(f).filter((x): x is T => x !== null).slice(0, MAX_ENTRIES) : []);
  return { schema: 1, scans: list(raw.scans, normalizeScan), created: list(raw.created, normalizeCreated) };
}

export function normalizeSettings(raw: unknown): Settings {
  const r = isObj(raw) ? raw : {};
  const d = DEFAULT_SETTINGS;
  return {
    schema: 1,
    language: oneOf(r.language, ['auto', 'de', 'en'], d.language),
    theme: oneOf(r.theme, ['system', 'light', 'dark'], d.theme),
    saveScans: bool(r.saveScans, d.saveScans),
    saveCreated: bool(r.saveCreated, d.saveCreated),
    vibrate: bool(r.vibrate, d.vibrate),
  };
}

// ----------------------------------------------------------- mutations

/** Newest first; an identical previous entry moves to the top instead of duplicating. */
export function addScan(doc: HistoryDoc, entry: ScanEntry): HistoryDoc {
  const rest = doc.scans.filter((s) => !(s.text === entry.text && s.format === entry.format));
  return { ...doc, scans: [entry, ...rest].slice(0, MAX_ENTRIES) };
}

export function addCreated(doc: HistoryDoc, entry: CreateEntry): HistoryDoc {
  const key = (e: CreateEntry) => JSON.stringify([e.payload, e.style, e.options]);
  const k = key(entry);
  const rest = doc.created.filter((c) => key(c) !== k);
  return { ...doc, created: [entry, ...rest].slice(0, MAX_ENTRIES) };
}

export function removeEntry(doc: HistoryDoc, id: string): HistoryDoc {
  return { ...doc, scans: doc.scans.filter((s) => s.id !== id), created: doc.created.filter((c) => c.id !== id) };
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
