import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../lib/auth-context';
import { isLogtoConfigured } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { Loader2, Shield, Zap, ChevronRight, ExternalLink } from 'lucide-react';
import { showToast } from '../components/Toast';
import { Btn, Card } from '../components/ui';
import { PernLogo } from '../components/PernLogo';

export default function Login() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleLogin = async () => {
    setLoading(true);
    try {
      await login();
    } catch (error) {
      console.error('Login failed:', error);
      showToast(t('auth.loginFailed', 'Login failed. Please try again.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = () => {
    sessionStorage.setItem('pern_demo_user', JSON.stringify({
      id: 'demo-user',
      name: 'Demo User',
      email: 'demo@pern.dev',
      role: 'supervisor',
    }));
    sessionStorage.setItem('pern_auth_token', 'demo-token');
    window.location.hash = '#/';
    window.location.reload();
    navigate('/');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-0)] px-4 py-8">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8 animate-fade-in-up">
          <PernLogo size={72} className="mx-auto mb-4" />
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gradient">{t('login.title', 'PERN Platform')}</h1>
          <p className="text-[var(--text-tertiary)] mt-2 text-sm">{t('login.subtitle', 'Environmental Health Intelligence')}</p>
        </div>

        {/* Card */}
        <Card hover={false} className="animate-fade-in-up stagger-1">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">{t('auth.welcomeBack', 'Welcome back')}</h2>
          <p className="text-sm text-[var(--text-tertiary)] mb-6">{t('login.signInSubtitle', 'Sign in to access your environmental monitoring dashboard')}</p>

          <div className="space-y-3">
            {/* Logto OIDC Button */}
            <Btn
              variant={isLogtoConfigured ? 'primary' : 'ghost'}
              onClick={handleLogin}
              disabled={loading || !isLogtoConfigured}
              className="w-full justify-center gap-3"
            >
              {loading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Shield size={18} />
              )}
              {isLogtoConfigured ? t('auth.logto', 'Sign in with Logto') : t('auth.logtoNotConfigured', 'Logto not configured')}
              {isLogtoConfigured && !loading && <ChevronRight size={16} className="ml-auto opacity-60 rtl:ml-0 rtl:mr-auto" />}
            </Btn>

            {/* Divider */}
            <div className="flex items-center gap-3 my-2">
              <div className="flex-1 h-px bg-[var(--border)]" />
              <span className="text-[11px] text-[var(--text-disabled)] uppercase tracking-wider">{t('login.or', 'or')}</span>
              <div className="flex-1 h-px bg-[var(--border)]" />
            </div>

            {/* Demo Login */}
            <Btn
              variant="ghost"
              onClick={handleDemoLogin}
              className="w-full justify-center gap-3"
            >
              <Zap size={18} />
              {t('auth.demoAccount', 'Continue with Demo Account')}
            </Btn>
          </div>

          {!isLogtoConfigured && (
            <div className="mt-4 p-3 rounded-[var(--radius-sm)] bg-[var(--amber-dim)] border border-[var(--amber)]/20 text-xs text-[var(--amber)]">
              <strong>{t('login.setupRequired', 'Setup required:')}</strong> {t('login.setupConfigure', 'Configure')} <code>VITE_LOGTO_ENDPOINT</code> {t('login.setupAnd', 'and')} <code>VITE_LOGTO_APP_ID</code> {t('login.setupIn', 'in your')} <code>.env</code> {t('login.setupSuffix', 'file to enable Logto authentication.')}
            </div>
          )}
        </Card>

        {/* Footer */}
        <div className="text-center mt-6 space-y-3">
          <a
            href="/"
            className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)] hover:text-[var(--emerald)] transition-colors"
            title={t('login.backTitle', 'Back to the PERN landing page')}
          >
            <ExternalLink size={12} />
            {t('login.backLink', 'Back to the landing page')}
          </a>
          <div className="text-[11px] text-[var(--text-disabled)]">
            {t('login.footerBrand', 'STEM Gharbiya • PERN v2.7 • 2026')}
          </div>
        </div>
      </div>
    </div>
  );
}
