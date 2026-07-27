/**
 * PERN Device Lifecycle Management
 * Tracks device usage, uptime, and estimates remaining lifetime
 */

export interface DeviceLifecycle {
  id: string;
  name: string;
  type: string;
  totalReadings: number;
  uptimeHours: number;
  lastSeen: string;
  status: 'online' | 'offline' | 'warning';
  estimatedRemainingDays: number;
  healthScore: number; // 0-100
  usageIntensity: 'low' | 'medium' | 'high';
}

export interface DeviceEvent {
  timestamp: string;
  type: 'reading' | 'command' | 'alert' | 'restart';
  message: string;
}

const DEVICE_BASE_LIFETIME_DAYS = 1095; // ~3 years

export function calculateDeviceLifecycle(
  deviceId: string,
  name: string,
  type: string,
  totalReadings: number,
  lastSeenTimestamp: number
): DeviceLifecycle {
  const now = Date.now();
  const lastSeen = new Date(lastSeenTimestamp).toISOString();
  
  const daysSinceLastSeen = (now - lastSeenTimestamp) / (1000 * 3600 * 24);
  const uptimeHours = Math.max(12, Math.floor(totalReadings / 4.2));

  // Health calculation
  let health = 92;
  if (daysSinceLastSeen > 2) health -= 25;
  if (totalReadings < 200) health -= 15;

  // Usage intensity
  const intensity = totalReadings > 1800 ? 'high' : totalReadings > 600 ? 'medium' : 'low';

  // Remaining lifetime estimation
  const usageFactor = intensity === 'high' ? 1.4 : intensity === 'medium' ? 1.0 : 0.7;
  const remainingDays = Math.max(30, Math.round(
    (DEVICE_BASE_LIFETIME_DAYS - (uptimeHours / 24) * usageFactor) * (health / 100)
  ));

  return {
    id: deviceId,
    name,
    type,
    totalReadings,
    uptimeHours,
    lastSeen,
    status: daysSinceLastSeen > 1.5 ? 'offline' : 'online',
    estimatedRemainingDays: remainingDays,
    healthScore: Math.max(35, Math.min(98, health)),
    usageIntensity: intensity
  };
}