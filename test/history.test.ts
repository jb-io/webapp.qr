import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addScan, emptyHistory, normalizeHistory, normalizeSettings, normalizeStyle, removeEntry, DEFAULT_SETTINGS } from '../src/core/history.ts';
import { DEFAULT_STYLE } from '../src/core/types.ts';
import { buildPdf, pdfString } from '../src/core/pdf.ts';

test('garbage in, empty history out', () => {
  assert.deepEqual(normalizeHistory(null), emptyHistory());
  assert.deepEqual(normalizeHistory({ schema: 2 }), emptyHistory());
  const h = normalizeHistory({ schema: 1, scans: [{ id: 'a', text: 'x' }, { nope: 1 }], created: [{ id: 'b', content: { type: 'bogus' } }] });
  assert.equal(h.scans.length, 1);
  assert.equal(h.created.length, 0);
});

test('styles never accept remote logos or broken colours', () => {
  const s = normalizeStyle({ logo: 'https://evil.example/x.png', foreground: 'red', quietZone: 99 });
  assert.equal(s.logo, '');
  assert.equal(s.foreground, DEFAULT_STYLE.foreground);
  assert.equal(s.quietZone, 10);
});

test('duplicate scans move to the top, removal works', () => {
  let h = emptyHistory();
  const e = (id: string, text: string) => ({ id, at: '', text, format: 'QRCode', contentType: 'text' as const, source: 'camera' as const });
  h = addScan(h, e('1', 'a'));
  h = addScan(h, e('2', 'b'));
  h = addScan(h, e('3', 'a'));
  assert.deepEqual(h.scans.map((s) => s.id), ['3', '2']);
  assert.deepEqual(removeEntry(h, '3').scans.map((s) => s.id), ['2']);
});

test('settings defaults', () => {
  assert.deepEqual(normalizeSettings(undefined), DEFAULT_SETTINGS);
  assert.equal(normalizeSettings({ theme: 'dark' }).theme, 'dark');
});

test('pdf structure', () => {
  const pdf = new TextDecoder('latin1').decode(buildPdf({ data: new Uint8Array([1, 2, 3]), width: 1, height: 1 }, { widthMm: 50, title: 'Ä(x)' }));
  assert.match(pdf, /^%PDF-1\.4/);
  assert.match(pdf, /\/Width 1 \/Height 1/);
  assert.match(pdf, /%%EOF\n$/);
  const xref = Number(/startxref\n(\d+)/.exec(pdf)?.[1]);
  assert.equal(pdf.slice(xref, xref + 4), 'xref');
  assert.equal(pdfString('Ä(x)'), '(?\\(x\\))');
});
