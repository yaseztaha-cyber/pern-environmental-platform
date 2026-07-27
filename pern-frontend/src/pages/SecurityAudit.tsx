import { useState, useEffect } from 'react';
import { PageHeader, Card, Pill, Btn } from '../components/ui';
import { apiClient } from '../lib/api-client';

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

export default function SecurityAudit() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    apiClient.getAuditLogs(filter ? { resourceType: filter } : {}).then((data: any) => {
      setLogs(Array.isArray(data) ? data : []);
    }).catch(() => setLogs([])).finally(() => setLoading(false));
  }, [filter, refreshKey]);

  const getSeverityColor = (action: string) => {
    if (action.includes('delete') || action.includes('critical')) return 'text-[var(--rose)] bg-[var(--rose-dim)]';
    if (action.includes('trigger') || action.includes('warning')) return 'text-[var(--amber)] bg-[var(--amber-dim)]';
    return 'text-[var(--emerald)] bg-[var(--emerald-dim)]';
  };

  const actionTypes = [...new Set(logs.map(l => l.action))].slice(0, 10);

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader
        title="Security & Audit Logs"
        subtitle="Enterprise-grade activity tracking"
        right={
          <div className="flex items-center gap-2">
            <Pill tone="slate">{logs.length} events</Pill>
            <Btn size="sm" onClick={() => setRefreshKey(k => k + 1)}>Refresh</Btn>
          </div>
        }
      />

      <div className="flex gap-2 mb-4 flex-wrap grid-entrance">
        <Btn size="sm" variant={filter === '' ? 'primary' : 'ghost'} onClick={() => setFilter('')}>All</Btn>
        {['alert', 'notification', 'device', 'rule', 'threshold'].map(type => (
          <Btn key={type} size="sm" variant={filter === type ? 'primary' : 'ghost'} onClick={() => setFilter(type)}>{type}</Btn>
        ))}
      </div>

      {loading ? (
        <Card className="text-center py-16 text-[var(--text-disabled)]">Loading audit logs...</Card>
      ) : logs.length === 0 ? (
        <Card className="text-center py-16">
          <div className="text-[var(--text-secondary)] text-lg font-medium mb-1">No audit events yet</div>
          <p className="text-[var(--text-disabled)] text-sm">Events are logged when you create rules, receive alerts, or change settings.</p>
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
                    <span className="text-[var(--text-disabled)] ml-2">by {log.userId || 'system'}</span>
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
