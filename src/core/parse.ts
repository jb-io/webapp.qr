/**
 * Interprets decoded text: which kind of content is it, which fields does it
 * carry, and - for links - is there anything suspicious about it. Nothing
 * here performs an action; the UI offers actions based on the result.
 */
import type { ReadType } from './types.ts';

export interface ParsedField { key: string; value: string; sensitive?: boolean }

export interface UrlAnalysis {
  href: string;
  scheme: string;
  host: string;
  /** Only http(s) links may be opened directly. */
  openable: boolean;
  warnings: UrlWarning[];
}

export type UrlWarning =
  | 'insecure'
  | 'punycode'
  | 'ipHost'
  | 'userinfo'
  | 'shortener'
  | 'port'
  | 'dangerousScheme';

export interface ParsedContent {
  type: ReadType;
  /** Human-readable key/value pairs (keys are i18n field keys). */
  fields: ParsedField[];
  url?: UrlAnalysis;
  /** Contains secrets (Wi-Fi password, OTP seed) - the UI masks them. */
  sensitive: boolean;
}

const LINEAR_FORMATS = /^(EAN|UPC|ISBN|Code|ITF|Codabar|DataBar|PZN|Telepen|DX)/;

/** Unescape `\;`, `\,`, `\:`, `\\`, `\"` (WIFI: / MECARD). */
function unescapeWifi(value: string): string {
  return value.replace(/\\(.)/g, '$1');
}

/** Splits `K:v;K:v;;` respecting backslash escapes. */
export function splitKeyValues(body: string): Map<string, string> {
  const out = new Map<string, string>();
  let current = '';
  const flush = () => {
    const i = current.indexOf(':');
    if (i > 0) {
      const key = current.slice(0, i).toUpperCase();
      if (!out.has(key)) out.set(key, unescapeWifi(current.slice(i + 1)));
    }
    current = '';
  };
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '\\' && i + 1 < body.length) {
      current += ch + body[i + 1];
      i++;
    } else if (ch === ';') {
      flush();
    } else {
      current += ch;
    }
  }
  flush();
  return out;
}

function unescapeVText(value: string): string {
  return value.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
}

/** Very small vCard / iCalendar line reader (handles folded lines). */
export function readProperties(text: string): { name: string; params: string; value: string }[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  return unfolded.split(/\r?\n/).flatMap((line) => {
    const i = line.indexOf(':');
    if (i <= 0) return [];
    const head = line.slice(0, i);
    const [name = '', ...params] = head.split(';');
    return [{ name: name.toUpperCase(), params: params.join(';').toUpperCase(), value: line.slice(i + 1) }];
  });
}

const SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'rebrand.ly',
  'cutt.ly', 'shorturl.at', 'tiny.cc', 'rb.gy', 'qrco.de', 's.id', 'lnkd.in', 'bl.ink',
]);

/** Inspects a link for common phishing tricks. Never throws. */
export function analyzeUrl(raw: string): UrlAnalysis | undefined {
  const candidate = /^www\./i.test(raw.trim()) ? `https://${raw.trim()}` : raw.trim();
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return undefined;
  }
  const scheme = url.protocol.replace(/:$/, '').toLowerCase();
  const warnings: UrlWarning[] = [];
  const web = scheme === 'http' || scheme === 'https';
  if (['javascript', 'data', 'vbscript', 'file', 'blob'].includes(scheme)) warnings.push('dangerousScheme');
  if (scheme === 'http') warnings.push('insecure');
  const host = url.hostname.toLowerCase();
  if (web) {
    if (host.split('.').some((label) => label.startsWith('xn--'))) warnings.push('punycode');
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[')) warnings.push('ipHost');
    if (url.username || url.password) warnings.push('userinfo');
    if (SHORTENERS.has(host.replace(/^www\./, ''))) warnings.push('shortener');
    if (url.port) warnings.push('port');
  }
  return { href: url.href, scheme, host, openable: web, warnings };
}

