import { useI18n, type Locale } from '../lib/i18n';
import { Globe } from 'lucide-react';

const LABELS: Record<Locale, string> = { en: 'EN', ar: 'AR' };

export default function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();
  const next: Locale = locale === 'en' ? 'ar' : 'en';

  return (
    <button
      onClick={() => setLocale(next)}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-[var(--surface)] hover:bg-[var(--surface-hover)] border border-[var(--border)] transition-colors text-xs font-medium text-[var(--text-secondary)]"
      title={next === 'ar' ? '\u062a\u0628\u062f\u064a\u0644 \u0625\u0644\u0649 \u0627\u0644\u0639\u0631\u0628\u064a\u0629' : 'Switch to English'}
      aria-label={next === 'ar' ? '\u062a\u0628\u062f\u064a\u0644 \u0625\u0644\u0649 \u0627\u0644\u0639\u0631\u0628\u064a\u0629' : 'Switch to English'}
    >
      <Globe size={14} />
      <span className="hidden sm:inline">{LABELS[locale]}</span>
    </button>
  );
}
