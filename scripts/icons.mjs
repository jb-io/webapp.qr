/**
 * Renders the PNG app icons from public/icons/icon.svg with the locally
 * installed Chrome (Playwright). Run after changing the SVG:
 *
 *   npm run icons
 */
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

const dir = new URL('../public/icons/', import.meta.url).pathname;
const svg = await readFile(`${dir}icon.svg`, 'utf8');
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();

/** `maskable` adds a safe-zone padding: Android crops to a circle. */
const targets = [
  { name: 'icon-192.png', size: 192, pad: 0 },
  { name: 'icon-512.png', size: 512, pad: 0 },
  { name: 'icon-maskable-512.png', size: 512, pad: 0.12, bleed: true },
  { name: 'apple-touch-icon.png', size: 180, pad: 0, bleed: true },
];

for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  const inner = t.size * (1 - 2 * t.pad);
  const body = t.bleed
    ? `<div style="width:${t.size}px;height:${t.size}px;background:linear-gradient(135deg,#14b8a6,#0f5f58);display:grid;place-items:center">
         <div style="width:${inner}px;height:${inner}px">${svg.replace('<rect width="512" height="512" rx="112" fill="url(#g)"/>', '')}</div></div>`
    : `<div style="width:${t.size}px;height:${t.size}px">${svg}</div>`;
  await page.setContent(`<html><body style="margin:0;background:transparent">${body}</body></html>`);
  await page.screenshot({ path: `${dir}${t.name}`, omitBackground: true });
  console.log('written:', t.name);
}
await browser.close();
