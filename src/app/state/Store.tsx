/**
 * Application state: settings, history, the generator draft and the route.
 * Toasts live in their own context so that a notification does not
 * re-render every page. Persistence goes through `lib/storage.ts`.
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
import { detectLanguage, I18nProvider, useI18n, type Key } from '../i18n/index.tsx';

export type Route = 'scan' | 'create' | 'history' | 'settings' | 'privacy' | 'shared';
const ROUTES: Route[] = ['scan', 'create', 'history', 'settings', 'privacy', 'shared'];

export interface Draft {
  content: CreateContent;
  style: QrStyle;
  options: MatrixOptions;
  /** Why the draft was prefilled - shown once as a hint, then cleared. */
  origin: 'share' | 'scan' | 'history' | null;
  /** Changes whenever the draft is replaced from outside. */
  stamp: number;
}

type DraftPatch = Partial<Omit<Draft, 'stamp'>>;

/** A file shared into the app that should be decoded on the scan page. */
export interface PendingImage { file: Blob; name: string }

interface StoreValue {
  route: Route;
  navigate: (route: Route) => void;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  lang: Language;
  history: HistoryDoc;
  /** Returns false when saving is switched off. */
  recordScan: (entry: Omit<ScanEntry, 'id' | 'at'>) => boolean;
  recordCreated: (entry: Omit<CreateEntry, 'id' | 'at'>, explicit: boolean) => void;
  deleteEntry: (id: string) => void;
  clearList: (list: 'scans' | 'created') => void;
  draft: Draft;
  /** Patches are applied to the latest draft (safe in async callbacks). */
  setDraft: (patch: DraftPatch | ((d: Draft) => DraftPatch)) => void;
  loadDraft: (draft: Omit<Draft, 'stamp'>) => void;
  /** Hands over (and clears) an image shared into the app. */
  takePendingImage: () => PendingImage | null;
  setPendingImage: (img: PendingImage) => void;
  pendingImageStamp: number;
}

const StoreContext = createContext<StoreValue | null>(null);

// ------------------------------------------------------------------ toasts

export interface Toast { id: number; text: string; tone: 'info' | 'error'; action?: { label: string; run: () => void } }

interface ToastValue {
  toasts: Toast[];
  notify: (key: Key, tone?: Toast['tone'], params?: Record<string, string | number>, action?: { label: Key; run: () => void }) => void;
  dismissToast: (id: number) => void;
}

const ToastContext = createContext<ToastValue | null>(null);

function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);
  const dismissToast = useCallback((id: number) => setToasts((list) => list.filter((x) => x.id !== id)), []);
  const notify = useCallback<ToastValue['notify']>((key, tone = 'info', params, action) => {
    const id = ++counter.current;
    const text = t(key, params);
    // Same text again replaces the old toast instead of stacking up.
    setToasts((list) => [...list.filter((x) => x.text !== text).slice(-1), {
      id, text, tone, ...(action ? { action: { label: t(action.label), run: action.run } } : {}),
    }]);
    setTimeout(() => dismissToast(id), tone === 'error' || action ? 7000 : 3500);
  }, [t, dismissToast]);
  const value = useMemo(() => ({ toasts, notify, dismissToast }), [toasts, notify, dismissToast]);
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToasts(): ToastValue {
  const v = useContext(ToastContext);
  if (!v) throw new Error('useToasts outside StoreProvider');
  return v;
}

// ------------------------------------------------------------------- store

