import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { ChartGrid, ChartTooltip, CHART_TICK, CHART_CURSOR, ChartAreaGradient } from '../components/charts';
import {
  Wifi, Cpu, Clock, AlertTriangle, Download, RefreshCw, Activity,
  Power, Wrench, TrendingUp, TrendingDown, Minus, Signal, ShieldCheck, ShieldAlert,
  Gauge as GaugeIcon, BookOpen, FlaskConical, Ruler, Sigma, type LucideIcon,
} from 'lucide-react';
import { apiClient } from '../lib/api-client';
import {
  calculateRealHealthScore,
  getRssiQuality, getHeapHealth, getUptimeQuality, getCpuHealth, getHealthLabel,
  getHealthTrend, getMemoryTrend, estimateRemainingUsefulLife, getHealthBreakdown,
  getFleetStats, getMaintenanceActions, buildDeviceAlerts, formatUptime, formatBytes,
} from '../lib/device-health';
import {
  trendConfidence, rulConfidence, rssiToDistance, rssiBandLabel,
  measurementUncertainty, ewma, theilSenSlope, HEALTH_WEIGHTS, HEALTH_BANDS,
  RSSI_BANDS, healthModelRefs, signalModelRefs, memoryModelRefs, trendModelRefs,
  rulModelRefs, uncertaintyRefs, PATH_LOSS_MODEL, type ConfidenceVerdict,
} from '../lib/device-health-science';
import { connectActuatorWebSocket, onDeviceHeartbeat, onSensorReading, type DeviceHeartbeat, type SensorReadingUpdate } from '../lib/actuator-ws';
import { PageHeader, Card, StatCard, Pill, ProgressRing, Btn, LoadingState, Toggle, fmt, SourceChips } from '../components/ui';
import { useI18n } from '../lib/i18n';
import { analyzeSensorHealth, buildSensorHistory, SENSOR_STATUS_META } from '../lib/sensor-health';
import { toCitation } from '../lib/ai-references';
import type {
  EnrichedDevice, EnrichedDeviceAlert, HealthComponentScore, HealthTrendInfo,
  MaintenanceAction, RealDeviceHealth, DeviceSensorReport, ViewMode, FleetStats,
} from '../lib/types';

type TFunc = (key: string, fallback?: string, params?: Record<string, string>) => string;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function healthScores(d: EnrichedDevice): number[] {
  return d.history.map(h =>
    calculateRealHealthScore(
      getRssiQuality(h.rssi ?? null),
      getHeapHealth(h.free_heap ?? null),
      getUptimeQuality(h.uptime_seconds ?? null),
    ),
  );
}

function scoreColor(score: number): string {
  if (score >= 80) return 'var(--emerald)';
  if (score >= 60) return 'var(--amber)';
  return 'var(--rose)';
}

function scoreGrad(score: number): string {
  if (score >= 80) return 'linear-gradient(90deg, #059669, #34d399)';
  if (score >= 60) return 'linear-gradient(90deg, #d97706, #fbbf24)';
  return 'linear-gradient(90deg, #e11d48, #fb7185)';
}

function exportHealthCSV(devices: EnrichedDevice[]) {
  const rows = ['Device,RSSI (dBm),Free Heap (bytes),Uptime (s),Health Score,CPU (MHz),Recorded At'];
  for (const d of devices) {
    for (const h of d.history) {
      rows.push(`${d.id},${h.rssi ?? ''},${h.free_heap ?? ''},${h.uptime_seconds ?? ''},${d.healthScore},${h.cpu_freq ?? ''},${h.recorded_at}`);
    }
  }
  downloadCSV(rows, `device-health-${new Date().toISOString().slice(0, 10)}.csv`);
}

function exportSensorCSV(devices: EnrichedDevice[]) {
  const rows = ['Device,Sensor,Status,Severity,Reason'];
  for (const d of devices) {
    for (const r of d.sensorReports) {
      rows.push(`${d.id},${r.key},${r.status},${r.severity},"${(r.reason || '').replace(/"/g, "'")}"`);
    }
  }
  downloadCSV(rows, `sensor-health-${new Date().toISOString().slice(0, 10)}.csv`);
}

