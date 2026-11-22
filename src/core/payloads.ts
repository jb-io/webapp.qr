/**
 * Builds the encoded string for each content type and validates the input.
 * Formats follow the de-facto standards understood by common scanner apps
 * (ZXing conventions, vCard 3.0, iCalendar VEVENT, EPC069-12).
 */
import type {
  ContactContent, CreateContent, CreateType, EpcContent, EventContent,
} from './types.ts';
import { encodeStrict, singleLine } from './text.ts';

/** A validation problem; `code` is an i18n key suffix. */
export interface FieldError { field: string; code: string }

export function emptyContent(type: CreateType): CreateContent {
  switch (type) {
    case 'text': return { type, text: '' };
    case 'url': return { type, url: '' };
    case 'wifi': return { type, ssid: '', password: '', security: 'WPA', hidden: false };
    case 'contact': return {
      type, firstName: '', lastName: '', organization: '', title: '', phone: '', mobile: '',
      email: '', website: '', street: '', postalCode: '', city: '', country: '', note: '',
    };
    case 'email': return { type, to: '', subject: '', body: '' };
    case 'sms': return { type, number: '', message: '' };
    case 'phone': return { type, number: '' };
    case 'geo': return { type, latitude: '', longitude: '', label: '' };
    case 'event': return { type, title: '', location: '', description: '', allDay: false, start: '', end: '' };
    case 'epc': return { type, name: '', iban: '', bic: '', amount: '', reference: '', text: '' };
  }
}

// ------------------------------------------------------------- escaping

