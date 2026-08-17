import { describe, it, expect } from 'vitest';
import {
  getRssiQuality,
  getHeapHealth,
  getUptimeQuality,
  getCpuHealth,
  calculateRealHealthScore,
  getHealthLabel,
  getScoreAccent,
  getHealthTrend,
  getMemoryTrend,
  estimateRemainingUsefulLife,
  getHealthBreakdown,
  getFleetStats,
  formatUptime,
  formatBytes,
  buildDeviceAlerts,
  getMaintenanceActions,
} from './device-health';
import type { EnrichedDevice, RealDeviceHealth } from './types';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

function row(over: Partial<RealDeviceHealth> & { recorded_at: string }): RealDeviceHealth {
  return { ...over };
}

function healthyRow(t: number): RealDeviceHealth {
  return {
    recorded_at: new Date(t).toISOString(),
    rssi: -45,
    free_heap: 240 * 1024,
    uptime_seconds: 48 * 3600,
    cpu_freq: 240,
    wifi_channel: 1,
  };
}

function degradingHistory(samples = 10, spanHours = 10): RealDeviceHealth[] {
  const out: RealDeviceHealth[] = [];
  for (let i = 0; i < samples; i++) {
    const frac = i / (samples - 1);
    out.push(
      row({
        recorded_at: new Date(spanHours * HOUR * (i / (samples - 1))).toISOString(),
        rssi: -40 - frac * 45,
        free_heap: 240 * 1024,
        uptime_seconds: 48 * 3600,
      }),
    );
  }
  return out;
}

function device(over: Partial<EnrichedDevice> = {}): EnrichedDevice {
  return {
    id: 'dev-1',
    name: 'Device One',
    type: 'Sensor',
    status: 'online',
    firmwareVersion: '2.4.1',
    ipAddress: '192.168.1.10',
    rssi: -45,
    freeHeap: 240 * 1024,
    uptimeSeconds: 48 * 3600,
    wifiChannel: 1,
    cpuFreq: 240,
    healthScore: 95,
    rssiQuality: 100,
    heapHealth: 100,
    uptimeQuality: 100,
    cpuHealth: 100,
    breakdown: [],
    healthTrend: null,
    memTrend: null,
    rulDays: null,
    sensorReports: [],
    lastSeen: new Date().toISOString(),
    recordedAt: new Date().toISOString(),
    history: [],
    alerts: [],
    ...over,
  };
}

describe('quality scoring (device-health)', () => {
  it('maps RSSI dBm to 0-100 quality', () => {
    expect(getRssiQuality(-30)).toBe(100);
    expect(getRssiQuality(-60)).toBe(50);
    expect(getRssiQuality(-90)).toBe(0);
    expect(getRssiQuality(null)).toBe(0);
    expect(getRssiQuality(-120)).toBe(0); // clamped
  });

  it('maps free heap bytes to 0-100 health', () => {
    expect(getHeapHealth(320 * 1024)).toBe(100);
    expect(getHeapHealth(150 * 1024)).toBeGreaterThan(50);
    expect(getHeapHealth(null)).toBe(0);
  });

  it('maps uptime seconds to 0-100 quality', () => {
    expect(getUptimeQuality(24 * 3600)).toBe(100);
    expect(getUptimeQuality(null)).toBe(0);
  });

  it('maps CPU frequency to 0-100 health', () => {
    expect(getCpuHealth(240)).toBe(100);
    expect(getCpuHealth(80)).toBe(50);
    expect(getCpuHealth(null)).toBe(0);
    expect(getCpuHealth(40)).toBeLessThan(50);
  });

  it('combines components with 40/35/25 weights', () => {
    expect(calculateRealHealthScore(100, 100, 100)).toBe(100);
    expect(calculateRealHealthScore(0, 0, 0)).toBe(0);
    expect(calculateRealHealthScore(100, 0, 0)).toBe(40);
  });

  it('labels and accents scores', () => {
    expect(getHealthLabel(92)).toBe('Excellent');
    expect(getHealthLabel(80)).toBe('Good');
    expect(getHealthLabel(65)).toBe('Fair');
    expect(getHealthLabel(45)).toBe('Poor');
    expect(getHealthLabel(20)).toBe('Critical');
    expect(getScoreAccent(85)).toBe('emerald');
    expect(getScoreAccent(70)).toBe('amber');
    expect(getScoreAccent(30)).toBe('rose');
  });
});

