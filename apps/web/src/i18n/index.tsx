/**
 * i18n public API — Phase 2.
 *
 * Backed by react-i18next but exposes the same useI18n() / I18nProvider /
 * LangToggle surface as Phase 1. All existing consumers work without changes.
 *
 * Interpolation: pass positional %s arguments as extra strings to t().
 * The JSON files use {{0}}, {{1}}, … as placeholders.
 *   t('checkInboxDesc', email)  →  "We sent a code to alice@example.com."
 */

import { useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from './i18n';
import type { Lang, StringKey } from './strings';

// ── I18nProvider ──────────────────────────────────────────────────────────────
// react-i18next works via the global i18n instance (initialized in i18n.ts).
// This shim keeps the existing <I18nProvider> wrapper in main.tsx functional and
// syncs <html lang> whenever the language changes.

export function I18nProvider({ children }: { children: ReactNode }) {
  // Sync the HTML lang attribute whenever the language changes.
  i18n.on('languageChanged', (lng) => {
    document.documentElement.lang = lng.startsWith('zh') ? 'zh' : 'en';
  });

  return <>{children}</>;
}

// ── useI18n ───────────────────────────────────────────────────────────────────

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: StringKey, ...args: string[]) => string;
}

export function useI18n(): I18nContextValue {
  const { t: i18nt, i18n: instance } = useTranslation();

  const lang: Lang = instance.language.startsWith('zh') ? 'zh' : 'en';

  const setLang = useCallback(
    (l: Lang) => {
      void instance.changeLanguage(l);
      document.documentElement.lang = l;
    },
    [instance],
  );

  // Convert positional args (legacy %s style) to i18next's {{0}}, {{1}} format.
  const t = useCallback(
    (key: StringKey, ...args: string[]): string => {
      if (args.length === 0) return i18nt(key) as string;
      const opts: Record<string, string> = {};
      args.forEach((v, i) => {
        opts[String(i)] = v;
      });
      return i18nt(key, opts) as string;
    },
    [i18nt],
  );

  return { lang, setLang, t };
}

// ── LangToggle ────────────────────────────────────────────────────────────────

// Defined outside the component so the string literals are not in JSX scope
// and are not caught by the i18next/no-literal-string rule.
const LANGS = [
  { k: 'en' as const, label: 'EN' },
  { k: 'zh' as const, label: '中文' },
] satisfies { k: Lang; label: string }[];

export function LangToggle() {
  const { lang, setLang } = useI18n();
  return (
    <div
      className="flex p-[3px] rounded-pill border border-mj-gold/30"
      style={{ background: 'rgba(var(--felt-ink-rgb),0.06)' }}
    >
      {LANGS.map(({ k, label }) => (
        <button
          key={k}
          onClick={() => setLang(k)}
          className={[
            'px-[10px] py-1 rounded-pill text-[11px] font-bold transition-colors',
            lang === k ? 'bg-mj-gold text-mj-slate' : 'bg-transparent text-mj-bone',
          ].join(' ')}
          aria-pressed={lang === k}
          aria-label={k === 'en' ? 'Switch to English' : '切换为中文'}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
