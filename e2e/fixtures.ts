import { test as base, expect } from '@playwright/test';

/**
 * Every test fails if the page logs errors or any request - including the
 * service worker's own - leaves the origin. This is how "no external
 * requests" is guarded continuously.
 */
export const test = base.extend<{ guard: string[] }>({
  guard: [async ({ page, context, baseURL }, use) => {
    const problems: string[] = [];
    const origin = new URL(baseURL ?? 'http://localhost').origin;
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(`console: ${m.text()}`);
    });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    context.on('request', (r) => {
      const url = r.url();
      if (!url.startsWith(origin) && !/^(data|blob):/.test(url)) problems.push(`external request: ${url}`);
    });
    await use(problems);
    expect(problems, problems.join('\n')).toEqual([]);
  }, { auto: true }],
});

export { expect };
