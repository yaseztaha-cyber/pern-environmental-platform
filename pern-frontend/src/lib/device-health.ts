/**
 * PERN Device & Sensor Health + Lifecycle Management
 *
 * Tracks:
 * - Device health score (computed from real device_health table rows)
 * - Sensor accuracy & drift
 * - Battery / Power health
 * - Connectivity health
 * - Health trends (improving / degrading / stable)
 * - Memory leak detection
 * - Estimated Remaining Useful Life (RUL)
 * - Maintenance recommendations
 */

import type {
  EnrichedDevice,
  EnrichedDeviceAlert,
  FleetStats,
  HealthComponentScore,
  HealthTrendInfo,
  MaintenanceAction,
  MemoryTrendInfo,
  RealDeviceHealth,
} from './types';
import { linearRegression } from './device-health-science';

/* ─── Real device_health table row ─── */
export type { RealDeviceHealth };

/* ─── RSSI quality (0-100) ─── */
export function getRssiQuality(rssi: number | null): number {
  if (rssi === null) return 0;
  // -30 dBm = excellent, -90 dBm = unusable
  const clamped = Math.max(-90, Math.min(-30, rssi));
  return Math.round(((clamped + 90) / 60) * 100);
}

/* ─── Heap health (0-100) ─── */
export function getHeapHealth(freeHeap: number | null): number {
  if (freeHeap === null) return 0;
  // ESP32 typical: 320 KB total, <10 KB critical
  const kb = freeHeap / 1024;
  if (kb >= 200) return 100;
  if (kb >= 100) return 80 + Math.round(((kb - 100) / 100) * 20);
  if (kb >= 50) return 50 + Math.round(((kb - 50) / 50) * 30);
  if (kb >= 10) return 10 + Math.round(((kb - 10) / 40) * 40);
  return Math.max(5, Math.round((kb / 10) * 10));
}

/* ─── Uptime quality (0-100) ─── */
export function getUptimeQuality(uptimeSeconds: number | null): number {
  if (uptimeSeconds === null) return 0;
  const hours = uptimeSeconds / 3600;
  if (hours >= 24) return 100;
  if (hours >= 12) return 85 + Math.round(((hours - 12) / 12) * 15);
  if (hours >= 1) return 40 + Math.round(((hours - 1) / 11) * 45);
  return Math.max(10, Math.round(hours * 40));
}

/* ─── CPU frequency health (0-100) ─── */
export function getCpuHealth(cpuFreq: number | null): number {
  if (cpuFreq === null) return 0;
  // ESP32 base 240 MHz; 160+ healthy, 80 = throttled, 40 = thermal / power issue
  if (cpuFreq >= 160) return 100;
  if (cpuFreq >= 80) return 50 + Math.round(((cpuFreq - 80) / 80) * 50);
  return Math.max(5, Math.round((cpuFreq / 80) * 50));
}

/* ─── Combined real health score (0-100) ─── */
export function calculateRealHealthScore(
  rssiQuality: number,
  heapHealth: number,
  uptimeQuality: number,
): number {
  // RSSI 40%, Heap 35%, Uptime 25%
  return Math.round(rssiQuality * 0.40 + heapHealth * 0.35 + uptimeQuality * 0.25);
}

/* ─── Health label ─── */
export function getHealthLabel(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 60) return 'Fair';
  if (score >= 40) return 'Poor';
  return 'Critical';
}

/* ─── Score accent for UI ─── */
export function getScoreAccent(score: number): 'emerald' | 'amber' | 'rose' {
  if (score >= 80) return 'emerald';
  if (score >= 60) return 'amber';
  return 'rose';
}

/* ─── Linear regression over equally spaced samples ─── */
function linearSlope(values: number[]): { slope: number; intercept: number; delta: number } {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0, delta: 0 };
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - yMean);
    den += (i - xMean) * (i - xMean);
  }
  const slope = den > 0 ? num / den : 0;
  const intercept = yMean - slope * xMean;
  return { slope, intercept, delta: slope * (n - 1) };
}

function parseTime(iso: string | undefined): number {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(t) ? t : NaN;
}

/* ─── Health trend over history (per-sample regression) ─── */
export function getHealthTrend(history: RealDeviceHealth[]): HealthTrendInfo | null {
  if (!history || history.length < 3) return null;
  const scores = history.map(h =>
    calculateRealHealthScore(
      getRssiQuality(h.rssi ?? null),
      getHeapHealth(h.free_heap ?? null),
      getUptimeQuality(h.uptime_seconds ?? null),
    ),
  );
  const { slope, r2 } = linearRegression(scores);
  const delta = slope * (scores.length - 1);
  const direction: HealthTrendInfo['direction'] =
    slope > 0.4 ? 'improving' : slope < -0.4 ? 'degrading' : 'stable';
  return { direction, slope: Math.round(slope * 1000) / 1000, delta: Math.round(delta * 10) / 10, samples: scores.length, r2: Math.round(r2 * 1000) / 1000 };
}

