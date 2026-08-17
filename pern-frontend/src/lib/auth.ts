/**
 * Self-hosted JWT Authentication API
 * Replaces Logto OIDC with local bcrypt + JWT auth
 */

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export interface AuthUser {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  emailVerified?: boolean;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

async function authPost<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // send/receive refresh cookie
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Auth error ${res.status}`);
  return data as T;
}

export async function register(name: string, email: string, password: string): Promise<AuthResponse> {
  return authPost<AuthResponse>('/auth/register', { name, email, password });
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  return authPost<AuthResponse>('/auth/login', { email, password });
}

export async function logout(): Promise<void> {
  await authPost('/auth/logout', {});
}

export async function getMe(token: string): Promise<AuthUser | null> {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function refreshToken(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.accessToken || null;
  } catch {
    return null;
  }
}

export async function verifyEmail(token: string): Promise<boolean> {
  try {
    const data = await authPost<{ success: boolean }>('/auth/verify-email', { token });
    return !!data.success;
  } catch {
    return false;
  }
}

export async function resendVerification(email: string): Promise<void> {
  await authPost('/auth/resend-verification', { email });
}

export async function forgotPassword(email: string): Promise<void> {
  await authPost('/auth/forgot-password', { email });
}

export async function resetPassword(token: string, password: string): Promise<void> {
  await authPost('/auth/reset-password', { token, password });
}
