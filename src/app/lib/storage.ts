/**
 * Thin, failure-tolerant wrapper around localStorage. Private windows and
 * blocked site data make storage throw or vanish; the app must keep working
 * (without persistence) in that case.
 */
import { HISTORY_KEY, SETTINGS_KEY, normalizeHistory, normalizeSettings } from '../../core/history.ts';
import type { HistoryDoc, Settings } from '../../core/types.ts';

/** All keys this app ever writes - shown in the transparency view. */
export const OWN_KEYS = [SETTINGS_KEY, HISTORY_KEY] as const;

export class QuotaError extends Error {}

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    if (error instanceof DOMException && /quota/i.test(error.name)) throw new QuotaError(error.message);
    // Storage unavailable (private mode, disabled) - silently run without persistence.
  }
}

export const loadSettings = (): Settings => normalizeSettings(read(SETTINGS_KEY));
export const saveSettings = (s: Settings): void => write(SETTINGS_KEY, s);
export const loadHistory = (): HistoryDoc => normalizeHistory(read(HISTORY_KEY));
export const saveHistory = (h: HistoryDoc): void => write(HISTORY_KEY, h);

/** Raw stored strings of our own keys, for the transparency view. */
export function rawStorage(): { key: string; value: string | null; bytes: number }[] {
  return OWN_KEYS.map((key) => {
    let value: string | null = null;
    try {
      value = localStorage.getItem(key);
    } catch { /* unavailable */ }
    // localStorage counts UTF-16 code units.
    return { key, value, bytes: (key.length + (value?.length ?? 0)) * 2 };
  });
}

/** Removes everything this app stored: localStorage keys, caches, service worker. */
export async function wipeEverything(): Promise<void> {
  for (const key of OWN_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch { /* ignore */ }
  }
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('qr-lokal')).map((k) => caches.delete(k)));
  }
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  }
}

export function formatBytes(bytes: number, lang: string): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toLocaleString(lang, { maximumFractionDigits: 1 })} KB`;
  return `${(kb / 1024).toLocaleString(lang, { maximumFractionDigits: 1 })} MB`;
}
