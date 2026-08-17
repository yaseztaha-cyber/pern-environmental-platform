import { useState, useEffect } from 'react';
import { apiClient } from '../lib/api-client';
import { PageHeader, Card, Pill, SectionTitle, EmptyState } from '../components/ui';
import { Radio, ServerCrash } from 'lucide-react';
import { useI18n } from '../lib/i18n';

interface ProtocolStatus {
  protocols: Record<string, boolean>;
  timestamp: string;
}

export default function ProtocolStatusDashboard() {
  const { t } = useI18n();
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
        title={t('protocol.title', 'Protocol Status')}
        subtitle={t('protocol.subtitle', 'Multi-protocol device connection monitoring')}
        right={
          backendDown
            ? <Pill tone="rose">{t('protocol.backendOffline', 'Backend offline')}</Pill>
            : lastUpdated
              ? <Pill tone="emerald">{t('protocol.liveSince', 'Live · {time}', { time: lastUpdated })}</Pill>
              : undefined
        }
      />

      {loading ? (
        <Card className="text-center py-12">{t('protocol.loading', 'Loading protocol status…')}</Card>
      ) : status && Object.keys(status.protocols).length > 0 ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 grid-entrance">
          {Object.entries(status.protocols).map(([name, connected]) => (
            <Card key={name} hover={false}>
              <div className="flex items-center gap-4">
                <div className="text-4xl">{getProtocolIcon(name)}</div>
                <div>
                  <div className="font-semibold text-lg text-[var(--text-primary)]">{name}</div>
                  <div className={`text-sm ${connected ? 'text-[var(--emerald)]' : 'text-[var(--rose)]'}`}>
                    {connected ? t('protocol.connected', 'Connected') : t('protocol.disconnected', 'Disconnected')}
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
            title={backendDown ? t('protocol.backendOffline', 'Backend offline') : t('protocol.noData', 'No protocol data')}
            message={backendDown
              ? t('protocol.backendDownHint', 'The PERN backend is not reachable. Start it (npm start in pern-backend) to see live protocol status. The page will reconnect automatically.')
              : t('protocol.noDataHint', 'Protocol status is not available right now.')}
          />
        </Card>
      )}

      <Card className="mt-8" hover={false}>
        <SectionTitle>{t('protocol.section.supported', 'Supported Protocols')}</SectionTitle>
        <div className="grid md:grid-cols-2 gap-4 text-sm grid-entrance">
          <div>
            <div className="font-medium">{t('protocol.mqttPrimary', 'MQTT (Primary)')}</div>
            <div className="text-[var(--text-tertiary)]">{t('protocol.mqttPrimary.desc', 'Best for real-time IoT devices')}</div>
          </div>
          <div>
            <div className="font-medium">HTTP/REST</div>
            <div className="text-[var(--text-tertiary)]">{t('protocol.httpRest.desc', 'Simple devices & webhooks')}</div>
          </div>
          <div>
            <div className="font-medium">WebSocket</div>
            <div className="text-[var(--text-tertiary)]">{t('protocol.websocket.desc', 'Browser-based devices')}</div>
          </div>
          <div>
            <div className="font-medium">CoAP / LoRaWAN</div>
            <div className="text-[var(--text-tertiary)]">{t('protocol.coapLorawan.desc', 'Low-power & long-range devices')}</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