function downloadCSV(rows: string[], filename: string) {
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toReport(reports: ReturnType<typeof analyzeSensorHealth>): DeviceSensorReport[] {
  return reports.map(r => ({
    key: r.key,
    status: r.status,
    reason: r.reason,
    severity: r.severity,
    crossCheckSensor: r.crossCheckSensor,
  }));
}

function sensorAlerts(reports: DeviceSensorReport[], t: TFunc): EnrichedDeviceAlert[] {
  const alerts: EnrichedDeviceAlert[] = [];
  for (const r of reports) {
    if (r.status === 'failed') {
      alerts.push({ type: 'sensor', severity: 'critical', message: t('deviceHealth.sensorAlert.failed', 'Sensor {key} failed — {reason}', { key: r.key, reason: r.reason || t('deviceHealth.noValidData', 'no valid data') }) });
    } else if (r.status === 'degraded') {
      alerts.push({ type: 'sensor', severity: 'warning', message: t('deviceHealth.sensorAlert.degraded', 'Sensor {key} degraded — {reason}', { key: r.key, reason: r.reason || t('deviceHealth.offBaseline', 'off baseline') }) });
    }
  }
  return alerts;
}

function alertTypeLabel(t: TFunc, type: string): string {
  return t(`deviceHealth.alertType.${type}`, type.replace('_', ' '));
}

const ACTION_ICONS: Record<MaintenanceAction['icon'], LucideIcon> = {
  signal: Signal,
  cpu: Cpu,
  clock: Clock,
  download: Download,
  power: Power,
  wifi: Wifi,
};

function actionText(t: TFunc, a: MaintenanceAction, d: EnrichedDevice): { title: string; description: string } {
  switch (a.id) {
    case 'offline':
      return {
        title: t('deviceHealth.action.offline.title', 'Device offline'),
        description: t('deviceHealth.action.offline.desc', 'Check power source and network connectivity, then verify the device is booting.'),
      };
    case 'signal':
      return {
        title: t('deviceHealth.action.signal.title', 'Weak Wi-Fi signal'),
        description: t('deviceHealth.action.signal.desc', 'RSSI {rssi} dBm — move the device closer to the gateway or add a high-gain antenna.', { rssi: String(d.rssi ?? '') }),
      };
    case 'heap-leak':
      return {
        title: t('deviceHealth.action.heapLeak.title', 'Memory leak detected'),
        description: t('deviceHealth.action.heapLeak.desc', 'Free heap falling ~{rate} KB/hour. Restart the device and inspect the firmware for leaks.', { rate: String(Math.abs(d.memTrend?.rateKBh ?? 0)) }),
      };
    case 'heap-low':
      return {
        title: t('deviceHealth.action.heapLow.title', 'Low free memory'),
        description: t('deviceHealth.action.heapLow.desc', 'Only {heap} free. A reboot will reclaim memory.', { heap: formatBytes(d.freeHeap ?? 0) }),
      };
    case 'uptime':
      return {
        title: t('deviceHealth.action.uptime.title', 'Long uptime'),
        description: t('deviceHealth.action.uptime.desc', 'Running {uptime} — plan a maintenance reboot during a quiet window.', { uptime: formatUptime(d.uptimeSeconds) }),
      };
    case 'firmware':
      return {
        title: t('deviceHealth.action.firmware.title', 'Firmware update available'),
        description: t('deviceHealth.action.firmware.desc', 'Device is on {fw}. Update to the latest 2.x build for fixes and improvements.', { fw: d.firmwareVersion }),
      };
    case 'cpu':
      return {
        title: t('deviceHealth.action.cpu.title', 'CPU throttled'),
        description: t('deviceHealth.action.cpu.desc', 'CPU at {freq} MHz — check thermals and the power profile.', { freq: String(d.cpuFreq ?? '') }),
      };
    case 'channel':
      return {
        title: t('deviceHealth.action.channel.title', 'Suboptimal Wi-Fi channel'),
        description: t('deviceHealth.action.channel.desc', 'Channel {channel} can overlap neighbouring APs — prefer channels 1, 6 or 11.', { channel: String(d.wifiChannel ?? '') }),
      };
    case 'trend':
      return {
        title: t('deviceHealth.action.trend.title', 'Health degrading'),
        description: t('deviceHealth.action.trend.desc', 'Health score falling ~{slope}/sample. Investigate the weakest subsystem below.', { slope: Math.abs(d.healthTrend?.slope ?? 0).toFixed(1) }),
      };
    default:
      return { title: a.title, description: a.description };
  }
}

/* ------------------------------------------------------------------ */
/*  Small presentational components                                    */
/* ------------------------------------------------------------------ */

function Sparkline({ values, color = 'var(--emerald)', width = 96, height = 28 }: {
  values: number[]; color?: string; width?: number; height?: number;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values
    .map((v, i) => `${((i / (values.length - 1)) * width).toFixed(1)},${(height - ((v - min) / range) * (height - 4) - 2).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={width} height={height} className="overflow-visible opacity-90" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrendArrow({ direction, t }: { direction: HealthTrendInfo['direction'] | null; t: TFunc }) {
  if (!direction) return <Pill tone="slate" className="text-[9px]">{t('deviceHealth.trend.none', 'No trend')}</Pill>;
  if (direction === 'improving') return <Pill tone="emerald" className="text-[9px]"><TrendingUp size={10} /> {t('deviceHealth.trend.improving', 'Improving')}</Pill>;
  if (direction === 'degrading') return <Pill tone="rose" className="text-[9px]"><TrendingDown size={10} /> {t('deviceHealth.trend.degrading', 'Degrading')}</Pill>;
  return <Pill tone="cyan" className="text-[9px]"><Minus size={10} /> {t('deviceHealth.trend.stable', 'Stable')}</Pill>;
}

function BreakdownBars({ breakdown, t }: { breakdown: HealthComponentScore[]; t: TFunc }) {
  return (
    <div className="space-y-3">
      {breakdown.map(c => (
        <div key={c.key}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-[var(--text-secondary)] font-medium">
              {t(`deviceHealth.weight.${c.key}`, c.label)} <span className="text-[var(--text-disabled)] font-normal">· {(c.weight * 100).toFixed(0)}%</span>
            </span>
            <span className="font-mono font-semibold tabular-nums" style={{ color: scoreColor(c.score) }}>
              {c.score}% <span className="text-[var(--text-disabled)] font-normal">{c.detail || t('deviceHealth.breakdownNoData', 'No data')}</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-[var(--surface-hover)] overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${c.score}%`, background: scoreGrad(c.score) }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function SensorHealthGrid({ reports, t }: { reports: DeviceSensorReport[]; t: TFunc }) {
  if (!reports || reports.length === 0) {
    return <div className="text-xs text-[var(--text-tertiary)]">{t('deviceHealth.noSensorReadingsDevice', 'No sensor readings yet for this device.')}</div>;
  }
  const sorted = [...reports].sort((a, b) => b.severity - a.severity);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
      {sorted.map(r => {
        const meta = SENSOR_STATUS_META[r.status] ?? SENSOR_STATUS_META.unknown;
        return (
          <div
            key={r.key}
            className="rounded-[var(--radius-md)] border p-2.5"
            style={{
              borderColor: r.status === 'healthy' ? 'var(--border)' : `${meta.color}55`,
              background: r.status === 'healthy' ? 'rgba(255,255,255,0.02)' : `${meta.color}12`,
            }}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: meta.color }}>{r.key}</span>
              <Pill tone={meta.tone} className="text-[8px]">{t(`deviceHealth.sensorStatus.${r.status}`, meta.label)}</Pill>
            </div>
            <div className="text-[10px] text-[var(--text-tertiary)] leading-tight">
              {r.reason || t('deviceHealth.withinRange', 'Within expected range')}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Scientific method presentational components                         */
/* ------------------------------------------------------------------ */

function trendVerdict(d: EnrichedDevice): ConfidenceVerdict | null {
  if (!d.healthTrend) return null;
  return trendConfidence(d.healthTrend.r2 ?? 0, d.healthTrend.samples);
}

function historySpanHours(d: EnrichedDevice): number {
  const ts = d.history.filter(h => h.recorded_at).map(h => new Date(h.recorded_at).getTime());
  if (ts.length < 2) return 0;
  return (Math.max(...ts) - Math.min(...ts)) / 3600000;
}

function rulVerdict(d: EnrichedDevice): ConfidenceVerdict | null {
  if (d.rulDays === null || !d.healthTrend) return null;
  return rulConfidence(d.healthTrend.r2 ?? 0, d.healthTrend.samples, historySpanHours(d));
}

function ConfidencePill({ verdict, label, t }: { verdict: ConfidenceVerdict; label?: string; t: TFunc }) {
  const tone = verdict.level === 'high' ? ('emerald' as const) : verdict.level === 'medium' ? ('amber' as const) : ('rose' as const);
  return (
    <span title={verdict.basis}>
      <Pill tone={tone} className="text-[9px]">
        {label ? `${label} ` : ''}{t(`deviceHealth.confidence.${verdict.level}`, verdict.level.toUpperCase())} · {verdict.score}%
      </Pill>
    </span>
  );
}

function MethodCard({ icon, title, formula, note, refs, children }: {
  icon: ReactNode; title: string; formula: string; note: string;
  refs: ReturnType<typeof healthModelRefs>; children?: ReactNode;
}) {
  return (
    <Card hover={false}>
      <div className="flex items-start gap-3 mb-2">
        <div className="w-8 h-8 rounded-md flex items-center justify-center bg-[var(--emerald-dim)] text-[var(--emerald)] shrink-0">{icon}</div>
        <div className="min-w-0">
          <div className="section-label mb-1">{title}</div>
          <div className="inline-block font-mono text-[11px] text-[var(--cyan)] bg-black/20 border border-white/[0.05] rounded px-2 py-1 whitespace-pre-wrap">{formula}</div>
        </div>
      </div>
      <p className="text-xs text-[var(--text-tertiary)] leading-relaxed mb-3">{note}</p>
      {children}
      <SourceChips sources={refs} className="mt-3" />
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function DeviceHealthDashboard() {
  const { t } = useI18n();
  const [devices, setDevices] = useState<EnrichedDevice[]>([]);
  const [sensorReports, setSensorReports] = useState<Record<string, DeviceSensorReport[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<ViewMode>('overview');
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [historyLimit, setHistoryLimit] = useState(50);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [alertFilter, setAlertFilter] = useState<'all' | 'warning' | 'critical'>('all');
  const sensorBufferRef = useRef<Record<string, Record<string, number[]>>>({});

  const loadHealth = useCallback(async (silent = false, refreshBuffers = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const devicesList = await apiClient.getDevices();
      const results: EnrichedDevice[] = [];
      const nextReports: Record<string, DeviceSensorReport[]> = {};
      if (refreshBuffers) sensorBufferRef.current = {};

      await Promise.all(devicesList.map(async (d) => {
        try {
          const [health, history, readings] = await Promise.all([
            apiClient.getDeviceHealth(d.id),
            apiClient.getDeviceHealthHistory(d.id, historyLimit),
            sensorBufferRef.current[d.id]
              ? Promise.resolve(null)
              : apiClient.getSensorReadings(50, d.id).catch(() => []),
          ]);
          const hist: RealDeviceHealth[] = Array.isArray(history) ? history : [];
          const rssi = health?.rssi ?? null;
          const freeHeap = health?.free_heap ?? null;
          const uptimeSec = health?.uptime_seconds ?? null;
          const cpuFreq = health?.cpu_freq ?? null;
          const rssiQuality = getRssiQuality(rssi);
          const heapHealth = getHeapHealth(freeHeap);
          const uptimeQuality = getUptimeQuality(uptimeSec);
          const cpuHealth = getCpuHealth(cpuFreq);
          const healthScore = calculateRealHealthScore(rssiQuality, heapHealth, uptimeQuality);

          const base = {
            id: d.id,
            name: d.name || d.id,
            type: d.type || 'Generic',
            status: d.status || 'unknown',
            firmwareVersion: health?.firmware_version || d.metadata?.firmware_version || 'N/A',
            ipAddress: health?.ip_address || '—',
            rssi,
            freeHeap,
            uptimeSeconds: uptimeSec,
            wifiChannel: health?.wifi_channel ?? null,
            cpuFreq,
            rssiQuality,
            heapHealth,
            uptimeQuality,
            cpuHealth,
            lastSeen: d.last_seen || new Date().toISOString(),
            recordedAt: health?.recorded_at || null,
            history: hist,
          };

          let buffer = sensorBufferRef.current[d.id];
          if (!buffer) {
            buffer = buildSensorHistory(readings ?? []);
            sensorBufferRef.current[d.id] = buffer;
          }
          const reports = toReport(analyzeSensorHealth(buffer));

          const enriched: EnrichedDevice = {
            ...base,
            healthScore,
            healthTrend: getHealthTrend(hist),
            memTrend: getMemoryTrend(hist),
            rulDays: estimateRemainingUsefulLife(hist),
            breakdown: getHealthBreakdown(base),
            sensorReports: reports,
            alerts: [],
          };
          enriched.alerts = [...buildDeviceAlerts(enriched), ...sensorAlerts(reports, t)];
          results.push(enriched);
          nextReports[d.id] = reports;
        } catch {
          const fallback: EnrichedDevice = {
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
            cpuHealth: 0,
            breakdown: getHealthBreakdown({ rssi: null, freeHeap: null, uptimeSeconds: null, rssiQuality: 0, heapHealth: 0, uptimeQuality: 0 }),
            healthTrend: null,
            memTrend: null,
            rulDays: null,
            sensorReports: [],
            lastSeen: d.last_seen || new Date().toISOString(),
            recordedAt: null,
            history: [],
            alerts: [{ type: 'offline', severity: 'critical', message: t('deviceHealth.noHealthData', 'No health data available') }],
          };
          results.push(fallback);
        }
      }));

      setDevices(results);
      setSensorReports(nextReports);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to load device health:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [historyLimit]);

  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => loadHealth(true), 30000);
    return () => clearInterval(id);
  }, [autoRefresh, loadHealth]);

  // Real-time heartbeat + sensor updates via WebSocket
  useEffect(() => {
    connectActuatorWebSocket();
    const unsubHeartbeat = onDeviceHeartbeat((hb: DeviceHeartbeat) => {
      setDevices(prev => prev.map(d => {
        if (d.id !== hb.device) return d;
        const rssi = hb.rssi ?? null;
        const freeHeap = hb.freeHeap ?? null;
        const uptime = hb.uptime ?? null;
        const cpuFreq = hb.cpuFreq ?? null;
        const rssiQuality = getRssiQuality(rssi);
        const heapHealth = getHeapHealth(freeHeap);
        const uptimeQuality = getUptimeQuality(uptime);
        const cpuHealth = getCpuHealth(cpuFreq);
        const healthScore = calculateRealHealthScore(rssiQuality, heapHealth, uptimeQuality);
        const synth: RealDeviceHealth = {
          recorded_at: new Date(hb.timestamp).toISOString(),
          rssi,
          free_heap: freeHeap,
          uptime_seconds: uptime,
          firmware_version: hb.fwVersion,
          ip_address: hb.ip,
          wifi_channel: hb.wifiChannel,
          cpu_freq: cpuFreq,
        };
        const history = [...d.history, synth].slice(-200);
        const base = {
          ...d,
          rssi,
          freeHeap,
          uptimeSeconds: uptime,
          cpuFreq,
          firmwareVersion: hb.fwVersion || d.firmwareVersion,
          ipAddress: hb.ip || d.ipAddress,
          wifiChannel: hb.wifiChannel ?? d.wifiChannel,
          rssiQuality,
          heapHealth,
          uptimeQuality,
          cpuHealth,
          lastSeen: new Date(hb.timestamp).toISOString(),
          recordedAt: new Date(hb.timestamp).toISOString(),
          status: 'online',
          history,
        };
        const updated: EnrichedDevice = {
          ...base,
          healthScore,
          healthTrend: getHealthTrend(history),
          memTrend: getMemoryTrend(history),
          rulDays: estimateRemainingUsefulLife(history),
          breakdown: getHealthBreakdown(base),
        };
        updated.alerts = buildDeviceAlerts(updated);
        return updated;
      }));
    });

    const unsubReading = onSensorReading((reading: SensorReadingUpdate) => {
      const { device, sensors } = reading;
      if (!device || !sensors) return;
      const buffer = sensorBufferRef.current[device] ?? (sensorBufferRef.current[device] = {});
      for (const [k, v] of Object.entries(sensors)) {
        const n = Number(v);
        if (v === null || v === undefined || isNaN(n)) continue;
        const arr = buffer[k] ?? (buffer[k] = []);
        arr.push(n);
        if (arr.length > 60) arr.shift();
      }
      const reports = toReport(analyzeSensorHealth(buffer));
      setSensorReports(prev => ({ ...prev, [device]: reports }));
      setDevices(prev => prev.map(d => {
        if (d.id !== device) return d;
        return { ...d, sensorReports: reports, alerts: [...buildDeviceAlerts(d), ...sensorAlerts(reports, t)] };
      }));
    });

    return () => {
      unsubHeartbeat();
      unsubReading();
    };
  }, []);

  const stats: FleetStats = useMemo(() => getFleetStats(devices), [devices]);

  const allAlerts = useMemo(() =>
    devices.flatMap(d => d.alerts.map(a => ({ ...a, deviceId: d.id, deviceName: d.name }))),
    [devices],
  );

  const filteredAlerts = useMemo(() =>
    allAlerts.filter(a => alertFilter === 'all' || a.severity === alertFilter),
    [allAlerts, alertFilter],
  );

  const activeDevice = useMemo(() =>
    devices.find(d => d.id === selectedDevice) || null,
    [devices, selectedDevice],
  );

  const methodDevice = activeDevice ?? devices[0] ?? null;

  const chartData = useMemo(() => {
    if (!activeDevice || activeDevice.history.length === 0) return [];
    return [...activeDevice.history].reverse().map(h => ({
      time: new Date(h.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      rssi: h.rssi,
      heap: h.free_heap ? Math.round(h.free_heap / 1024) : null,
      uptime: h.uptime_seconds ? Math.round(h.uptime_seconds / 60) : null,
    }));
  }, [activeDevice]);

  const healthChartData = useMemo(() => {
    if (!activeDevice) return [];
    const scores = activeDevice.history.map(h =>
      calculateRealHealthScore(
        getRssiQuality(h.rssi ?? null),
        getHeapHealth(h.free_heap ?? null),
        getUptimeQuality(h.uptime_seconds ?? null),
      ),
    );
    const smoothed = ewma(scores, 0.35);
    return activeDevice.history.map((h, i) => ({
      time: new Date(h.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      score: scores[i],
      smoothed: Math.round(smoothed[i] * 10) / 10,
    })).reverse();
  }, [activeDevice]);

  const fleetSensors = useMemo(() => Object.values(sensorReports).flat(), [sensorReports]);
  const fleetSensorStats = useMemo(() => {
    const total = fleetSensors.length;
    const healthy = fleetSensors.filter(r => r.status === 'healthy').length;
    const degraded = fleetSensors.filter(r => r.status === 'degraded').length;
    const failed = fleetSensors.filter(r => r.status === 'failed').length;
    const overall = total > 0 ? Math.round(((healthy * 100 + degraded * 50) / total)) : 0;
    return { total, healthy, degraded, failed, overall };
  }, [fleetSensors]);

  const sensorsByKey = useMemo(() => {
    const map: Record<string, DeviceSensorReport[]> = {};
    for (const r of fleetSensors) (map[r.key] ?? (map[r.key] = [])).push(r);
    return map;
  }, [fleetSensors]);

  const dist = stats.distribution;
  const distTotal = Math.max(1, stats.count);

  const tabBtn = (mode: ViewMode, label: string, count?: number) => (
    <Btn variant={view === mode ? 'primary' : 'ghost'} size="sm" onClick={() => setView(mode)}>
      {label}
      {count !== undefined && count > 0 && (
        <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[var(--rose)] text-white text-[10px]">{count}</span>
      )}
    </Btn>
  );

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader
        title={t('deviceHealth.title', 'Device Health Dashboard')}
        subtitle={t('deviceHealth.subtitle', 'Fleet health • {online}/{total} online • {atRisk} at risk • auto-refresh {auto}', {
          online: String(stats.online),
          total: String(stats.count),
          atRisk: String(stats.atRisk),
          auto: autoRefresh ? t('deviceHealth.on', 'on') : t('deviceHealth.off', 'off'),
        })}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 mr-1 text-[11px] text-[var(--text-tertiary)]">
              {lastUpdated && <span>{t('deviceHealth.updated', 'Updated {time}', { time: lastUpdated.toLocaleTimeString() })}</span>}
              <Toggle checked={autoRefresh} onChange={setAutoRefresh} label={t('deviceHealth.autoRefresh', 'Auto-refresh')} />
            </div>
            <Btn variant="ghost" size="sm" loading={refreshing} onClick={() => loadHealth(true, true)}>
              <RefreshCw size={14} /> {t('deviceHealth.refresh', 'Refresh')}
            </Btn>
            <Btn variant="ghost" size="sm" onClick={() => exportHealthCSV(devices)}>
              <Download size={14} /> {t('deviceHealth.healthCsv', 'Health CSV')}
            </Btn>
            <Btn variant="ghost" size="sm" onClick={() => exportSensorCSV(devices)}>
              <Activity size={14} /> {t('deviceHealth.sensorsCsv', 'Sensors CSV')}
            </Btn>
          </div>
        }
      />

      {loading ? (
        <LoadingState label={t('deviceHealth.loading', 'Loading device health…')} />
      ) : devices.length === 0 ? (
        <Card hover={false} className="text-center py-12 text-[var(--text-tertiary)]">
          {t('deviceHealth.noDevices', 'No devices found. Connect a device to see health data.')}
        </Card>
      ) : (
        <>
          {/* View tabs */}
          <div className="flex flex-wrap gap-2 mb-6">
            {tabBtn('overview', t('deviceHealth.tab.overview', 'Overview'))}
            {tabBtn('sensors', t('deviceHealth.view.sensors', 'Sensors'), fleetSensorStats.total - fleetSensorStats.healthy)}
            {tabBtn('comparison', t('deviceHealth.view.compare', 'Compare'))}
            {tabBtn('alerts', t('deviceHealth.tab.alerts', 'Alerts'), allAlerts.length)}
            {tabBtn('method', t('deviceHealth.view.methodology', 'Methodology'))}
          </div>

          {/* Fleet summary */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <StatCard label={t('deviceHealth.stat.devices', 'Devices')} value={stats.count} accent="cyan" icon={<Cpu size={18} />} />
            <StatCard label={t('deviceHealth.stat.online', 'Online')} value={stats.online} accent="emerald" icon={<Wifi size={18} />} />
            <StatCard label={t('deviceHealth.stat.avgHealth', 'Avg Health')} value={stats.avgScore} unit="%" accent={stats.avgScore >= 80 ? 'emerald' : stats.avgScore >= 60 ? 'amber' : 'rose'} icon={<GaugeIcon size={18} />} />
            <StatCard label={t('deviceHealth.stat.atRisk', 'At Risk')} value={stats.atRisk} accent={stats.atRisk > 0 ? 'rose' : 'emerald'} icon={<AlertTriangle size={18} />} />
            <StatCard label={t('deviceHealth.stat.activeAlerts', 'Active Alerts')} value={allAlerts.length} accent={allAlerts.length > 0 ? 'rose' : 'emerald'} icon={<ShieldAlert size={18} />} />
          </div>

          {/* Fleet distribution */}
          <div className="glass-panel rounded-2xl p-5 mb-6 animate-fade-slide-up">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <GaugeIcon size={14} className="text-[var(--cyan)]" />
              <h3 className="text-sm font-semibold">{t('deviceHealth.fleetDistribution', 'Fleet health distribution')}</h3>
              <div className="h-px flex-1 bg-[var(--border)]" />
              {stats.avgRssi !== null && <Pill tone="cyan">{t('deviceHealth.avgRssi', 'avg RSSI {value} dBm', { value: String(stats.avgRssi) })}</Pill>}
              <Pill tone={stats.avgScore >= 80 ? 'emerald' : stats.avgScore >= 60 ? 'amber' : 'rose'}>{t('deviceHealth.avgScore', 'avg {value}%', { value: String(stats.avgScore) })}</Pill>
            </div>
            <div className="flex h-3 rounded-full overflow-hidden bg-[var(--surface-hover)] mb-2.5">
              {dist.excellent > 0 && <div className="h-full transition-all duration-700" style={{ width: `${(dist.excellent / distTotal) * 100}%`, background: 'linear-gradient(90deg,#059669,#34d399)' }} title={`${t('deviceHealth.dist.excellent', 'Excellent')}: ${dist.excellent}`} />}
              {dist.good > 0 && <div className="h-full transition-all duration-700" style={{ width: `${(dist.good / distTotal) * 100}%`, background: 'linear-gradient(90deg,#0d9488,#2dd4bf)' }} title={`${t('deviceHealth.dist.good', 'Good')}: ${dist.good}`} />}
              {dist.fair > 0 && <div className="h-full transition-all duration-700" style={{ width: `${(dist.fair / distTotal) * 100}%`, background: 'linear-gradient(90deg,#d97706,#fbbf24)' }} title={`${t('deviceHealth.dist.fair', 'Fair')}: ${dist.fair}`} />}
              {dist.poor > 0 && <div className="h-full transition-all duration-700" style={{ width: `${(dist.poor / distTotal) * 100}%`, background: 'linear-gradient(90deg,#ea580c,#fb923c)' }} title={`${t('deviceHealth.dist.poor', 'Poor')}: ${dist.poor}`} />}
              {dist.critical > 0 && <div className="h-full transition-all duration-700" style={{ width: `${(dist.critical / distTotal) * 100}%`, background: 'linear-gradient(90deg,#e11d48,#fb7185)' }} title={`${t('deviceHealth.dist.critical', 'Critical')}: ${dist.critical}`} />}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[var(--text-tertiary)]">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#34d399]" /> {t('deviceHealth.dist.excellent', 'Excellent')} ({dist.excellent})</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#2dd4bf]" /> {t('deviceHealth.dist.good', 'Good')} ({dist.good})</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#fbbf24]" /> {t('deviceHealth.dist.fair', 'Fair')} ({dist.fair})</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#fb923c]" /> {t('deviceHealth.dist.poor', 'Poor')} ({dist.poor})</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#fb7185]" /> {t('deviceHealth.dist.critical', 'Critical')} ({dist.critical})</span>
            </div>
          </div>

          {/* ALERTS VIEW */}
          {view === 'alerts' && (
            <Card hover={false} className="mb-6">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <div className="section-label mb-0 mr-auto">{t('deviceHealth.activeAlerts', 'Active Health Alerts')}</div>
                {(['all', 'warning', 'critical'] as const).map(f => (
                  <Btn key={f} variant={alertFilter === f ? 'primary' : 'ghost'} size="sm" onClick={() => setAlertFilter(f)}>
                    {f === 'all' ? t('deviceHealth.severity.all', 'All') : f === 'warning' ? t('deviceHealth.severity.warning', 'Warning') : t('deviceHealth.severity.critical', 'Critical')}
                    {f !== 'all' && (
                      <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px]" style={{ background: f === 'critical' ? 'var(--rose-dim)' : 'var(--amber-dim)', color: f === 'critical' ? 'var(--rose)' : 'var(--amber)' }}>
                        {allAlerts.filter(a => a.severity === f).length}
                      </span>
                    )}
                  </Btn>
                ))}
              </div>
              {filteredAlerts.length === 0 ? (
                <div className="text-sm text-[var(--text-tertiary)] py-4 flex items-center gap-2">
                  <ShieldCheck size={16} className="text-[var(--emerald)]" /> {alertFilter === 'all' ? t('deviceHealth.noAlerts', 'No alerts. All devices healthy.') : t('deviceHealth.noAlertsFiltered', 'No {filter} alerts. All devices healthy.', { filter: alertFilter === 'warning' ? t('deviceHealth.severity.warning', 'warning') : t('deviceHealth.severity.critical', 'critical') })}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredAlerts.map((a, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 p-3 rounded-[var(--radius-md)] bg-white/[0.03] border border-[var(--border)]">
                      <div className="flex items-center gap-3 min-w-0">
                        <AlertTriangle size={16} className={a.severity === 'critical' ? 'text-[var(--rose)] shrink-0' : 'text-[var(--amber)] shrink-0'} />
                        <div className="min-w-0">
                          <span className="font-medium text-[var(--text-primary)] text-sm">{a.deviceName}</span>
                          <span className="text-[var(--text-tertiary)] text-sm"> — {a.message}</span>
                        </div>
                      </div>
                      <Pill tone={a.severity === 'critical' ? 'rose' : 'amber'} className="shrink-0">{a.severity === 'critical' ? t('deviceHealth.severityLabel.critical', 'CRITICAL') : t('deviceHealth.severityLabel.warning', 'WARNING')}</Pill>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* SENSORS VIEW */}
          {view === 'sensors' && (
            <div className="space-y-6 mb-6">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <StatCard label={t('deviceHealth.stat.reports', 'Reports')} value={fleetSensorStats.total} accent="cyan" icon={<Activity size={16} />} />
                <StatCard label={t('deviceHealth.stat.healthy', 'Healthy')} value={fleetSensorStats.healthy} accent="emerald" icon={<ShieldCheck size={16} />} />
                <StatCard label={t('deviceHealth.stat.degraded', 'Degraded')} value={fleetSensorStats.degraded} accent="amber" icon={<AlertTriangle size={16} />} />
                <StatCard label={t('deviceHealth.stat.failed', 'Failed')} value={fleetSensorStats.failed} accent="rose" icon={<AlertTriangle size={16} />} />
                <StatCard label={t('deviceHealth.stat.sensorHealth', 'Sensor Health')} value={fleetSensorStats.overall} unit="%" accent={fleetSensorStats.overall >= 80 ? 'emerald' : fleetSensorStats.overall >= 60 ? 'amber' : 'rose'} icon={<GaugeIcon size={16} />} />
              </div>

              <Card hover={false}>
                <div className="flex items-center justify-between mb-3">
                  <div className="section-label mb-0">{t('deviceHealth.sensorFleetByType', 'Sensor Fleet — By Type')}</div>
                  <Pill tone="cyan">{t('deviceHealth.sensorTypes', '{count} sensor types', { count: String(Object.keys(sensorsByKey).length) })}</Pill>
                </div>
                {Object.keys(sensorsByKey).length === 0 ? (
                  <div className="text-sm text-[var(--text-tertiary)] py-4">{t('deviceHealth.noSensorReadings', 'No sensor readings available yet. Keep live mode running to build sensor health.')}</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {Object.entries(sensorsByKey).map(([key, reports]) => {
                      const healthy = reports.filter(r => r.status === 'healthy').length;
                      const degraded = reports.filter(r => r.status === 'degraded').length;
                      const failed = reports.filter(r => r.status === 'failed').length;
                      const worst = reports.reduce((m, r) => Math.max(m, r.severity), 0);
                      const reasons = reports.filter(r => r.reason).slice(0, 2).map(r => r.reason);
                      const tone = failed > 0 ? 'rose' as const : degraded > 0 ? 'amber' as const : 'emerald' as const;
                      return (
                        <div key={key} className="rounded-[var(--radius-md)] border p-3" style={{ borderColor: tone === 'emerald' ? 'var(--border)' : tone === 'amber' ? 'rgba(251,191,36,0.3)' : 'rgba(251,113,113,0.3)', background: tone === 'emerald' ? 'rgba(255,255,255,0.02)' : tone === 'amber' ? 'rgba(251,191,36,0.06)' : 'rgba(251,113,113,0.06)' }}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-semibold uppercase tracking-wide">{key}</span>
                            <Pill tone={tone} className="text-[9px]">{reports.length} {t(reports.length > 1 ? 'deviceHealth.devices' : 'deviceHealth.device', reports.length > 1 ? 'devices' : 'device')}</Pill>
                          </div>
                          <div className="flex gap-2 mb-1.5">
                            {failed > 0 && <span className="text-[10px] text-[var(--rose)] font-semibold">{failed} {t('deviceHealth.failedWord', 'failed')}</span>}
                            {degraded > 0 && <span className="text-[10px] text-[var(--amber)] font-semibold">{degraded} {t('deviceHealth.degradedWord', 'degraded')}</span>}
                            {healthy > 0 && <span className="text-[10px] text-[var(--emerald)] font-semibold">{healthy} {t('deviceHealth.healthyWord', 'healthy')}</span>}
                          </div>
                          <div className="h-1.5 rounded-full bg-[var(--surface-hover)] overflow-hidden">
                            <div className="h-full transition-all duration-700" style={{ width: `${worst > 0 ? Math.min(100, worst) : 0}%`, background: scoreGrad(Math.max(1, 100 - worst)) }} />
                          </div>
                          {reasons.length > 0 && (
                            <div className="mt-1.5 text-[10px] text-[var(--text-tertiary)] leading-tight">
                              {reasons.join(' • ')}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* COMPARISON VIEW */}
          {view === 'comparison' && (
            <Card hover={false} className="mb-6">
              <div className="section-label mb-3">{t('deviceHealth.deviceComparison', 'Device Comparison')}</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[var(--text-tertiary)] border-b border-[var(--border)]">
                      <th className="text-left py-2 pr-4 font-medium">{t('deviceHealth.col.device', 'Device')}</th>
                      <th className="text-left py-2 pr-4 font-medium">{t('deviceHealth.col.status', 'Status')}</th>
                      <th className="text-right py-2 pr-4 font-medium">{t('deviceHealth.col.health', 'Health')}</th>
                      <th className="text-left py-2 pr-4 font-medium">{t('deviceHealth.col.signal', 'Signal')}</th>
                      <th className="text-left py-2 pr-4 font-medium">{t('deviceHealth.col.memory', 'Memory')}</th>
                      <th className="text-left py-2 pr-4 font-medium">{t('deviceHealth.col.uptime', 'Uptime')}</th>
                      <th className="text-right py-2 pr-4 font-medium">{t('deviceHealth.col.cpu', 'CPU')}</th>
                      <th className="text-left py-2 pr-4 font-medium">{t('deviceHealth.col.trend', 'Trend')}</th>
                      <th className="text-right py-2 pr-4 font-medium">{t('deviceHealth.col.rul', 'RUL')}</th>
                      <th className="text-left py-2 font-medium">{t('deviceHealth.col.alerts', 'Alerts')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {devices.map(d => (
                      <tr key={d.id} className="border-b border-[var(--border)] hover:bg-white/[0.02]">
                        <td className="py-2.5 pr-4 font-medium text-[var(--text-primary)]">{d.name}</td>
                        <td className="py-2.5 pr-4">
                          <Pill tone={d.status === 'online' ? 'emerald' : 'rose'}>{d.status === 'online' ? t('deviceHealth.status.online', 'ONLINE') : d.status === 'offline' ? t('deviceHealth.status.offline', 'OFFLINE') : d.status.toUpperCase()}</Pill>
                        </td>
                        <td className="py-2.5 pr-4 text-right">
                          <span className={`font-semibold ${d.healthScore >= 80 ? 'text-[var(--emerald)]' : d.healthScore >= 60 ? 'text-[var(--amber)]' : 'text-[var(--rose)]'}`}>
                            {d.healthScore}%
                          </span>
                        </td>
                        <td className="py-2.5 pr-4">
                          <div className="w-24">
                            <div className="h-1.5 rounded-full bg-[var(--surface-hover)] overflow-hidden">
                              <div className="h-full" style={{ width: `${d.rssiQuality}%`, background: 'linear-gradient(90deg,var(--emerald),var(--cyan))' }} />
                            </div>
                            <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{d.rssi !== null ? `${d.rssi} dBm` : '—'}</div>
                          </div>
                        </td>
                        <td className="py-2.5 pr-4">
                          <div className="w-24">
                            <div className="h-1.5 rounded-full bg-[var(--surface-hover)] overflow-hidden">
                              <div className="h-full" style={{ width: `${d.heapHealth}%`, background: 'linear-gradient(90deg,var(--cyan),var(--violet))' }} />
                            </div>
                            <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{d.freeHeap !== null ? `${Math.round(d.freeHeap / 1024)} KB` : '—'}</div>
                          </div>
                        </td>
                        <td className="py-2.5 pr-4">
                          <div className="w-24">
                            <div className="h-1.5 rounded-full bg-[var(--surface-hover)] overflow-hidden">
                              <div className="h-full" style={{ width: `${d.uptimeQuality}%`, background: 'linear-gradient(90deg,var(--violet),var(--amber))' }} />
                            </div>
                            <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{formatUptime(d.uptimeSeconds)}</div>
                          </div>
                        </td>
                        <td className="py-2.5 pr-4 text-right font-mono text-xs text-[var(--text-secondary)]">
                          {d.cpuFreq !== null ? `${d.cpuFreq} MHz` : '—'}
                        </td>
                        <td className="py-2.5 pr-4"><TrendArrow direction={d.healthTrend?.direction ?? null} t={t} /></td>
                        <td className="py-2.5 pr-4 text-right font-mono text-xs text-[var(--text-secondary)]">
                          {d.rulDays !== null ? `${d.rulDays}d` : '—'}
                        </td>
                        <td className="py-2.5">
                          <div className="flex gap-1">
                            {d.alerts.length > 0 ? d.alerts.slice(0, 2).map((a, i) => (
                              <Pill key={i} tone={a.severity === 'critical' ? 'rose' : 'amber'} className="text-[9px]">{alertTypeLabel(t, a.type)}</Pill>
                            )) : <span className="text-xs text-[var(--text-tertiary)]">{t('deviceHealth.ok', 'OK')}</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* METHODOLOGY & SOURCES VIEW */}
          {view === 'method' && (
            <div className="space-y-5 mb-6">
              <div className="glass-panel rounded-2xl p-5 animate-fade-slide-up">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-[var(--emerald-dim)] text-[var(--emerald)] shrink-0"><FlaskConical size={16} /></div>
                  <div>
                    <h3 className="text-sm font-semibold">{t('deviceHealth.methodologyTitle', 'Scientific methodology & sources')}</h3>
                    <p className="text-xs text-[var(--text-tertiary)] mt-0.5 leading-relaxed">
                      {t('deviceHealth.methodBody.a', 'Every score, trend, and prediction in this dashboard is computed from transparent, cited formulas. International standards and peer-reviewed literature back each model — hover any source chip for the full citation, or open the ')}
                      <span className="text-[var(--emerald)]">{t('deviceHealth.references', 'References')}</span>
                      {t('deviceHealth.methodBody.b', ' page for the complete library with BibTeX / CSV export.')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid lg:grid-cols-2 gap-5">
                <MethodCard
                  icon={<GaugeIcon size={15} />}
                  title={t('deviceHealth.method.composite', 'COMPOSITE HEALTH SCORE')}
                  formula={'Score = 0.40·Signal + 0.35·Memory + 0.25·Uptime'}
                  note={t('deviceHealth.method.compositeNote', 'A weighted composite of the three subsystems that most determine whether a node is useful: connectivity (lost link = no data), memory (heap exhaustion destabilises firmware) and uptime (sustained operation evidences a non-resetting node).')}
                  refs={healthModelRefs()}
                >
                  <div className="space-y-2 mb-3">
                    {HEALTH_WEIGHTS.map(w => (
                      <div key={w.key}>
                        <div className="flex items-center justify-between text-[11px] mb-0.5">
                          <span className="font-medium text-[var(--text-secondary)]">{t(`deviceHealth.weight.${w.key}`, w.label)} · {Math.round(w.weight * 100)}%</span>
                          <span className="text-[9px] text-[var(--text-disabled)] max-w-[60%] text-right">{t(`deviceHealth.weightNote.${w.key}`, w.note)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-[var(--surface-hover)] overflow-hidden">
                          <div className="h-full transition-all duration-700" style={{ width: `${w.weight * 100}%`, background: 'linear-gradient(90deg,var(--emerald),var(--cyan))' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {HEALTH_BANDS.map(b => (
                      <span key={b.label} className="text-[10px] px-2 py-0.5 rounded-full border" style={{ borderColor: `${b.color}55`, color: b.color, background: `${b.color}12` }}>
                        {b.min}+ {t(`deviceHealth.dist.${b.label}`, b.label)}
                      </span>
                    ))}
                  </div>
                </MethodCard>

                <MethodCard
                  icon={<Signal size={15} />}
                  title={t('deviceHealth.method.signal', 'SIGNAL & RSSI MODEL')}
                  formula={'d = d₀·10^((P₀−RSSI)/(10·n))    quality = ((RSSI+90)/60)·100'}
                  note={t('deviceHealth.method.signalNote', 'RSSI is scaled to a 0–100 quality over the −90…−30 dBm usable window (IEEE 802.11 signal-strength reporting) and converted to an estimated device distance with the log-distance path-loss model (Friis 1946; ITU-R P.1238-11).')}
                  refs={signalModelRefs()}
                >
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                    {RSSI_BANDS.map(b => (
                      <div key={b.label} className="p-2 rounded-md bg-white/[0.03] border border-[var(--border)]">
                        <div className="text-[11px] font-semibold text-[var(--text-primary)]">{t(`deviceHealth.rssiBand.${b.label}`, b.label)}</div>
                        <div className="text-[10px] font-mono text-[var(--text-tertiary)]">
                          {b.max === Infinity ? `≥ ${b.min}` : b.min === -Infinity ? `< ${b.max}` : `${b.min}…${b.max}`} dBm
                        </div>
                      </div>
                    ))}
                  </div>
                  {methodDevice && methodDevice.rssi !== null && (
                    <div className="text-[11px] text-[var(--text-tertiary)] rounded-md bg-[var(--emerald-dim)]/60 border border-[var(--emerald-glow)] px-2.5 py-2">
                      <span className="text-[var(--emerald)] font-semibold">{methodDevice.name}:</span> RSSI {methodDevice.rssi} dBm
                      ({t(`deviceHealth.rssiBand.${rssiBandLabel(methodDevice.rssi)}`, rssiBandLabel(methodDevice.rssi))}) → {t('deviceHealth.estDistance', 'est. distance ≈ {value} m', { value: (rssiToDistance(methodDevice.rssi) ?? 0).toFixed(1) })} {t('deviceHealth.withN', 'with n = {value}.', { value: String(PATH_LOSS_MODEL.pathLossExponent) })}
                    </div>
                  )}
                </MethodCard>

                <MethodCard
                  icon={<Cpu size={15} />}
                  title={t('deviceHealth.method.memory', 'MEMORY HEALTH & LEAK DETECTION')}
                  formula={'leak rate = Δheap/Δt (KB/hour)    leaking when rate < −5 KB/h'}
                  note={t('deviceHealth.method.memoryNote', 'Free heap is scored against ESP32-class memory budgets (Espressif datasheet / TRM). A memory leak is declared when the ordinary least-squares slope of free heap over time is below −5 KB/hour — fast enough to threaten the device within days.')}
                  refs={memoryModelRefs()}
                >
                  <div className="flex flex-wrap gap-1.5 text-[10px]">
                    <span className="px-2 py-0.5 rounded-full bg-[var(--emerald-dim)] text-[var(--emerald)]">{t('deviceHealth.method.memHealthy', '≥ 200 KB · healthy')}</span>
                    <span className="px-2 py-0.5 rounded-full bg-[var(--emerald-dim)]/50 text-[var(--emerald)]">{t('deviceHealth.method.memGood', '100–200 KB · good')}</span>
                    <span className="px-2 py-0.5 rounded-full bg-[var(--amber-dim)] text-[var(--amber)]">{t('deviceHealth.method.memWatch', '50–100 KB · watch')}</span>
                    <span className="px-2 py-0.5 rounded-full bg-[var(--rose-dim)] text-[var(--rose)]">{t('deviceHealth.method.memLow', '10–50 KB · low')}</span>
                    <span className="px-2 py-0.5 rounded-full bg-[var(--rose-dim)] text-[var(--rose)]">{t('deviceHealth.method.memCritical', '< 10 KB · critical')}</span>
                  </div>
                </MethodCard>

                <MethodCard
                  icon={<Ruler size={15} />}
                  title={t('deviceHealth.method.uncertainty', 'MEASUREMENT UNCERTAINTY (GUM)')}
                  formula={'u = value·pct/100·(1/√3)    expanded = k·u (k=2 → ≈95%)'}
                  note={t('deviceHealth.method.uncertaintyNote', 'Type-B standard uncertainty assumes a rectangular distribution over a declared relative accuracy. The expanded uncertainty (coverage factor k = 2) approximates a 95% confidence interval — the recommended reporting convention of the GUM (JCGM 100:2008).')}
                  refs={uncertaintyRefs()}
                >
                  {methodDevice && methodDevice.rssi !== null && (() => {
                    const u = measurementUncertainty(methodDevice.rssi, 3, 2);
                    return (
                      <div className="text-[11px] text-[var(--text-tertiary)] space-y-0.5 rounded-md bg-white/[0.03] border border-[var(--border)] px-2.5 py-2">
                        <div><span className="text-[var(--cyan)] font-semibold">{t('deviceHealth.method.exampleRssi', 'Example — {name} RSSI:', { name: methodDevice.name })}</span> {t('deviceHealth.method.declaredAccuracy', 'declared accuracy ±3% (typical 802.11 RSSI report)')}</div>
                        <div>{t('deviceHealth.method.stdUncertainty', 'Standard uncertainty u = ')}<span className="font-mono">{u.standardUncertainty.toFixed(2)} dBm</span></div>
                        <div>{t('deviceHealth.method.expanded', 'Expanded (k=2, ≈95%) = ')}<span className="font-mono">±{u.expandedUncertainty.toFixed(1)} dBm</span>{t('deviceHealth.method.interval', ' → interval [{a}, {b}] dBm', { a: u.interval[0].toFixed(1), b: u.interval[1].toFixed(1) })}</div>
                      </div>
                    );
                  })()}
                </MethodCard>
              </div>

              <MethodCard
                icon={<Sigma size={15} />}
                title={t('deviceHealth.method.trend', 'TREND & REMAINING USEFUL LIFE (PROGNOSTICS)')}
                formula={'OLS: ŷ = a + b·x  (Gauss 1809)   ·   R² = 1 − Σ(y−ŷ)²/Σ(y−ȳ)²   ·   Theil–Sen: b = median{(yⱼ−yᵢ)/(j−i)}   ·   EWMA: sₜ = α·yₜ + (1−α)·sₜ₋₁'}
                note={t('deviceHealth.method.trendNote', 'Trends are fitted with ordinary least squares and validated with R² (Moriasi et al. 2007). The Theil–Sen median slope (Theil 1950; Sen 1968) is robust to outliers, and an EWMA (Roberts 1959) smooths the raw signal. Remaining Useful Life extrapolates the degrading health slope to the critical threshold of 40 — a linear degradation model consistent with ISO 13381-1:2015 prognostics.')}
                refs={[...trendModelRefs(), ...rulModelRefs()]}
              >
                {methodDevice && methodDevice.healthTrend && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-1">
                    {(() => {
                      const scores = healthScores(methodDevice);
                      const ts = theilSenSlope(scores);
                      const tv = trendVerdict(methodDevice);
                      const rv = rulVerdict(methodDevice);
                      return (
                        <>
                          <div className="p-2 rounded-md bg-white/[0.03] border border-[var(--border)]">
                            <div className="text-[9px] uppercase tracking-wide text-[var(--text-tertiary)]">{t('deviceHealth.method.olsSlope', 'OLS slope / sample')}</div>
                            <div className="font-mono text-sm font-semibold text-[var(--text-secondary)]">{methodDevice.healthTrend.slope.toFixed(2)}</div>
                          </div>
                          <div className="p-2 rounded-md bg-white/[0.03] border border-[var(--border)]">
                            <div className="text-[9px] uppercase tracking-wide text-[var(--text-tertiary)]">{t('deviceHealth.method.theilSen', 'Theil–Sen slope')}</div>
                            <div className="font-mono text-sm font-semibold text-[var(--text-secondary)]">{ts.toFixed(2)}</div>
                          </div>
                          <div className="p-2 rounded-md bg-white/[0.03] border border-[var(--border)]">
                            <div className="text-[9px] uppercase tracking-wide text-[var(--text-tertiary)]">{t('deviceHealth.method.fitR2', 'Fit R²')}</div>
                            <div className="font-mono text-sm font-semibold text-[var(--cyan)]">{methodDevice.healthTrend.r2 != null ? methodDevice.healthTrend.r2.toFixed(2) : '—'}</div>
                          </div>
                          <div className="p-2 rounded-md bg-white/[0.03] border border-[var(--border)]">
                            <div className="text-[9px] uppercase tracking-wide text-[var(--text-tertiary)]">{t('deviceHealth.method.samplesSpan', 'Samples / span')}</div>
                            <div className="font-mono text-sm font-semibold text-[var(--text-secondary)]">{methodDevice.healthTrend.samples} / {historySpanHours(methodDevice).toFixed(1)}h</div>
                          </div>
                          <div className="col-span-2 flex flex-wrap gap-1.5">
                            {tv && <ConfidencePill verdict={tv} label={t('deviceHealth.trendConfidence', 'Trend confidence')} t={t} />}
                            {rv && <ConfidencePill verdict={rv} label={t('deviceHealth.rulConfidence', 'RUL confidence')} t={t} />}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </MethodCard>

              <Card hover={false}>
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen size={14} className="text-[var(--cyan)]" />
                  <div className="section-label mb-0">{t('deviceHealth.applicableStandards', 'APPLICABLE STANDARDS & LITERATURE')}</div>
                  <Pill tone="cyan">{t('deviceHealth.sourcesPill', '{count} curated sources', { count: String(healthModelRefs().length) })}</Pill>
                </div>
                <div className="grid md:grid-cols-2 gap-x-6 gap-y-2">
                  {healthModelRefs().map(r => (
                    <div key={r.id} className="text-[11px] text-[var(--text-tertiary)] leading-relaxed border-l-2 pl-3" style={{ borderColor: 'var(--emerald-glow)' }}>
                      <span className="font-medium text-[var(--text-secondary)]">{r.title}</span><br />
                      <span>{toCitation(r)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {/* OVERVIEW VIEW */}
          {view === 'overview' && (
            <div className="grid lg:grid-cols-3 gap-5">
              {/* Device list */}
              <div className="space-y-3">
                <div className="section-label">{t('deviceHealth.devices', 'DEVICES')}</div>
                {devices.map(d => {
                  const scores = healthScores(d);
                  return (
                    <Card
                      key={d.id}
                      onClick={() => setSelectedDevice(d.id)}
                      className={`cursor-pointer transition-all ${selectedDevice === d.id ? 'ring-2 ring-[var(--emerald)]' : ''}`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="font-semibold text-[var(--text-primary)]">{d.name}</div>
                          <div className="text-xs text-[var(--text-tertiary)] mt-0.5">
                            {d.type} • {d.firmwareVersion}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Sparkline values={scores} color={scoreColor(d.healthScore)} />
                          <ProgressRing value={d.healthScore} size={42} strokeWidth={3} accent={d.healthScore >= 80 ? 'emerald' : d.healthScore >= 60 ? 'amber' : 'rose'} />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3 text-xs mb-3">
                        <div>
                          <div className="text-[var(--text-tertiary)] mb-0.5">{t('deviceHealth.metric.rssi', 'RSSI')}</div>
                          <div className="font-mono font-semibold text-[var(--text-secondary)]">
                            {d.rssi !== null ? `${d.rssi}` : '—'}
                            {d.rssi !== null && <span className="text-[var(--text-disabled)]"> dBm</span>}
                          </div>
                        </div>
                        <div>
                          <div className="text-[var(--text-tertiary)] mb-0.5">{t('deviceHealth.metric.heap', 'Heap')}</div>
                          <div className="font-mono font-semibold text-[var(--text-secondary)]">
                            {d.freeHeap !== null ? fmt(Math.round(d.freeHeap / 1024)) : '—'}
                            {d.freeHeap !== null && <span className="text-[var(--text-disabled)]"> KB</span>}
                          </div>
                        </div>
                        <div>
                          <div className="text-[var(--text-tertiary)] mb-0.5">{t('deviceHealth.metric.uptime', 'Uptime')}</div>
                          <div className="font-mono font-semibold text-[var(--text-secondary)]">
                            {formatUptime(d.uptimeSeconds)}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {d.alerts.length > 0 ? (
                          d.alerts.slice(0, 3).map((a, i) => (
                            <Pill key={i} tone={a.severity === 'critical' ? 'rose' : 'amber'} className="text-[9px]">
                              {a.type === 'rssi_low' ? <Wifi size={10} /> : a.type === 'heap_low' || a.type === 'heap_leak' ? <Cpu size={10} /> : <AlertTriangle size={10} />}
                              {alertTypeLabel(t, a.type)}
                            </Pill>
                          ))
                        ) : (
                          <Pill tone="emerald">{t('deviceHealth.healthy', 'Healthy')}</Pill>
                        )}
                        <div className="ml-auto flex items-center gap-1.5">
                          {d.rulDays !== null && <Pill tone="slate" className="text-[9px]">{t('deviceHealth.rulShort', 'RUL')} {d.rulDays}d</Pill>}
                          <TrendArrow direction={d.healthTrend?.direction ?? null} t={t} />
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>

              {/* Detail panel */}
              {activeDevice && (
                <div className="lg:col-span-2 space-y-5">
                  <Card hover={false}>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <div className="section-label">{t('deviceHealth.healthDetail', 'HEALTH DETAIL — {name}', { name: activeDevice.name })}</div>
                        <div className="text-xs text-[var(--text-tertiary)] mt-0.5">
                          {t('deviceHealth.lastRecorded', 'Last recorded: {time}', { time: activeDevice.recordedAt ? new Date(activeDevice.recordedAt).toLocaleString() : t('deviceHealth.never', 'Never') })}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-xs text-[var(--text-tertiary)]">{t(`deviceHealth.dist.${getHealthLabel(activeDevice.healthScore).toLowerCase()}`, getHealthLabel(activeDevice.healthScore))}</div>
                          <div className="text-lg font-bold tabular-nums" style={{ color: scoreColor(activeDevice.healthScore) }}>{activeDevice.healthScore}/100</div>
                        </div>
                        <ProgressRing value={activeDevice.healthScore} size={56} strokeWidth={5} accent={activeDevice.healthScore >= 80 ? 'emerald' : activeDevice.healthScore >= 60 ? 'amber' : 'rose'} />
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4 mb-4">
                      <div className="p-3 rounded-[var(--radius-md)] bg-white/[0.03]">
                        <BreakdownBars breakdown={activeDevice.breakdown} t={t} />
                      </div>
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <TrendArrow direction={activeDevice.healthTrend?.direction ?? null} t={t} />
                          {activeDevice.healthTrend && (
                            <Pill tone={activeDevice.healthTrend.delta < 0 ? 'rose' : 'emerald'} className="text-[9px]">
                              {activeDevice.healthTrend.delta >= 0 ? '+' : ''}{activeDevice.healthTrend.delta.toFixed(1)} {t('deviceHealth.overSamples', 'over {count} samples', { count: String(activeDevice.healthTrend.samples) })}
                            </Pill>
                          )}
                          {activeDevice.healthTrend && activeDevice.healthTrend.r2 != null && (
                            <span title={t('deviceHealth.r2Title', 'Coefficient of determination (Gauss 1809; Moriasi et al. 2007)')}>
                              <Pill tone="cyan" className="text-[9px]">
                                R² {activeDevice.healthTrend.r2.toFixed(2)}
                              </Pill>
                            </span>
                          )}
                          {trendVerdict(activeDevice) && <ConfidencePill verdict={trendVerdict(activeDevice)!} label={t('deviceHealth.trend', 'Trend')} t={t} />}
                          {activeDevice.memTrend?.leaking && <Pill tone="rose" className="text-[9px]">{t('deviceHealth.heapLeak', 'Heap leak ~{rate} KB/h', { rate: String(Math.abs(activeDevice.memTrend.rateKBh)) })}</Pill>}
                          {activeDevice.rulDays !== null && <Pill tone={activeDevice.rulDays < 7 ? 'rose' : activeDevice.rulDays < 30 ? 'amber' : 'emerald'} className="text-[9px]">{t('deviceHealth.rulApprox', 'RUL ~{days}d', { days: String(activeDevice.rulDays) })}</Pill>}
                          {rulVerdict(activeDevice) && <ConfidencePill verdict={rulVerdict(activeDevice)!} label={t('deviceHealth.rul', 'RUL')} t={t} />}
                        </div>
                        {activeDevice.rssi !== null && (
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-tertiary)] pt-1">
                            <Signal size={11} className="text-[var(--cyan)]" />
                            <span>{t('deviceHealth.band', '{band} band', { band: rssiBandLabel(activeDevice.rssi) })}</span>
                            <span className="text-[var(--text-disabled)]">·</span>
                            <span>{t('deviceHealth.estDistance', 'est. distance ≈ {value} m', { value: (rssiToDistance(activeDevice.rssi) ?? 0).toFixed(1) })}</span>
                            <span className="text-[var(--text-disabled)]">{t('deviceHealth.pathLoss', '(log-distance path loss, n={n}, ITU-R P.1238)', { n: String(PATH_LOSS_MODEL.pathLossExponent) })}</span>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="p-2 rounded bg-white/[0.02]"><span className="text-[var(--text-tertiary)]">{t('deviceHealth.ip', 'IP: ')}</span><span className="font-mono text-[var(--text-secondary)]">{activeDevice.ipAddress}</span></div>
                          <div className="p-2 rounded bg-white/[0.02]"><span className="text-[var(--text-tertiary)]">{t('deviceHealth.wifiCh', 'WiFi Ch: ')}</span><span className="font-mono text-[var(--text-secondary)]">{activeDevice.wifiChannel ?? '—'}</span></div>
                          <div className="p-2 rounded bg-white/[0.02]"><span className="text-[var(--text-tertiary)]">{t('deviceHealth.cpu', 'CPU: ')}</span><span className="font-mono text-[var(--text-secondary)]">{activeDevice.cpuFreq ? `${activeDevice.cpuFreq} MHz` : '—'}</span></div>
                          <div className="p-2 rounded bg-white/[0.02]"><span className="text-[var(--text-tertiary)]">{t('deviceHealth.fw', 'FW: ')}</span><span className="font-mono text-[var(--text-secondary)]">{activeDevice.firmwareVersion}</span></div>
                        </div>
                      </div>
                    </div>

                    {/* Sensor health strip */}
                    <div className="mb-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Activity size={13} className="text-[var(--cyan)]" />
                        <span className="section-label mb-0">{t('deviceHealth.sensorHealth', 'SENSOR HEALTH')}</span>
                        <Pill tone={activeDevice.sensorReports.some(r => r.status === 'failed') ? 'rose' : activeDevice.sensorReports.some(r => r.status === 'degraded') ? 'amber' : 'emerald'} className="text-[9px]">
                          {activeDevice.sensorReports.filter(r => r.status === 'healthy').length}/{activeDevice.sensorReports.length} {t('deviceHealth.healthy', 'healthy')}
                        </Pill>
                      </div>
                      <SensorHealthGrid reports={activeDevice.sensorReports} t={t} />
                    </div>
                  </Card>

                  {/* Health score trend */}
                  {healthChartData.length > 1 && (
                    <Card hover={false}>
                      <div className="section-label mb-3">{t('deviceHealth.healthTrendTitle', 'HEALTH SCORE TREND')}</div>
                      <ResponsiveContainer width="100%" height={180}>
                        <AreaChart data={healthChartData}>
                          <ChartAreaGradient id="healthGrad" from="var(--emerald)" to="var(--emerald)" />
                          <ChartGrid />
                          <XAxis dataKey="time" tick={CHART_TICK} axisLine={false} tickLine={false} />
                          <YAxis domain={[0, 100]} tick={CHART_TICK} axisLine={false} tickLine={false} />
                          <Tooltip content={<ChartTooltip />} cursor={CHART_CURSOR} />
                          <ReferenceLine y={60} stroke="var(--amber)" strokeOpacity={0.3} strokeDasharray="4 6" label={{ value: t('deviceHealth.atRisk', 'At risk 60'), position: 'insideBottomRight', fontSize: 9, fill: 'var(--text-tertiary)' }} />
                          <ReferenceLine y={40} stroke="var(--rose)" strokeOpacity={0.3} strokeDasharray="4 6" label={{ value: t('deviceHealth.critical40', 'Critical 40'), position: 'insideBottomRight', fontSize: 9, fill: 'var(--text-tertiary)' }} />
                          <Area type="monotone" dataKey="score" name={t('deviceHealth.chartHealth', 'Health')} stroke="var(--emerald)" fill="url(#healthGrad)" strokeWidth={2.5} activeDot={{ r: 4, strokeWidth: 0 }} />
                          <Line type="monotone" dataKey="smoothed" name={t('deviceHealth.chartEwma', 'EWMA α=0.35')} stroke="var(--cyan)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-[var(--text-tertiary)]">
                        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded bg-[var(--emerald)]" /> {t('deviceHealth.legendHealth', 'Health score (OLS trend)')}</span>
                        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded border-t border-dashed border-[var(--cyan)]" /> {t('deviceHealth.legendEwma', 'EWMA smoothed (α=0.35)')}</span>
                      </div>
                    </Card>
                  )}

                  {/* RSSI + Heap trends */}
                  {chartData.length > 1 && (
                    <div className="grid md:grid-cols-2 gap-5">
                      <Card hover={false}>
                        <div className="section-label mb-3">{t('deviceHealth.rssiTrend', 'RSSI TREND')}</div>
                        <ResponsiveContainer width="100%" height={160}>
                          <AreaChart data={chartData}>
                            <defs>
                              <linearGradient id="rssiGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="var(--emerald)" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="var(--emerald)" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <ChartGrid />
                            <XAxis dataKey="time" tick={CHART_TICK} axisLine={false} tickLine={false} />
                            <YAxis tick={CHART_TICK} axisLine={false} tickLine={false} domain={['dataMin - 10', 'dataMax + 10']} />
                            <Tooltip content={<ChartTooltip />} cursor={CHART_CURSOR} />
                            <Area type="monotone" dataKey="rssi" stroke="var(--emerald)" fill="url(#rssiGrad)" strokeWidth={2.5} name={t('deviceHealth.chartRssi', 'RSSI (dBm)')} activeDot={{ r: 4, strokeWidth: 0 }} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </Card>

                      <Card hover={false}>
                        <div className="section-label mb-3">{t('deviceHealth.memTrendTitle', 'MEMORY TREND (KB)')}</div>
                        <ResponsiveContainer width="100%" height={160}>
                          <LineChart data={chartData}>
                            <ChartGrid />
                            <XAxis dataKey="time" tick={CHART_TICK} axisLine={false} tickLine={false} />
                            <YAxis tick={CHART_TICK} axisLine={false} tickLine={false} />
                            <Tooltip content={<ChartTooltip />} cursor={CHART_CURSOR} />
                            <Line type="monotone" dataKey="heap" stroke="var(--cyan)" strokeWidth={2.5} dot={false} name={t('deviceHealth.chartFreeHeap', 'Free Heap (KB)')} activeDot={{ r: 4, strokeWidth: 0 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </Card>
                    </div>
                  )}

                  {/* Uptime trend */}
                  {chartData.length > 1 && (
                    <Card hover={false}>
                      <div className="section-label mb-3">{t('deviceHealth.uptimeTrendTitle', 'UPTIME TREND (minutes)')}</div>
                      <ResponsiveContainer width="100%" height={160}>
                        <LineChart data={chartData}>
                          <ChartGrid />
                          <XAxis dataKey="time" tick={CHART_TICK} axisLine={false} tickLine={false} />
                          <YAxis tick={CHART_TICK} axisLine={false} tickLine={false} />
                          <Tooltip content={<ChartTooltip />} cursor={CHART_CURSOR} />
                          <Line type="monotone" dataKey="uptime" stroke="var(--violet)" strokeWidth={2.5} dot={false} name={t('deviceHealth.chartUptime', 'Uptime (min)')} activeDot={{ r: 4, strokeWidth: 0 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </Card>
                  )}

                  {chartData.length <= 1 && (
                    <Card hover={false} className="text-center py-8 text-[var(--text-tertiary)] text-sm">
                      <Clock size={20} className="mx-auto mb-2 opacity-50" />
                      {t('deviceHealth.trendPending', 'Trend charts will appear once multiple health samples are collected.')}
                      <br />{t('deviceHealth.currentHistory', 'Current history: {count} sample(s).', { count: String(activeDevice.history.length) })}
                    </Card>
                  )}

                  {/* Maintenance actions */}
                  <Card hover={false}>
                    <div className="flex items-center gap-2 mb-3">
                      <Wrench size={14} className="text-[var(--amber)]" />
                      <div className="section-label mb-0">{t('deviceHealth.maintenance', 'MAINTENANCE & RECOMMENDATIONS')}</div>
                    </div>
                    {getMaintenanceActions(activeDevice).length === 0 ? (
                      <div className="text-sm text-[var(--text-tertiary)] flex items-center gap-2 py-1">
                        <ShieldCheck size={16} className="text-[var(--emerald)]" /> {t('deviceHealth.noMaintenance', 'No maintenance needed — device is healthy.')}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {getMaintenanceActions(activeDevice).map(a => {
                          const Icon = ACTION_ICONS[a.icon];
                          const text = actionText(t, a, activeDevice);
                          return (
                            <div key={a.id} className="flex items-start gap-3 p-2.5 rounded-[var(--radius-md)] bg-white/[0.03] border border-[var(--border)]">
                              <div
                                className="mt-0.5 w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                                style={{ background: a.priority === 'high' ? 'var(--rose-dim)' : a.priority === 'medium' ? 'var(--amber-dim)' : 'var(--surface-hover)' }}
                              >
                                <Icon size={14} style={{ color: a.priority === 'high' ? 'var(--rose)' : a.priority === 'medium' ? 'var(--amber)' : 'var(--text-tertiary)' }} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-[var(--text-primary)]">{text.title}</div>
                                <div className="text-xs text-[var(--text-tertiary)] mt-0.5 leading-relaxed">{text.description}</div>
                              </div>
                              <Pill tone={a.priority === 'high' ? 'rose' : a.priority === 'medium' ? 'amber' : 'slate'} className="text-[9px] shrink-0">{t(`deviceHealth.priority.${a.priority}`, a.priority)}</Pill>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <SourceChips sources={rulModelRefs()} label={t('deviceHealth.progStdLabel', 'Prognostics & maintenance standards')} className="mt-4" />
                  </Card>
                </div>
              )}
            </div>
          )}

          {/* History limit selector shown with charts */}
          {view === 'overview' && activeDevice && chartData.length > 1 && (
            <div className="mt-5 flex items-center gap-2 text-[11px] text-[var(--text-tertiary)]">
              <Clock size={12} />
              <span>{t('deviceHealth.samplesLoaded', '{count} samples loaded · history window:', { count: String(activeDevice.history.length) })}</span>
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
          )}
        </>
      )}
    </div>
  );
}
