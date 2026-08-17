import { useState } from 'react';
import { Link } from 'react-router';
import { forgotPassword } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { Loader2, Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import { showToast } from '../components/Toast';
import { Btn, Card } from '../components/ui';
import { PernLogo } from '../components/PernLogo';

export default function ForgotPassword() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      showToast(t('forgot.enterEmail', 'Please enter your email'), 'error');
      return;
    }
    setLoading(true);
    try {
      await forgotPassword(email.trim());
      setSent(true);
    } catch (err: any) {
      showToast(err.message || t('forgot.failed', 'Failed to send reset email'), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-0)] px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8 animate-fade-in-up">
          <PernLogo size={72} className="mx-auto mb-4" />
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gradient">{t('forgot.title', 'Reset Password')}</h1>
          <p className="text-[var(--text-tertiary)] mt-2 text-sm">{t('forgot.subtitle', 'Enter your email to receive a reset link')}</p>
        </div>

        <Card hover={false} className="animate-fade-in-up stagger-1">
          {sent ? (
            <div className="text-center py-4">
              <CheckCircle size={48} className="mx-auto mb-4 text-[var(--emerald)]" />
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">{t('forgot.sent', 'Check your email')}</h2>
              <p className="text-sm text-[var(--text-tertiary)]">
                {t('forgot.sentDesc', 'We sent a password reset link to')} <strong>{email}</strong>
              </p>
              <p className="text-xs text-[var(--text-disabled)] mt-3">{t('forgot.checkSpam', "Don't see it? Check your spam folder.")}</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{t('forgot.email', 'Email')}</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-disabled)]" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-[var(--radius-sm)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:outline-none focus:border-[var(--emerald)] transition-colors"
                    placeholder={t('forgot.emailPlaceholder', 'you@example.com')}
                    autoComplete="email"
                    autoFocus
                  />
                </div>
              </div>

              <Btn type="submit" variant="primary" disabled={loading} className="w-full justify-center gap-2">
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Mail size={18} />}
                {t('forgot.submit', 'Send Reset Link')}
              </Btn>
            </form>
          )}

          <div className="mt-4 text-center text-sm text-[var(--text-tertiary)]">
            <Link to="/login" className="inline-flex items-center gap-1.5 text-[var(--emerald)] hover:underline">
              <ArrowLeft size={14} />
              {t('forgot.backToLogin', 'Back to login')}
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
