import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { register } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { Loader2, UserPlus, Mail, Lock, User, ArrowLeft } from 'lucide-react';
import { showToast } from '../components/Toast';
import { Btn, Card } from '../components/ui';
import { PernLogo } from '../components/PernLogo';

export default function Register() {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password) {
      showToast(t('register.fillAll', 'Please fill in all fields'), 'error');
      return;
    }
    if (password.length < 8) {
      showToast(t('register.passwordMin', 'Password must be at least 8 characters'), 'error');
      return;
    }
    setLoading(true);
    try {
      await register(name.trim(), email.trim(), password);
      showToast(t('register.success', 'Account created! Check your email to verify.'), 'success');
      navigate('/login');
    } catch (err: any) {
      showToast(err.message || t('register.failed', 'Registration failed'), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-0)] px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8 animate-fade-in-up">
          <PernLogo size={72} className="mx-auto mb-4" />
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gradient">{t('register.title', 'Create Account')}</h1>
          <p className="text-[var(--text-tertiary)] mt-2 text-sm">{t('register.subtitle', 'Join the Environmental Intelligence Platform')}</p>
        </div>

        <Card hover={false} className="animate-fade-in-up stagger-1">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{t('register.name', 'Full Name')}</label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-disabled)]" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-[var(--radius-sm)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:outline-none focus:border-[var(--emerald)] transition-colors"
                  placeholder={t('register.namePlaceholder', 'Your name')}
                  autoComplete="name"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{t('register.email', 'Email')}</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-disabled)]" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-[var(--radius-sm)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:outline-none focus:border-[var(--emerald)] transition-colors"
                  placeholder={t('register.emailPlaceholder', 'you@example.com')}
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{t('register.password', 'Password')}</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-disabled)]" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-[var(--radius-sm)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:outline-none focus:border-[var(--emerald)] transition-colors"
                  placeholder={t('register.passwordPlaceholder', 'Min. 8 characters')}
                  autoComplete="new-password"
                />
              </div>
            </div>

            <Btn type="submit" variant="primary" disabled={loading} className="w-full justify-center gap-2">
              {loading ? <Loader2 size={18} className="animate-spin" /> : <UserPlus size={18} />}
              {t('register.submit', 'Create Account')}
            </Btn>
          </form>

          <div className="mt-4 text-center text-sm text-[var(--text-tertiary)]">
            {t('register.hasAccount', 'Already have an account?')}{' '}
            <Link to="/login" className="text-[var(--emerald)] hover:underline">{t('register.signIn', 'Sign in')}</Link>
          </div>
        </Card>

        <div className="text-center mt-6">
          <Link to="/" className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)] hover:text-[var(--emerald)] transition-colors">
            <ArrowLeft size={12} />
            {t('login.backLink', 'Back to the landing page')}
          </Link>
        </div>
      </div>
    </div>
  );
}
