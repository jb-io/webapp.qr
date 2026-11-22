/**
 * Domain types - the single source of truth for everything that is stored,
 * rendered or exported. Look here first.
 */

// --------------------------------------------------------------- content

/** Content types the generator can produce. */
export type CreateType =
  | 'text'
  | 'url'
  | 'wifi'
  | 'contact'
  | 'email'
  | 'sms'
  | 'phone'
  | 'geo'
  | 'event'
  | 'epc';

export const CREATE_TYPES: readonly CreateType[] = [
  'url', 'text', 'wifi', 'contact', 'email', 'phone', 'sms', 'geo', 'event', 'epc',
];

export interface TextContent { type: 'text'; text: string }
export interface UrlContent { type: 'url'; url: string }
/** `SAE` = WPA3-only networks; `WPA` covers WPA/WPA2 (and WPA2/3 transition). */
export type WifiSecurity = 'WPA' | 'SAE' | 'WEP' | 'nopass';
export interface WifiContent {
  type: 'wifi';
  ssid: string;
  password: string;
  security: WifiSecurity;
  hidden: boolean;
}
export interface ContactContent {
  type: 'contact';
  firstName: string;
  lastName: string;
  organization: string;
  title: string;
  phone: string;
  mobile: string;
  email: string;
  website: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  note: string;
}
export interface EmailContent { type: 'email'; to: string; subject: string; body: string }
export interface SmsContent { type: 'sms'; number: string; message: string }
export interface PhoneContent { type: 'phone'; number: string }
export interface GeoContent { type: 'geo'; latitude: string; longitude: string; label: string }
export interface EventContent {
  type: 'event';
  title: string;
  location: string;
  description: string;
  allDay: boolean;
  /** `YYYY-MM-DDTHH:mm` (or `YYYY-MM-DD` when all-day), local floating time. */
  start: string;
  end: string;
}
/** SEPA credit transfer (EPC069-12, known as "GiroCode" in Germany). */
export interface EpcContent {
  type: 'epc';
  name: string;
  iban: string;
  bic: string;
  /** Decimal amount as typed by the user, e.g. `12.50`; empty = no amount. */
  amount: string;
  reference: string;
  text: string;
}

export type CreateContent =
  | TextContent
  | UrlContent
  | WifiContent
  | ContactContent
  | EmailContent
  | SmsContent
  | PhoneContent
  | GeoContent
  | EventContent
  | EpcContent;

/** Content types recognised when reading - a superset of {@link CreateType}. */
export type ReadType = CreateType | 'otp' | 'product' | 'uri';

// ------------------------------------------------------------- QR matrix

export type EcLevel = 'L' | 'M' | 'Q' | 'H';
export const EC_LEVELS: readonly EcLevel[] = ['L', 'M', 'Q', 'H'];
/** Approximate share of codewords each level can restore. */
export const EC_RECOVERY: Record<EcLevel, number> = { L: 0.07, M: 0.15, Q: 0.25, H: 0.3 };

export type SegmentMode = 'Numeric' | 'Alphanumeric' | 'Byte' | 'Kanji';

export interface QrMatrix {
  /** Modules per side (17 + 4 * version). */
  size: number;
  version: number;
  ecLevel: EcLevel;
  mask: number;
  /** Row-major, 1 = dark. */
  dark: Uint8Array;
  /** Row-major, 1 = function module (finder, timing, alignment, format/version info). */
  reserved: Uint8Array;
  segments: { mode: SegmentMode; length: number }[];
  /** Data bits actually used (headers + payload, without padding). */
  usedDataBits: number;
  /** Data bits available at this version / level. */
  capacityDataBits: number;
  totalCodewords: number;
  ecCodewords: number;
  ecBlocks: number;
}

export interface MatrixOptions {
  ecLevel: EcLevel;
  /** 0 = smallest version that fits. */
  minVersion: number;
  /** -1 = choose best mask automatically. */
  mask: number;
}

// ----------------------------------------------------------------- style

export type ModuleShape = 'square' | 'rounded' | 'dots' | 'gapped';
export type EyeShape = 'square' | 'rounded' | 'circle';
export type FrameStyle = 'none' | 'border' | 'rounded' | 'banner';
export type LabelPosition = 'top' | 'bottom';
export type LabelSize = 's' | 'm' | 'l';

export interface QrStyle {
  foreground: string;
  background: string;
  transparentBackground: boolean;
  /** Separate colour for the three finder patterns; empty = foreground. */
  eyeColor: string;
  moduleShape: ModuleShape;
  eyeFrameShape: EyeShape;
  eyeBallShape: EyeShape;
  /** Quiet zone in modules; the standard asks for 4. */
  quietZone: number;
  frame: FrameStyle;
  frameColor: string;
  label: string;
  labelPosition: LabelPosition;
  labelSize: LabelSize;
  labelColor: string;
  /** Logo as data URL, already downscaled by the UI; empty = none. */
  logo: string;
  /** Logo edge length relative to the symbol width (0.1 - 0.3). */
  logoSize: number;
  /** Remove modules under the logo (cleaner look, costs redundancy). */
  logoExcavate: boolean;
  /** Draw a background plate behind the logo. */
  logoPlate: boolean;
}

export const DEFAULT_STYLE: QrStyle = {
  foreground: '#111827',
  background: '#ffffff',
  transparentBackground: false,
  eyeColor: '',
  moduleShape: 'square',
  eyeFrameShape: 'square',
  eyeBallShape: 'square',
  quietZone: 4,
  frame: 'none',
  frameColor: '#111827',
  label: '',
  labelPosition: 'bottom',
  labelSize: 'm',
  labelColor: '',
  logo: '',
  logoSize: 0.22,
  logoExcavate: true,
  logoPlate: true,
};

// -------------------------------------------------------------- analysis

export type Severity = 'ok' | 'info' | 'warn' | 'error';

/** One finding of the static quality analysis, rendered via i18n by code. */
export interface Finding {
  code: string;
  severity: Severity;
  params?: Record<string, string | number>;
}

// --------------------------------------------------------------- history

export interface ScanEntry {
  id: string;
  /** ISO timestamp. */
  at: string;
  text: string;
  /** zxing format name, e.g. `QRCode`, `EAN13`. */
  format: string;
  /** Detected content type. */
  contentType: ReadType;
  /** Where it came from. */
  source: 'camera' | 'image';
}

export interface CreateEntry {
  id: string;
  at: string;
  content: CreateContent;
  style: QrStyle;
  options: MatrixOptions;
  /** Encoded payload for quick display. */
  payload: string;
}

export interface HistoryDoc {
  schema: 1;
  scans: ScanEntry[];
  created: CreateEntry[];
}

export type Theme = 'system' | 'light' | 'dark';
export type Language = 'de' | 'en';

export interface Settings {
  schema: 1;
  language: Language | 'auto';
  theme: Theme;
  saveScans: boolean;
  saveCreated: boolean;
  /** Short vibration when a code was recognised (where supported). */
  vibrate: boolean;
}
