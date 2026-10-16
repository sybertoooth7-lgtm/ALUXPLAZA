import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { translate, type SupportedLanguage, type TranslationKey } from './translations';
import { LanguageContext } from './languageContext';

const STORAGE_KEY = 'alux-plaza-language';

function getInitialLanguage(): SupportedLanguage {
  if (typeof window === 'undefined') return 'en';
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'sw' ? 'sw' : 'en';
  } catch {
    return 'en';
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLanguage>(getInitialLanguage);

  const setLanguage = useCallback((nextLanguage: SupportedLanguage) => {
    setLanguageState(nextLanguage);
    try {
      window.localStorage.setItem(STORAGE_KEY, nextLanguage);
    } catch {
      // The language still changes for this session if storage is unavailable.
    }
    document.documentElement.lang = nextLanguage;
  }, []);

  const t = useCallback((key: TranslationKey) => translate(language, key), [language]);

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
