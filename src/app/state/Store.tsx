/**
 * Application state: settings, history, toasts, the generator draft and the
 * current route. Persistence goes through `lib/storage.ts`; everything else
 * reads state from here.
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import { addCreated, addScan, DEFAULT_OPTIONS, newId, removeEntry } from '../../core/history.ts';
import { emptyContent } from '../../core/payloads.ts';
import { DEFAULT_STYLE } from '../../core/types.ts';
import type {
  CreateContent, CreateEntry, HistoryDoc, Language, MatrixOptions, QrStyle, ScanEntry, Settings,
} from '../../core/types.ts';
import { loadHistory, loadSettings, QuotaError, saveHistory, saveSettings } from '../lib/storage.ts';
import { detectLanguage, I18nProvider, makeI18n, type Key } from '../i18n/index.tsx';

export type Route = 'scan' | 'create' | 'history' | 'settings' | 'privacy' | 'shared';
const ROUTES: Route[] = ['scan', 'create', 'history', 'settings', 'privacy', 'shared'];

export interface Draft {
  content: CreateContent;
  style: QrStyle;
  options: MatrixOptions;
  /** Why the draft was prefilled - shown once as a hint. */
  origin: 'share' | 'scan' | 'history' | null;
  /** Changes whenever the draft is replaced from outside (focus / hint). */
  stamp: number;
}

export interface Toast { id: number; text: string; tone: 'info' | 'error' }

/** A file shared into the app that should be decoded on the scan page. */
export interface PendingImage { file: Blob; name: string }

interface StoreValue {
  route: Route;
  navigate: (route: Route) => void;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  lang: Language;
  history: HistoryDoc;
  recordScan: (entry: Omit<ScanEntry, 'id' | 'at'>) => void;
  recordCreated: (entry: Omit<CreateEntry, 'id' | 'at'>, explicit: boolean) => void;
  deleteEntry: (id: string) => void;
  clearList: (list: 'scans' | 'created') => void;
  draft: Draft;
  setDraft: (patch: Partial<Omit<Draft, 'stamp'>>) => void;
  loadDraft: (draft: Omit<Draft, 'stamp'>) => void;
  pendingImage: PendingImage | null;
  setPendingImage: (img: PendingImage | null) => void;
  toasts: Toast[];
  notify: (key: Key, tone?: Toast['tone'], params?: Record<string, string | number>) => void;
  dismissToast: (id: number) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

function routeFromHash(): Route {
  const name = window.location.hash.replace(/^#\/?/, '').split(/[/?]/)[0] as Route;
  return ROUTES.includes(name) ? name : 'scan';
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(routeFromHash);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [history, setHistory] = useState<HistoryDoc>(loadHistory);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [draft, setDraftState] = useState<Draft>({
    content: emptyContent('url'), style: DEFAULT_STYLE, options: DEFAULT_OPTIONS, origin: null, stamp: 0,
  });
  const toastId = useRef(0);

  const lang: Language = settings.language === 'auto' ? detectLanguage() : settings.language;
  const i18n = useMemo(() => makeI18n(lang), [lang]);

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = `${i18n.t('app.name')} – ${i18n.t(`nav.${route === 'shared' ? 'create' : route}` as Key)}`;
  }, [lang, route, i18n]);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = settings.theme;
  }, [settings.theme]);

  const notify = useCallback((key: Key, tone: Toast['tone'] = 'info', params?: Record<string, string | number>) => {
    const id = ++toastId.current;
    setToasts((list) => [...list.slice(-2), { id, text: i18n.t(key, params), tone }]);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), tone === 'error' ? 7000 : 3500);
  }, [i18n]);

  const dismissToast = useCallback((id: number) => setToasts((list) => list.filter((x) => x.id !== id)), []);

  const persistHistory = useCallback((next: HistoryDoc) => {
    setHistory(next);
    try {
      saveHistory(next);
    } catch (error) {
      if (error instanceof QuotaError) notify('common.storageFull', 'error');
    }
  }, [notify]);

  // Functional updates must read the latest history, not a stale closure.
  const historyRef = useRef(history);
  historyRef.current = history;

  const navigate = useCallback((r: Route) => {
    const hash = `#/${r}`;
    if (window.location.hash !== hash) window.location.hash = hash;
    setRoute(r);
  }, []);

  const value = useMemo<StoreValue>(() => ({
    route,
    navigate,
    settings,
    updateSettings: (patch) => {
      setSettings((s) => {
        const next = { ...s, ...patch };
        try {
          saveSettings(next);
        } catch { /* settings are tiny; ignore quota */ }
        return next;
      });
    },
    lang,
    history,
    recordScan: (entry) => {
      if (!settings.saveScans) return;
      persistHistory(addScan(historyRef.current, { ...entry, id: newId(), at: new Date().toISOString() }));
    },
    recordCreated: (entry, explicit) => {
      if (!settings.saveCreated) {
        if (explicit) notify('history.disabled', 'error');
        return;
      }
      persistHistory(addCreated(historyRef.current, { ...entry, id: newId(), at: new Date().toISOString() }));
      if (explicit) notify('common.saved');
    },
    deleteEntry: (id) => persistHistory(removeEntry(historyRef.current, id)),
    clearList: (list) => persistHistory({ ...historyRef.current, [list]: [] }),
    draft,
    setDraft: (patch) => setDraftState((d) => ({ ...d, ...patch })),
    loadDraft: (d) => setDraftState((prev) => ({ ...d, stamp: prev.stamp + 1 })),
    pendingImage,
    setPendingImage,
    toasts,
    notify,
    dismissToast,
  }), [route, navigate, settings, lang, history, persistHistory, draft, pendingImage, toasts, notify, dismissToast]);

  return (
    <StoreContext.Provider value={value}>
      <I18nProvider lang={lang}>{children}</I18nProvider>
    </StoreContext.Provider>
  );
}

export function useStore(): StoreValue {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore outside StoreProvider');
  return store;
}

