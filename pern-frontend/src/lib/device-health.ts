/**
 * PERN Device & Sensor Health + Lifecycle Management
 * 
 * Tracks:
 * - Device health score
 * - Sensor accuracy & drift
 * - Battery / Power health
 * - Connectivity health
 * - Estimated Remaining Useful Life (RUL)
 */

export interface SensorHealth {
  sensorType: string;
  lastValue: number;
  accuracy: number;           // 0-100
  drift: number;              // How much it has drifted from baseline
  lastCalibrated: string;
  readingsCount: number;
}

export interface DeviceHealth {
  deviceId: string;
  overallScore: number;       // 0-100
  batteryHealth: number;      // 0-100
  connectivityHealth: number; // 0-100
  hardwareHealth: number;     // 0-100
  sensorHealth: SensorHealth[];
  usageIntensity: 'low' | 'medium' | 'high';
  totalReadings: number;
  uptimeHours: number;
  lastSeen: string;
  estimatedRemainingDays: number;
  healthTrend: 'improving' | 'stable' | 'declining';
}

/**
 * Calculate estimated remaining life based on multiple factors
 */
export function calculateRemainingLife(health: Partial<DeviceHealth>): number {
  const baseLife = 1095; // ~3 years in days

  let remaining = baseLife;

  // Battery impact
  if (health.batteryHealth !== undefined) {
    remaining *= (health.batteryHealth / 100);
  }

  // Usage intensity impact
  if (health.usageIntensity) {
    const usageFactor = health.usageIntensity === 'high' ? 0.6 : 
                        health.usageIntensity === 'medium' ? 0.85 : 1.0;
    remaining *= usageFactor;
  }

  // Overall health impact
  if (health.overallScore !== undefined) {
    remaining *= (health.overallScore / 100);
  }

  // Connectivity issues reduce life
  if (health.connectivityHealth !== undefined && health.connectivityHealth < 70) {
    remaining *= 0.85;
  }

  return Math.max(30, Math.floor(remaining));
}

/**
 * Calculate overall device health score
 */
export function calculateDeviceHealthScore(metrics: {
  batteryHealth: number;
  connectivityHealth: number;
  hardwareHealth: number;
  avgSensorAccuracy: number;
}): number {
  const weights = {
    battery: 0.30,
    connectivity: 0.25,
    hardware: 0.20,
    sensors: 0.25
  };

  return Math.round(
    metrics.batteryHealth * weights.battery +
    metrics.connectivityHealth * weights.connectivity +
    metrics.hardwareHealth * weights.hardware +
    metrics.avgSensorAccuracy * weights.sensors
  );
}

/**
 * Generate realistic device health data
 */
export function generateDeviceHealth(deviceId: string, totalReadings: number): DeviceHealth {
  const uptimeHours = Math.floor(totalReadings / 3.5);
  const daysSinceLastSeen = Math.random() * 2;

  const batteryHealth = Math.max(35, Math.min(98, 92 - (uptimeHours / 200)));
  const connectivityHealth = daysSinceLastSeen > 1 ? 45 : 85 + Math.random() * 12;
  const hardwareHealth = 78 + Math.random() * 18;
  const avgSensorAccuracy = 82 + Math.random() * 15;

  const overallScore = calculateDeviceHealthScore({
    batteryHealth,
    connectivityHealth,
    hardwareHealth,
    avgSensorAccuracy
  });

  const usageIntensity = totalReadings > 2000 ? 'high' : 
                         totalReadings > 600 ? 'medium' : 'low';

  const estimatedRemainingDays = calculateRemainingLife({
    batteryHealth,
    usageIntensity,
    overallScore,
    connectivityHealth
  });

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
    healthTrend: overallScore > 75 ? 'stable' : overallScore > 55 ? 'improving' : 'declining'
  };
}