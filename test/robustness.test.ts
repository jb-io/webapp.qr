import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromICal, parseSms, sharedToContent, textToContent } from '../src/core/convert.ts';
import { analyzeUrl, parseContent, toIcsFile, toVcfFile } from '../src/core/parse.ts';
import { addDays, buildPayload, validateContent } from '../src/core/payloads.ts';
import { createMatrix } from '../src/core/matrix.ts';
import { codewordBlocks, codewordMap, coverageDamage } from '../src/core/damage.ts';
import { analyze } from '../src/core/analysis.ts';
import { escapeXml, renderSvg } from '../src/core/render.ts';
import { addCreated, addScan, emptyHistory, MAX_ENTRIES, normalizeContent, normalizeOptions, normalizeStyle } from '../src/core/history.ts';
import { DEFAULT_STYLE } from '../src/core/types.ts';
import type { CreateContent, CreateEntry } from '../src/core/types.ts';
import { unescapeVText } from '../src/core/text.ts';

test('malformed percent escapes never throw', () => {
  for (const t of ['mailto:%E0%A4%A', 'geo:1,2?q=1,2(%E0)', 'sms:%E0?body=%E0', 'tel:%E0']) {
    assert.doesNotThrow(() => parseContent(t));
    assert.doesNotThrow(() => textToContent(t));
  }
});

