import { useState, useEffect } from 'react';
import { PageHeader, Card, Pill, Btn } from '../components/ui';
import { apiClient } from '../lib/api-client';
import { useI18n } from '../lib/i18n';

interface AuditLog {
  id: number;
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details: any;
  ipAddress: string;
  createdAt: string;
}

const DEFAULT_FILTERS = ['alert', 'notification', 'device', 'rule', 'threshold'];

export default function SecurityAudit() {
  const { t } = useI18n();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [status, setStatus] = useState<any>(null);

  useEffect(() => {
    setLoading(true);
    apiClient.getAuditLogs(filter ? { resourceType: filter } : {}).then((data: any) => {
      setLogs(Array.isArray(data) ? data : []);
    }).catch(() => setLogs([])).finally(() => setLoading(false));
  }, [filter, refreshKey]);

  useEffect(() => {
    apiClient.getSecurityStatus().then(setStatus).catch(() => setStatus(null));
  }, [refreshKey]);

  const resourceTypes = logs.length > 0
    ? [...new Set(logs.map(l => l.resourceType))].filter(Boolean).slice(0, 10)
    : DEFAULT_FILTERS;

  const getSeverityColor = (action: string) => {
    if (action.includes('delete') || action.includes('critical')) return 'text-[var(--rose)] bg-[var(--rose-dim)]';
    if (action.includes('trigger') || action.includes('warning')) return 'text-[var(--amber)] bg-[var(--amber-dim)]';
    return 'text-[var(--emerald)] bg-[var(--emerald-dim)]';
  };

  const postureItems = [
    { label: t('securityAudit.posture.authentication', 'Authentication'), on: status?.authentication?.enforced === true, detail: status?.authentication?.enforced ? t('securityAudit.posture.authentication.enforced', 'Enforced (Logto)') : t('securityAudit.posture.authentication.dev', 'Development mode') },
    { label: t('securityAudit.posture.deviceAuth', 'Device Auth (API keys)'), on: status?.deviceAuthentication?.enforced === true, detail: status?.deviceAuthentication?.enforced ? t('securityAudit.posture.deviceAuth.enforced', 'Enforced') : t('securityAudit.posture.deviceAuth.notEnforced', 'Not enforced') },
    { label: t('securityAudit.posture.headers', 'Helmet / Security Headers'), on: true, detail: t('securityAudit.posture.headers.detail', 'CSP, HSTS, frame/cert policy') },
    { label: t('securityAudit.posture.queryValidation', 'Query Validation'), on: true, detail: t('securityAudit.posture.queryValidation.detail', 'Injection & prototype-pollution guard') },
    { label: t('securityAudit.posture.rateLimiting', 'Rate Limiting'), on: true, detail: t('securityAudit.posture.rateLimiting.detail', 'Per-IP sliding window') },
    { label: t('securityAudit.posture.bruteForce', 'Brute-Force Protection'), on: true, detail: t('securityAudit.posture.bruteForce.detail', 'Exponential backoff after 5 failures') },
    { label: t('securityAudit.posture.auditLogging', 'Audit Logging'), on: true, detail: t('securityAudit.posture.auditLogging.detail', 'State changes persisted with request IDs') },
    { label: t('securityAudit.posture.csrf', 'CSRF Protection'), on: status?.csrf?.enabled === true, detail: status?.csrf?.enabled ? t('securityAudit.posture.csrf.enabled', 'Enabled') : t('securityAudit.posture.csrf.disabled', 'Disabled (bearer-token SPA)') },
  ];

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader
        title={t('securityAudit.title', 'Security & Audit Logs')}
        subtitle={t('securityAudit.subtitle', 'Enterprise-grade activity tracking')}
        right={
          <div className="flex items-center gap-2">
            <Pill tone="slate">{t('securityAudit.events', '{count} events', { count: logs.length })}</Pill>
            <Btn size="sm" onClick={() => setRefreshKey(k => k + 1)}>{t('common.refresh', 'Refresh')}</Btn>
          </div>
        }
      />

      <Card className="mb-4 grid-entrance">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">{t('securityAudit.section.posture', 'Security Posture')}</h3>
          <Pill tone={status ? 'emerald' : 'slate'}>
            {status ? t('securityAudit.dbInfo', '{db} · v{version}', { db: status.db === 'postgres' ? 'PostgreSQL' : t('securityAudit.db.inMemory', 'In-memory DB'), version: status.version }) : t('securityAudit.statusUnavailable', 'Status unavailable')}
          </Pill>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {postureItems.map(item => (
            <div key={item.label} className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-xs font-medium text-[var(--text-primary)] truncate">{item.label}</div>
                <div className="text-[10px] text-[var(--text-disabled)] truncate">{item.detail}</div>
              </div>
              <Pill tone={item.on ? 'emerald' : 'slate'}>{item.on ? t('securityAudit.on', 'ON') : t('securityAudit.off', 'OFF')}</Pill>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex gap-2 mb-4 flex-wrap grid-entrance">
        <Btn size="sm" variant={filter === '' ? 'primary' : 'ghost'} onClick={() => setFilter('')}>{t('securityAudit.filterAll', 'All')}</Btn>
        {resourceTypes.map(type => (
          <Btn key={type} size="sm" variant={filter === type ? 'primary' : 'ghost'} onClick={() => setFilter(type)}>{type}</Btn>
        ))}
      </div>

      {loading ? (
        <Card className="text-center py-16 text-[var(--text-disabled)]">{t('securityAudit.loading', 'Loading audit logs...')}</Card>
      ) : logs.length === 0 ? (
        <Card className="text-center py-16">
          <div className="text-[var(--text-secondary)] text-lg font-medium mb-1">{t('securityAudit.noEvents', 'No audit events yet')}</div>
          <p className="text-[var(--text-disabled)] text-sm">{t('securityAudit.noEventsHint', 'Events are logged when you create rules, receive alerts, or change settings.')}</p>
        </Card>
      ) : (
        <Card>
          <div className="max-h-[600px] overflow-y-auto space-y-1">
            {logs.map((log) => (
              <div key={log.id} className="flex items-center justify-between py-3 px-3 rounded-[var(--radius-sm)] hover:bg-[var(--surface)] text-sm">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase ${getSeverityColor(log.action)}`}>{log.action}</span>
                  <div>
                    <span className="font-medium">{log.resourceType}</span>
                    {log.resourceId && <span className="text-[var(--text-disabled)] ml-1">#{log.resourceId}</span>}
                    <span className="text-[var(--text-disabled)] ml-2">{t('securityAudit.by', 'by {user}', { user: log.userId || t('securityAudit.bySystem', 'system') })}</span>
                  </div>
                </div>
                <span className="text-[10px] text-[var(--text-disabled)]">{new Date(log.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
