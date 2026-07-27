/**
 * Logto OIDC Authentication
 * Uses @logto/browser SDK
 */

import LogtoClient, { 
  type LogtoConfig, 
  type UserInfoResponse 
} from '@logto/browser';

const endpoint = import.meta.env.VITE_LOGTO_ENDPOINT;
const appId = import.meta.env.VITE_LOGTO_APP_ID;

// Logto is only considered configured when real (non-default) env values are
// provided. Otherwise the OIDC call would always fail with a network error in
// local/dev environments — so we skip it and guide the user to the demo login.
export const isLogtoConfigured = Boolean(endpoint && appId && endpoint !== 'http://localhost:3001');

const config: LogtoConfig = {
  endpoint: endpoint || 'http://localhost:3001',
  appId: appId || 'pern-app',
  resources: ['https://api.pern.dev'],
};

export const logtoClient = new LogtoClient(config);

export interface AuthUser {
  id: string;
  name?: string;
  email?: string;
  role?: string;
}

export async function loginWithLogto(redirectUri?: string) {
  const callbackUri = redirectUri || `${window.location.origin}/#/auth/callback`;
  await logtoClient.signIn(callbackUri);
}

export async function handleLogtoCallback() {
  await logtoClient.handleSignInCallback(window.location.href);
}

export async function logout() {
  await logtoClient.signOut(window.location.origin);
}

export async function getUser(): Promise<AuthUser | null> {
  const isAuthenticated = await logtoClient.isAuthenticated();
  if (!isAuthenticated) return null;

  try {
    const userInfo: UserInfoResponse = await logtoClient.fetchUserInfo();
    return {
      id: userInfo.sub,
      name: userInfo.name ?? undefined,
      email: userInfo.email ?? undefined,
      role: (userInfo.custom_data as any)?.role || 'viewer',
    };
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[Auth] Failed to fetch user info:', (e as Error)?.message || e);
    return null;
  }
}

export async function getAccessToken(): Promise<string | null> {
  try {
    return await logtoClient.getAccessToken();
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[Auth] Failed to get access token:', (e as Error)?.message || e);
    return null;
  }
}

export function isAuthenticated(): Promise<boolean> {
  return logtoClient.isAuthenticated();
}