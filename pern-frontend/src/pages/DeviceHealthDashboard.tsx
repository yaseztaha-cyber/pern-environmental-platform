import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { Wifi, Cpu, Clock, ArrowDownUp, AlertTriangle, Download } from 'lucide-react';
import { apiClient } from '../lib/api-client';
import {
  calculateRealHealthScore,
  getRssiQuality, getHeapHealth, getUptimeQuality, getHealthLabel,
} from '../lib/device-health';
import { connectActuatorWebSocket, onDeviceHeartbeat, type DeviceHeartbeat } from '../lib/actuator-ws';
import { PageHeader, Card, StatCard, Pill, ProgressRing, Btn, LoadingState, fmt } from '../components/ui';
import type { EnrichedDevice, EnrichedDeviceAlert, RealDeviceHealth, ViewMode } from '../lib/types';

function buildAlerts(d: EnrichedDevice): EnrichedDeviceAlert[] {
  const alerts: EnrichedDeviceAlert[] = [];
  if (d.rssi !== null && d.rssi < -80) {
    alerts.push({
      type: 'rssi_low',
      severity: d.rssi < -90 ? 'critical' : 'warning',
      message: `Weak signal (${d.rssi} dBm)`,
    });
  }
  if (d.freeHeap !== null && d.freeHeap < 20000) {
    alerts.push({
      type: 'heap_low',
      severity: d.freeHeap < 10000 ? 'critical' : 'warning',
      message: `Low memory (${fmt(d.freeHeap)} bytes free)`,
    });
  }
  if (d.status !== 'online') {
    alerts.push({
      type: 'offline',
      severity: 'critical',
      message: 'Device is offline',
    });
  }
  // Firmware version check
  const fw = d.firmwareVersion;
  if (fw && fw !== 'N/A' && fw !== 'unknown' && !fw.startsWith('2.')) {
    alerts.push({
      type: 'firmware_old',
      severity: 'warning',
      message: `Firmware ${fw} may be outdated`,
    });
  }
  return alerts;
}

