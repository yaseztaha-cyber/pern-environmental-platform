import { useI18n, type Locale } from '../lib/i18n';
import { Globe } from 'lucide-react';

const LABELS: Record<Locale, string> = {
  en: 'العربية',
  ar: 'English',
};

export default function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();
  const next: Locale = locale === 'en' ? 'ar' : 'en';

  return (
    <button
      onClick={() => setLocale(next)}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-[var(--surface)] hover:bg-[var(--surface-hover)] border border-[var(--border)] transition-colors text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--border-hover)]"
      title={next === 'ar' ? 'التحدث بالعربية' : 'Switch to English'}
      aria-label={next === 'ar' ? 'التحدث بالعربية' : 'Switch to English'}
    >
      <Globe size={14} className="opacity-70" />
      <span key={locale} className="hidden sm:inline animate-fade-in">
        {LABELS[locale]}
      </span>
    </button>
  );
}
