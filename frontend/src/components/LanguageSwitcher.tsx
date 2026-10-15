import { useLanguage } from '@/i18n/LanguageProvider';

interface LanguageSwitcherProps {
  className?: string;
}

export default function LanguageSwitcher({ className = '' }: LanguageSwitcherProps) {
  const { language, setLanguage, t } = useLanguage();

  return (
    <label className={`inline-flex items-center gap-2 text-sm ${className}`}>
      <span className="text-current/70">{t('language')}</span>
      <select
        aria-label={t('language')}
        value={language}
        onChange={(event) => setLanguage(event.target.value === 'sw' ? 'sw' : 'en')}
        className="rounded-lg border border-current/20 bg-transparent px-2 py-1.5 text-current focus:outline-none focus:ring-2 focus:ring-alux-cyan"
      >
        <option value="en">{t('english')}</option>
        <option value="sw">{t('swahili')}</option>
      </select>
    </label>
  );
}
