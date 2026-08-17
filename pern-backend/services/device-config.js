/**
 * Device runtime config normalization for MQTT config pushes.
 * Contract: pushes are published to `pern/devices/{deviceId}/config`.
 */

const DEFAULT_CONFIG = {
  interval: 15000,
  sensors: {},
};

function normalizeDeviceConfig(payload = {}) {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return { error: 'config must be a JSON object' };
  }
  const result = {};
  if (payload.interval != null) {
    const interval = Number(payload.interval);
    if (!Number.isFinite(interval) || interval < 500 || interval > 3600000) {
      return { error: 'interval must be a number between 500 and 3600000 ms' };
    }
    result.interval = Math.round(interval);
  }
  if (payload.sensors != null) {
    if (typeof payload.sensors !== 'object' || payload.sensors === null || Array.isArray(payload.sensors)) {
      return { error: 'sensors must be an object mapping sensor key to boolean' };
    }
    const sensors = {};
    for (const [key, enabled] of Object.entries(payload.sensors)) {
      if (typeof key !== 'string' || key.length === 0 || key.length > 32) {
        return { error: `invalid sensor key: ${key}` };
      }
      sensors[key] = Boolean(enabled);
    }
    result.sensors = sensors;
  }
  if (Object.keys(result).length === 0) {
    return { error: 'config must include interval or sensors' };
  }
  return { config: result };
}

module.exports = { normalizeDeviceConfig, DEFAULT_CONFIG };
