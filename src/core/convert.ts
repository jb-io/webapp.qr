/**
 * The single parser for creatable content: decoded QR text, text shared
 * from another app or a shared `.vcf`/`.ics` file become editable generator
 * content. `parse.ts` derives its display fields from this result, so
 * "show" and "edit" can never disagree.
 */
import { emptyContent, normalizeUrl } from './payloads.ts';
import { firstBlock, readProperties, safeDecode, splitKeyValues, unescapeVText } from './text.ts';
import type { ContactContent, CreateContent, EpcContent, EventContent, WifiSecurity } from './types.ts';

/** First vCard of a (possibly multi-contact) `.vcf` document. */
export function vcardToContact(text: string): ContactContent {
  const c = emptyContent('contact') as ContactContent;
  const block = firstBlock(text, 'VCARD') ?? text;
  let fn = '';
  for (const p of readProperties(block)) {
    const v = unescapeVText(p.value).trim();
    switch (p.name) {
      case 'N': {
        const [last = '', given = ''] = p.value.split(/(?<!\\);/).map((s) => unescapeVText(s).trim());
        c.lastName = last;
        c.firstName = given;
        break;
      }
      case 'FN': fn = v; break;
      case 'ORG': c.organization ||= v.replace(/;/g, ' ').trim(); break;
      case 'TITLE': c.title ||= v; break;
      case 'TEL': {
        const number = v.replace(/^tel:/i, '');
        if (/CELL|MOBILE/.test(p.params) && !c.mobile) c.mobile = number;
        else if (!c.phone) c.phone = number;
        else if (!c.mobile) c.mobile = number;
        break;
      }
      case 'EMAIL': c.email ||= v; break;
      case 'URL': c.website ||= v; break;
      case 'ADR':
        if (!c.street && !c.city) {
          const parts = p.value.split(/(?<!\\);/).map((s) => unescapeVText(s).trim());
          c.street = parts[2] ?? '';
          c.city = parts[3] ?? '';
          c.postalCode = parts[5] ?? '';
          c.country = parts[6] ?? '';
        }
        break;
      case 'NOTE': c.note ||= v; break;
      default: break;
    }
  }
  if (!c.firstName && !c.lastName && fn) {
    const bits = fn.split(/\s+/);
    if (bits.length > 1) {
      c.lastName = bits.pop() ?? '';
      c.firstName = bits.join(' ');
    } else {
      c.lastName = fn;
    }
  }
  return c;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * iCalendar date(-time) -> form value. UTC times (`Z`) are converted to the
 * local time zone; floating times stay as they are. `exclusiveEnd` turns an
 * all-day DTEND (exclusive per RFC 5545) into the inclusive last day.
 */
export function fromICal(value: string, exclusiveEnd = false): { value: string; allDay: boolean } {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return { value: '', allDay: false };
  const [, y, mo, d, h, mi, s, z] = m;
  if (!h) {
    const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d) - (exclusiveEnd ? 1 : 0)));
    return { value: `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`, allDay: true };
  }
  if (z) {
    const local = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0)));
    return {
      value: `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}`,
      allDay: false,
    };
  }
  return { value: `${y}-${mo}-${d}T${h}:${mi}`, allDay: false };
}

function eventFrom(text: string): EventContent {
  const block = firstBlock(text, 'VEVENT') ?? text;
  const props = readProperties(block);
  const get = (n: string) => unescapeVText(props.find((p) => p.name === n)?.value ?? '');
  const start = fromICal(get('DTSTART'));
  const end = fromICal(get('DTEND'), start.allDay);
  return {
    type: 'event', title: get('SUMMARY'), location: get('LOCATION'), description: get('DESCRIPTION'),
    allDay: start.allDay, start: start.value, end: end.value,
  };
}

function wifiSecurity(value: string): WifiSecurity {
  const t = value.toUpperCase();
  if (t === 'WEP') return 'WEP';
  if (t === 'SAE' || t === 'WPA3') return 'SAE';
  if (t === '' || t === 'NOPASS') return 'nopass';
  return 'WPA';
}

/** Splits `mailto:` into address and query parameters (tolerant decoding). */
export function parseMailto(text: string): { to: string; params: URLSearchParams } {
  const body = text.replace(/^mailto:/i, '');
  const q = body.indexOf('?');
  const addr = q < 0 ? body : body.slice(0, q);
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(q < 0 ? '' : body.slice(q + 1));
  } catch {
    params = new URLSearchParams();
  }
  return { to: safeDecode(addr), params };
}

