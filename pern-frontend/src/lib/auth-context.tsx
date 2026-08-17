/* oxlint-disable react/only-export-components */
/**
 * Authentication Context — wraps the app with auth state.
 * Uses self-hosted JWT + bcrypt auth with refresh tokens.
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { type AuthUser, login as apiLogin, logout as apiLogout, getMe, refreshToken } from './auth';

const STORAGE_KEY_TOKEN = 'pern_auth_token';
const STORAGE_KEY_DEMO = 'pern_demo_user';

const DEMO_USER: AuthUser = { id: 'demo-user', name: 'Demo User', email: 'demo@pern.dev', role: 'supervisor' };

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAuthenticated: false,
  login: async () => {},
  logout: async () => {},
  refresh: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    // Check for demo user first
    const demoRaw = sessionStorage.getItem(STORAGE_KEY_DEMO);
    if (demoRaw) {
      try {
        const demo = JSON.parse(demoRaw);
        setUser({ id: demo.id, name: demo.name, email: demo.email, role: demo.role });
        return;
      } catch { /* corrupt */ }
    }

    // Try existing access token
    const existingToken = sessionStorage.getItem(STORAGE_KEY_TOKEN);
    if (existingToken && existingToken !== 'demo-token') {
      const me = await getMe(existingToken);
      if (me) {
        setUser(me);
        return;
      }
      // Token expired — try refresh
      const newToken = await refreshToken();
      if (newToken) {
        sessionStorage.setItem(STORAGE_KEY_TOKEN, newToken);
        const me2 = await getMe(newToken);
        if (me2) {
          setUser(me2);
          return;
        }
      }
      sessionStorage.removeItem(STORAGE_KEY_TOKEN);
    }

    // No session — auto-enter demo mode
    sessionStorage.setItem(STORAGE_KEY_DEMO, JSON.stringify(DEMO_USER));
    sessionStorage.setItem(STORAGE_KEY_TOKEN, 'demo-token');
    setUser(DEMO_USER);
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  // React to session expiry
  useEffect(() => {
    const onAuthExpired = () => setUser(null);
    window.addEventListener('pern-auth-expired', onAuthExpired);
    return () => window.removeEventListener('pern-auth-expired', onAuthExpired);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      const result = await apiLogin(email, password);
      sessionStorage.setItem(STORAGE_KEY_TOKEN, result.accessToken);
      setUser(result.user);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try { await apiLogout(); } catch { /* noop */ }
    sessionStorage.removeItem(STORAGE_KEY_DEMO);
    sessionStorage.removeItem(STORAGE_KEY_TOKEN);
    localStorage.removeItem(STORAGE_KEY_DEMO);
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      isAuthenticated: !!user,
      login,
      logout,
      refresh,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
