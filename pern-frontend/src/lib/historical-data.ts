/**
 * PERN Historical Data Store
 * 
 * Stores real EHI values per device (Live Mode).
 * This data is used to make more accurate, device-specific predictions.
 */

const MAX_HISTORY = 50;

const deviceHistories = new Map<string, number[]>();
let lastUpdateTime = 0;

export function addEHIReading(ehiValue: number, deviceId?: string) {
  if (typeof ehiValue !== 'number' || isNaN(ehiValue)) return;

  const key = deviceId || 'default';
  if (!deviceHistories.has(key)) {
    deviceHistories.set(key, []);
  }
  const history = deviceHistories.get(key)!;
  history.push(ehiValue);
  if (history.length > MAX_HISTORY) {
    history.shift();
  }
  lastUpdateTime = Date.now();
}

export function getEHIHistory(deviceId?: string): number[] {
  const key = deviceId || 'default';
  return [...(deviceHistories.get(key) || [])];
}

export function getLastEHI(deviceId?: string): number | null {
  const history = getEHIHistory(deviceId);
  if (history.length === 0) return null;
  return history[history.length - 1];
}

export function clearHistory(deviceId?: string) {
  if (deviceId) {
    deviceHistories.delete(deviceId);
  } else {
    deviceHistories.clear();
  }
  lastUpdateTime = 0;
}

export function getHistoryLength(deviceId?: string): number {
  const key = deviceId || 'default';
  return (deviceHistories.get(key) || []).length;
}

export function getLastUpdateTime(): number {
  return lastUpdateTime;
}
