import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeUrl, parseContent, toIcsFile, toVcfFile } from '../src/core/parse.ts';
import { buildPayload } from '../src/core/payloads.ts';

const field = (text: string, key: string, format?: string) => parseContent(text, format).fields.find((f) => f.key === key)?.value;

test('wifi round trip', () => {
  const p = buildPayload({ type: 'wifi', ssid: 'A;B', password: 'pa:ss', security: 'WPA', hidden: false });
  const r = parseContent(p);
  assert.equal(r.type, 'wifi');
  assert.equal(field(p, 'ssid'), 'A;B');
  assert.equal(field(p, 'password'), 'pa:ss');
  assert.ok(r.sensitive);
});

test('url warnings', () => {
  assert.deepEqual(analyzeUrl('https://example.org')?.warnings, []);
  assert.deepEqual(analyzeUrl('http://example.org')?.warnings, ['insecure']);
  assert.ok(analyzeUrl('https://xn--pypal-4ve.com')?.warnings.includes('punycode'));
  assert.ok(analyzeUrl('https://bank.de@evil.example')?.warnings.includes('userinfo'));
  assert.ok(analyzeUrl('https://192.168.0.1/login')?.warnings.includes('ipHost'));
  assert.ok(analyzeUrl('https://bit.ly/x')?.warnings.includes('shortener'));
  const js = analyzeUrl('javascript:alert(1)');
  assert.equal(js?.openable, false);
  assert.ok(js?.warnings.includes('dangerousScheme'));
});

test('types are detected', () => {
  assert.equal(parseContent('https://a.de/x').type, 'url');
  assert.equal(parseContent('www.a.de').type, 'url');
  assert.equal(parseContent('mailto:a@b.de?subject=Hi').type, 'email');
  assert.equal(parseContent('SMSTO:+49123:Hello').type, 'sms');
  assert.equal(field('SMSTO:+49123:Hello: you', 'message'), 'Hello: you');
  assert.equal(parseContent('tel:+49123').type, 'phone');
  assert.equal(parseContent('geo:52.1,13.2').type, 'geo');
  assert.equal(parseContent('otpauth://totp/A:b?secret=XYZ&issuer=A').type, 'otp');
  assert.equal(parseContent('4006381333931', 'EAN13').type, 'product');
  assert.equal(parseContent('bitcoin:abc').type, 'uri');
  assert.equal(parseContent('Hello world').type, 'text');
  assert.equal(parseContent('BCD\n002\n1\nSCT\n\nX\nDE89370400440532013000\nEUR5').type, 'epc');
});

test('vcard fields', () => {
  const v = 'BEGIN:VCARD\nVERSION:3.0\nFN:Ann Lee\nTEL;TYPE=CELL:+491\nEMAIL:a@b.de\nEND:VCARD';
  assert.equal(field(v, 'name'), 'Ann Lee');
  assert.equal(field(v, 'mobile'), '+491');
  assert.match(toVcfFile(v), /\r\nEND:VCARD\r\n$/);
  assert.match(toVcfFile('MECARD:N:Lee,Ann;TEL:123;;'), /FN:Ann Lee/);
});

test('ics wrapping', () => {
  const ics = toIcsFile('BEGIN:VEVENT\nSUMMARY:X\nEND:VEVENT');
  assert.match(ics, /^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
});
