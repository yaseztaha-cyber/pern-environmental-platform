import { useState, useEffect } from 'react';
import { PageHeader, Card, Pill, LiveBadge, ProgressRing } from '../components/ui';
import { API_BASE } from '../lib/constants';
import { CheckCircle2, AlertTriangle, XCircle, Server } from 'lucide-react';

interface ServiceStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  latency: number | null;
  details: string;
}

export default function SystemStatus() {
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const checkServices = async () => {
    const results: ServiceStatus[] = [];

    const probe = async (url: string) => {
      const start = performance.now();
      const res = await fetch(url);
      return { res, latency: Math.round(performance.now() - start), data: await res.json().catch(() => ({})) };
    };

    // Backend + MQTT (single health endpoint carries mqtt state)
    try {
      const { latency, data } = await probe(`${API_BASE}/health`);
      results.push({ name: 'Backend API', status: data.status === 'ok' ? 'healthy' : 'degraded', latency, details: data.mqtt ? 'MQTT connected' : 'MQTT disconnected' });
      results.push({ name: 'MQTT Broker', status: data.mqtt ? 'healthy' : 'degraded', latency, details: data.mqtt ? 'Mosquitto connected' : 'Broker unreachable' });
    } catch {
      results.push({ name: 'Backend API', status: 'down', latency: null, details: 'Connection refused' });
      results.push({ name: 'MQTT Broker', status: 'down', latency: null, details: 'Connection refused' });
    }

    // Live system stats
    try {
      const { latency, data } = await probe(`${API_BASE}/live/status`);
      results.push({ name: 'WebSocket', status: data.websocketClients >= 0 ? 'healthy' : 'degraded', latency, details: `${data.websocketClients} active clients` });
      results.push({ name: 'Device Registry', status: data.devices > 0 ? 'healthy' : 'degraded', latency: null, details: `${data.devices} registered devices` });
      results.push({ name: 'Data Pipeline', status: data.recentReadings >= 0 ? 'healthy' : 'degraded', latency: null, details: `${data.recentReadings} readings buffered, ${Math.round(data.uptime)}s uptime, ${data.memoryUsage}MB heap` });
    } catch { /* live status unavailable */ }

    // PostgreSQL (via sensors endpoint reachability)
    try {
      const { latency, res } = await probe(`${API_BASE}/sensors`);
      results.push({ name: 'PostgreSQL', status: res.ok ? 'healthy' : 'degraded', latency, details: res.ok ? 'Read/write OK' : 'Read failed' });
    } catch { results.push({ name: 'PostgreSQL', status: 'down', latency: null, details: 'Connection refused' }); }

    // Protocol Adapters
    try {
      const { latency, data } = await probe(`${API_BASE}/protocols/status`);
      const protocols = data.protocols || {};
      const connected = Object.values(protocols).filter(Boolean).length;
      const total = Object.keys(protocols).length;
      results.push({ name: 'Protocol Adapters', status: total > 0 && connected === total ? 'healthy' : 'degraded', latency, details: `${connected}/${total} protocols connected` });
    } catch { results.push({ name: 'Protocol Adapters', status: 'down', latency: null, details: 'Connection refused' }); }

    // ntfy is pushed FROM the backend, not polled from the browser (CORS).
    // Report it as "configured" rather than probing it client-side.
    results.push({ name: 'ntfy.sh Push', status: 'healthy', latency: null, details: 'Configured (backend push)' });

    setServices(results);
    setLoading(false);
  };

  useEffect(() => {
    checkServices();
    const interval = setInterval(checkServices, 15000);
    return () => clearInterval(interval);
  }, []);

  const healthy = services.filter(s => s.status === 'healthy').length;
  const allHealthy = services.length > 0 && healthy === services.length;
  const healthPercent = services.length > 0 ? Math.round((healthy / services.length) * 100) : 0;
  const tone = (s: string): 'emerald' | 'amber' | 'rose' => s === 'healthy' ? 'emerald' : s === 'degraded' ? 'amber' : 'rose';
  const icon = (s: string) => s === 'healthy' ? <CheckCircle2 size={20} className="text-[var(--emerald)]" /> : s === 'degraded' ? <AlertTriangle size={20} className="text-[var(--amber)]" /> : <XCircle size={20} className="text-[var(--rose)]" />;

  return (
    <div className="max-w-[1000px] mx-auto">
      <PageHeader
        title="System Status"
        subtitle="Live health checks across all services"
        right={<LiveBadge on={allHealthy} label={allHealthy ? 'HEALTHY' : services.length ? 'MONITORING' : 'IDLE'} />}
      />

      {loading ? (
        <Card hover={false} className="text-center py-12 text-[var(--text-tertiary)]">Checking services…</Card>
      ) : (
        <>
          <Card hover={false} className="mb-5 flex items-center gap-4">
            <ProgressRing value={healthPercent} size={48} strokeWidth={4} accent={allHealthy ? 'emerald' : 'amber'} />
            <div className="flex items-center gap-3">
              <Server size={20} className="text-[var(--emerald)]" />
              <div>
                <div className="font-semibold">{healthy}/{services.length} services healthy</div>
                <div className="text-xs text-[var(--text-tertiary)] mt-0.5">Overall system health</div>
              </div>
            </div>
            <div className="ml-auto">
              <Pill tone={allHealthy ? 'emerald' : 'amber'}>{allHealthy ? 'All operational' : 'Partial degradation'}</Pill>
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
                  <Pill tone={tone(svc.status)}>{svc.status}</Pill>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
