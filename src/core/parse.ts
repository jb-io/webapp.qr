/**
 * Interprets decoded text for display: which kind of content is it, which
 * fields does it carry, and - for links - is there anything suspicious.
 * Creatable types are parsed by `convert.ts` (single source); this module
 * adds read-only types and display concerns. Nothing here performs an action.
 */
import { parseMailto, textToContent } from './convert.ts';
import { buildPayload } from './payloads.ts';
import { splitKeyValues } from './text.ts';
import type { CreateContent, ReadType } from './types.ts';

export { safeDecode } from './text.ts';

export interface ParsedField { key: string; value: string; sensitive?: boolean }

export type UrlWarning =
  | 'insecure'
  | 'punycode'
  | 'ipHost'
  | 'userinfo'
  | 'shortener'
  | 'port'
  | 'dangerousScheme';

export interface UrlAnalysis {
  href: string;
  scheme: string;
  host: string;
  /** Registrable part of the host (last two labels) - what to look at. */
  domain: string;
  /** Only http(s) links may be opened directly. */
  openable: boolean;
  warnings: UrlWarning[];
}

export interface ParsedContent {
  type: ReadType;
  /** Human-readable key/value pairs (keys are i18n field keys). */
  fields: ParsedField[];
  url?: UrlAnalysis;
  /** Contains secrets (Wi-Fi password, OTP seed) - the UI masks them. */
  sensitive: boolean;
  /** Editable generator content, when the type can be recreated. */
  content?: CreateContent;
}

const LINEAR_FORMATS = /^(EAN|UPC|ISBN|Code|ITF|Codabar|DataBar|PZN|Telepen|DX)/;

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
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  const ip = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[');
  if (web) {
    if (host.split('.').some((label) => label.startsWith('xn--'))) warnings.push('punycode');
    if (ip) warnings.push('ipHost');
    if (url.username || url.password) warnings.push('userinfo');
    if (SHORTENERS.has(host.replace(/^www\./, ''))) warnings.push('shortener');
    if (url.port) warnings.push('port');
  }
  const domain = ip ? host : host.split('.').slice(-2).join('.');
  return { href: url.href, scheme, host, domain, openable: web, warnings };
}

function contentFields(c: CreateContent): ParsedField[] {
  switch (c.type) {
    case 'text': return [{ key: 'text', value: c.text }];
    case 'url': return [{ key: 'url', value: c.url }];
    case 'wifi': return [
      { key: 'ssid', value: c.ssid },
      { key: 'security', value: c.security },
      { key: 'password', value: c.password, sensitive: true },
      { key: 'hidden', value: c.hidden ? 'yes' : '' },
    ];
    case 'contact': return [
      { key: 'name', value: [c.firstName, c.lastName].filter(Boolean).join(' ') },
      { key: 'organization', value: c.organization },
      { key: 'title', value: c.title },
      { key: 'phone', value: c.phone },
      { key: 'mobile', value: c.mobile },
      { key: 'email', value: c.email },
      { key: 'website', value: c.website },
      { key: 'address', value: [c.street, [c.postalCode, c.city].filter(Boolean).join(' '), c.country].filter(Boolean).join(', ') },
      { key: 'note', value: c.note },
    ];
    case 'email': return [{ key: 'to', value: c.to }, { key: 'subject', value: c.subject }, { key: 'body', value: c.body }];
    case 'sms': return [{ key: 'number', value: c.number }, { key: 'message', value: c.message }];
    case 'phone': return [{ key: 'number', value: c.number }];
    case 'geo': return [{ key: 'latitude', value: c.latitude }, { key: 'longitude', value: c.longitude }, { key: 'label', value: c.label }];
    case 'event': return [
      { key: 'eventTitle', value: c.title },
      { key: 'start', value: c.start.replace('T', ' ') },
      { key: 'end', value: c.end.replace('T', ' ') },
      { key: 'location', value: c.location },
      { key: 'description', value: c.description },
    ];
    case 'epc': return [
      { key: 'name', value: c.name },
      { key: 'iban', value: c.iban.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim() },
      { key: 'bic', value: c.bic },
      { key: 'amount', value: c.amount ? `${c.amount} EUR` : '' },
      { key: 'reference', value: c.reference },
      { key: 'remittance', value: c.text },
    ];
  }
}

