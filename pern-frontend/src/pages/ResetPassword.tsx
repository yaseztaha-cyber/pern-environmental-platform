import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { resetPassword } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { Loader2, Lock, ArrowLeft, CheckCircle } from 'lucide-react';
import { showToast } from '../components/Toast';
import { Btn, Card } from '../components/ui';
import { PernLogo } from '../components/PernLogo';

export default function ResetPassword() {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      showToast(t('reset.enterPassword', 'Please enter a new password'), 'error');
      return;
    }
    if (password.length < 8) {
      showToast(t('reset.passwordMin', 'Password must be at least 8 characters'), 'error');
      return;
    }
    if (password !== confirmPassword) {
      showToast(t('reset.noMatch', 'Passwords do not match'), 'error');
      return;
    }
    if (!token) {
      showToast(t('reset.noToken', 'Invalid reset link'), 'error');
      return;
    }
    setLoading(true);
    try {
      await resetPassword(token, password);
      setSuccess(true);
    } catch (err: any) {
      showToast(err.message || t('reset.failed', 'Password reset failed'), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-0)] px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8 animate-fade-in-up">
          <PernLogo size={72} className="mx-auto mb-4" />
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gradient">{t('reset.title', 'New Password')}</h1>
          <p className="text-[var(--text-tertiary)] mt-2 text-sm">{t('reset.subtitle', 'Enter your new password below')}</p>
        </div>

        <Card hover={false} className="animate-fade-in-up stagger-1">
          {success ? (
            <div className="text-center py-4">
              <CheckCircle size={48} className="mx-auto mb-4 text-[var(--emerald)]" />
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">{t('reset.success', 'Password Reset!')}</h2>
              <p className="text-sm text-[var(--text-tertiary)] mb-4">{t('reset.successDesc', 'Your password has been updated successfully.')}</p>
              <Link to="/login" className="btn btn-primary">{t('reset.goLogin', 'Sign in')}</Link>
            </div>
          ) : !token ? (
            <div className="text-center py-4">
              <p className="text-[var(--text-tertiary)]">{t('reset.invalidLink', 'This password reset link is invalid or missing.')}</p>
              <Link to="/forgot-password" className="btn btn-primary mt-4">{t('reset.requestNew', 'Request a new link')}</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{t('reset.newPassword', 'New Password')}</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-disabled)]" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-[var(--radius-sm)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:outline-none focus:border-[var(--emerald)] transition-colors"
                    placeholder={t('reset.passwordPlaceholder', 'Min. 8 characters')}
                    autoComplete="new-password"
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{t('reset.confirmPassword', 'Confirm Password')}</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-disabled)]" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-[var(--radius-sm)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:outline-none focus:border-[var(--emerald)] transition-colors"
                    placeholder={t('reset.confirmPlaceholder', 'Re-enter password')}
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <Btn type="submit" variant="primary" disabled={loading} className="w-full justify-center gap-2">
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Lock size={18} />}
                {t('reset.submit', 'Reset Password')}
              </Btn>
            </form>
          )}

          <div className="mt-4 text-center text-sm text-[var(--text-tertiary)]">
            <Link to="/login" className="inline-flex items-center gap-1.5 text-[var(--emerald)] hover:underline">
              <ArrowLeft size={14} />
              {t('reset.backToLogin', 'Back to login')}
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
