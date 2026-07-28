import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../lib/auth-context';
import { Loader2, Shield, Zap, ChevronRight } from 'lucide-react';
import { showToast } from '../components/Toast';
import { Btn, Card } from '../components/ui';

const isLogtoConfigured = import.meta.env.VITE_LOGTO_ENDPOINT &&
  import.meta.env.VITE_LOGTO_ENDPOINT !== 'http://localhost:3001' &&
  import.meta.env.VITE_LOGTO_APP_ID &&
  import.meta.env.VITE_LOGTO_APP_ID !== 'pern-app';

export default function Login() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleLogin = async () => {
    setLoading(true);
    try {
      await login();
    } catch (error) {
      console.error('Login failed:', error);
      showToast('Login failed. Please try again.', 'error');
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
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-[var(--emerald)] to-emerald-600 rounded-2xl flex items-center justify-center mb-4 shadow-glow-md">
            <span className="text-white text-3xl font-bold">P</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gradient">PERN Platform</h1>
          <p className="text-[var(--text-tertiary)] mt-2 text-sm">Environmental Health Intelligence</p>
        </div>

        {/* Card */}
        <Card hover={false} className="animate-fade-in-up stagger-1">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">Welcome back</h2>
          <p className="text-sm text-[var(--text-tertiary)] mb-6">Sign in to access your environmental monitoring dashboard</p>

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
              {isLogtoConfigured ? 'Sign in with Logto' : 'Logto not configured'}
              {isLogtoConfigured && !loading && <ChevronRight size={16} className="ml-auto opacity-60" />}
            </Btn>

            {/* Divider */}
            <div className="flex items-center gap-3 my-2">
              <div className="flex-1 h-px bg-[var(--border)]" />
              <span className="text-[11px] text-[var(--text-disabled)] uppercase tracking-wider">or</span>
              <div className="flex-1 h-px bg-[var(--border)]" />
            </div>

            {/* Demo Login */}
            <Btn
              variant="ghost"
              onClick={handleDemoLogin}
              className="w-full justify-center gap-3"
            >
              <Zap size={18} />
              Continue with Demo Account
            </Btn>
          </div>

          {!isLogtoConfigured && (
            <div className="mt-4 p-3 rounded-[var(--radius-sm)] bg-[var(--amber-dim)] border border-[var(--amber)]/20 text-xs text-[var(--amber)]">
              <strong>Setup required:</strong> Configure <code>VITE_LOGTO_ENDPOINT</code> and <code>VITE_LOGTO_APP_ID</code> in your <code>.env</code> file to enable Logto authentication.
            </div>
          )}
        </Card>

        {/* Footer */}
        <div className="text-center mt-6 text-[11px] text-[var(--text-disabled)]">
          STEM Gharbiya • PERN v2.7 • 2026
        </div>
      </div>
    </div>
  );
}