/** WIFI: and MECARD-style escaping: backslash before `\ ; , : "`. */
export function escapeWifi(value: string): string {
  return value.replace(/([\\;,:"])/g, '\\$1');
}

/** vCard / iCalendar text escaping (RFC 6350 / RFC 5545). */
export function escapeVText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/([,;])/g, '\\$1');
}

const compactPhone = (value: string): string => value.replace(/[^\d+*#]/g, '');

/** `52,52` -> `52.52`; anything that is not a plain decimal stays as typed (validation rejects it). */
export const normalizeCoordinate = (value: string): string => value.trim().replace(',', '.');

// ------------------------------------------------------------ building

export function buildPayload(content: CreateContent): string {
  switch (content.type) {
    case 'text':
      return content.text;
    case 'url':
      return normalizeUrl(content.url);
    case 'wifi': {
      const parts = [`T:${content.security}`, `S:${escapeWifi(content.ssid)}`];
      if (content.security !== 'nopass') parts.push(`P:${escapeWifi(content.password)}`);
      if (content.hidden) parts.push('H:true');
      return `WIFI:${parts.join(';')};;`;
    }
    case 'contact':
      return buildVCard(content);
    case 'email': {
      const query = [
        content.subject && `subject=${encodeURIComponent(content.subject)}`,
        content.body && `body=${encodeURIComponent(content.body)}`,
      ].filter(Boolean).join('&');
      return `mailto:${content.to.trim()}${query ? `?${query}` : ''}`;
    }
    case 'sms':
      return `SMSTO:${compactPhone(content.number)}:${content.message}`;
    case 'phone':
      return `tel:${compactPhone(content.number)}`;
    case 'geo': {
      const coords = `${normalizeCoordinate(content.latitude)},${normalizeCoordinate(content.longitude)}`;
      return content.label.trim()
        ? `geo:${coords}?q=${coords}(${encodeStrict(singleLine(content.label.trim()))})`
        : `geo:${coords}`;
    }
    case 'event':
      return buildEvent(content);
    case 'epc':
      return buildEpc(content);
  }
}

/** Adds `https://` when the user typed a bare host like `example.org`. */
export function normalizeUrl(value: string): string {
  const v = value.trim();
  if (!v) return '';
  return /^[a-z][a-z\d+.-]*:/i.test(v) ? v : `https://${v}`;
}

function buildVCard(c: ContactContent): string {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
  const full = [c.firstName, c.lastName].map((s) => s.trim()).filter(Boolean).join(' ');
  lines.push(`N:${escapeVText(c.lastName.trim())};${escapeVText(c.firstName.trim())};;;`);
  lines.push(`FN:${escapeVText(full || c.organization.trim())}`);
  if (c.organization.trim()) lines.push(`ORG:${escapeVText(c.organization.trim())}`);
  if (c.title.trim()) lines.push(`TITLE:${escapeVText(c.title.trim())}`);
  // Unescaped single-value properties must not smuggle in line breaks.
  if (c.phone.trim()) lines.push(`TEL;TYPE=WORK,VOICE:${singleLine(c.phone.trim())}`);
  if (c.mobile.trim()) lines.push(`TEL;TYPE=CELL:${singleLine(c.mobile.trim())}`);
  if (c.email.trim()) lines.push(`EMAIL:${singleLine(c.email.trim())}`);
  if (c.website.trim()) lines.push(`URL:${singleLine(normalizeUrl(c.website))}`);
  if ([c.street, c.postalCode, c.city, c.country].some((s) => s.trim())) {
    const adr = ['', '', c.street, c.city, '', c.postalCode, c.country].map((s) => escapeVText(s.trim()));
    lines.push(`ADR;TYPE=WORK:${adr.join(';')}`);
  }
  if (c.note.trim()) lines.push(`NOTE:${escapeVText(c.note.trim())}`);
  lines.push('END:VCARD');
  return lines.join('\n');
}

/** `2026-11-22T09:30` -> `20261122T093000`, `2026-11-22` -> `20261122`. */
export function toICalDate(value: string, allDay: boolean): string {
  const [date = '', time = ''] = value.split('T');
  const d = date.replace(/-/g, '');
  if (allDay) return d;
  const t = (time || '00:00').replace(/:/g, '').padEnd(6, '0').slice(0, 6);
  return `${d}T${t}`;
}

/** `2026-11-22` + n days, calendar-correct. */
export function addDays(date: string, days: number): string {
  const [y = 0, m = 1, d = 1] = date.slice(0, 10).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

function buildEvent(c: EventContent): string {
  const dt = (name: string, value: string) => (c.allDay
    ? `${name};VALUE=DATE:${toICalDate(value, true)}`
    : `${name}:${toICalDate(value, false)}`);
  const lines = ['BEGIN:VEVENT', `SUMMARY:${escapeVText(c.title.trim())}`, dt('DTSTART', c.start)];
  // All-day DTEND is exclusive (RFC 5545): the form's "last day" + 1.
  if (c.end) lines.push(dt('DTEND', c.allDay ? addDays(c.end, 1) : c.end));
  if (c.location.trim()) lines.push(`LOCATION:${escapeVText(c.location.trim())}`);
  if (c.description.trim()) lines.push(`DESCRIPTION:${escapeVText(c.description.trim())}`);
  lines.push('END:VEVENT');
  return lines.join('\n');
}

export const compactIban = (value: string): string => value.replace(/\s+/g, '').toUpperCase();

/** Amount `12,5` / `12.50` -> `EUR12.5`; empty -> empty. */
export function epcAmount(value: string): string {
  const v = value.trim().replace(',', '.');
  if (!v) return '';
  const n = Number(v);
  return `EUR${Number.isInteger(n) ? n.toFixed(0) : n.toFixed(2).replace(/0$/, '')}`;
}

function buildEpc(c: EpcContent): string {
  const lines = [
    'BCD', '002', '1', 'SCT',
    c.bic.replace(/\s+/g, '').toUpperCase(),
    singleLine(c.name.trim()),
    compactIban(c.iban),
    epcAmount(c.amount),
    '', // purpose code
    singleLine(c.reference.trim()),
    singleLine(c.text.trim()),
  ];
  // Trailing empty fields may be omitted (EPC069-12, 3.4).
  while (lines.length > 7 && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}

// ----------------------------------------------------------- validation

/** ISO 13616 mod-97 check. */
export function isValidIban(value: string): boolean {
  const iban = compactIban(value);
  if (!/^[A-Z]{2}\d{2}[A-Z\d]{11,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let rest = 0;
  for (const ch of rearranged) {
    const digits = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of digits) rest = (rest * 10 + Number(d)) % 97;
  }
  return rest === 1;
}

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const isPhone = (v: string) => /^\+?[\d\s()/.-]{3,}$/.test(v.trim());

function inRange(value: string, limit: number): boolean {
  const v = normalizeCoordinate(value);
  return /^-?\d{1,3}(\.\d+)?$/.test(v) && Math.abs(Number(v)) <= limit;
}

/** EPC069-12: the whole payload must not exceed 331 bytes. */
export const EPC_MAX_BYTES = 331;
const utf8Length = (v: string) => new TextEncoder().encode(v).length;

/** Returns all problems; an empty list means the content can be encoded. */
export function validateContent(c: CreateContent): FieldError[] {
  const errors: FieldError[] = [];
  const need = (field: string, value: string) => {
    if (!value.trim()) errors.push({ field, code: 'required' });
  };
  switch (c.type) {
    case 'text':
      need('text', c.text);
      break;
    case 'url':
      need('url', c.url);
      if (c.url.trim()) {
        try {
          new URL(normalizeUrl(c.url));
        } catch {
          errors.push({ field: 'url', code: 'invalidUrl' });
        }
      }
      break;
    case 'wifi':
      need('ssid', c.ssid);
      if (c.security !== 'nopass') need('password', c.password);
      // WPA/WPA3 passphrases: 8-63 bytes, or exactly 64 hex digits (raw PSK).
      if ((c.security === 'WPA' || c.security === 'SAE') && c.password
        && !/^[\da-f]{64}$/i.test(c.password)
        && (utf8Length(c.password) < 8 || utf8Length(c.password) > 63)) {
        errors.push({ field: 'password', code: 'wpaLength' });
      }
      break;
    case 'contact':
      if (![c.firstName, c.lastName, c.organization].some((s) => s.trim())) {
        errors.push({ field: 'lastName', code: 'nameOrOrg' });
      }
      if (c.email.trim() && !isEmail(c.email)) errors.push({ field: 'email', code: 'invalidEmail' });
      break;
    case 'email':
      need('to', c.to);
      if (c.to.trim() && !c.to.split(',').every(isEmail)) errors.push({ field: 'to', code: 'invalidEmail' });
      break;
    case 'sms':
    case 'phone':
      need('number', c.number);
      if (c.number.trim() && !isPhone(c.number)) errors.push({ field: 'number', code: 'invalidPhone' });
      break;
    case 'geo':
      if (!inRange(c.latitude, 90)) errors.push({ field: 'latitude', code: 'invalidLatitude' });
      if (!inRange(c.longitude, 180)) errors.push({ field: 'longitude', code: 'invalidLongitude' });
      break;
    case 'event':
      need('title', c.title);
      need('start', c.start);
      if (c.start && c.end && c.end < c.start) errors.push({ field: 'end', code: 'endBeforeStart' });
      break;
    case 'epc': {
      need('name', c.name);
      if (c.name.length > 70) errors.push({ field: 'name', code: 'tooLong' });
      need('iban', c.iban);
      if (c.iban.trim() && !isValidIban(c.iban)) errors.push({ field: 'iban', code: 'invalidIban' });
      if (c.bic.trim() && !/^[A-Z]{6}[A-Z\d]{2}([A-Z\d]{3})?$/i.test(c.bic.replace(/\s+/g, ''))) {
        errors.push({ field: 'bic', code: 'invalidBic' });
      }
      if (c.amount.trim()) {
        const n = Number(c.amount.trim().replace(',', '.'));
        if (!/^\d+([.,]\d{1,2})?$/.test(c.amount.trim()) || n < 0.01 || n > 999999999.99) {
          errors.push({ field: 'amount', code: 'invalidAmount' });
        }
      }
      if (c.reference.trim() && c.text.trim()) errors.push({ field: 'text', code: 'referenceOrText' });
      if (c.reference.length > 35) errors.push({ field: 'reference', code: 'tooLong' });
      if (c.text.length > 140) errors.push({ field: 'text', code: 'tooLong' });
      if (!errors.length && utf8Length(buildEpc(c)) > EPC_MAX_BYTES) errors.push({ field: 'text', code: 'epcTooLong' });
      break;
    }
  }
  return errors;
}

/** EPC069-12 mandates error correction level M. */
export const requiredEcLevel = (type: CreateType) => (type === 'epc' ? 'M' as const : null);