/** `SMSTO:nr:msg` (raw message) or RFC 5724 `sms:nr?body=msg` (encoded). */
export function parseSms(text: string): { number: string; message: string } | null {
  const smsto = /^SMSTO:([^:]*)(?::([\s\S]*))?$/i.exec(text);
  if (smsto) return { number: smsto[1] ?? '', message: smsto[2] ?? '' };
  const sms = /^sms:([^?]*)(?:\?([\s\S]*))?$/i.exec(text);
  if (!sms) return null;
  const body = /(?:^|&)body=([^&]*)/i.exec(sms[2] ?? '')?.[1] ?? '';
  return { number: safeDecode(sms[1] ?? ''), message: safeDecode(body.replace(/\+/g, ' ')) };
}

const GEO = /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:[,;][^?]*)?(?:\?(.*))?$/i;

/** Best-effort conversion of decoded / shared text into generator content. */
export function textToContent(text: string): CreateContent {
  const t = text.trim();
  const upper = t.toUpperCase();

  if (upper.startsWith('BEGIN:VCARD')) return vcardToContact(t);

  if (upper.startsWith('MECARD:')) {
    const kv = splitKeyValues(t.slice(7));
    const [last = '', first = ''] = (kv.get('N') ?? '').split(',');
    return {
      ...(emptyContent('contact') as ContactContent),
      lastName: last.trim(), firstName: first.trim(),
      organization: kv.get('ORG') ?? '', phone: kv.get('TEL') ?? '', email: kv.get('EMAIL') ?? '',
      website: kv.get('URL') ?? '', street: kv.get('ADR') ?? '', note: kv.get('NOTE') ?? '',
    };
  }

  if (upper.startsWith('WIFI:')) {
    const kv = splitKeyValues(t.slice(5));
    return { type: 'wifi', ssid: kv.get('S') ?? '', password: kv.get('P') ?? '', security: wifiSecurity(kv.get('T') ?? ''), hidden: kv.get('H') === 'true' };
  }

  if (/BEGIN:VEVENT/i.test(t)) return eventFrom(t);

  if (/^BCD\r?\n/.test(t)) {
    const l = t.split(/\r?\n/);
    const epc: EpcContent = {
      type: 'epc', bic: l[4] ?? '', name: l[5] ?? '', iban: l[6] ?? '', amount: (l[7] ?? '').replace(/^[A-Z]{3}/, ''),
      reference: l[9] ?? '', text: l[10] ?? '',
    };
    return epc;
  }

  if (/^mailto:/i.test(t)) {
    const { to, params } = parseMailto(t);
    return { type: 'email', to, subject: params.get('subject') ?? '', body: params.get('body') ?? '' };
  }
  if (upper.startsWith('MATMSG:')) {
    const kv = splitKeyValues(t.slice(7));
    return { type: 'email', to: kv.get('TO') ?? '', subject: kv.get('SUB') ?? '', body: kv.get('BODY') ?? '' };
  }

  const sms = parseSms(t);
  if (sms) return { type: 'sms', ...sms };
  if (/^tel:/i.test(t)) return { type: 'phone', number: safeDecode(t.slice(4)) };

  const geo = GEO.exec(t);
  if (geo) {
    const label = /\(([^)]*)\)\s*$/.exec(geo[3] ?? '')?.[1] ?? '';
    return { type: 'geo', latitude: geo[1] ?? '', longitude: geo[2] ?? '', label: safeDecode(label) };
  }

  if (/^(https?:\/\/|www\.)\S+$/i.test(t)) return { type: 'url', url: t };
  return { type: 'text', text };
}

/**
 * Builds content from the fields of an Android share intent
 * (`title`, `text`, `url`). Apps are inconsistent: many put the link into
 * `text`, sometimes after a headline - pick the link if that is all there is.
 */
export function sharedToContent(shared: { title?: string; text?: string; url?: string }): CreateContent {
  const title = shared.title?.trim() ?? '';
  const text = shared.text?.trim() ?? '';
  const url = shared.url?.trim() ?? '';
  if (url && (!text || text === url)) return { type: 'url', url: normalizeUrl(url) };
  if (text) {
    const lone = /^(?:([\s\S]*?)\s+)?(https?:\/\/\S+)$/.exec(text);
    if (!url && lone && lone[2] && (!lone[1] || lone[1] === title)) return { type: 'url', url: lone[2] };
    return textToContent(url ? `${text}\n${url}` : text);
  }
  if (title) return { type: 'text', text: title };
  return emptyContent('text');
}