test('ics with VTIMEZONE uses the VEVENT start', () => {
  const ics = [
    'BEGIN:VCALENDAR', 'BEGIN:VTIMEZONE', 'TZID:Europe/Berlin', 'BEGIN:STANDARD', 'DTSTART:19701025T030000', 'END:STANDARD', 'END:VTIMEZONE',
    'BEGIN:VEVENT', 'SUMMARY:Meet', 'DTSTART;TZID=Europe/Berlin:20261201T100000', 'DTEND;TZID=Europe/Berlin:20261201T110000', 'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const c = textToContent(ics);
  assert.equal(c.type, 'event');
  if (c.type === 'event') {
    assert.equal(c.start, '2026-12-01T10:00');
    assert.equal(c.end, '2026-12-01T11:00');
  }
});

test('UTC times become local times, all-day end is exclusive', () => {
  const local = fromICal('20260101T120000Z').value;
  const d = new Date(Date.UTC(2026, 0, 1, 12));
  assert.equal(local.slice(11), `${String(d.getHours()).padStart(2, '0')}:00`);
  assert.equal(fromICal('20261123', true).value, '2026-11-22');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  const e: CreateContent = { type: 'event', title: 'X', location: '', description: '', allDay: true, start: '2026-11-22', end: '2026-11-22' };
  assert.match(buildPayload(e), /DTEND;VALUE=DATE:20261123/);
  assert.deepEqual(textToContent(buildPayload(e)), e);
});

test('geo: comma decimals and parentheses in labels', () => {
  const g: CreateContent = { type: 'geo', latitude: '52,52', longitude: '13,4', label: 'Café (Mitte)' };
  assert.deepEqual(validateContent(g), []);
  const p = buildPayload(g);
  assert.match(p, /^geo:52\.52,13\.4\?/);
  assert.deepEqual(textToContent(p), { ...g, latitude: '52.52', longitude: '13.4' });
  assert.equal(validateContent({ ...g, latitude: '1e1' })[0]?.code, 'invalidLatitude');
});

test('sms: SMSTO is raw, sms: body is decoded', () => {
  assert.deepEqual(parseSms('SMSTO:+491:50%25 off'), { number: '+491', message: '50%25 off' });
  assert.deepEqual(parseSms('sms:+491?body=50%25%20off'), { number: '+491', message: '50% off' });
  const s: CreateContent = { type: 'sms', number: '+491', message: '50%25: yes' };
  assert.deepEqual(textToContent(buildPayload(s)), s);
});

test('vText unescaping is order independent', () => {
  assert.equal(unescapeVText('C:\\\\new'), 'C:\\new');
  assert.equal(unescapeVText('a\\nb\\, c\;'), 'a\nb, c;');
});

test('EPC fields cannot inject lines, total size is limited', () => {
  const c: CreateContent = { type: 'epc', name: 'A\nDE00', iban: 'DE89370400440532013000', bic: '', amount: '', reference: '', text: 'x\ny' };
  const lines = buildPayload(c).split('\n');
  assert.equal(lines[5], 'A DE00');
  assert.equal(lines.length, 11);
});

test('wifi: WPA3 and raw hex PSK', () => {
  const w: CreateContent = { type: 'wifi', ssid: 'N', password: 'a'.repeat(64).replace(/a/g, 'f'), security: 'SAE', hidden: false };
  assert.deepEqual(validateContent(w), []);
  assert.match(buildPayload(w), /^WIFI:T:SAE;/);
  assert.deepEqual(textToContent(buildPayload(w)), w);
  assert.equal(validateContent({ ...w, password: 'äöü' }).length, 1);
});

test('mailto shows hidden recipients', () => {
  const r = parseContent('mailto:a@b.de?bcc=evil@x.com&subject=Hi');
  assert.equal(r.fields.find((f) => f.key === 'bcc')?.value, 'evil@x.com');
});

test('url analysis edge cases', () => {
  assert.ok(analyzeUrl('https://bit.ly./x')?.warnings.includes('shortener'));
  assert.equal(analyzeUrl('https://paypal.com.evil.tk/')?.domain, 'evil.tk');
  assert.ok(analyzeUrl('http://[::1]:8080/')?.warnings.includes('ipHost'));
});

test('ics and vcf files are importable', () => {
  const ics = toIcsFile('BEGIN:VEVENT\nSUMMARY:X\nDTSTART:20260101T100000\nEND:VEVENT', new Date(Date.UTC(2026, 0, 1)));
  assert.match(ics, /\r\nUID:[^\r]+@webapp\.qr\r\n/);
  assert.match(ics, /\r\nDTSTAMP:20260101T000000Z\r\n/);
  assert.match(toVcfFile('MECARD:N:Lee,Ann;ORG:A\\, B;;'), /ORG:A\\, B\r\n/);
});

test('shared text with title and link', () => {
  assert.deepEqual(sharedToContent({ title: 'T', text: 'T https://x.de' }), { type: 'url', url: 'https://x.de' });
});

test('codeword map covers every codeword exactly 8 times', () => {
  for (const [v, l] of [[1, 'L'], [5, 'Q'], [7, 'H'], [21, 'M'], [40, 'H']] as const) {
    const m = createMatrix('x', { ecLevel: l, minVersion: v, mask: -1 });
    const counts = new Map<number, number>();
    for (const cw of codewordMap(m)) if (cw >= 0) counts.set(cw, (counts.get(cw) ?? 0) + 1);
    assert.equal(counts.size, m.totalCodewords);
    assert.ok([...counts.values()].every((n) => n === 8));
    const { blockOf } = codewordBlocks(m);
    assert.equal(new Set(blockOf).size, m.ecBlocks);
  }
});

test('logo damage is measured per block, not by area', () => {
  const m = createMatrix('https://example.org', { ecLevel: 'H', minVersion: 3, mask: -1 });
  const none = coverageDamage(m, () => false);
  assert.equal(none.worstBlockLoad, 0);
  const big = analyze(m, { ...DEFAULT_STYLE, logo: 'data:image/png;base64,AA==', logoSize: 0.3 }, 1024);
  assert.ok(big.logoLoad > 0.5, `load ${big.logoLoad}`);
  assert.ok(big.logoCoverage < 0.12);
  const v7 = createMatrix('x', { ecLevel: 'H', minVersion: 7, mask: -1 });
  assert.ok(analyze(v7, { ...DEFAULT_STYLE, logo: 'data:image/png;base64,AA==', logoSize: 0.2 }, 1024).findings.some((f) => f.code === 'logoAlignment'));
});

test('labels: invalid XML characters and surrogate pairs', () => {
  assert.equal(escapeXml('a\u0001b<'), 'ab&lt;');
  const s = normalizeStyle({ label: `${'x'.repeat(59)}😀😀` });
  assert.equal(Array.from(s.label).length, 60);
  const m = createMatrix('x', { ecLevel: 'L', minVersion: 0, mask: -1 });
  assert.doesNotThrow(() => encodeURIComponent(renderSvg(m, s).svg));
});

test('history normalisation and limits', () => {
  assert.equal(normalizeContent({ type: 'wifi', ssid: 'a', security: 'bogus' })?.type, 'wifi');
  assert.equal(normalizeContent({ type: 'nope' }), null);
  assert.deepEqual(normalizeOptions({ ecLevel: 'X', minVersion: 99, mask: 12 }), { ecLevel: 'M', minVersion: 40, mask: 7 });
  let h = emptyHistory();
  for (let i = 0; i < MAX_ENTRIES + 5; i++) h = addScan(h, { id: String(i), at: '', text: String(i), format: 'QRCode', contentType: 'text', source: 'image' });
  assert.equal(h.scans.length, MAX_ENTRIES);
  const entry: CreateEntry = { id: 'a', at: '', content: { type: 'text', text: 'x' }, style: DEFAULT_STYLE, options: { ecLevel: 'M', minVersion: 0, mask: -1 }, payload: 'x' };
  h = addCreated(addCreated(h, entry), { ...entry, id: 'b' });
  assert.deepEqual(h.created.map((c) => c.id), ['b']);
});
