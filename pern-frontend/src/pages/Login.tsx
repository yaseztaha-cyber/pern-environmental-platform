import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../lib/auth-context';
import { useI18n } from '../lib/i18n';
import { Loader2, Shield, Zap, Mail, Lock, ArrowRight } from 'lucide-react';
import { showToast } from '../components/Toast';
import { Btn, Card } from '../components/ui';
import { PernLogo } from '../components/PernLogo';

export default function Login() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      showToast(t('login.fillAll', 'Please enter email and password'), 'error');
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
      navigate('/');
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('EMAIL_NOT_VERIFIED')) {
        showToast(t('login.emailNotVerified', 'Please verify your email first. Check your inbox.'), 'error');
        navigate(`/verify-email?email=${encodeURIComponent(email)}`);
      } else {
        showToast(msg || t('login.failed', 'Login failed. Please try again.'), 'error');
      }
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

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{t('login.email', 'Email')}</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-disabled)]" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-[var(--radius-sm)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:outline-none focus:border-[var(--emerald)] transition-colors"
                  placeholder={t('login.emailPlaceholder', 'you@example.com')}
                  autoComplete="email"
                  autoFocus
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-[var(--text-secondary)]">{t('login.password', 'Password')}</label>
                <Link to="/forgot-password" className="text-xs text-[var(--emerald)] hover:underline">{t('login.forgotPassword', 'Forgot password?')}</Link>
              </div>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-disabled)]" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-[var(--radius-sm)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:outline-none focus:border-[var(--emerald)] transition-colors"
                  placeholder={t('login.passwordPlaceholder', 'Enter your password')}
                  autoComplete="current-password"
                />
              </div>
            </div>

            <Btn type="submit" variant="primary" disabled={loading} className="w-full justify-center gap-2">
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Shield size={18} />}
              {t('login.signInButton', 'Sign In')}
              {!loading && <ArrowRight size={16} className="ml-auto opacity-60 rtl:ml-0 rtl:mr-auto" />}
            </Btn>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-4">
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

          <div className="mt-4 text-center text-sm text-[var(--text-tertiary)]">
            {t('login.noAccount', "Don't have an account?")}{' '}
            <Link to="/register" className="text-[var(--emerald)] hover:underline">{t('login.signUp', 'Sign up')}</Link>
          </div>
        </Card>

        {/* Footer */}
        <div className="text-center mt-6 space-y-3">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)] hover:text-[var(--emerald)] transition-colors"
          >
            {t('login.backLink', 'Back to the landing page')}
          </Link>
          <div className="text-[11px] text-[var(--text-disabled)]">
            {t('login.footerBrand', 'STEM Gharbiya • PERN v2.7 • 2026')}
          </div>
        </div>
      </div>
    </div>
  );
}
