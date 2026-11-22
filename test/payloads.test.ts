import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPayload, emptyContent, epcAmount, escapeWifi, isValidIban, normalizeUrl, toICalDate, validateContent,
} from '../src/core/payloads.ts';
import type { ContactContent, EpcContent, EventContent, WifiContent } from '../src/core/types.ts';

test('wifi payload escapes special characters', () => {
  const c: WifiContent = { type: 'wifi', ssid: 'My;Net', password: 'p:a\\ss,"x"', security: 'WPA', hidden: true };
  assert.equal(buildPayload(c), 'WIFI:T:WPA;S:My\\;Net;P:p\\:a\\\\ss\\,\\"x\\";H:true;;');
  assert.equal(escapeWifi('a;b'), 'a\\;b');
});

test('open wifi omits the password', () => {
  assert.equal(buildPayload({ type: 'wifi', ssid: 'Cafe', password: 'x', security: 'nopass', hidden: false }), 'WIFI:T:nopass;S:Cafe;;');
});

test('url gets https when no scheme is given', () => {
  assert.equal(normalizeUrl('example.org/a'), 'https://example.org/a');
  assert.equal(normalizeUrl('http://x.de'), 'http://x.de');
  assert.deepEqual(validateContent({ type: 'url', url: 'http://' }), [{ field: 'url', code: 'invalidUrl' }]);
});

test('vcard contains escaped name and address', () => {
  const c: ContactContent = { ...(emptyContent('contact') as ContactContent), firstName: 'Ann', lastName: 'Lee, Jr', city: 'Köln', email: 'a@b.de' };
  const v = buildPayload(c);
  assert.match(v, /^BEGIN:VCARD\nVERSION:3\.0\nN:Lee\\, Jr;Ann;;;\nFN:Ann Lee\\, Jr\n/);
  assert.match(v, /ADR;TYPE=WORK:;;;Köln;;;\n/);
  assert.match(v, /END:VCARD$/);
});

test('event dates', () => {
  assert.equal(toICalDate('2026-11-22T09:30', false), '20261122T093000');
  assert.equal(toICalDate('2026-11-22', true), '20261122');
  const e: EventContent = { type: 'event', title: 'Meet', location: '', description: '', allDay: true, start: '2026-11-22', end: '' };
  assert.equal(buildPayload(e), 'BEGIN:VEVENT\nSUMMARY:Meet\nDTSTART;VALUE=DATE:20261122\nEND:VEVENT');
});

test('iban check', () => {
  assert.ok(isValidIban('DE89 3704 0044 0532 0130 00'));
  assert.ok(!isValidIban('DE89 3704 0044 0532 0130 01'));
});

test('epc payload (GiroCode)', () => {
  const c: EpcContent = { type: 'epc', name: 'Red Cross', iban: 'de89 3704 0044 0532 0130 00', bic: '', amount: '12,50', reference: '', text: 'Donation' };
  assert.equal(buildPayload(c), 'BCD\n002\n1\nSCT\n\nRed Cross\nDE89370400440532013000\nEUR12.5\n\n\nDonation');
  assert.equal(epcAmount('10'), 'EUR10');
  assert.equal(epcAmount('0.05'), 'EUR0.05');
  assert.deepEqual(validateContent({ ...c, amount: '1,234' }).map((e) => e.code), ['invalidAmount']);
});

test('validation requires the essential fields', () => {
  assert.deepEqual(validateContent(emptyContent('wifi')).map((e) => e.field), ['ssid', 'password']);
  assert.deepEqual(validateContent({ type: 'geo', latitude: '91', longitude: '8', label: '' }).map((e) => e.code), ['invalidLatitude']);
  assert.deepEqual(validateContent({ type: 'phone', number: '+49 30 1234' }), []);
});

test('sms, phone, mail, geo', () => {
  assert.equal(buildPayload({ type: 'sms', number: '+49 (151) 123', message: 'Hi: you' }), 'SMSTO:+49151123:Hi: you');
  assert.equal(buildPayload({ type: 'phone', number: '+49 30-12' }), 'tel:+493012');
  assert.equal(buildPayload({ type: 'email', to: 'a@b.de', subject: 'Hi there', body: '' }), 'mailto:a@b.de?subject=Hi%20there');
  assert.equal(buildPayload({ type: 'geo', latitude: '52.5', longitude: '13.4', label: '' }), 'geo:52.5,13.4');
});
