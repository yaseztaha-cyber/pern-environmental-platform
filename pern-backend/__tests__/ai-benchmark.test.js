const benchmarkClient = require('../services/ai-benchmark-client');

const SAMPLE = {
  available: true,
  generated_utc: '2026-08-12T03:32:40Z',
  yardstick: { deg_f: 3.0, deg_c: 1.667 },
  protocol: 'calibrate on first 60%...',
  pern: { agriculture: { '1d': { anomaly: { rmse: 1.131, accuracy_within: { '1.667': 0.98 } } } } },
  competitors: [{ label: 'NWS', horizon: '1-3 d', lo: 90, hi: 95 }],
};

describe('AI Benchmark Client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    benchmarkClient.resetCache();
  });

  it('returns the published tables from pern-ai', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => SAMPLE,
    }));
    const tables = await benchmarkClient.getBenchmark();
    expect(tables.available).toBe(true);
    expect(tables.yardstick.deg_c).toBe(1.667);
    expect(tables.competitors.length).toBe(1);
    expect(tables.pern.agriculture['1d'].anomaly.accuracy_within['1.667']).toBe(0.98);
  });

  it('returns null and never throws when pern-ai is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const tables = await benchmarkClient.getBenchmark();
    expect(tables).toBeNull();
    expect(benchmarkClient.getLastError()).toContain('offline');
  });

  it('returns null when pern-ai reports unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ available: false, detail: 'no benchmark tables' }),
    }));
    expect(await benchmarkClient.getBenchmark()).toBeNull();
  });

  it('caches the fetched tables within TTL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => SAMPLE });
    vi.stubGlobal('fetch', fetchMock);
    await benchmarkClient.getBenchmark();
    await benchmarkClient.getBenchmark();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
