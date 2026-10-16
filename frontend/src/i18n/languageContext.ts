import { createContext, useContext } from 'react';
import type { SupportedLanguage, TranslationKey } from './translations';

// The context and the hook live apart from <LanguageProvider> because a file
// that exports a component alongside a hook or constant cannot be hot-reloaded
// by React Fast Refresh (react-refresh/only-export-components).

export interface LanguageContextValue {
  language: SupportedLanguage;
  setLanguage: (language: SupportedLanguage) => void;
  t: (key: TranslationKey) => string;
}

export const LanguageContext = createContext<LanguageContextValue | null>(null);

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used inside LanguageProvider.');
  }
  return context;
}
