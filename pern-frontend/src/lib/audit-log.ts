/**
 * PERN Enterprise Audit Logging
 * Tracks all important actions for security and compliance
 */

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  organizationId?: string;
  action: string;
  resource: string;
  details?: any;
  ip?: string;
  severity: 'info' | 'warning' | 'critical';
}

import { apiClient } from './api-client';

const AUDIT_KEY = 'pern_audit_logs';

export function logAuditEvent(
  action: string,
  resource: string,
  details?: any,
  severity: 'info' | 'warning' | 'critical' = 'info'
) {
  const log: AuditLog = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2),
    timestamp: new Date().toISOString(),
    userId: (() => { try { const v = localStorage.getItem('pern_demo_user'); return v ? JSON.parse(v).id : 'anonymous'; } catch { return 'anonymous'; } })(),
    organizationId: (() => { try { const v = localStorage.getItem('pern_current_organization'); return v ? JSON.parse(v).id : undefined; } catch { return undefined; } })(),
    action,
    resource,
    details,
    severity
  };

  // Mirror to the backend audit trail (fire-and-forget; never block the UI).
  apiClient.postAuditEvent(action, resource, details).catch(() => {});

  // Keep a local copy as an offline fallback
  const existing = JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]');
  existing.unshift(log);
  
  // Keep only last 500 logs
  if (existing.length > 500) {
    existing.splice(500);
  }
  
  localStorage.setItem(AUDIT_KEY, JSON.stringify(existing));

  // Also log to console in development
  if (import.meta.env.DEV) {
    console.log(`[AUDIT] ${severity.toUpperCase()}: ${action} on ${resource}`, details);
  }
}

// Get audit logs
export function getAuditLogs(limit = 50): AuditLog[] {
  const logs = JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]');
  return logs.slice(0, limit);
}

// Clear audit logs (admin only)
export function clearAuditLogs() {
  localStorage.removeItem(AUDIT_KEY);
}