/* ─── Memory leak detection (KB/hour) ─── */
export function getMemoryTrend(history: RealDeviceHealth[]): MemoryTrendInfo | null {
  if (!history || history.length < 3) return null;
  const pts = history
    .filter(h => h.free_heap != null && h.recorded_at)
    .map(h => ({ t: parseTime(h.recorded_at), v: h.free_heap as number }))
    .filter(p => !isNaN(p.t))
    .sort((a, b) => a.t - b.t);
  if (pts.length < 3) return null;
  const dtHours = (pts[pts.length - 1].t - pts[0].t) / 3600000;
  if (dtHours < 0.25) return null;
  const { slope } = linearSlope(pts.map(p => p.v));
  const rateKBh = Math.round(((slope * (pts.length - 1)) / dtHours / 1024) * 10) / 10;
  return { slope: Math.round(slope * 10) / 10, leaking: rateKBh < -5, rateKBh };
}

/* ─── Estimated Remaining Useful Life (days until score < 40) ─── */
export function estimateRemainingUsefulLife(history: RealDeviceHealth[]): number | null {
  if (!history || history.length < 5) return null;
  const scored = history.map(h => ({
    t: parseTime(h.recorded_at),
    s: calculateRealHealthScore(
      getRssiQuality(h.rssi ?? null),
      getHeapHealth(h.free_heap ?? null),
      getUptimeQuality(h.uptime_seconds ?? null),
    ),
  }));
  const valid = scored.filter(p => !isNaN(p.t)).sort((a, b) => a.t - b.t);
  if (valid.length < 5) return null;
  const spanHours = (valid[valid.length - 1].t - valid[0].t) / 3600000;
  if (spanHours < 1) return null;
  const { slope } = linearSlope(valid.map(p => p.s));
  if (slope >= -0.02) return null; // not degrading meaningfully
  const last = valid[valid.length - 1].s;
  const samplesToFail = (last - 40) / -slope;
  const hoursPerSample = spanHours / (valid.length - 1);
  const hours = samplesToFail * hoursPerSample;
  if (!isFinite(hours)) return null;
  return Math.max(0, Math.min(90, Math.round((hours / 24) * 10) / 10));
}

/* ─── Weighted health breakdown ─── */
export function getHealthBreakdown(d: {
  rssi: number | null;
  freeHeap: number | null;
  uptimeSeconds: number | null;
  rssiQuality: number;
  heapHealth: number;
  uptimeQuality: number;
}): HealthComponentScore[] {
  const mb = (bytes: number) =>
    bytes >= 1024 * 1024 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
  return [
    {
      key: 'rssi',
      label: 'Signal',
      score: d.rssiQuality,
      weight: 0.4,
      detail: d.rssi !== null ? `${d.rssi} dBm` : 'No data',
    },
    {
      key: 'heap',
      label: 'Memory',
      score: d.heapHealth,
      weight: 0.35,
      detail: d.freeHeap !== null ? `${mb(d.freeHeap)} free` : 'No data',
    },
    {
      key: 'uptime',
      label: 'Uptime',
      score: d.uptimeQuality,
      weight: 0.25,
      detail: d.uptimeSeconds !== null ? formatUptime(d.uptimeSeconds) : 'No data',
    },
  ];
}

/* ─── Fleet statistics ─── */
export function getFleetStats(devices: Array<{ status: string; healthScore: number; rssi: number | null }>): FleetStats {
  const count = devices.length;
  const online = devices.filter(d => d.status === 'online').length;
  const avgScore = count > 0 ? Math.round(devices.reduce((s, d) => s + d.healthScore, 0) / count) : 0;
  const rssis = devices.map(d => d.rssi).filter((r): r is number => r !== null);
  const avgRssi = rssis.length > 0 ? Math.round(rssis.reduce((a, b) => a + b, 0) / rssis.length) : null;
  const atRisk = devices.filter(d => d.healthScore < 60).length;
  const distribution = { excellent: 0, good: 0, fair: 0, poor: 0, critical: 0 };
  for (const d of devices) {
    const label = getHealthLabel(d.healthScore);
    if (label === 'Excellent') distribution.excellent++;
    else if (label === 'Good') distribution.good++;
    else if (label === 'Fair') distribution.fair++;
    else if (label === 'Poor') distribution.poor++;
    else distribution.critical++;
  }
  return { count, online, avgScore, avgRssi, atRisk, distribution };
}

