/**
 * Generates the README screenshots from the production build so the guide
 * shows what users actually see.
 *
 *   npm run build && npm run preview     # second terminal
 *   npm run screenshots
 */
import { chromium, devices } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT = new URL('../docs/images/', import.meta.url).pathname;
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome' });

async function open(mobile, colorScheme = 'light') {
  const context = await browser.newContext(mobile
    ? { ...devices['Pixel 7'], locale: 'de-DE', colorScheme }
    : { viewport: { width: 1360, height: 900 }, locale: 'de-DE', colorScheme });
  const page = await context.newPage();
  return { context, page };
}

async function shot(page, name, fullPage = false) {
  await page.mouse.move(0, 0).catch(() => undefined);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}${name}.png`, fullPage });
  console.log('written:', `docs/images/${name}.png`);
}

async function createUrl(page) {
  await page.goto(`${BASE}/#/create`);
  await page.getByLabel('Adresse (URL)').fill('https://github.com/jb-io/webapp.qr');
  await page.getByText('Lesbar – Inhalt stimmt überein').waitFor();
}

{
  const { context, page } = await open(false);
  await createUrl(page);
  await page.getByRole('radio', { name: 'Abgerundet' }).first().check().catch(() => undefined);
  await page.getByText('Form', { exact: true }).click();
  await page.getByRole('radio', { name: 'Abgerundet' }).first().check();
  await page.getByText('Rahmen & Beschriftung').click();
  await page.getByRole('radio', { name: 'Mit Banner' }).check();
  await page.getByRole('textbox', { name: /^Beschriftung/ }).fill('Scan mich');
  await page.getByText('Lesbar – Inhalt stimmt überein').waitFor();
  await shot(page, '01-create-desktop');
  await page.goto(`${BASE}/#/scan`);
  await shot(page, '02-scan-desktop');
  await context.close();
}
{
  const { context, page } = await open(true);
  await createUrl(page);
  await shot(page, '03-create-mobile');
  await page.getByRole('button', { name: 'Im Verlauf speichern' }).click();
  await page.goto(`${BASE}/#/history`);
  await page.getByRole('radio', { name: /^Erstellt/ }).check();
  await shot(page, '04-history-mobile');
  await context.close();
}
{
  const { context, page } = await open(true, 'dark');
  await createUrl(page);
  await page.locator('.verify').scrollIntoViewIfNeeded();
  await shot(page, '05-verify-mobile-dark');
  await context.close();
}
await browser.close();
