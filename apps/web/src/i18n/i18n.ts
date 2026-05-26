/**
 * i18next initialization — Phase 2.
 *
 * Import this module once at the very top of main.tsx so the i18next instance
 * is ready before any component mounts. All components then call useTranslation()
 * (or the useI18n() wrapper) without needing an explicit provider.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './en.json';
import zh from './zh.json';

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      zh: { translation: zh },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'zh'],
    interpolation: {
      escapeValue: false, // React already escapes output
    },
    detection: {
      // Read/write language from localStorage under the same key used in Phase 1.
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'nanchang-lang',
      caches: ['localStorage'],
    },
  });

export default i18n;
