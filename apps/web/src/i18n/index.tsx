/**
 * Lightweight i18n — Phase 1 implementation.
 *
 * Phase 2 migrates this to react-i18next with separate JSON files and a
 * key-parity CI check. This version is intentionally minimal so Phase 2
 * can do a clean swap without touching every consumer.
 */

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { STRINGS, type Lang, type StringKey } from './strings';

// ── Context ───────────────────────────────────────────────────────────────────

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** Translate a key with optional %s interpolation. */
  t: (key: StringKey, ...args: string[]) => string;
}

const I18nContext = createContext<I18nContextValue>({
  lang: 'en',
  setLang: () => {},
  t: (key) => key as string,
});

// ── Provider ──────────────────────────────────────────────────────────────────

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      return (localStorage.getItem('nanchang-lang') as Lang) || 'en';
    } catch {
      return 'en';
    }
  });

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem('nanchang-lang', l);
    } catch {
      /* localStorage unavailable (e.g. private browsing) — ignore */
    }
    // Update <html lang> for accessibility
    document.documentElement.lang = l;
  };

  const t = useCallback(
    (key: StringKey, ...args: string[]): string => {
      const entry = STRINGS[key];
      if (!entry) return key as string;
      let s: string = entry[lang] || entry.en;
      args.forEach((a) => {
        s = s.replace('%s', a);
      });
      return s;
    },
    [lang],
  );

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useI18n() {
  return useContext(I18nContext);
}

// ── LangToggle ────────────────────────────────────────────────────────────────

export function LangToggle() {
  const { lang, setLang } = useI18n();
  return (
    <div
      className="flex p-[3px] rounded-pill border border-mj-gold/30"
      style={{ background: 'rgba(245,239,223,0.06)' }}
    >
      {(
        [
          { k: 'en' as const, label: 'EN' },
          { k: 'zh' as const, label: '中文' },
        ] satisfies { k: Lang; label: string }[]
      ).map(({ k, label }) => (
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
