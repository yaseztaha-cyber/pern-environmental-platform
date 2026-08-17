const cams = require('../services/sources/cams-source');

describe('CAMS Source Adapter (v4.0)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetchByLocation falls back to a normalized simulation when no key', async () => {
    delete process.env.CAMS_API_KEY;
    const sample = await cams.fetchByLocation(30.5, 31.2);
    expect(sample.latitude).toBe(30.5);
    expect(sample.longitude).toBe(31.2);
    expect(sample.pm25).toBeTypeOf('number');
    expect(sample.pm25).toBeGreaterThan(0);
    expect(sample.pm10).toBeTypeOf('number');
  });

  it('fetchByLocation falls back to simulation on network failure', async () => {
    process.env.CAMS_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const sample = await cams.fetchByLocation(30.5, 31.2);
    expect(sample.pm25).toBeTypeOf('number');
    expect(sample.pm25).toBeGreaterThan(0);
  });

  it('maps the CAMS pm2p5 species to the engine pm25 field', async () => {
    process.env.CAMS_API_KEY = 'test-key';
    process.env.CAMS_POLL_MS = '1';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ request_id: 'job-1' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'successful' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ pm2p5: 33.5, pm10: 55.0, no2: 14.0, o3: 70.0, so2: 3.0 }) });
    vi.stubGlobal('fetch', fetchMock);
    const sample = await cams.fetchByLocation(30.5, 31.2);
    expect(sample.pm25).toBe(33.5);
    expect(sample.pm10).toBe(55.0);
  });

  it('polls the ADS job until successful and returns normalized values', async () => {
    process.env.CAMS_API_KEY = 'test-key';
    process.env.CAMS_POLL_MS = '1';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ request_id: 'job-2' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'queued' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'successful' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ pm2p5: 20.0, pm10: 30.0 }) });
    vi.stubGlobal('fetch', fetchMock);
    const sample = await cams.fetchByLocation(30.5, 31.2);
    expect(sample.pm25).toBe(20.0);
    expect(sample.pm10).toBe(30.0);
    expect(fetchMock.mock.calls.length).toBe(4);
  });

  it('exports the adapter contract', () => {
    expect(cams.id).toBe('cams');
    expect(cams.baseTrust).toBe(0.85);
    expect(typeof cams.fetchLatest).toBe('function');
  });
});