/** Detects the content type of decoded text and extracts its fields. Never throws. */
export function parseContent(text: string, format = 'QRCode'): ParsedContent {
  const t = text.trim();
  const make = (type: ReadType, fields: ParsedField[], extra: Partial<ParsedContent> = {}): ParsedContent => ({
    type, fields: fields.filter((f) => f.value !== ''), sensitive: false, ...extra,
  });

  if (LINEAR_FORMATS.test(format) && /^\d+$/.test(t)) return make('product', [{ key: 'number', value: t }]);

  if (/^otpauth(-migration)?:\/\//i.test(t)) {
    const fields: ParsedField[] = [];
    try {
      const u = new URL(t);
      fields.push({ key: 'otpType', value: u.hostname });
      fields.push({ key: 'account', value: decodeURIComponent(u.pathname.replace(/^\//, '')) });
      fields.push({ key: 'issuer', value: u.searchParams.get('issuer') ?? '' });
      fields.push({ key: 'secret', value: u.searchParams.get('secret') ?? u.searchParams.get('data') ?? '', sensitive: true });
    } catch { /* keep the raw text only */ }
    return make('otp', fields, { sensitive: true });
  }

  const content = textToContent(text);

  if (content.type === 'url') {
    const url = analyzeUrl(t);
    if (url) return make('url', [{ key: 'url', value: url.href }], { url, content: { type: 'url', url: url.href } });
  }

  if (content.type === 'text') {
    // Other URI schemes (e.g. `bitcoin:`, `spotify:`) - shown, never opened.
    if (/^[a-z][a-z\d+.-]{1,30}:\S+$/i.test(t)) {
      const any = analyzeUrl(t);
      return make('uri', [{ key: 'uri', value: t }], any ? { url: any } : {});
    }
    return make('text', [{ key: 'text', value: text }], { content });
  }

  const fields = contentFields(content);
  if (content.type === 'email') {
    // Show every recipient a mail app would receive, including hidden ones.
    const { params } = parseMailto(/^mailto:/i.test(t) ? t : buildPayload(content));
    for (const key of ['cc', 'bcc'] as const) {
      const v = params.get(key);
      if (v) fields.splice(1, 0, { key, value: v });
    }
  }
  const sensitive = content.type === 'wifi' && Boolean(content.password);
  return make(content.type, fields, { content, sensitive });
}

/** Wraps a bare VEVENT so that calendar apps accept it as `.ics` file (RFC 5545). */
export function toIcsFile(text: string, now = new Date()): string {
  let t = text.trim().replace(/\r?\n/g, '\r\n');
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  if (!/^UID:/im.test(t)) t = t.replace(/BEGIN:VEVENT\r\n/i, `BEGIN:VEVENT\r\nUID:${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 10)}@webapp.qr\r\n`);
  if (!/^DTSTAMP[:;]/im.test(t)) t = t.replace(/BEGIN:VEVENT\r\n/i, `BEGIN:VEVENT\r\nDTSTAMP:${stamp}\r\n`);
  if (/^BEGIN:VCALENDAR/i.test(t)) return `${t}\r\n`;
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//webapp.qr//EN', t, 'END:VCALENDAR', ''].join('\r\n');
}

/** vCard file for a scanned vCard or MECARD (re-encoded with proper escaping). */
export function toVcfFile(text: string): string {
  const t = text.trim();
  if (/^BEGIN:VCARD/i.test(t)) return `${t.replace(/\r?\n/g, '\r\n')}\r\n`;
  const content = textToContent(/^MECARD:/i.test(t) ? t : `MECARD:${splitKeyValues(t).size ? t : ''}`);
  return `${buildPayload(content).replace(/\n/g, '\r\n')}\r\n`;
}
