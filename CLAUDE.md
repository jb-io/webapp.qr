# CLAUDE.md

Guidance for Claude Code (and other agents) working in this repository.

Code, identifiers and comments are **English**. UI texts exist in German
(reference) and English. User-facing README is German with an English summary.

## Commands

```bash
npm run dev          # Vite dev server, http://localhost:3000 (no CSP, no service worker)
npm run build        # tsc --noEmit && vite build -> dist/
npm run typecheck
npm test             # node:test, finds test/*.test.ts itself
npm run test:e2e     # Playwright against `vite preview` of dist/ - build first!
npm run screenshots  # README images (needs `npm run preview` on :3000)
npm run icons        # PNG icons from public/icons/icon.svg
```

`npm test` runs **without a bundler** (type stripping). Rules for everything in
`src/core` and `test/` (Architecture.md A3): relative imports with `.ts`
extension, only erasable syntax (no enums, no parameter properties), type
imports as `import type`. Run `npm run typecheck` after changes – `node --test`
does not check types.

`npm run test:e2e` tests the **production build**; run `npx vite build` first or
you test a stale `dist/`.

## Mandatory: Architecture.md

All architectural decisions are listed there (A1, A2, …) with reason and
consequence. Update it in the same change. Superseded entries are marked, not
deleted.

## Rules that protect the core promises

1. **No external requests.** Never add CDN links, web fonts, remote images,
   analytics or libraries that fetch at runtime. The CSP in `vite.config.ts`
   and the e2e fixture (`e2e/fixtures.ts`) enforce this – do not loosen them.
   Libraries that load WASM or data from a CDN by default must be pointed at
   bundled files (see `decoder.worker.ts`).
2. **Camera only after an explicit click**, stopped on hit, stop, route change
   and `visibilitychange`.
3. **Show before act.** A scan result never triggers navigation, downloads or
   app launches by itself. Only `http(s)` links get an "open" action; secrets
   are masked.
4. **Storage is transparent.** Only the keys in `lib/storage.ts → OWN_KEYS`
   are written; anything new must be listed there, shown in the history raw
   view, described in the privacy page (`pages/PrivacyPage.tsx`) and go
   through a `normalize*` function in `core/history.ts`.
5. **Every new UI string** goes into `i18n/de.ts` and `i18n/en.ts` (the `Dict`
   type fails the build otherwise).

## Structure

See Architecture.md §3. `src/core/types.ts` is the single source of the domain
types. The SVG from `core/render.ts` is the master for every output format.

## Publishing

Every push to `master` runs `.github/workflows/pages.yml`: typecheck, unit
tests, build, Playwright e2e (desktop + mobile), then deploy to
<https://jb-io.github.io/webapp.qr/>. A red run publishes nothing.
