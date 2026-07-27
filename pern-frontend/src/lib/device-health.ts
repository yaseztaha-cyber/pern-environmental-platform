/**
 * PERN Device & Sensor Health + Lifecycle Management
 *
 * Tracks:
 * - Device health score (real + legacy mock)
 * - Sensor accuracy & drift
 * - Battery / Power health
 * - Connectivity health
 * - Estimated Remaining Useful Life (RUL)
 */

/* ─── Real device_health table row ─── */
export interface RealDeviceHealth {
  id: number;
  device_id: string;
  rssi: number | null;
  free_heap: number | null;
  uptime_seconds: number | null;
  firmware_version: string | null;
  ip_address: string | null;
  wifi_channel: number | null;
  cpu_freq: number | null;
  actuators: Record<string, unknown> | null;
  recorded_at: string;
}

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

/* ─── Legacy: estimated remaining life ─── */
export function calculateRemainingLife(health: Partial<LegacyDeviceHealth>): number {
  const baseLife = 1095;
  let remaining = baseLife;
  if (health.batteryHealth !== undefined) remaining *= (health.batteryHealth / 100);
  if (health.usageIntensity) {
    remaining *= health.usageIntensity === 'high' ? 0.6 : health.usageIntensity === 'medium' ? 0.85 : 1.0;
  }
  if (health.overallScore !== undefined) remaining *= (health.overallScore / 100);
  if (health.connectivityHealth !== undefined && health.connectivityHealth < 70) remaining *= 0.85;
  return Math.max(30, Math.floor(remaining));
}

/* ─── Legacy: overall device health score ─── */
export function calculateDeviceHealthScore(metrics: {
  batteryHealth: number;
  connectivityHealth: number;
  hardwareHealth: number;
  avgSensorAccuracy: number;
}): number {
  return Math.round(
    metrics.batteryHealth * 0.30 +
    metrics.connectivityHealth * 0.25 +
    metrics.hardwareHealth * 0.20 +
    metrics.avgSensorAccuracy * 0.25
  );
}

/* ─── Legacy: generate mock device health data ─── */
export function generateDeviceHealth(deviceId: string, totalReadings: number): LegacyDeviceHealth {
  const uptimeHours = Math.floor(totalReadings / 3.5);
  const daysSinceLastSeen = Math.random() * 2;
  const batteryHealth = Math.max(35, Math.min(98, 92 - (uptimeHours / 200)));
  const connectivityHealth = daysSinceLastSeen > 1 ? 45 : 85 + Math.random() * 12;
  const hardwareHealth = 78 + Math.random() * 18;
  const avgSensorAccuracy = 82 + Math.random() * 15;
  const overallScore = calculateDeviceHealthScore({ batteryHealth, connectivityHealth, hardwareHealth, avgSensorAccuracy });
  const usageIntensity = totalReadings > 2000 ? 'high' : totalReadings > 600 ? 'medium' : 'low';
  const estimatedRemainingDays = calculateRemainingLife({ batteryHealth, usageIntensity, overallScore, connectivityHealth });
  return {
    deviceId,
    overallScore: Math.round(overallScore),
    batteryHealth: Math.round(batteryHealth),
    connectivityHealth: Math.round(connectivityHealth),
    hardwareHealth: Math.round(hardwareHealth),
    sensorHealth: [],
    usageIntensity,
    totalReadings,
    uptimeHours,
    lastSeen: new Date(Date.now() - daysSinceLastSeen * 86400000).toISOString(),
    estimatedRemainingDays,
    healthTrend: overallScore > 75 ? 'stable' : overallScore > 55 ? 'improving' : 'declining',
  };
}

/* ─── Legacy types ─── */
export interface SensorHealth {
  sensorType: string;
  lastValue: number;
  accuracy: number;
  drift: number;
  lastCalibrated: string;
  readingsCount: number;
}

export interface LegacyDeviceHealth {
  deviceId: string;
  overallScore: number;
  batteryHealth: number;
  connectivityHealth: number;
  hardwareHealth: number;
  sensorHealth: SensorHealth[];
  usageIntensity: 'low' | 'medium' | 'high';
  totalReadings: number;
  uptimeHours: number;
  lastSeen: string;
  estimatedRemainingDays: number;
  healthTrend: 'improving' | 'stable' | 'declining';
}
