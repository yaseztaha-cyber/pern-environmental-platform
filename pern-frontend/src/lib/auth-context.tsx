/**
 * Authentication Context — wraps the app with auth state.
 * Supports Logto OIDC and demo user fallback.
 *
 * Tokens are stored in sessionStorage (cleared when the tab closes)
 * rather than localStorage (persists across sessions) for better security.
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { logtoClient, type AuthUser, getUser, getAccessToken, isAuthenticated as checkIsAuthenticated, logout as logtoLogout } from './auth';

const STORAGE_KEY_TOKEN = 'pern_auth_token';
const STORAGE_KEY_DEMO = 'pern_demo_user';

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: () => Promise<void>;
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
    try {
      const authed = await checkIsAuthenticated();
      if (authed) {
        const u = await getUser();
        if (u) {
          setUser(u);
          const token = await getAccessToken();
          if (token) sessionStorage.setItem(STORAGE_KEY_TOKEN, token);
          return;
        }
      }
    } catch { /* not logged in via Logto */ }

    // Fallback: check for demo user in sessionStorage
    const demoRaw = sessionStorage.getItem(STORAGE_KEY_DEMO);
    if (demoRaw) {
      try {
        const demo = JSON.parse(demoRaw);
        setUser({ id: demo.id, name: demo.name, email: demo.email, role: demo.role });
        return;
      } catch { /* corrupt */ }
    }

    setUser(null);
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const login = useCallback(async () => {
    setLoading(true);
    try {
      await logtoClient.signIn(`${window.location.origin}/#/auth/callback`);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Login failed:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      const authed = await checkIsAuthenticated();
      if (authed) {
        await logtoLogout();
      }
    } catch { /* noop */ }
    // Clear all auth-related storage
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
