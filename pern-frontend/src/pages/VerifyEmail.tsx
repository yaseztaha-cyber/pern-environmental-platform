import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router';
import { verifyEmail, resendVerification } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { Loader2, CheckCircle, XCircle, Mail, ArrowLeft } from 'lucide-react';
import { showToast } from '../components/Toast';
import { Btn, Card } from '../components/ui';
import { PernLogo } from '../components/PernLogo';

export default function VerifyEmail() {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'verifying' | 'success' | 'error' | 'no-token'>(
    token ? 'verifying' : 'no-token'
  );
  const [email, setEmail] = useState('');
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (!token) return;
    verifyEmail(token).then((ok) => {
      setStatus(ok ? 'success' : 'error');
    }).catch(() => setStatus('error'));
  }, [token]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setResending(true);
    try {
      await resendVerification(email.trim());
      showToast(t('verify.resendSuccess', 'Verification email sent!'), 'success');
    } catch {
      showToast(t('verify.resendFailed', 'Failed to resend'), 'error');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-0)] px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8 animate-fade-in-up">
          <PernLogo size={72} className="mx-auto mb-4" />
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gradient">{t('verify.title', 'Email Verification')}</h1>
        </div>

        <Card hover={false} className="animate-fade-in-up stagger-1">
          {status === 'verifying' && (
            <div className="text-center py-8">
              <Loader2 size={48} className="mx-auto mb-4 text-[var(--emerald)] animate-spin" />
              <p className="text-[var(--text-secondary)]">{t('verify.processing', 'Verifying your email...')}</p>
            </div>
          )}

          {status === 'success' && (
            <div className="text-center py-4">
              <CheckCircle size={48} className="mx-auto mb-4 text-[var(--emerald)]" />
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">{t('verify.success', 'Email Verified!')}</h2>
              <p className="text-sm text-[var(--text-tertiary)] mb-4">{t('verify.successDesc', 'Your email has been verified. You can now sign in.')}</p>
              <Link to="/login" className="btn btn-primary">{t('verify.goLogin', 'Sign in')}</Link>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center py-4">
              <XCircle size={48} className="mx-auto mb-4 text-red-400" />
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">{t('verify.failed', 'Verification Failed')}</h2>
              <p className="text-sm text-[var(--text-tertiary)] mb-4">{t('verify.failedDesc', 'This verification link is invalid or has expired.')}</p>
            </div>
          )}

          {status === 'no-token' && (
            <div className="text-center py-4">
              <Mail size={48} className="mx-auto mb-4 text-[var(--text-disabled)]" />
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">{t('verify.noToken', 'No Verification Link')}</h2>
              <p className="text-sm text-[var(--text-tertiary)] mb-4">{t('verify.noTokenDesc', 'Enter your email to resend the verification link.')}</p>
            </div>
          )}

          {(status === 'error' || status === 'no-token') && (
            <form onSubmit={handleResend} className="mt-4 space-y-3">
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-disabled)]" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-[var(--radius-sm)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:outline-none focus:border-[var(--emerald)] transition-colors"
                  placeholder={t('verify.emailPlaceholder', 'your@email.com')}
                  autoComplete="email"
                />
              </div>
              <Btn type="submit" variant="ghost" disabled={resending} className="w-full justify-center gap-2">
                {resending ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
                {t('verify.resend', 'Resend Verification Email')}
              </Btn>
            </form>
          )}

          <div className="mt-4 text-center text-sm text-[var(--text-tertiary)]">
            <Link to="/login" className="inline-flex items-center gap-1.5 text-[var(--emerald)] hover:underline">
              <ArrowLeft size={14} />
              {t('verify.backToLogin', 'Back to login')}
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
