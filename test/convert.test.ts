import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sharedToContent, textToContent, vcardToContact } from '../src/core/convert.ts';
import { buildPayload } from '../src/core/payloads.ts';
import type { CreateContent } from '../src/core/types.ts';

test('generated payloads convert back to the same content', () => {
  const samples: CreateContent[] = [
    { type: 'wifi', ssid: 'Home;1', password: 'secret12', security: 'WPA', hidden: false },
    { type: 'phone', number: '+4930123' },
    { type: 'sms', number: '+4930123', message: 'Hi' },
    { type: 'email', to: 'a@b.de', subject: 'S x', body: 'B' },
    { type: 'event', title: 'T', location: 'L', description: '', allDay: false, start: '2026-01-02T10:00', end: '2026-01-02T11:00' },
    { type: 'epc', name: 'N', iban: 'DE89370400440532013000', bic: '', amount: '5', reference: '', text: 'x' },
    { type: 'url', url: 'https://example.org/' },
  ];
  for (const s of samples) assert.deepEqual(textToContent(buildPayload(s)), s);
});

test('vcf with groups and only FN', () => {
  const c = vcardToContact('BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Max Mustermann\r\nitem1.EMAIL;TYPE=INTERNET:max@x.de\r\nTEL;TYPE=CELL:+49 151\r\nEND:VCARD\r\nBEGIN:VCARD\r\nFN:Other\r\nEND:VCARD');
  assert.equal(c.firstName, 'Max');
  assert.equal(c.lastName, 'Mustermann');
  assert.equal(c.email, 'max@x.de');
  assert.equal(c.mobile, '+49 151');
});

test('android share intents', () => {
  assert.deepEqual(sharedToContent({ url: 'https://a.de' }), { type: 'url', url: 'https://a.de' });
  assert.deepEqual(sharedToContent({ title: 'Article', text: 'Article https://a.de/x' }), { type: 'url', url: 'https://a.de/x' });
  assert.deepEqual(sharedToContent({ text: 'Just a note' }), { type: 'text', text: 'Just a note' });
  assert.deepEqual(sharedToContent({ text: 'Look at this https://a.de' }), { type: 'text', text: 'Look at this https://a.de' });
});
