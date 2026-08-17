import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useI18n } from '../lib/i18n';

export default function AuthCallback() {
  const { t } = useI18n();
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/login');
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-1)]">
      <div className="glass p-8 rounded-[var(--radius-sm)] text-center">
        <div className="animate-spin w-8 h-8 border-2 border-[var(--emerald)] border-t-transparent rounded-full mx-auto mb-4"></div>
        <div className="text-[var(--text-secondary)] text-lg">{t('auth.processing', 'Redirecting...')}</div>
      </div>
    </div>
  );
}
