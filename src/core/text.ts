/**
 * Low-level text helpers shared by the parsers: escaping rules of the
 * WIFI:/MECARD and vCard/iCalendar formats, tolerant percent-decoding.
 */

/** decodeURIComponent that never throws (malformed `%` sequences stay as is). */
export function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Percent-encoding that also escapes `(` `)` (used inside geo labels). */
export const encodeStrict = (value: string): string =>
  encodeURIComponent(value).replace(/[()!'*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** Unescape `\;`, `\,`, `\:`, `\\`, `\"` (WIFI: / MECARD). */
export const unescapeWifi = (value: string): string => value.replace(/\\(.)/g, '$1');

/** vCard / iCalendar text unescaping in a single pass (order-independent). */
export const unescapeVText = (value: string): string =>
  value.replace(/\\([nN,;:\\])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c));

/** Removes line breaks - for single-line fields of line-based formats. */
export const singleLine = (value: string): string => value.replace(/[\r\n]+/g, ' ');

/** Splits `K:v;K:v;;` respecting backslash escapes; keys upper-cased. */
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

export interface Property { name: string; params: string; value: string }

/**
 * Minimal vCard / iCalendar content-line reader: unfolds lines, strips
 * vendor group prefixes (`item1.EMAIL`), upper-cases names and parameters.
 */
export function readProperties(text: string): Property[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  return unfolded.split(/\r?\n/).flatMap((line) => {
    const i = line.indexOf(':');
    if (i <= 0) return [];
    const [name = '', ...params] = line.slice(0, i).split(';');
    return [{ name: name.replace(/^[^.]+\./, '').toUpperCase(), params: params.join(';').toUpperCase(), value: line.slice(i + 1) }];
  });
}

/** First `BEGIN:<kind> … END:<kind>` block, or null. */
export function firstBlock(text: string, kind: string): string | null {
  const re = new RegExp(`BEGIN:${kind}[\\s\\S]*?END:${kind}`, 'i');
  return re.exec(text)?.[0] ?? null;
}
