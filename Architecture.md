# Architecture – webapp.qr ("QR lokal")

Status: 2026-11-22 · React + TypeScript on a framework-free core

This file records the load-bearing decisions as a numbered list (A1, A2, …)
with reason and consequence. It **must be updated in the same change** as any
architectural change. Superseded decisions are marked, not deleted.

## 1. Goal

Read and create QR codes in the browser – on desktop, mobile and as installed
PWA – with zero external requests, no cookies, no tracking and a transparent,
deletable local history. Every generated code is re-read by an independent
decoder before the user relies on it.

Non-goals: accounts, sync, server-side processing, analytics.

## 2. Decisions

| # | Decision | Reason | Consequence |
|---|---|---|---|
| A1 | **Static single-page app**, React + Vite, hash routing, `base: './'` | No data ever leaves the device, so there is nothing for a backend to do. Hash routes work on any static host and in sub paths (GitHub Pages) | Routes: `#/scan`, `#/create`, `#/history`, `#/settings`, `#/privacy`, `#/shared` |
| A2 | **Framework-free core** in `src/core` (pure TS, no DOM, no React) | Payload building, parsing, rendering, analysis and storage normalisation are the logic worth testing; keeping them DOM-free makes them testable with plain `node --test` | Dependency direction `src/app → src/core`, never the reverse |
| A3 | **Tests run without a bundler** (`node --test`, type stripping) | Same files are tested that ship; no second tool chain | Relative imports with `.ts`, erasable syntax only, `import type` |
| A4 | **Decoder: zxing-wasm (zxing-cpp)**, WASM bundled and served from our origin | Broadest format support (QR, Micro QR, rMQR, Data Matrix, Aztec, PDF417, all retail/industrial 1D) and rich metadata (version, EC level, mask, unused EC margin). The library loads its WASM from a CDN by default – overridden via `locateFile` | ~950 KB WASM (415 KB gzip), cached by the service worker |
| A5 | **Decoding in a Web Worker** (`lib/decoder.worker.ts`) | Camera frames are decoded continuously; the main thread must stay smooth | One shared worker; `ImageData` buffers are transferred, not copied |
| A6 | **Encoder: `qrcode` (node-qrcode)** for the matrix only; **our own SVG renderer** | We need module shapes, finder styles, frames, labels and logos – rendering ourselves keeps full control and a single master format. Capacity figures come from qrcode's internal tables (`qrcode-internals.d.ts`) | `renderSvg()` is the master; preview, fullscreen, PNG/JPEG/WebP (canvas) and PDF derive from it and cannot drift |
| A7 | **Own minimal PDF writer** (`core/pdf.ts`), lossless Flate image | A PDF library would add >100 KB for one image on one page. `CompressionStream('deflate')` yields exactly the zlib stream PDF expects | Rasterised at ~600 dpi for the chosen print width |
| A8 | **Verification = re-read with zxing + static analysis** (`core/analysis.ts`) | The real question is "does a scanner read it?". The static part explains *why* (contrast, quiet zone, logo coverage vs. EC budget, density, print size) | Rendered at ~6 px/module, decoded `qrOnly`, payload compared byte-exact |
| A9 | **Hand-written service worker**, precache list injected at build (`vite.config.ts`, `src/sw/sw-template.js`) | Small and readable; no Workbox. Cache-first for everything since nothing is remote. Also needed for the share target (A10) | Versioned cache per build hash; update banner when a new worker waits; no reload on first install |
| A10 | **Android Web Share Target via POST** → SW parks data in Cache Storage → `#/shared` imports it into the editable form | GitHub Pages cannot receive POST; files (`.vcf`, `.ics`, images) need multipart POST | Shared data is deleted right after pickup. Images go to the scanner, everything else to the generator – always editable before use |
| A11 | **Content Security Policy** in the built `index.html` (`connect-src 'self'`, no remote script/style/img) | Turns "no external requests" from a promise into a browser-enforced rule; also hardens against injected content | Only in production builds (dev server needs inline scripts). `wasm-unsafe-eval` for zxing. Styles via CSSOM only (`style-src 'self'`) |
| A12 | **localStorage only, normalised on read** (`core/history.ts`) | `normalizeHistory/normalizeSettings/normalizeStyle` are the only entry points for stored data: input is `unknown`, garbage becomes defaults, logos must be raster data URLs (never remote URLs) | Keys `webapp.qr.settings.v1`, `webapp.qr.history.v1`; max 200 entries per list; schema bump ⇒ new key + migration |
| A13 | **History writes only on explicit actions** (save, export, share, copy, fullscreen) | Live preview would otherwise create an entry per keystroke | Identical entries move to the top instead of duplicating |
| A14 | **Nothing happens automatically after a scan** | Safety (phishing QR codes) and user control | Results are shown first; links are analysed (`analyzeUrl`, real host highlighted) and only http(s) can be opened; `mailto:` is rebuilt from the displayed fields (no hidden bcc), `tel:` with `*#` warns; OTP secrets and Wi-Fi passwords are masked. **OTP codes are never written to the history** |
| A15 | **i18n via typed flat dictionaries** (`app/i18n/de.ts` is the reference, `Dict` type forces completeness) | Small, no library; missing keys fail the type check | Privacy policy is JSX per language (long-form text). More languages: tracked in an issue |
| A16 | **E2E tests with Playwright against the production build** (desktop + mobile profile), guarded by an auto-fixture that fails on console errors and on any request leaving the origin | CSP, service worker and WASM loading only exist in the build; the privacy promise is checked continuously | CI installs Chromium; locally the installed Chrome is used |

