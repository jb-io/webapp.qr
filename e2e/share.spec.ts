import { test, expect } from './fixtures.ts';

/**
 * Simulates the Android share target: the service worker would have parked
 * the data in Cache Storage; we put it there directly and open the landing
 * route. The user must end up in an editable form.
 */
async function share(page: import('@playwright/test').Page, meta: object, files: { type: string; body: string }[] = []) {
  await page.goto('/#/settings');
  await page.evaluate(async ({ meta, files }) => {
    const cache = await caches.open('qr-lokal-share');
    await cache.put('shared/meta', new Response(JSON.stringify(meta)));
    for (const [i, f] of files.entries()) await cache.put(`shared/file/${i}`, new Response(f.body, { headers: { 'Content-Type': f.type } }));
  }, { meta, files });
  await page.goto('/?shared=1#/shared');
}

test('shared URL lands in the editable URL form', async ({ page }) => {
  await share(page, { title: 'Artikel', text: 'Artikel https://example.org/a', url: '' });
  await expect(page.getByText('Geteilte Daten übernommen')).toBeVisible();
  await expect(page.getByLabel('Adresse (URL)')).toHaveValue('https://example.org/a');
  await page.getByLabel('Adresse (URL)').fill('https://example.org/b');
  await expect(page.getByText('Lesbar – Inhalt stimmt überein')).toBeVisible();
});

test('shared vcf becomes an editable contact', async ({ page }) => {
  const vcf = 'BEGIN:VCARD\r\nVERSION:3.0\r\nN:Mustermann;Erika;;;\r\nFN:Erika Mustermann\r\nTEL;TYPE=CELL:+49 151 1234567\r\nEMAIL:erika@example.org\r\nEND:VCARD\r\n';
  await share(page, { title: '', text: '', url: '', files: [{ name: 'erika.vcf', type: 'text/x-vcard' }] }, [{ type: 'text/x-vcard', body: vcf }]);
  await expect(page.getByLabel(/^Vorname/)).toHaveValue('Erika');
  await expect(page.getByLabel(/^Nachname/)).toHaveValue('Mustermann');
  await expect(page.getByLabel(/^Mobil/)).toHaveValue('+49 151 1234567');
  await page.getByLabel(/^Firma/).fill('Beispiel GmbH');
  await expect(page.getByText('Lesbar – Inhalt stimmt überein')).toBeVisible();
});

test('shared plain text becomes editable text', async ({ page }) => {
  await share(page, { title: '', text: 'Kopierter Text', url: '' });
  await expect(page.getByRole('textbox', { name: 'Text' })).toHaveValue('Kopierter Text');
});

test('real share-target POST through the service worker', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium');
  await page.goto('/#/settings');
  // Wait until the service worker controls the page (first visit: claim()).
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, undefined, { timeout: 15000 });
  await page.evaluate(() => {
    const form = document.createElement('form');
    form.method = 'POST';
    form.enctype = 'multipart/form-data';
    form.action = './share-target';
    const add = (name: string, value: string) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.append(input);
    };
    add('title', '');
    add('text', 'Geteilter Text aus einer anderen App');
    add('url', '');
    document.body.append(form);
    form.submit();
  });
  await expect(page.getByRole('textbox', { name: 'Text' })).toHaveValue('Geteilter Text aus einer anderen App');
  await expect(page.getByText('Geteilte Daten übernommen')).toBeVisible();
  expect(await page.evaluate(async () => (await caches.keys()).includes('qr-lokal-share'))).toBe(false);
});
