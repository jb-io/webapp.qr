import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { StoreProvider } from './state/Store.tsx';
import { discardStaleShare } from './lib/shareTarget.ts';
import './styles.css';

// The CSP cannot forbid framing via <meta>; refuse to run inside a foreign frame (clickjacking).
if (window.top !== window.self) {
  document.documentElement.textContent = '';
  throw new Error('framed');
}

// Chromium fires this early - keep it for the "Install" button in the settings.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  (window as unknown as { __installPrompt?: Event }).__installPrompt = e;
});

// Shared data that was never picked up must not linger.
if (!new URLSearchParams(window.location.search).has('shared')) void discardStaleShare().catch(() => undefined);

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');

createRoot(root).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
);

/**
 * Service worker only in production builds. A waiting update is announced
 * via a `sw-update` event; after the user confirms (App.tsx sets
 * `__reloadOnUpdate`) the page reloads once the new worker took over. The
 * first install claims the page silently - no reload needed then.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      const announce = (worker: ServiceWorker | null) => {
        if (worker && navigator.serviceWorker.controller) {
          window.dispatchEvent(new CustomEvent('sw-update', { detail: worker }));
        }
      };
      announce(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed') announce(worker);
        });
      });
      // Long-lived PWA sessions: look for updates when the app comes back.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void reg.update().catch(() => undefined);
      });
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading || !(window as unknown as { __reloadOnUpdate?: boolean }).__reloadOnUpdate) return;
        reloading = true;
        window.location.reload();
      });
    } catch {
      // Offline support is an extra; the app works without it.
    }
  });
}