| A17 | **One parser for creatable content** (`core/convert.ts`); `core/parse.ts` derives display fields from it | Two parsers had drifted (sms decoding, vCard groups, geo labels). Now "show" and "edit" cannot disagree; shared text helpers live in `core/text.ts` | Malformed input never throws (`safeDecode`); calendar files are read from the first VEVENT block, UTC times converted to local, all-day DTEND treated as exclusive |
| A18 | **Logo check per Reed-Solomon block** (`core/damage.ts`) | Area is a poor proxy: a logo cuts codewords partially and blocks unevenly. Modules are mapped to codewords (ISO 18004 placement + interleaving); the worst block is compared with its correctable errors | Findings `logoOk/logoLarge/logoTooLarge` use that load; covering alignment patterns is a separate warning |
| A19 | **Shared origin awareness**: GitHub Pages serves all projects of `jb-io` from one origin | Other projects could see/clear our storage and we theirs | SW only deletes caches prefixed `qr-lokal-` and only handles requests in its scope; "delete all data" only unregisters our own scope; privacy policy says so |
| A20 | **Toasts in their own context**, store updates through refs/updaters | A toast or keystroke must not re-render every page; async callbacks (geolocation, logo upload) must patch the latest draft, and several scans in one image must all be stored | `setDraft` accepts updater functions; `persistHistory` applies updaters to a ref-held document |
| A21 | **Precache bypasses the HTTP cache** (`cache: 'reload'`), SW version hashes every served byte incl. public files and `index.html` | GitHub Pages sends `max-age=600`; a new worker could otherwise store an old `index.html` pointing at deleted chunks | Update banner reloads only after the user confirms; first install never reloads |

## 3. Layout

```
index.html               entry (CSP injected at build)
vite.config.ts           base "./", CSP + service-worker plugins
playwright.config.ts     e2e against `vite preview`
src/core/                pure logic, tested with node:test
  types.ts               domain types – start here
  payloads.ts            content → payload string, validation (IBAN, …)
  parse.ts               decoded text → typed fields, URL risk analysis
  text.ts                escaping/unescaping, tolerant decoding, content lines
  convert.ts             the parser: text / shared data / vcf / ics → editable content
  damage.ts              module → codeword → RS block mapping (logo check)
  matrix.ts              payload → module matrix + capacity figures
  render.ts              matrix + style → SVG (master format)
  analysis.ts            contrast, quiet zone, logo coverage, print size
  pdf.ts                 minimal single-image PDF writer
  history.ts             normalisation + mutations of stored data
src/app/                 React UI
  state/Store.tsx        settings, history, draft, route, toasts
  lib/                   decoder (+worker), export, storage, share target
  pages/                 one component per route
  components/            forms, result card, verify panel, icons, ui kit
  i18n/                  de (reference), en
src/sw/sw-template.js    service worker template
public/                  manifest, icons
test/                    unit tests (core only)
e2e/                     Playwright tests
```