/** Detects the content type of decoded text and extracts its fields. */
export function parseContent(text: string, format = 'QRCode'): ParsedContent {
  const t = text.trim();
  const upper = t.toUpperCase();
  const result = (type: ReadType, fields: ParsedField[] = [], extra: Partial<ParsedContent> = {}): ParsedContent => ({
    type, fields: fields.filter((f) => f.value !== ''), sensitive: false, ...extra,
  });

  if (LINEAR_FORMATS.test(format) && /^\d+$/.test(t)) {
    return result('product', [{ key: 'number', value: t }]);
  }

  if (upper.startsWith('WIFI:')) {
    const kv = splitKeyValues(t.slice(5));
    return result('wifi', [
      { key: 'ssid', value: kv.get('S') ?? '' },
      { key: 'security', value: kv.get('T') || 'nopass' },
      { key: 'password', value: kv.get('P') ?? '', sensitive: true },
      { key: 'hidden', value: kv.get('H') === 'true' ? 'yes' : '' },
    ], { sensitive: Boolean(kv.get('P')) });
  }

  if (upper.startsWith('BEGIN:VCARD')) {
    const props = readProperties(t);
    const fields: ParsedField[] = [];
    for (const p of props) {
      const v = unescapeVText(p.value);
      if (p.name === 'FN') fields.push({ key: 'name', value: v });
      else if (p.name === 'ORG') fields.push({ key: 'organization', value: v.replace(/;/g, ' ').trim() });
      else if (p.name === 'TITLE') fields.push({ key: 'title', value: v });
      else if (p.name === 'TEL') fields.push({ key: p.params.includes('CELL') ? 'mobile' : 'phone', value: v });
      else if (p.name === 'EMAIL') fields.push({ key: 'email', value: v });
      else if (p.name === 'URL') fields.push({ key: 'website', value: v });
      else if (p.name === 'ADR') fields.push({ key: 'address', value: v.split(';').map((s) => s.trim()).filter(Boolean).join(', ') });
      else if (p.name === 'NOTE') fields.push({ key: 'note', value: v });
    }
    return result('contact', fields);
  }

  if (upper.startsWith('MECARD:')) {
    const kv = splitKeyValues(t.slice(7));
    return result('contact', [
      { key: 'name', value: (kv.get('N') ?? '').split(',').reverse().join(' ').trim() },
      { key: 'organization', value: kv.get('ORG') ?? '' },
      { key: 'phone', value: kv.get('TEL') ?? '' },
      { key: 'email', value: kv.get('EMAIL') ?? '' },
      { key: 'website', value: kv.get('URL') ?? '' },
      { key: 'address', value: kv.get('ADR') ?? '' },
      { key: 'note', value: kv.get('NOTE') ?? '' },
    ]);
  }

  if (upper.startsWith('BEGIN:VEVENT') || upper.startsWith('BEGIN:VCALENDAR')) {
    const props = readProperties(t);
    const get = (name: string) => unescapeVText(props.find((p) => p.name === name)?.value ?? '');
    return result('event', [
      { key: 'title', value: get('SUMMARY') },
      { key: 'start', value: formatICalDate(get('DTSTART')) },
      { key: 'end', value: formatICalDate(get('DTEND')) },
      { key: 'location', value: get('LOCATION') },
      { key: 'description', value: get('DESCRIPTION') },
    ]);
  }

  if (/^BCD\r?\n/.test(t)) {
    const l = t.split(/\r?\n/);
    const amount = l[7] ?? '';
    return result('epc', [
      { key: 'name', value: l[5] ?? '' },
      { key: 'iban', value: (l[6] ?? '').replace(/(.{4})/g, '$1 ').trim() },
      { key: 'bic', value: l[4] ?? '' },
      { key: 'amount', value: amount.replace(/^([A-Z]{3})(.*)$/, '$2 $1') },
      { key: 'reference', value: l[9] ?? '' },
      { key: 'text', value: l[10] ?? '' },
    ]);
  }

  if (/^mailto:/i.test(t)) {
    const [addr = '', query = ''] = t.slice(7).split('?');
    const params = new URLSearchParams(query);
    return result('email', [
      { key: 'to', value: decodeURIComponent(addr) },
      { key: 'subject', value: params.get('subject') ?? '' },
      { key: 'body', value: params.get('body') ?? '' },
    ]);
  }
  if (upper.startsWith('MATMSG:')) {
    const kv = splitKeyValues(t.slice(7));
    return result('email', [
      { key: 'to', value: kv.get('TO') ?? '' },
      { key: 'subject', value: kv.get('SUB') ?? '' },
      { key: 'body', value: kv.get('BODY') ?? '' },
    ]);
  }

  const sms = /^(?:SMSTO|SMS):([^:?]*)(?:[:?](?:body=)?([\s\S]*))?$/i.exec(t);
  if (sms) {
    return result('sms', [
      { key: 'number', value: sms[1] ?? '' },
      { key: 'message', value: safeDecode(sms[2] ?? '') },
    ]);
  }

  if (/^tel:/i.test(t)) return result('phone', [{ key: 'number', value: t.slice(4) }]);

  const geo = /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:[,;?].*?(?:\(([^)]*)\))?)?/i.exec(t);
  if (geo) {
    return result('geo', [
      { key: 'latitude', value: geo[1] ?? '' },
      { key: 'longitude', value: geo[2] ?? '' },
      { key: 'label', value: safeDecode(geo[3] ?? '') },
    ]);
  }

  if (/^otpauth(-migration)?:\/\//i.test(t)) {
    const fields: ParsedField[] = [];
    try {
      const u = new URL(t);
      fields.push({ key: 'otpType', value: u.hostname });
      fields.push({ key: 'account', value: decodeURIComponent(u.pathname.replace(/^\//, '')) });
      fields.push({ key: 'issuer', value: u.searchParams.get('issuer') ?? '' });
      fields.push({ key: 'secret', value: u.searchParams.get('secret') ?? '', sensitive: true });
    } catch { /* keep the raw text only */ }
    return result('otp', fields, { sensitive: true });
  }

  const url = /^(https?:\/\/|www\.)\S+$/i.test(t) ? analyzeUrl(t) : undefined;
  if (url) return result('url', [{ key: 'url', value: url.href }], { url });

  // Other URI schemes (e.g. `bitcoin:`, `spotify:`) - shown, never opened.
  if (/^[a-z][a-z\d+.-]{1,30}:\S+$/i.test(t) && !/\s/.test(t)) {
    const any = analyzeUrl(t);
    return result('uri', [{ key: 'uri', value: t }], any ? { url: any } : {});
  }

  return result('text', [{ key: 'text', value: text }]);
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** `20261122T093000` -> `2026-11-22 09:30`, `20261122` -> `2026-11-22`. */
export function formatICalDate(value: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return value;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  return m[4] ? `${date} ${m[4]}:${m[5]}${m[7] ? ' UTC' : ''}` : date;
}

/** Wraps a bare VEVENT so that calendar apps accept it as `.ics` file. */
export function toIcsFile(text: string): string {
  const t = text.trim().replace(/\r?\n/g, '\r\n');
  if (/^BEGIN:VCALENDAR/i.test(t)) return `${t}\r\n`;
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//webapp.qr//EN', t, 'END:VCALENDAR', ''].join('\r\n');
}

/** Turns MECARD into a vCard so that it can be imported as `.vcf`. */
export function toVcfFile(text: string): string {
  const t = text.trim();
  if (/^BEGIN:VCARD/i.test(t)) return `${t.replace(/\r?\n/g, '\r\n')}\r\n`;
  const kv = splitKeyValues(t.replace(/^MECARD:/i, ''));
  const [last = '', first = ''] = (kv.get('N') ?? '').split(',');
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${last};${first};;;`, `FN:${[first, last].filter(Boolean).join(' ')}`];
  if (kv.get('ORG')) lines.push(`ORG:${kv.get('ORG')}`);
  if (kv.get('TEL')) lines.push(`TEL:${kv.get('TEL')}`);
  if (kv.get('EMAIL')) lines.push(`EMAIL:${kv.get('EMAIL')}`);
  if (kv.get('URL')) lines.push(`URL:${kv.get('URL')}`);
  if (kv.get('ADR')) lines.push(`ADR:;;${kv.get('ADR')};;;;`);
  if (kv.get('NOTE')) lines.push(`NOTE:${kv.get('NOTE')}`);
  lines.push('END:VCARD', '');
  return lines.join('\r\n');
}
