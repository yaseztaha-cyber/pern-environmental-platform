const forecastClient = require('../services/ai-forecast-client');

const SAMPLE = {
  horizon_days: 7,
  method: 'anomaly',
  center: 26.4,
  lower: 21.3,
  upper: 31.5,
  width: 10.2,
  coverage: 0.93,
  confidence: 82.4,
  site_index: 0,
  bin_key: 'm08|v0|a1',
  alpha: 0.04,
  inflation: 1.1825,
  rho: 0.998,
  target_std: 3.0,
};

describe('AI Forecast Client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    forecastClient.resetCache();
  });

  it('returns the PERN forecast from pern-ai', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => SAMPLE,
    }));
    const fc = await forecastClient.getForecast({
      latitude: 30.0, longitude: 31.5, horizon: 7, target_date: '2026-08-14',
    });
    expect(fc.horizon_days).toBe(7);
    expect(fc.center).toBeCloseTo(26.4);
    expect(fc.method).toBe('anomaly');
    expect(fc.coverage).toBeGreaterThan(0);
  });

  it('rejects invalid input without calling pern-ai', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await forecastClient.getForecast({ horizon: 7 })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null and never throws when pern-ai is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const fc = await forecastClient.getForecast({
      latitude: 30.0, longitude: 31.5, horizon: 1, target_date: '2026-08-14',
    });
    expect(fc).toBeNull();
    expect(forecastClient.getLastError()).toContain('offline');
  });

  it('caches identical requests within TTL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => SAMPLE });
    vi.stubGlobal('fetch', fetchMock);
    const input = { latitude: 30.0, longitude: 31.5, horizon: 30, target_date: '2026-08-14' };
    await forecastClient.getForecast(input);
    await forecastClient.getForecast(input);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