function formatUptime(seconds: number | null): string {
  if (seconds === null) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function exportHealthCSV(devices: EnrichedDevice[]) {
  const rows = ['Device,RSSI (dBm),Free Heap (bytes),Uptime (s),Health Score,Recorded At'];
  for (const d of devices) {
    for (const h of d.history) {
      rows.push(`${d.id},${h.rssi ?? ''},${h.free_heap ?? ''},${h.uptime_seconds ?? ''},${d.healthScore},${h.recorded_at}`);
    }
  }
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `device-health-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DeviceHealthDashboard() {
  const [devices, setDevices] = useState<EnrichedDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>('overview');
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [historyLimit, setHistoryLimit] = useState(50);

  const loadHealth = useCallback(async () => {
    setLoading(true);
    try {
      const devicesList = await apiClient.getDevices();
      const results: EnrichedDevice[] = [];

      for (const d of devicesList) {
        try {
          const [health, history] = await Promise.all([
            apiClient.getDeviceHealth(d.id),
            apiClient.getDeviceHealthHistory(d.id, historyLimit),
          ]);

          const rssi = health.rssi ?? null;
          const freeHeap = health.free_heap ?? null;
          const uptimeSec = health.uptime_seconds ?? null;

          const rssiQuality = getRssiQuality(rssi);
          const heapHealth = getHeapHealth(freeHeap);
          const uptimeQuality = getUptimeQuality(uptimeSec);
          const healthScore = calculateRealHealthScore(rssiQuality, heapHealth, uptimeQuality);

          const enriched: EnrichedDevice = {
            id: d.id,
            name: d.name || d.id,
            type: d.type || 'Generic',
            status: d.status || 'unknown',
            firmwareVersion: health.firmware_version || d.metadata?.firmware_version || 'N/A',
            ipAddress: health.ip_address || '—',
            rssi,
            freeHeap,
            uptimeSeconds: uptimeSec,
            wifiChannel: health.wifi_channel ?? null,
            cpuFreq: health.cpu_freq ?? null,
            healthScore,
            rssiQuality,
            heapHealth,
            uptimeQuality,
            lastSeen: d.last_seen || new Date().toISOString(),
            recordedAt: health.recorded_at || null,
            history: Array.isArray(history) ? history : [],
            alerts: [],
          };
          enriched.alerts = buildAlerts(enriched);
          results.push(enriched);
        } catch {
          results.push({
            id: d.id,
            name: d.name || d.id,
            type: d.type || 'Generic',
            status: 'offline',
            firmwareVersion: 'N/A',
            ipAddress: '—',
            rssi: null,
            freeHeap: null,
            uptimeSeconds: null,
            wifiChannel: null,
            cpuFreq: null,
            healthScore: 0,
            rssiQuality: 0,
            heapHealth: 0,
            uptimeQuality: 0,
            lastSeen: d.last_seen || new Date().toISOString(),
            recordedAt: null,
            history: [],
            alerts: [{ type: 'offline', severity: 'critical', message: 'No health data available' }],
          });
        }
      }

      setDevices(results);
    } catch (err) {
      console.error('Failed to load device health:', err);
    } finally {
      setLoading(false);
    }
  }, [historyLimit]);

  useEffect(() => {
    loadHealth();
    const interval = setInterval(loadHealth, 30000);
    return () => clearInterval(interval);
  }, [loadHealth]);

  // Real-time heartbeat updates via WebSocket
  useEffect(() => {
    connectActuatorWebSocket();
    const unsub = onDeviceHeartbeat((hb: DeviceHeartbeat) => {
      setDevices(prev => prev.map(d => {
        if (d.id !== hb.device) return d;
        const rssiQuality = getRssiQuality(hb.rssi);
        const heapHealth = getHeapHealth(hb.freeHeap);
        const uptimeQuality = getUptimeQuality(hb.uptime);
        const healthScore = calculateRealHealthScore(rssiQuality, heapHealth, uptimeQuality);
        const updated: EnrichedDevice = {
          ...d,
          rssi: hb.rssi,
          freeHeap: hb.freeHeap,
          uptimeSeconds: hb.uptime,
          firmwareVersion: hb.fwVersion || d.firmwareVersion,
          ipAddress: hb.ip || d.ipAddress,
          wifiChannel: hb.wifiChannel ?? d.wifiChannel,
          cpuFreq: hb.cpuFreq ?? d.cpuFreq,
          rssiQuality,
          heapHealth,
          uptimeQuality,
          healthScore,
          lastSeen: new Date(hb.timestamp).toISOString(),
          recordedAt: new Date(hb.timestamp).toISOString(),
          status: 'online',
        };
        updated.alerts = buildAlerts(updated);
        return updated;
      }));
    });
    return unsub;
  }, []);

  const allAlerts = useMemo(() =>
    devices.flatMap(d => d.alerts.map(a => ({ ...a, deviceId: d.id, deviceName: d.name }))),
    [devices],
  );

  const avgHealth = useMemo(() =>
    devices.length > 0 ? Math.round(devices.reduce((s, d) => s + d.healthScore, 0) / devices.length) : 0,
    [devices],
  );

  const onlineCount = useMemo(() => devices.filter(d => d.status === 'online').length, [devices]);

  const activeDevice = useMemo(() =>
    devices.find(d => d.id === selectedDevice) || null,
    [devices, selectedDevice],
  );

  const chartData = useMemo(() => {
    if (!activeDevice || activeDevice.history.length === 0) return [];
    return [...activeDevice.history].reverse().map(h => ({
      time: new Date(h.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      rssi: h.rssi,
      heap: h.free_heap ? Math.round(h.free_heap / 1024) : null,
      uptime: h.uptime_seconds ? Math.round(h.uptime_seconds / 60) : null,
    }));
  }, [activeDevice]);

  const getAccent = (score: number): 'emerald' | 'amber' | 'rose' => {
    if (score >= 80) return 'emerald';
    if (score >= 60) return 'amber';
    return 'rose';
  };

  const getSeverityPill = (severity: string) => severity === 'critical' ? 'rose' as const : 'amber' as const;

  return (
    <div>
      <PageHeader
        title="Device Health Dashboard"
        subtitle={`Real-time monitoring • ${onlineCount}/${devices.length} online • Auto-refresh 30s`}
        right={
          <div className="flex gap-2">
            <Btn variant="ghost" size="sm" onClick={() => exportHealthCSV(devices)}>
              <Download size={14} /> Export CSV
            </Btn>
            <Btn variant={view === 'overview' ? 'primary' : 'ghost'} size="sm" onClick={() => setView('overview')}>
              Overview
            </Btn>
            <Btn variant={view === 'comparison' ? 'primary' : 'ghost'} size="sm" onClick={() => setView('comparison')}>
              Compare
            </Btn>
            <Btn variant={view === 'alerts' ? 'primary' : 'ghost'} size="sm" onClick={() => setView('alerts')}>
              Alerts {allAlerts.length > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[var(--rose)] text-white text-[10px]">{allAlerts.length}</span>}
            </Btn>
          </div>
        }
      />

      {loading ? (
        <LoadingState label="Loading device health…" />
      ) : devices.length === 0 ? (
        <Card hover={false} className="text-center py-12 text-[var(--text-tertiary)]">
          No devices found. Connect a device to see health data.
        </Card>
      ) : (
        <>
          {/* Summary row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <StatCard label="DEVICES" value={devices.length} accent="cyan" icon={<Cpu size={18} />} />
            <StatCard label="ONLINE" value={onlineCount} accent="emerald" icon={<Wifi size={18} />} />
            <StatCard label="AVG HEALTH" value={avgHealth} unit="%" accent={getAccent(avgHealth)} icon={<ArrowDownUp size={18} />} />
            <StatCard label="FW OUTDATED" value={devices.filter(d => d.firmwareVersion !== 'N/A' && !d.firmwareVersion.startsWith('2.')).length} accent="amber" icon={<AlertTriangle size={18} />} />
            <StatCard label="ALERTS" value={allAlerts.length} accent={allAlerts.length > 0 ? 'rose' : 'emerald'} icon={<AlertTriangle size={18} />} />
          </div>

          {/* Alerts View */}
          {view === 'alerts' && (
            <Card hover={false} className="mb-6">
              <div className="section-label mb-3">ACTIVE HEALTH ALERTS</div>
              {allAlerts.length === 0 ? (
                <div className="text-sm text-[var(--text-tertiary)] py-4">No active alerts. All devices healthy.</div>
              ) : (
                <div className="space-y-2">
                  {allAlerts.map((a, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-[var(--radius-md)] bg-white/[0.03] border border-[var(--border)]">
                      <div className="flex items-center gap-3">
                        <AlertTriangle size={16} className={a.severity === 'critical' ? 'text-[var(--rose)]' : 'text-[var(--amber)]'} />
                        <div>
                          <span className="font-medium text-[var(--text-primary)] text-sm">{a.deviceName}</span>
                          <span className="text-[var(--text-tertiary)] text-sm ml-2">— {a.message}</span>
                        </div>
                      </div>
                      <Pill tone={getSeverityPill(a.severity)}>{a.severity.toUpperCase()}</Pill>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Comparison View */}
          {view === 'comparison' && (
            <Card hover={false} className="mb-6">
              <div className="section-label mb-3">DEVICE COMPARISON</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[var(--text-tertiary)] border-b border-[var(--border)]">
                      <th className="text-left py-2 pr-4 font-medium">Device</th>
                      <th className="text-left py-2 pr-4 font-medium">Status</th>
                      <th className="text-right py-2 pr-4 font-medium">RSSI</th>
                      <th className="text-right py-2 pr-4 font-medium">Heap</th>
                      <th className="text-right py-2 pr-4 font-medium">Uptime</th>
                      <th className="text-right py-2 pr-4 font-medium">Health</th>
                      <th className="text-left py-2 pr-4 font-medium">Firmware</th>
                      <th className="text-left py-2 font-medium">Alerts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {devices.map(d => (
                      <tr key={d.id} className="border-b border-[var(--border)] hover:bg-white/[0.02]">
                        <td className="py-2.5 pr-4 font-medium text-[var(--text-primary)]">{d.name}</td>
                        <td className="py-2.5 pr-4">
                          <Pill tone={d.status === 'online' ? 'emerald' : 'rose'}>{d.status.toUpperCase()}</Pill>
                        </td>
                        <td className="py-2.5 pr-4 text-right font-mono text-[var(--text-secondary)]">
                          {d.rssi !== null ? `${d.rssi} dBm` : '—'}
                        </td>
                        <td className="py-2.5 pr-4 text-right font-mono text-[var(--text-secondary)]">
                          {d.freeHeap !== null ? `${fmt(d.freeHeap)} B` : '—'}
                        </td>
                        <td className="py-2.5 pr-4 text-right font-mono text-[var(--text-secondary)]">
                          {formatUptime(d.uptimeSeconds)}
                        </td>
                        <td className="py-2.5 pr-4 text-right">
                          <span className={`font-semibold ${getAccent(d.healthScore) === 'emerald' ? 'text-[var(--emerald)]' : getAccent(d.healthScore) === 'amber' ? 'text-[var(--amber)]' : 'text-[var(--rose)]'}`}>
                            {d.healthScore}%
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 font-mono text-xs">
                          <Pill tone={d.firmwareVersion && !d.firmwareVersion.startsWith('2.') && d.firmwareVersion !== 'N/A' ? 'amber' : 'emerald'}>
                            {d.firmwareVersion}
                          </Pill>
                        </td>
                        <td className="py-2.5">
                          <div className="flex gap-1">
                            {d.alerts.length > 0 ? d.alerts.slice(0, 2).map((a, i) => (
                              <Pill key={i} tone={a.severity === 'critical' ? 'rose' : 'amber'} className="text-[9px]">{a.type.replace('_', ' ')}</Pill>
                            )) : <span className="text-xs text-[var(--text-tertiary)]">OK</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Device Cards + Charts */}
          <div className="grid lg:grid-cols-3 gap-5">
            {/* Device list */}
            <div className={`${view !== 'overview' ? 'lg:col-span-3' : ''} space-y-3`}>
              <div className="section-label">DEVICES</div>
              {devices.map(d => (
                <Card
                  key={d.id}
                  onClick={() => { setSelectedDevice(d.id); setView('overview'); }}
                  className={`cursor-pointer transition-all ${selectedDevice === d.id ? 'ring-2 ring-[var(--emerald)]' : ''}`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="font-semibold text-[var(--text-primary)]">{d.name}</div>
                      <div className="text-xs text-[var(--text-tertiary)] mt-0.5">
                        {d.type} • {d.firmwareVersion}
                      </div>
                    </div>
                    <ProgressRing value={d.healthScore} size={42} strokeWidth={3} accent={getAccent(d.healthScore)} />
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-xs mb-3">
                    <div>
                      <div className="text-[var(--text-tertiary)] mb-0.5">RSSI</div>
                      <div className="font-mono font-semibold text-[var(--text-secondary)]">
                        {d.rssi !== null ? `${d.rssi}` : '—'}
                        {d.rssi !== null && <span className="text-[var(--text-disabled)]"> dBm</span>}
                      </div>
                    </div>
                    <div>
                      <div className="text-[var(--text-tertiary)] mb-0.5">Heap</div>
                      <div className="font-mono font-semibold text-[var(--text-secondary)]">
                        {d.freeHeap !== null ? fmt(d.freeHeap) : '—'}
                        {d.freeHeap !== null && <span className="text-[var(--text-disabled)]"> B</span>}
                      </div>
                    </div>
                    <div>
                      <div className="text-[var(--text-tertiary)] mb-0.5">Uptime</div>
                      <div className="font-mono font-semibold text-[var(--text-secondary)]">
                        {formatUptime(d.uptimeSeconds)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex gap-1.5">
                      {d.alerts.length > 0 ? (
                        d.alerts.map((a, i) => (
                          <Pill key={i} tone={a.severity === 'critical' ? 'rose' : 'amber'} className="text-[9px]">
                            {a.type === 'rssi_low' ? <Wifi size={10} /> : a.type === 'heap_low' ? <Cpu size={10} /> : <AlertTriangle size={10} />}
                            {a.type.replace('_', ' ')}
                          </Pill>
                        ))
                      ) : (
                        <Pill tone="emerald">Healthy</Pill>
                      )}
                    </div>
                    <Pill tone={d.status === 'online' ? 'emerald' : 'rose'}>
                      {d.status.toUpperCase()}
                    </Pill>
                  </div>
                </Card>
              ))}
            </div>

            {/* Detail + Charts panel */}
            {view === 'overview' && activeDevice && (
              <div className="lg:col-span-2 space-y-5">
                <Card hover={false}>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="section-label">HEALTH DETAIL — {activeDevice.name}</div>
                      <div className="text-xs text-[var(--text-tertiary)] mt-0.5">
                        Last recorded: {activeDevice.recordedAt ? new Date(activeDevice.recordedAt).toLocaleString() : 'Never'}
                      </div>
                    </div>
                    <ProgressRing value={activeDevice.healthScore} size={56} strokeWidth={5} accent={getAccent(activeDevice.healthScore)} />
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="p-3 rounded-[var(--radius-md)] bg-white/[0.03]">
                      <div className="section-label text-[10px] mb-1">SIGNAL QUALITY</div>
                      <div className="text-lg font-bold text-[var(--text-primary)]">{activeDevice.rssiQuality}%</div>
                      <div className="text-[10px] text-[var(--text-tertiary)]">{activeDevice.rssi !== null ? `${activeDevice.rssi} dBm` : 'No data'}</div>
                    </div>
                    <div className="p-3 rounded-[var(--radius-md)] bg-white/[0.03]">
                      <div className="section-label text-[10px] mb-1">MEMORY HEALTH</div>
                      <div className="text-lg font-bold text-[var(--text-primary)]">{activeDevice.heapHealth}%</div>
                      <div className="text-[10px] text-[var(--text-tertiary)]">{activeDevice.freeHeap !== null ? `${fmt(activeDevice.freeHeap)} B free` : 'No data'}</div>
                    </div>
                    <div className="p-3 rounded-[var(--radius-md)] bg-white/[0.03]">
                      <div className="section-label text-[10px] mb-1">UPTIME</div>
                      <div className="text-lg font-bold text-[var(--text-primary)]">{activeDevice.uptimeQuality}%</div>
                      <div className="text-[10px] text-[var(--text-tertiary)]">{formatUptime(activeDevice.uptimeSeconds)}</div>
                    </div>
                    <div className="p-3 rounded-[var(--radius-md)] bg-white/[0.03]">
                      <div className="section-label text-[10px] mb-1">OVERALL</div>
                      <div className={`text-lg font-bold ${getAccent(activeDevice.healthScore) === 'emerald' ? 'text-[var(--emerald)]' : getAccent(activeDevice.healthScore) === 'amber' ? 'text-[var(--amber)]' : 'text-[var(--rose)]'}`}>
                        {getHealthLabel(activeDevice.healthScore)}
                      </div>
                      <div className="text-[10px] text-[var(--text-tertiary)]">{activeDevice.healthScore}/100</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-2 rounded bg-white/[0.02]">
                      <span className="text-[var(--text-tertiary)]">IP: </span>
                      <span className="font-mono text-[var(--text-secondary)]">{activeDevice.ipAddress}</span>
                    </div>
                    <div className="p-2 rounded bg-white/[0.02]">
                      <span className="text-[var(--text-tertiary)]">WiFi Ch: </span>
                      <span className="font-mono text-[var(--text-secondary)]">{activeDevice.wifiChannel ?? '—'}</span>
                    </div>
                    <div className="p-2 rounded bg-white/[0.02]">
                      <span className="text-[var(--text-tertiary)]">CPU: </span>
                      <span className="font-mono text-[var(--text-secondary)]">{activeDevice.cpuFreq ? `${activeDevice.cpuFreq} MHz` : '—'}</span>
                    </div>
                    <div className="p-2 rounded bg-white/[0.02]">
                      <span className="text-[var(--text-tertiary)]">FW: </span>
                      <span className="font-mono text-[var(--text-secondary)]">{activeDevice.firmwareVersion}</span>
                    </div>
                  </div>
                </Card>

                {/* RSSI Trend */}
                {chartData.length > 1 && (
                  <Card hover={false}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="section-label">RSSI TREND</div>
                      <div className="flex gap-2 items-center text-[10px] text-[var(--text-tertiary)]">
                        <Clock size={12} />
                        <span>{chartData.length} samples</span>
                        <select
                          value={historyLimit}
                          onChange={e => setHistoryLimit(Number(e.target.value))}
                          className="bg-[var(--bg-2)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-secondary)]"
                        >
                          <option value={20}>20</option>
                          <option value={50}>50</option>
                          <option value={100}>100</option>
                          <option value={200}>200</option>
                        </select>
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="rssiGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--emerald)" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="var(--emerald)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} />
                        <YAxis tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} domain={['dataMin - 10', 'dataMax + 10']} />
                        <Tooltip
                          contentStyle={{ background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                          labelStyle={{ color: 'var(--text-tertiary)' }}
                        />
                        <Area type="monotone" dataKey="rssi" stroke="var(--emerald)" fill="url(#rssiGrad)" strokeWidth={2} name="RSSI (dBm)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </Card>
                )}

                {/* Heap Trend */}
                {chartData.length > 1 && (
                  <Card hover={false}>
                    <div className="section-label mb-3">MEMORY TREND (KB)</div>
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} />
                        <YAxis tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} />
                        <Tooltip
                          contentStyle={{ background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                          labelStyle={{ color: 'var(--text-tertiary)' }}
                        />
                        <Line type="monotone" dataKey="heap" stroke="var(--cyan)" strokeWidth={2} dot={false} name="Free Heap (KB)" />
                      </LineChart>
                    </ResponsiveContainer>
                  </Card>
                )}

                {/* Uptime Trend */}
                {chartData.length > 1 && (
                  <Card hover={false}>
                    <div className="section-label mb-3">UPTIME TREND (minutes)</div>
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} />
                        <YAxis tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} />
                        <Tooltip
                          contentStyle={{ background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                          labelStyle={{ color: 'var(--text-tertiary)' }}
                        />
                        <Line type="monotone" dataKey="uptime" stroke="var(--violet)" strokeWidth={2} dot={false} name="Uptime (min)" />
                      </LineChart>
                    </ResponsiveContainer>
                  </Card>
                )}

                {chartData.length <= 1 && (
                  <Card hover={false} className="text-center py-8 text-[var(--text-tertiary)] text-sm">
                    <Clock size={20} className="mx-auto mb-2 opacity-50" />
                    Trend charts will appear once multiple health samples are collected.
                    <br />Current history: {activeDevice.history.length} sample(s).
                  </Card>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
