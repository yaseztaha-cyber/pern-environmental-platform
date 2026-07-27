import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../lib/api-client';
import { PageHeader, Card, Pill, ProgressRing, LoadingState } from '../components/ui';

interface DeviceHealth {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  status: string;
  healthScore: number;
  connectivityHealth: number;
  readingCount: number;
  minutesSinceLastSeen: number | null;
  lastSeen: string;
  firmwareVersion: string;
  latestReading: any;
}

export default function DeviceHealthDashboard() {
  const [devices, setDevices] = useState<DeviceHealth[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHealth = useCallback(async () => {
    setLoading(true);
    try {
      const devicesData = await apiClient.getDevices();
      const results: DeviceHealth[] = [];

      for (const d of devicesData) {
        try {
          const health = await apiClient.request<any>(`/devices/${d.id}/health`);

          const minutesSince = health.minutesSinceLastSeen;
          const readingCount = health.readingCount || 0;

          let connectivityHealth = 100;
          if (minutesSince !== null) {
            if (minutesSince < 5) connectivityHealth = 100;
            else if (minutesSince < 15) connectivityHealth = 90;
            else if (minutesSince < 30) connectivityHealth = 80;
            else if (minutesSince < 60) connectivityHealth = 65;
            else connectivityHealth = 40;
          }

          let sensorHealth = 100;
          if (readingCount === 0) sensorHealth = 20;
          else if (readingCount < 10) sensorHealth = 50;
          else if (readingCount < 50) sensorHealth = 70;

          let hardwareHealth = 90;
          if (minutesSince !== null && minutesSince > 120) hardwareHealth = 60;

          let batteryHealth = 95;
          if (minutesSince !== null && minutesSince > 60) batteryHealth = 70;
          if (minutesSince !== null && minutesSince > 300) batteryHealth = 45;

          const overallScore = Math.round(
            batteryHealth * 0.30 +
            connectivityHealth * 0.25 +
            hardwareHealth * 0.20 +
            sensorHealth * 0.25
          );

          results.push({
            deviceId: d.id,
            deviceName: d.name || d.id,
            deviceType: d.type || 'Generic',
            status: health.status || d.status || 'unknown',
            healthScore: health.healthScore || overallScore,
            connectivityHealth,
            readingCount,
            minutesSinceLastSeen: minutesSince,
            lastSeen: health.lastSeen || d.last_seen || new Date().toISOString(),
            firmwareVersion: d.metadata?.firmware_version || 'N/A',
            latestReading: health.latestReading,
          });
        } catch {
          results.push({
            deviceId: d.id,
            deviceName: d.name || d.id,
            deviceType: d.type || 'Generic',
            status: 'offline',
            healthScore: 0,
            connectivityHealth: 0,
            readingCount: 0,
            minutesSinceLastSeen: null,
            lastSeen: d.last_seen || new Date().toISOString(),
            firmwareVersion: d.metadata?.firmware_version || 'N/A',
            latestReading: null,
          });
        }
      }

      setDevices(results);
    } catch (err) {
      console.error('Failed to load device health:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHealth();
    const interval = setInterval(loadHealth, 30000);
    return () => clearInterval(interval);
  }, [loadHealth]);

  const getHealthAccent = (score: number): 'emerald' | 'amber' | 'rose' => {
    if (score >= 80) return 'emerald';
    if (score >= 60) return 'amber';
    return 'rose';
  };

  const getHealthPillTone = (score: number): 'emerald' | 'amber' | 'rose' => {
    return getHealthAccent(score);
  };

  const getStatusPillTone = (status: string): 'emerald' | 'amber' | 'rose' | 'slate' => {
    if (status === 'online') return 'emerald';
    if (status === 'warning') return 'amber';
    return 'rose';
  };

  const formatLastSeen = (minutes: number | null) => {
    if (minutes === null) return 'Never';
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${Math.round(minutes)}m ago`;
    return `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m ago`;
  };

  return (
    <div>
      <PageHeader
        title="Device Health Dashboard"
        subtitle="Real-time health • Connectivity • Sensor accuracy • Auto-refresh 30s"
      />

      {loading ? (
        <LoadingState label="Loading device health…" />
      ) : devices.length === 0 ? (
        <Card hover={false} className="text-center py-12 text-[var(--text-tertiary)]">
          No devices found.
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 grid-entrance">
          {devices.map(device => {
            const accent = getHealthAccent(device.healthScore);

            return (
              <Card key={device.deviceId}>
                <div className="flex justify-between items-start mb-5">
                  <div>
                    <div className="font-semibold text-xl text-[var(--text-primary)]">{device.deviceId}</div>
                    <div className="text-xs text-[var(--text-tertiary)] mt-1">
                      {device.deviceType} • {device.firmwareVersion}
                    </div>
                  </div>
                  <ProgressRing value={device.healthScore} size={48} strokeWidth={4} accent={accent} />
                </div>

                <div className="grid grid-cols-2 gap-4 mb-5">
                  <div>
                    <div className="section-label">CONNECTIVITY</div>
                    <div className="text-2xl font-bold tracking-tight mt-1 text-[var(--text-primary)]">
                      {device.connectivityHealth}%
                    </div>
                  </div>
                  <div>
                    <div className="section-label">READINGS</div>
                    <div className="text-2xl font-bold tracking-tight mt-1 text-[var(--text-primary)]">
                      {device.readingCount}
                    </div>
                  </div>
                  <div>
                    <div className="section-label">STATUS</div>
                    <div className="mt-1.5">
                      <Pill tone={getStatusPillTone(device.status)}>
                        {device.status.toUpperCase()}
                      </Pill>
                    </div>
                  </div>
                  <div>
                    <div className="section-label">LAST SEEN</div>
                    <div className="text-sm font-medium mt-1 text-[var(--text-secondary)]">
                      {formatLastSeen(device.minutesSinceLastSeen)}
                    </div>
                  </div>
                </div>

                {device.latestReading && (
                  <div className="pt-4 border-t border-[var(--border)] mb-3">
                    <div className="section-label mb-2">LATEST READING</div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      {device.latestReading.pm25 !== undefined && (
                        <div>
                          <span className="text-[var(--text-tertiary)]">PM2.5</span>{' '}
                          <span className="font-mono text-[var(--text-secondary)]">{device.latestReading.pm25} <span className="text-[var(--text-disabled)]">µg/m³</span></span>
                        </div>
                      )}
                      {device.latestReading.ph !== undefined && (
                        <div>
                          <span className="text-[var(--text-tertiary)]">pH</span>{' '}
                          <span className="font-mono text-[var(--text-secondary)]">{device.latestReading.ph}</span>
                        </div>
                      )}
                      {device.latestReading.tmp !== undefined && (
                        <div>
                          <span className="text-[var(--text-tertiary)]">Temp</span>{' '}
                          <span className="font-mono text-[var(--text-secondary)]">{device.latestReading.tmp}°C</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <Pill tone={accent}>
                  {device.healthScore} HEALTH
                </Pill>

                <div className="text-xs text-[var(--text-tertiary)] font-mono mt-3">
                  Last seen: {new Date(device.lastSeen).toLocaleString()}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
