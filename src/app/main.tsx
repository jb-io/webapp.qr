import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { StoreProvider } from './state/Store.tsx';
import './styles.css';

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
 * via a `sw-update` event; the page reloads once the new worker took over.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    // On the very first visit the worker claims the page - that is no update and needs no reload.
    const hadController = Boolean(navigator.serviceWorker.controller);
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
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading || !hadController) return;
        reloading = true;
        window.location.reload();
      });
    } catch {
      // Offline support is an extra; the app works without it.
    }
  });
}
