import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/**
 * Content Security Policy for the production build. It is what turns "no
 * external requests" from a promise into a browser-enforced rule: anything
 * not served from our own origin is blocked. Only applied to the build -
 * the dev server needs inline scripts for hot reloading.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "worker-src 'self'",
  "font-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function csp(): Plugin {
  return {
    name: 'csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

/**
 * Emits `sw.js` with the precache list of the finished bundle. A hand-made
 * worker instead of a plugin keeps the offline logic small and readable
 * (see src/sw/sw-template.js and Architecture.md, A9).
 */
function serviceWorker(): Plugin {
  return {
    name: 'service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const publicDir = new URL('./public/', import.meta.url).pathname;
      const files = [
        ...Object.keys(bundle),
        ...listFiles(publicDir).map((f) => relative(publicDir, f)),
      ].filter((f) => !f.endsWith('.map') && f !== 'sw.js').sort();
      const hash = createHash('sha256').update(files.join('\n'));
      for (const item of Object.values(bundle)) {
        hash.update(item.type === 'chunk' ? item.code : item.source);
      }
      const template = readFileSync(new URL('./src/sw/sw-template.js', import.meta.url), 'utf8');
      const source = template
        .replace('__VERSION__', hash.digest('hex').slice(0, 12))
        .replace('__PRECACHE__', JSON.stringify(['./', ...files], null, 2));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

// Relative base so the build works below any sub path (GitHub Pages).
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react(), csp(), serviceWorker()],
  build: { target: 'es2022', sourcemap: false },
  worker: { format: 'es' },
  server: { port: 3000 },
  preview: { port: 3000 },
});
