import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { de, type Dict, type Key } from './de.ts';
import { en } from './en.ts';
import type { Language } from '../../core/types.ts';

export type { Key } from './de.ts';

const DICTS: Record<Language, Dict> = { de, en };
export const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'de', label: 'Deutsch' },
  { code: 'en', label: 'English' },
];

export type Translate = (key: Key, params?: Record<string, string | number>) => string;

export interface I18n {
  lang: Language;
  t: Translate;
  /** Locale-aware date/time formatting. */
  formatDate: (iso: string) => string;
  formatNumber: (n: number, digits?: number) => string;
}

/** Resolves `auto` from the browser's preferred languages. */
export function detectLanguage(preferred: readonly string[] = navigator.languages ?? [navigator.language]): Language {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0];
    if (base === 'de' || base === 'en') return base;
  }
  return 'en';
}

export function makeI18n(lang: Language): I18n {
  const dict = DICTS[lang];
  const t: Translate = (key, params) => {
    const text = dict[key] ?? key;
    return params ? text.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m)) : text;
  };
  const dateFmt = new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' });
  return {
    lang,
    t,
    formatDate: (iso) => {
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d);
    },
    formatNumber: (n, digits = 0) => n.toLocaleString(lang, { maximumFractionDigits: digits }),
  };
}

const I18nContext = createContext<I18n>(makeI18n('de'));

export function I18nProvider({ lang, children }: { lang: Language; children: ReactNode }) {
  const value = useMemo(() => makeI18n(lang), [lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = (): I18n => useContext(I18nContext);
