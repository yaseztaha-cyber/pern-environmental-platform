/**
 * PERN Role-Based Access Control
 */

export type UserRole = 'admin' | 'supervisor' | 'researcher' | 'operator' | 'viewer';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  admin: ['*'], // Full access
  supervisor: ['dashboard', 'alerts', 'reports', 'compliance', 'automation'],
  researcher: ['dashboard', 'sensors', 'analytics', 'research', 'knowledge'],
  operator: ['devices', 'automation', 'firmware', 'device-connection'],
  viewer: ['dashboard', 'map', 'reports', 'resources']
};

export function hasPermission(role: UserRole, feature: string): boolean {
  if (role === 'admin') return true;
  return ROLE_PERMISSIONS[role]?.includes(feature) || false;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrator',
  supervisor: 'Supervisor',
  researcher: 'Researcher',
  operator: 'Operator',
  viewer: 'Viewer'
};