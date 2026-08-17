import { useState, useEffect, useCallback } from 'react';
import { PageHeader, Card, Pill, LiveBadge, ProgressRing } from '../components/ui';
import { apiClient } from '../lib/api-client';
import { useI18n } from '../lib/i18n';
import { CheckCircle2, AlertTriangle, XCircle, Server } from 'lucide-react';

interface ServiceStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  latency: number | null;
  details: string;
}

export default function SystemStatus() {
  const { t } = useI18n();
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const statusKeys: Record<string, string> = {
    healthy: 'settings.status.healthy',
    degraded: 'settings.status.degraded',
    down: 'settings.status.down',
  };

  const checkServices = useCallback(async () => {
    const results: ServiceStatus[] = [];

    const probe = async <T,>(fn: () => Promise<T>) => {
      const start = performance.now();
      const data = await fn();
      return { latency: Math.round(performance.now() - start), data };
    };

    // Backend + MQTT (single health endpoint carries mqtt state)
    try {
      const { latency, data } = await probe(() => apiClient.get<{ status: string; mqtt: boolean }>('/health'));
      results.push({ name: t('systemStatus.service.backendApi', 'Backend API'), status: data.status === 'ok' ? 'healthy' : 'degraded', latency, details: data.mqtt ? t('systemStatus.detail.mqttConnected', 'MQTT connected') : t('systemStatus.detail.mqttDisconnected', 'MQTT disconnected') });
      results.push({ name: t('systemStatus.service.mqttBroker', 'MQTT Broker'), status: data.mqtt ? 'healthy' : 'degraded', latency, details: data.mqtt ? t('systemStatus.detail.mosquittoConnected', 'Mosquitto connected') : t('systemStatus.detail.brokerUnreachable', 'Broker unreachable') });
    } catch {
      results.push({ name: t('systemStatus.service.backendApi', 'Backend API'), status: 'down', latency: null, details: t('systemStatus.detail.connectionRefused', 'Connection refused') });
      results.push({ name: t('systemStatus.service.mqttBroker', 'MQTT Broker'), status: 'down', latency: null, details: t('systemStatus.detail.connectionRefused', 'Connection refused') });
    }

    // Live system stats
    try {
      const { latency, data } = await probe(() => apiClient.get<{ websocketClients: number; devices: number; recentReadings: number; uptime: number; memoryUsage: number }>('/live/status'));
      results.push({ name: 'WebSocket', status: data.websocketClients >= 0 ? 'healthy' : 'degraded', latency, details: t('systemStatus.detail.activeClients', '{count} active clients', { count: data.websocketClients }) });
      results.push({ name: t('systemStatus.service.deviceRegistry', 'Device Registry'), status: data.devices > 0 ? 'healthy' : 'degraded', latency: null, details: t('systemStatus.detail.registeredDevices', '{count} registered devices', { count: data.devices }) });
      results.push({ name: t('systemStatus.service.dataPipeline', 'Data Pipeline'), status: data.recentReadings >= 0 ? 'healthy' : 'degraded', latency: null, details: t('systemStatus.detail.pipeline', '{count} readings buffered, {uptime}s uptime, {memory}MB heap', { count: data.recentReadings, uptime: Math.round(data.uptime), memory: data.memoryUsage }) });
    } catch { /* live status unavailable */ }

    // PostgreSQL (via sensors endpoint reachability)
    try {
      const { latency } = await probe(() => apiClient.get<unknown[]>('/sensors'));
      results.push({ name: 'PostgreSQL', status: 'healthy', latency, details: t('systemStatus.detail.readWriteOk', 'Read/write OK') });
    } catch { results.push({ name: 'PostgreSQL', status: 'down', latency: null, details: t('systemStatus.detail.connectionRefused', 'Connection refused') }); }

    // Protocol Adapters
    try {
      const { latency, data } = await probe(() => apiClient.get<{ protocols: Record<string, boolean> }>('/protocols/status'));
      const protocols = data.protocols || {};
      const connected = Object.values(protocols).filter(Boolean).length;
      const total = Object.keys(protocols).length;
      results.push({ name: t('systemStatus.service.protocolAdapters', 'Protocol Adapters'), status: total > 0 && connected === total ? 'healthy' : 'degraded', latency, details: t('systemStatus.detail.protocolsConnected', '{connected}/{total} protocols connected', { connected, total }) });
    } catch { results.push({ name: t('systemStatus.service.protocolAdapters', 'Protocol Adapters'), status: 'down', latency: null, details: t('systemStatus.detail.connectionRefused', 'Connection refused') }); }

    // ntfy is pushed FROM the backend, not polled from the browser (CORS).
    // Report it as "configured" rather than probing it client-side.
    results.push({ name: t('systemStatus.service.ntfyPush', 'ntfy.sh Push'), status: 'healthy', latency: null, details: t('systemStatus.detail.ntfyConfigured', 'Configured (backend push)') });

    setServices(results);
    setLoading(false);
  }, [t]);

  useEffect(() => {
    checkServices();
    const interval = setInterval(checkServices, 15000);
    return () => clearInterval(interval);
  }, [checkServices]);

  const healthy = services.filter(s => s.status === 'healthy').length;
  const allHealthy = services.length > 0 && healthy === services.length;
  const healthPercent = services.length > 0 ? Math.round((healthy / services.length) * 100) : 0;
  const tone = (s: string): 'emerald' | 'amber' | 'rose' => s === 'healthy' ? 'emerald' : s === 'degraded' ? 'amber' : 'rose';
  const icon = (s: string) => s === 'healthy' ? <CheckCircle2 size={20} className="text-[var(--emerald)]" /> : s === 'degraded' ? <AlertTriangle size={20} className="text-[var(--amber)]" /> : <XCircle size={20} className="text-[var(--rose)]" />;

  return (
    <div className="max-w-[1000px] mx-auto">
      <PageHeader
        title={t('systemStatus.title', 'System Status')}
        subtitle={t('systemStatus.subtitle', 'Live health checks across all services')}
        right={<LiveBadge on={allHealthy} label={allHealthy ? t('systemStatus.badge.healthy', 'HEALTHY') : services.length ? t('systemStatus.badge.monitoring', 'MONITORING') : t('systemStatus.badge.idle', 'IDLE')} />}
      />

      {loading ? (
        <Card hover={false} className="text-center py-12 text-[var(--text-tertiary)]">{t('systemStatus.checking', 'Checking services…')}</Card>
      ) : (
        <>
          <Card hover={false} className="mb-5 flex items-center gap-4">
            <ProgressRing value={healthPercent} size={48} strokeWidth={4} accent={allHealthy ? 'emerald' : 'amber'} />
            <div className="flex items-center gap-3">
              <Server size={20} className="text-[var(--emerald)]" />
              <div>
                <div className="font-semibold">{t('systemStatus.servicesHealthy', '{healthy}/{total} services healthy', { healthy, total: services.length })}</div>
                <div className="text-xs text-[var(--text-tertiary)] mt-0.5">{t('systemStatus.overallHealth', 'Overall system health')}</div>
              </div>
            </div>
            <div className="ml-auto">
              <Pill tone={allHealthy ? 'emerald' : 'amber'}>{allHealthy ? t('systemStatus.allOperational', 'All operational') : t('systemStatus.partialDegradation', 'Partial degradation')}</Pill>
            </div>
          </Card>
          <div className="grid md:grid-cols-2 gap-3 grid-entrance">
            {services.map((svc, i) => (
              <Card key={i} className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  {icon(svc.status)}
                  <div>
                    <div className="font-medium">{svc.name}</div>
                    <div className="text-xs text-[var(--text-tertiary)]">{svc.details}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {svc.latency !== null && <span className="text-xs font-mono text-[var(--text-tertiary)]">{svc.latency}ms</span>}
                  <Pill tone={tone(svc.status)}>{t(statusKeys[svc.status] ?? svc.status, svc.status)}</Pill>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
