import { useEffect, useState } from 'react';
import { Icon, type IconName } from './components/Icon.tsx';
import { ErrorBoundary, Toasts } from './components/ui.tsx';
import { useI18n, type Key } from './i18n/index.tsx';
import { useStore, type Route } from './state/Store.tsx';
import { CreatePage } from './pages/CreatePage.tsx';
import { HistoryPage } from './pages/HistoryPage.tsx';
import { PrivacyPage } from './pages/PrivacyPage.tsx';
import { ScanPage } from './pages/ScanPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { SharedPage } from './pages/SharedPage.tsx';
import { REPO_URL } from './config.ts';

const NAV: { route: Route; icon: IconName; label: Key }[] = [
  { route: 'scan', icon: 'scan', label: 'nav.scan' },
  { route: 'create', icon: 'qr', label: 'nav.create' },
  { route: 'history', icon: 'history', label: 'nav.history' },
  { route: 'settings', icon: 'settings', label: 'nav.settings' },
];

function NavLinks({ className, current }: { className: string; current: Route }) {
  const { t } = useI18n();
  return (
    <nav className={className} aria-label={t('nav.main')}>
      {NAV.map((n) => (
        <a key={n.route} href={`#/${n.route}`} aria-current={current === n.route ? 'page' : undefined}>
          <Icon name={n.icon} size={20} />
          <span>{t(n.label)}</span>
        </a>
      ))}
    </nav>
  );
}

/** Offers a reload when a new service worker is waiting. */
function useUpdateBanner(): (() => void) | null {
  const [apply, setApply] = useState<(() => void) | null>(null);
  useEffect(() => {
    const onUpdate = (event: Event) => {
      const worker = (event as CustomEvent<ServiceWorker>).detail;
      setApply(() => () => {
        // main.tsx reloads on controllerchange only when this flag is set.
        (window as unknown as { __reloadOnUpdate?: boolean }).__reloadOnUpdate = true;
        worker.postMessage('skipWaiting');
      });
    };
    window.addEventListener('sw-update', onUpdate);
    return () => window.removeEventListener('sw-update', onUpdate);
  }, []);
  return apply;
}

export function App() {
  const { route } = useStore();
  const { t } = useI18n();
  const update = useUpdateBanner();

  // Move focus to the page heading on navigation (screen readers, keyboard) -
  // unless the page already placed focus itself (child effects run first).
  useEffect(() => {
    const h1 = document.querySelector<HTMLElement>('main h1');
    const main = document.querySelector('main');
    if (h1 && document.activeElement !== document.body && !main?.contains(document.activeElement)) {
      h1.tabIndex = -1;
      h1.focus({ preventScroll: true });
    }
    window.scrollTo({ top: 0 });
  }, [route]);

  const current: Route = route === 'shared' ? 'create' : route;

  return (
    <div className="shell">
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>
        {t('app.skip')}
      </a>
      <header className="topbar">
        <div className="topbar-inner">
        <a className="brand" href="#/scan">
          <img src="./icons/icon.svg" alt="" width={32} height={32} />
          <span>
            {t('app.name')}
            <small>{t('app.tagline')}</small>
          </span>
        </a>
        <NavLinks className="nav" current={current} />
        </div>
      </header>

      {update && (
        <div className="note note-info update-banner" role="status">
          <Icon name="info" size={18} />
          <span>{t('app.update')}</span>
          <button type="button" className="btn btn-sm btn-primary push-right" onClick={update}>{t('app.updateNow')}</button>
        </div>
      )}

      <main id="main" className="main" tabIndex={-1}>
        <ErrorBoundary
          resetKey={route}
          fallback={() => (
            <div className="stack">
              <div className="note note-error" role="alert"><Icon name="alert" size={18} /><span>{t('common.crashed')}</span></div>
              <div className="actions">
                <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>{t('common.reload')}</button>
              </div>
            </div>
          )}
        >
          {route === 'scan' && <ScanPage />}
          {route === 'create' && <CreatePage />}
          {route === 'history' && <HistoryPage />}
          {route === 'settings' && <SettingsPage />}
          {route === 'privacy' && <PrivacyPage />}
          {route === 'shared' && <SharedPage />}
        </ErrorBoundary>
      </main>

      <footer className="footer">
        <nav aria-label={t('nav.privacy')}>
          <a href="#/privacy">{t('nav.privacy')}</a>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">{t('nav.source')}</a>
          <span>GPL-3.0</span>
        </nav>
      </footer>

      <NavLinks className="tabbar" current={current} />
      <Toasts />
    </div>
  );
}