function routeFromHash(): Route {
  const name = window.location.hash.replace(/^#\/?/, '').split(/[/?]/)[0] as Route;
  return ROUTES.includes(name) ? name : 'scan';
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const lang: Language = settings.language === 'auto' ? detectLanguage() : settings.language;
  return (
    <I18nProvider lang={lang}>
      <ToastProvider>
        <StoreInner settings={settings} setSettings={setSettings} lang={lang}>{children}</StoreInner>
      </ToastProvider>
    </I18nProvider>
  );
}

function StoreInner({ settings, setSettings, lang, children }: {
  settings: Settings;
  setSettings: (s: Settings) => void;
  lang: Language;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const { notify } = useToasts();
  const [route, setRoute] = useState<Route>(routeFromHash);
  const [history, setHistory] = useState<HistoryDoc>(loadHistory);
  const [draft, setDraftState] = useState<Draft>({
    content: emptyContent('url'), style: DEFAULT_STYLE, options: DEFAULT_OPTIONS, origin: null, stamp: 0,
  });
  const pendingImage = useRef<PendingImage | null>(null);
  const [pendingImageStamp, setPendingImageStamp] = useState(0);

  // Source of truth for synchronous successive updates (e.g. several codes in one image).
  const historyRef = useRef(history);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = `${t('app.name')} – ${t(`nav.${route === 'shared' ? 'create' : route}`)}`;
  }, [lang, route, t]);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = settings.theme;
  }, [settings.theme]);

  const persistHistory = useCallback((update: (h: HistoryDoc) => HistoryDoc) => {
    const next = update(historyRef.current);
    historyRef.current = next;
    setHistory(next);
    try {
      saveHistory(next);
    } catch (error) {
      if (error instanceof QuotaError) notify('common.storageFull', 'error');
    }
  }, [notify]);

  const navigate = useCallback((r: Route) => {
    const hash = `#/${r}`;
    if (window.location.hash !== hash) window.location.hash = hash;
    setRoute(r);
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    try {
      saveSettings(next);
    } catch { /* settings are tiny; ignore quota */ }
  }, [setSettings]);

  const recordScan = useCallback((entry: Omit<ScanEntry, 'id' | 'at'>) => {
    if (!settingsRef.current.saveScans) return false;
    persistHistory((h) => addScan(h, { ...entry, id: newId(), at: new Date().toISOString() }));
    return true;
  }, [persistHistory]);

  const recordCreated = useCallback((entry: Omit<CreateEntry, 'id' | 'at'>, explicit: boolean) => {
    if (!settingsRef.current.saveCreated) {
      if (explicit) notify('history.disabled', 'error');
      return;
    }
    persistHistory((h) => addCreated(h, { ...entry, id: newId(), at: new Date().toISOString() }));
    if (explicit) notify('common.saved');
  }, [notify, persistHistory]);

  const deleteEntry = useCallback((id: string) => {
    const before = historyRef.current;
    persistHistory((h) => removeEntry(h, id));
    notify('history.deleted', 'info', undefined, { label: 'common.undo', run: () => persistHistory(() => before) });
  }, [notify, persistHistory]);

  const clearList = useCallback((list: 'scans' | 'created') => persistHistory((h) => ({ ...h, [list]: [] })), [persistHistory]);

  const setDraft = useCallback((patch: DraftPatch | ((d: Draft) => DraftPatch)) => {
    setDraftState((d) => ({ ...d, ...(typeof patch === 'function' ? patch(d) : patch) }));
  }, []);
  const loadDraft = useCallback((d: Omit<Draft, 'stamp'>) => setDraftState((prev) => ({ ...d, stamp: prev.stamp + 1 })), []);

  const takePendingImage = useCallback(() => {
    const img = pendingImage.current;
    pendingImage.current = null;
    return img;
  }, []);
  const setPendingImage = useCallback((img: PendingImage) => {
    pendingImage.current = img;
    setPendingImageStamp((s) => s + 1);
  }, []);

  const value = useMemo<StoreValue>(() => ({
    route, navigate, settings, updateSettings, lang, history, recordScan, recordCreated, deleteEntry, clearList,
    draft, setDraft, loadDraft, takePendingImage, setPendingImage, pendingImageStamp,
  }), [route, navigate, settings, updateSettings, lang, history, recordScan, recordCreated, deleteEntry, clearList,
    draft, setDraft, loadDraft, takePendingImage, setPendingImage, pendingImageStamp]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore outside StoreProvider');
  return store;
}