describe('trends & lifecycle (device-health)', () => {
  it('returns null for short histories', () => {
    expect(getHealthTrend([healthyRow(0), healthyRow(HOUR)])).toBeNull();
    expect(getMemoryTrend([healthyRow(0), healthyRow(HOUR)])).toBeNull();
    expect(estimateRemainingUsefulLife(Array.from({ length: 4 }, (_, i) => healthyRow(i * HOUR)))).toBeNull();
  });

  it('detects a degrading health trend', () => {
    const trend = getHealthTrend(degradingHistory());
    expect(trend).not.toBeNull();
    expect(trend!.direction).toBe('degrading');
    expect(trend!.slope).toBeLessThan(-0.4);
    expect(trend!.samples).toBe(10);
  });

  it('detects a stable health trend when nothing changes', () => {
    const hist = Array.from({ length: 8 }, (_, i) => healthyRow(i * HOUR));
    const trend = getHealthTrend(hist);
    expect(trend).not.toBeNull();
    expect(trend!.direction).toBe('stable');
  });

  it('flags a leaking memory trend when heap drops fast', () => {
    const t0 = Date.now();
    const hist = Array.from({ length: 5 }, (_, i) =>
      row({ recorded_at: new Date(t0 + i * 10 * MIN).toISOString(), free_heap: (200 - i * 10) * 1024 }),
    );
    const trend = getMemoryTrend(hist);
    expect(trend).not.toBeNull();
    expect(trend!.leaking).toBe(true);
    expect(trend!.rateKBh).toBeLessThan(-5);
  });

  it('does not flag a leak for stable heap', () => {
    const t0 = Date.now();
    const hist = Array.from({ length: 5 }, (_, i) =>
      row({ recorded_at: new Date(t0 + i * 10 * MIN).toISOString(), free_heap: 200 * 1024 }),
    );
    const trend = getMemoryTrend(hist);
    expect(trend).not.toBeNull();
    expect(trend!.leaking).toBe(false);
  });

  it('estimates remaining useful life for a degrading device, capped at 90 days', () => {
    const rul = estimateRemainingUsefulLife(degradingHistory());
    expect(rul).not.toBeNull();
    expect(rul).toBeGreaterThan(0);
    expect(rul).toBeLessThanOrEqual(90);
  });

  it('returns null RUL when the device is not degrading', () => {
    const hist = Array.from({ length: 8 }, (_, i) => healthyRow(i * HOUR));
    expect(estimateRemainingUsefulLife(hist)).toBeNull();
  });
});

describe('breakdown, fleet stats & formatting (device-health)', () => {
  it('builds weighted breakdown with human details', () => {
    const b = getHealthBreakdown({
      rssi: -45,
      freeHeap: 128 * 1024,
      uptimeSeconds: 2 * 3600,
      rssiQuality: 75,
      heapHealth: 60,
      uptimeQuality: 50,
    });
    expect(b.map(x => x.key)).toEqual(['rssi', 'heap', 'uptime']);
    expect(b.reduce((s, x) => s + x.weight, 0)).toBeCloseTo(1);
    expect(b[0].detail).toContain('-45 dBm');
    expect(b[1].detail).toContain('128 KB');
    expect(b[2].detail).toContain('2h');
  });

  it('computes fleet stats with distribution', () => {
    const stats = getFleetStats([
      { status: 'online', healthScore: 95, rssi: -45 },
      { status: 'online', healthScore: 50, rssi: -70 },
      { status: 'offline', healthScore: 20, rssi: null },
    ]);
    expect(stats.count).toBe(3);
    expect(stats.online).toBe(2);
    expect(stats.avgScore).toBe(55);
    expect(stats.avgRssi).toBe(-57);
    expect(stats.atRisk).toBe(2);
    expect(stats.distribution).toEqual({ excellent: 1, good: 0, fair: 0, poor: 1, critical: 1 });
  });

  it('formats uptime and bytes', () => {
    expect(formatUptime(null)).toBe('—');
    expect(formatUptime(3661)).toBe('1h 1m');
    expect(formatUptime(49 * 3600)).toBe('2d 1h');
    expect(formatUptime(90)).toBe('1m');
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(2 * 1048576)).toBe('2.0 MB');
  });
});

describe('alerts & maintenance (device-health)', () => {
  it('builds no alerts for a healthy device', () => {
    expect(buildDeviceAlerts(device())).toEqual([]);
  });

  it('flags weak signal and low memory', () => {
    const alerts = buildDeviceAlerts(device({ rssi: -85, freeHeap: 15000 }));
    expect(alerts.some(a => a.type === 'rssi_low')).toBe(true);
    expect(alerts.some(a => a.type === 'heap_low')).toBe(true);
  });

  it('flags memory leak, offline, outdated firmware, long uptime, throttled CPU and channel overlap', () => {
    const alerts = buildDeviceAlerts(
      device({
        status: 'offline',
        firmwareVersion: '1.9.0',
        uptimeSeconds: 40 * 86400,
        cpuFreq: 60,
        wifiChannel: 3,
        memTrend: { slope: -30, leaking: true, rateKBh: -25 },
      }),
    );
    const types = alerts.map(a => a.type);
    expect(types).toContain('heap_leak');
    expect(types).toContain('offline');
    expect(types).toContain('firmware_old');
    expect(types).toContain('uptime_long');
    expect(types).toContain('cpu_low');
    expect(types).toContain('wifi_chan');
  });

  it('recommends maintenance actions tied to observed conditions', () => {
    const actions = getMaintenanceActions(
      device({
        status: 'offline',
        rssi: -88,
        firmwareVersion: '1.9.0',
        memTrend: { slope: -20, leaking: true, rateKBh: -18 },
      }),
    );
    const ids = actions.map(a => a.id);
    expect(ids).toContain('offline');
    expect(ids).toContain('signal');
    expect(ids).toContain('heap-leak');
    expect(ids).toContain('firmware');
    const offline = actions.find(a => a.id === 'offline')!;
    expect(offline.priority).toBe('high');
  });

  it('returns no maintenance actions for a healthy device', () => {
    expect(getMaintenanceActions(device())).toEqual([]);
  });
});