/* ─── Uptime formatting (shared, no UI deps) ─── */
export function formatUptime(seconds: number | null): string {
  if (seconds === null || isNaN(seconds)) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatBytes(bytes: number): string {
  if (bytes === null || bytes === undefined || isNaN(bytes)) return '—';
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round(bytes)} B`;
}

/* ─── Alert builder ─── */
export function buildDeviceAlerts(d: EnrichedDevice): EnrichedDeviceAlert[] {
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
      message: `Low memory (${formatBytes(d.freeHeap)} free)`,
    });
  }
  if (d.memTrend?.leaking) {
    alerts.push({
      type: 'heap_leak',
      severity: Math.abs(d.memTrend.rateKBh) > 15 ? 'critical' : 'warning',
      message: `Heap draining ~${Math.abs(d.memTrend.rateKBh)} KB/hour — possible leak`,
    });
  }
  if (d.status !== 'online') {
    alerts.push({ type: 'offline', severity: 'critical', message: 'Device is offline' });
  }
  const fw = d.firmwareVersion;
  if (fw && fw !== 'N/A' && fw !== 'unknown' && !fw.startsWith('2.')) {
    alerts.push({ type: 'firmware_old', severity: 'warning', message: `Firmware ${fw} may be outdated` });
  }
  if (d.uptimeSeconds !== null && d.uptimeSeconds > 30 * 86400) {
    alerts.push({
      type: 'uptime_long',
      severity: 'warning',
      message: `Uptime ${formatUptime(d.uptimeSeconds)} — schedule maintenance reboot`,
    });
  }
  if (d.cpuFreq !== null && d.cpuFreq < 80) {
    alerts.push({
      type: 'cpu_low',
      severity: d.cpuFreq < 40 ? 'critical' : 'warning',
      message: `CPU throttled at ${d.cpuFreq} MHz`,
    });
  }
  if (d.wifiChannel !== null && ![1, 6, 11].includes(d.wifiChannel)) {
    alerts.push({
      type: 'wifi_chan',
      severity: 'warning',
      message: `Wi-Fi channel ${d.wifiChannel} may overlap — prefer 1, 6 or 11`,
    });
  }
  return alerts;
}

/* ─── Maintenance recommendations ─── */
export function getMaintenanceActions(d: EnrichedDevice): MaintenanceAction[] {
  const actions: MaintenanceAction[] = [];
  if (d.status !== 'online') {
    actions.push({
      id: 'offline',
      priority: 'high',
      title: 'Device offline',
      description: 'Check power source and network connectivity, then verify the device is booting.',
      icon: 'power',
    });
  }
  if (d.rssi !== null && d.rssi < -80) {
    actions.push({
      id: 'signal',
      priority: d.rssi < -90 ? 'high' : 'medium',
      title: 'Weak Wi-Fi signal',
      description: `RSSI ${d.rssi} dBm — move the device closer to the gateway or add a high-gain antenna.`,
      icon: 'signal',
    });
  }
  if (d.memTrend?.leaking) {
    actions.push({
      id: 'heap-leak',
      priority: 'high',
      title: 'Memory leak detected',
      description: `Free heap falling ~${Math.abs(d.memTrend.rateKBh)} KB/hour. Restart the device and inspect the firmware for leaks.`,
      icon: 'cpu',
    });
  }
  if (d.freeHeap !== null && d.freeHeap < 20000) {
    actions.push({
      id: 'heap-low',
      priority: d.freeHeap < 10000 ? 'high' : 'medium',
      title: 'Low free memory',
      description: `Only ${formatBytes(d.freeHeap)} free. A reboot will reclaim memory.`,
      icon: 'cpu',
    });
  }
  if (d.uptimeSeconds !== null && d.uptimeSeconds > 30 * 86400) {
    actions.push({
      id: 'uptime',
      priority: 'low',
      title: 'Long uptime',
      description: `Running ${formatUptime(d.uptimeSeconds)} — plan a maintenance reboot during a quiet window.`,
      icon: 'clock',
    });
  }
  if (d.firmwareVersion && d.firmwareVersion !== 'N/A' && d.firmwareVersion !== 'unknown' && !d.firmwareVersion.startsWith('2.')) {
    actions.push({
      id: 'firmware',
      priority: 'medium',
      title: 'Firmware update available',
      description: `Device is on ${d.firmwareVersion}. Update to the latest 2.x build for fixes and improvements.`,
      icon: 'download',
    });
  }
  if (d.cpuFreq !== null && d.cpuFreq < 80) {
    actions.push({
      id: 'cpu',
      priority: 'medium',
      title: 'CPU throttled',
      description: `CPU at ${d.cpuFreq} MHz — check thermals and the power profile.`,
      icon: 'cpu',
    });
  }
  if (d.wifiChannel !== null && ![1, 6, 11].includes(d.wifiChannel)) {
    actions.push({
      id: 'channel',
      priority: 'low',
      title: 'Suboptimal Wi-Fi channel',
      description: `Channel ${d.wifiChannel} can overlap neighbouring APs — prefer channels 1, 6 or 11.`,
      icon: 'wifi',
    });
  }
  if (d.healthTrend?.direction === 'degrading') {
    actions.push({
      id: 'trend',
      priority: 'medium',
      title: 'Health degrading',
      description: `Health score falling ~${Math.abs(d.healthTrend.slope).toFixed(1)}/sample. Investigate the weakest subsystem below.`,
      icon: 'signal',
    });
  }
  return actions;
}
