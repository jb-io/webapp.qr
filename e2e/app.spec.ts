import { readFile } from 'node:fs/promises';
import { test, expect } from './fixtures.ts';

test('navigation and privacy page are reachable', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Code scannen', level: 1 })).toBeVisible();
  await page.goto('/#/privacy');
  await expect(page.getByRole('heading', { name: 'Datenschutzerklärung' })).toBeVisible();
  await page.goto('/#/settings');
  await expect(page.getByRole('heading', { name: 'Einstellungen', level: 1 })).toBeVisible();
});

test('camera is not requested before the user asks for it', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __gum: number }).__gum = 0;
    const md = navigator.mediaDevices;
    if (md) {
      const orig = md.getUserMedia.bind(md);
      md.getUserMedia = (c) => { (window as unknown as { __gum: number }).__gum++; return orig(c); };
    }
  });
  await page.goto('/#/scan');
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as unknown as { __gum: number }).__gum)).toBe(0);
});

test('generate, verify, export, scan back, history', async ({ page }, info) => {
  await page.goto('/#/create');
  await page.getByLabel('Adresse (URL)').fill('https://example.org/hallo?x=1');
  await expect(page.getByText('Lesbar – Inhalt stimmt überein')).toBeVisible();

  await page.getByRole('button', { name: 'Im Verlauf speichern' }).click();
  await expect(page.getByText('Im Verlauf gespeichert')).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Herunterladen/ }).click(),
  ]);
  const png = info.outputPath('code.png');
  await download.saveAs(png);
  expect(download.suggestedFilename()).toMatch(/^qr-url-\d{8}-\d{4}\.png$/);

  await page.goto('/#/scan');
  await page.locator('input[type=file]').setInputFiles(png);
  await expect(page.getByRole('heading', { name: 'Link', level: 2 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Link öffnen' })).toHaveAttribute('href', 'https://example.org/hallo?x=1');

  await page.goto('/#/history');
  await expect(page.getByText('Gescannt (1)')).toBeVisible();
  await expect(page.getByText('Erstellt (1)')).toBeVisible();
});

test('framed code with label and logo still verifies', async ({ page }) => {
  await page.goto('/#/create');
  await page.getByLabel('Adresse (URL)').fill('https://example.org');
  await page.getByText('Rahmen & Beschriftung').click();
  await page.getByRole('radio', { name: 'Mit Banner' }).check();
  await page.getByRole('textbox', { name: /^Beschriftung/ }).fill('Scan mich');
  await page.getByText('Logo / Bild in der Mitte').click();
  const icon = await readFile(new URL('../public/icons/icon-192.png', import.meta.url));
  await page.locator('input[type=file][accept*="image/png"]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: icon });
  await expect(page.getByText(/^Bild verdeckt \d+ %/)).toBeVisible();
  await expect(page.getByText('Lesbar – Inhalt stimmt überein')).toBeVisible();
});

test('all export formats produce files', async ({ page }) => {
  await page.goto('/#/create');
  await page.getByLabel('Adresse (URL)').fill('https://example.org');
  await expect(page.getByText('Lesbar – Inhalt stimmt überein')).toBeVisible();
  for (const [format, magic] of [['svg', '<?xml'], ['pdf', '%PDF'], ['png', '\x89PNG'], ['jpeg', '\xff\xd8'], ['webp', 'RIFF']] as const) {
    await page.getByLabel('Format').selectOption(format);
    const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Herunterladen/ }).click()]);
    const path = await d.path();
    const head = (await readFile(path)).subarray(0, 5).toString('latin1');
    expect(head.startsWith(magic), `${format}: ${JSON.stringify(head)}`).toBe(true);
  }
});

test('wifi form validates and builds a code', async ({ page }) => {
  await page.goto('/#/create');
  await page.getByRole('radio', { name: 'WLAN' }).check();
  await page.getByLabel('Netzwerkname (SSID)').fill('Home;Net');
  await page.getByLabel('Passwort', { exact: true }).fill('short');
  await page.getByLabel('Passwort', { exact: true }).blur();
  await expect(page.getByText('WPA-Passwörter haben 8 bis 63 Zeichen')).toBeVisible();
  await page.getByLabel('Passwort', { exact: true }).fill('long enough pw');
  await expect(page.getByText('Lesbar – Inhalt stimmt überein')).toBeVisible();
});

test('history entries can be inspected and deleted', async ({ page }) => {
  await page.goto('/#/create');
  await page.getByLabel('Adresse (URL)').fill('https://example.org/x');
  await page.getByRole('button', { name: 'Im Verlauf speichern' }).click();
  await page.goto('/#/history');
  await page.getByRole('radio', { name: /^Erstellt/ }).check();
  await page.getByRole('button', { name: 'Gespeicherte Rohdaten' }).click();
  await expect(page.locator('.raw-view pre').nth(1)).toContainText('https://example.org/x');
  await page.getByRole('button', { name: /^Löschen: / }).click();
  await expect(page.getByText('Noch keine erstellten Codes.')).toBeVisible();
});

test('english UI via settings', async ({ page }) => {
  await page.goto('/#/settings');
  await page.getByLabel('Sprache').selectOption('en');
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
});
