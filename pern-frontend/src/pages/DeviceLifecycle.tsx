import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../lib/api-client';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { PageHeader, Card, Pill, Btn } from '../components/ui';

interface LifecycleDevice {
  id: string;
  name: string;
  type: string;
  status: 'online' | 'offline' | 'warning';
  healthScore: number;
  totalReadings: number;
  uptimeHours: number;
  lastSeen: string;
  estimatedRemainingDays: number;
  usageIntensity: 'low' | 'medium' | 'high';
  firmwareVersion: string;
  recentReadings: number[];
}

export default function DeviceLifecyclePage() {
  const [devices, setDevices] = useState<LifecycleDevice[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDevices = useCallback(async () => {
    setLoading(true);
    try {
      const devicesData = await apiClient.getDevices();
      const results: LifecycleDevice[] = [];

      for (const d of devicesData) {
        try {
          const health = await apiClient.request<any>(`/devices/${d.id}/health`);
          const readings = await apiClient.getDeviceReadings(d.id, 50);

          const lastSeenMs = health.lastSeen ? new Date(health.lastSeen).getTime() : 0;
          const daysSinceLastSeen = lastSeenMs ? (Date.now() - lastSeenMs) / (1000 * 3600 * 24) : 999;
          const readingCount = health.readingCount || readings.length;
          const uptimeHours = Math.max(1, Math.floor(readingCount / 4));

          const intensity: 'low' | 'medium' | 'high' = readingCount > 1800 ? 'high' : readingCount > 600 ? 'medium' : 'low';
          const usageFactor = intensity === 'high' ? 1.4 : intensity === 'medium' ? 1.0 : 0.7;

          const healthScore = health.healthScore || 100;
          const estimatedRemainingDays = Math.max(30, Math.round(
            (1095 - (uptimeHours / 24) * usageFactor) * (healthScore / 100)
          ));

          const status: 'online' | 'offline' | 'warning' =
            daysSinceLastSeen < 0.5 ? 'online' :
            daysSinceLastSeen < 2 ? 'warning' : 'offline';

          const recentReadings = readings.slice(-8).map((r: any) => r.pm25 || r.value || 50);

          results.push({
            id: d.id,
            name: d.name || d.id,
            type: d.type || 'Generic',
            status,
            healthScore: Math.max(0, Math.min(100, healthScore)),
            totalReadings: readingCount,
            uptimeHours,
            lastSeen: health.lastSeen || d.last_seen || new Date().toISOString(),
            estimatedRemainingDays,
            usageIntensity: intensity,
            firmwareVersion: d.metadata?.firmware_version || 'N/A',
            recentReadings,
          });
        } catch {
          results.push({
            id: d.id,
            name: d.name || d.id,
            type: d.type || 'Generic',
            status: 'offline',
            healthScore: 0,
            totalReadings: 0,
            uptimeHours: 0,
            lastSeen: d.last_seen || new Date().toISOString(),
            estimatedRemainingDays: 0,
            usageIntensity: 'low',
            firmwareVersion: d.metadata?.firmware_version || 'N/A',
            recentReadings: [],
          });
        }
      }

      setDevices(results);
    } catch (err) {
      console.error('Failed to load devices:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDevices(); }, [loadDevices]);

  return (
    <div>
      <PageHeader
        title="Device Lifecycle Dashboard"
        subtitle="Real device telemetry • Usage frequency • Remaining lifetime"
        right={<Btn variant="primary" onClick={loadDevices}>Refresh All Metrics</Btn>}
      />

      {loading ? (
        <Card hover={false} className="text-center py-12 text-[var(--text-secondary)]">Loading device data…</Card>
      ) : devices.length === 0 ? (
        <Card hover={false} className="text-center py-12 text-[var(--text-secondary)]">No devices found. Connect devices first.</Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 grid-entrance">
          {devices.map(device => {
            const usageTone = device.usageIntensity === 'high' ? 'rose' :
                              device.usageIntensity === 'medium' ? 'amber' : 'emerald';
            const healthColor = device.healthScore > 80 ? 'var(--emerald)' :
                                device.healthScore > 60 ? 'var(--amber)' : 'var(--rose)';

            const trendData = device.recentReadings.map((v, i) => ({ day: i, value: v }));

            return (
              <Card key={device.id} hover={false}>
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <div className="font-semibold text-xl text-[var(--text-primary)]">{device.name}</div>
                    <div className="text-sm text-[var(--emerald)]">{device.type}</div>
                  </div>
                  <Pill tone={device.status === 'online' ? 'emerald' : device.status === 'warning' ? 'amber' : 'slate'}>
                    {device.status}
                  </Pill>
                </div>

                <div className="grid grid-cols-2 gap-y-6">
                  <div>
                    <div className="text-xs text-[var(--text-secondary)] tracking-wider">TOTAL READINGS</div>
                    <div className="font-mono text-4xl font-semibold tracking-tighter mt-1 text-[var(--text-primary)]">{device.totalReadings.toLocaleString()}</div>
                    <div className="text-xs text-[var(--emerald)] mt-1">Since deployment</div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--text-secondary)] tracking-wider">UPTIME</div>
                    <div className="font-mono text-4xl font-semibold tracking-tighter mt-1 text-[var(--text-primary)]">{device.uptimeHours}h</div>
                    <div className="text-xs text-[var(--emerald)] mt-1">~{Math.floor(device.uptimeHours / 24)} days</div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--text-secondary)] tracking-wider">HEALTH SCORE</div>
                    <div className="font-mono text-4xl font-semibold tracking-tighter mt-1" style={{ color: healthColor }}>
                      {device.healthScore}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--text-secondary)] tracking-wider">EST. REMAINING LIFE</div>
                    <div className="font-mono text-4xl font-semibold tracking-tighter mt-1 text-[var(--rose)]">
                      {device.estimatedRemainingDays}d
                    </div>
                    <div className="text-xs text-[var(--rose)] mt-1">~{Math.floor(device.estimatedRemainingDays / 30)} months</div>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-[var(--border)]">
                  <div className="text-xs text-[var(--text-secondary)] mb-2">Recent Sensor Readings</div>
                  <div className="h-16">
                    {trendData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trendData}>
                          <Line type="natural" dataKey="value" stroke="var(--emerald)" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-xs text-[var(--text-tertiary)]">No readings yet</div>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-[var(--border)] flex justify-between items-center text-sm">
                  <div>
                    <span className="text-[var(--text-secondary)]">Usage:</span>{' '}
                    <Pill tone={usageTone}>{device.usageIntensity}</Pill>
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] font-mono">
                    FW: {device.firmwareVersion}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
