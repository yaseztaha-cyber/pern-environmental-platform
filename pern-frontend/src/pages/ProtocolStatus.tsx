import { useState, useEffect } from 'react';
import { apiClient } from '../lib/api-client';
import { PageHeader, Card, Pill, SectionTitle, EmptyState } from '../components/ui';
import { Radio, ServerCrash } from 'lucide-react';

interface ProtocolStatus {
  protocols: Record<string, boolean>;
  timestamp: string;
}

export default function ProtocolStatusDashboard() {
  const [status, setStatus] = useState<ProtocolStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [backendDown, setBackendDown] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      const data = await apiClient.get<ProtocolStatus>('/protocols/status');
      setStatus(data);
      setBackendDown(false);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (error) {
      console.warn('[ProtocolStatus] Backend unreachable:', error);
      // Backend is down — keep showing the last known state (or an offline note)
      // instead of throwing. Degrade gracefully.
      setBackendDown(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000); // Refresh every 15s
    return () => clearInterval(interval);
  }, []);

  const getProtocolIcon = (name: string) => {
    switch (name) {
      case 'MQTT': return '📡';
      case 'HTTP': return '🌐';
      case 'WebSocket': return '🔌';
      case 'CoAP': return '📶';
      case 'LoRaWAN': return '🛰️';
      default: return '🔧';
    }
  };

  return (
    <div className="max-w-[1100px] mx-auto">
      <PageHeader
        title="Protocol Status"
        subtitle="Multi-protocol device connection monitoring"
        right={
          backendDown
            ? <Pill tone="rose">Backend offline</Pill>
            : lastUpdated
              ? <Pill tone="emerald">Live · {lastUpdated}</Pill>
              : undefined
        }
      />

      {loading ? (
        <Card className="text-center py-12">Loading protocol status…</Card>
      ) : status && Object.keys(status.protocols).length > 0 ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 grid-entrance">
          {Object.entries(status.protocols).map(([name, connected]) => (
            <Card key={name} hover={false}>
              <div className="flex items-center gap-4">
                <div className="text-4xl">{getProtocolIcon(name)}</div>
                <div>
                  <div className="font-semibold text-lg text-[var(--text-primary)]">{name}</div>
                  <div className={`text-sm ${connected ? 'text-[var(--emerald)]' : 'text-[var(--rose)]'}`}>
                    {connected ? 'Connected' : 'Disconnected'}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={backendDown ? <ServerCrash size={22} /> : <Radio size={22} />}
            title={backendDown ? 'Backend offline' : 'No protocol data'}
            message={backendDown
              ? 'The PERN backend is not reachable. Start it (npm start in pern-backend) to see live protocol status. The page will reconnect automatically.'
              : 'Protocol status is not available right now.'}
          />
        </Card>
      )}

      <Card className="mt-8" hover={false}>
        <SectionTitle>Supported Protocols</SectionTitle>
        <div className="grid md:grid-cols-2 gap-4 text-sm grid-entrance">
          <div>
            <div className="font-medium">MQTT (Primary)</div>
            <div className="text-[var(--text-tertiary)]">Best for real-time IoT devices</div>
          </div>
          <div>
            <div className="font-medium">HTTP/REST</div>
            <div className="text-[var(--text-tertiary)]">Simple devices &amp; webhooks</div>
          </div>
          <div>
            <div className="font-medium">WebSocket</div>
            <div className="text-[var(--text-tertiary)]">Browser-based devices</div>
          </div>
          <div>
            <div className="font-medium">CoAP / LoRaWAN</div>
            <div className="text-[var(--text-tertiary)]">Low-power &amp; long-range devices</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
