/**
 * Turns arbitrary incoming data - a scanned code, text shared from another
 * Android app, a shared `.vcf` file - into editable generator content. The
 * user always gets the form first and can adjust before anything is encoded.
 */
import { emptyContent, normalizeUrl } from './payloads.ts';
import { readProperties, splitKeyValues } from './parse.ts';
import type { ContactContent, CreateContent, EpcContent, EventContent, WifiSecurity } from './types.ts';

const unescapeV = (v: string) => v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

/** First vCard of a (possibly multi-contact) `.vcf` document. */
export function vcardToContact(text: string): ContactContent {
  const c = emptyContent('contact') as ContactContent;
  const first = /BEGIN:VCARD[\s\S]*?END:VCARD/i.exec(text)?.[0] ?? text;
  let fn = '';
  for (const p of readProperties(first)) {
    // Drop vendor group prefixes such as `item1.EMAIL`.
    const name = p.name.replace(/^[^.]+\./, '');
    const v = unescapeV(p.value).trim();
    switch (name) {
      case 'N': {
        const [last = '', given = ''] = p.value.split(';').map((s) => unescapeV(s).trim());
        c.lastName = last;
        c.firstName = given;
        break;
      }
      case 'FN': fn = v; break;
      case 'ORG': c.organization = c.organization || v.replace(/;/g, ' ').trim(); break;
      case 'TITLE': c.title = c.title || v; break;
      case 'TEL':
        if (/CELL|MOBILE/.test(p.params) && !c.mobile) c.mobile = v.replace(/^tel:/i, '');
        else if (!c.phone) c.phone = v.replace(/^tel:/i, '');
        else if (!c.mobile) c.mobile = v.replace(/^tel:/i, '');
        break;
      case 'EMAIL': c.email = c.email || v; break;
      case 'URL': c.website = c.website || v; break;
      case 'ADR':
        if (!c.street && !c.city) {
          const parts = p.value.split(';').map((s) => unescapeV(s).trim());
          c.street = parts[2] ?? '';
          c.city = parts[3] ?? '';
          c.postalCode = parts[5] ?? '';
          c.country = parts[6] ?? '';
        }
        break;
      case 'NOTE': c.note = c.note || v; break;
      default: break;
    }
  }
  if (!c.firstName && !c.lastName && fn) {
    const bits = fn.split(/\s+/);
    c.lastName = bits.length > 1 ? bits.pop() ?? '' : fn;
    c.firstName = bits.length ? bits.join(' ') : '';
    if (c.lastName === fn) c.firstName = '';
  }
  return c;
}

/** `20261122T093000` -> `2026-11-22T09:30`; `20261122` -> `2026-11-22`. */
function fromICal(value: string): { value: string; allDay: boolean } {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/.exec(value.trim());
  if (!m) return { value: '', allDay: false };
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  return m[4] ? { value: `${date}T${m[4]}:${m[5]}`, allDay: false } : { value: date, allDay: true };
}

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
    const sec = (kv.get('T') ?? '').toUpperCase();
    const security: WifiSecurity = sec === 'WEP' ? 'WEP' : sec === '' || sec === 'NOPASS' ? 'nopass' : 'WPA';
    return { type: 'wifi', ssid: kv.get('S') ?? '', password: kv.get('P') ?? '', security, hidden: kv.get('H') === 'true' };
  }

  if (/BEGIN:VEVENT/i.test(t)) {
    const props = readProperties(t);
    const get = (n: string) => unescapeV(props.find((p) => p.name === n)?.value ?? '');
    const start = fromICal(get('DTSTART'));
    const end = fromICal(get('DTEND'));
    const event: EventContent = {
      type: 'event', title: get('SUMMARY'), location: get('LOCATION'), description: get('DESCRIPTION'),
      allDay: start.allDay, start: start.value, end: end.value,
    };
    return event;
  }

  if (/^BCD\r?\n/.test(t)) {
    const l = t.split(/\r?\n/);
    const amount = (l[7] ?? '').replace(/^[A-Z]{3}/, '');
    const epc: EpcContent = {
      type: 'epc', bic: l[4] ?? '', name: l[5] ?? '', iban: l[6] ?? '', amount,
      reference: l[9] ?? '', text: l[10] ?? '',
    };
    return epc;
  }

  if (/^mailto:/i.test(t)) {
    const [addr = '', query = ''] = t.slice(7).split('?');
    const q = new URLSearchParams(query);
    return { type: 'email', to: decodeURIComponent(addr), subject: q.get('subject') ?? '', body: q.get('body') ?? '' };
  }
  const sms = /^(?:SMSTO|SMS):([^:?]*)(?:[:?](?:body=)?([\s\S]*))?$/i.exec(t);
  if (sms) return { type: 'sms', number: sms[1] ?? '', message: sms[2] ?? '' };
  if (/^tel:/i.test(t)) return { type: 'phone', number: t.slice(4) };
  const geo = /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:.*?\(([^)]*)\))?/i.exec(t);
  if (geo) return { type: 'geo', latitude: geo[1] ?? '', longitude: geo[2] ?? '', label: geo[3] ? decodeURIComponent(geo[3]) : '' };

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
    const parsed = textToContent(url ? `${text}\n${url}` : text);
    return parsed;
  }
  if (title) return { type: 'text', text: title };
  return emptyContent('text');
}
