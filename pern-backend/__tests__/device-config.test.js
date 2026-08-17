/**
 * Device Config Tests
 * Covers normalizeDeviceConfig + defaults used by the MQTT config push route.
 */

const { normalizeDeviceConfig, DEFAULT_CONFIG } = require('../services/device-config');

describe('normalizeDeviceConfig', () => {
  it('returns defaults shape', () => {
    expect(DEFAULT_CONFIG.interval).toBe(15000);
    expect(DEFAULT_CONFIG.sensors).toEqual({});
  });

  it('accepts a valid interval', () => {
    const { config, error } = normalizeDeviceConfig({ interval: 5000 });
    expect(error).toBeUndefined();
    expect(config.interval).toBe(5000);
  });

  it('rounds fractional intervals', () => {
    const { config } = normalizeDeviceConfig({ interval: 1000.6 });
    expect(config.interval).toBe(1001);
  });

  it('rejects out-of-range intervals', () => {
    expect(normalizeDeviceConfig({ interval: 100 }).error).toContain('interval');
    expect(normalizeDeviceConfig({ interval: 3600001 }).error).toContain('interval');
    expect(normalizeDeviceConfig({ interval: 'fast' }).error).toContain('interval');
  });

  it('normalizes sensors to booleans', () => {
    const { config } = normalizeDeviceConfig({ sensors: { temperature: 1, humidity: 0, pressure: 'yes' } });
    expect(config.sensors).toEqual({ temperature: true, humidity: false, pressure: true });
  });

  it('rejects non-object sensors', () => {
    expect(normalizeDeviceConfig({ sensors: ['temperature'] }).error).toContain('sensors');
    expect(normalizeDeviceConfig({ sensors: 'all' }).error).toContain('sensors');
  });

  it('rejects empty config payload', () => {
    expect(normalizeDeviceConfig({}).error).toContain('interval or sensors');
    expect(normalizeDeviceConfig().error).toContain('interval or sensors');
  });

  it('accepts interval and sensors together', () => {
    const { config } = normalizeDeviceConfig({ interval: 30000, sensors: { temperature: true } });
    expect(config.interval).toBe(30000);
    expect(config.sensors.temperature).toBe(true);
  });
});
