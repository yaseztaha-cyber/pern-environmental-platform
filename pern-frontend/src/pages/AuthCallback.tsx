import { useEffect, useState } from 'react';
import { handleLogtoCallback } from '../lib/auth';
import { useNavigate } from 'react-router';
import { useI18n } from '../lib/i18n';

export default function AuthCallback() {
  const { t } = useI18n();
  const [status, setStatus] = useState(t('auth.processing', 'Processing login...'));
  const navigate = useNavigate();

  useEffect(() => {
    const processCallback = async () => {
      try {
        await handleLogtoCallback();
        setStatus(t('auth.loginSuccess', 'Login successful! Redirecting...'));
        setTimeout(() => navigate('/'), 1200);
      } catch (error) {
        console.error('Callback error:', error);
        setStatus(t('auth.loginFailed', 'Login failed. Please try again.'));
        setTimeout(() => navigate('/login'), 2000);
      }
    };

    processCallback();
  }, [navigate, t]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-1)]">
      <div className="glass p-8 rounded-[var(--radius-sm)] text-center">
        <div className="animate-spin w-8 h-8 border-2 border-[var(--emerald)] border-t-transparent rounded-full mx-auto mb-4"></div>
        <div className="text-[var(--text-secondary)] text-lg">{status}</div>
      </div>
    </div>
  );
}