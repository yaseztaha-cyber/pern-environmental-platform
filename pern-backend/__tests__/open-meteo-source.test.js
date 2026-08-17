const openMeteo = require('../services/sources/open-meteo-source');

const daily = (n) => {
  const time = [];
  const mean = [];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + i);
    time.push(d.toISOString().slice(0, 10));
    mean.push(20 + i);
  }
  return { time, temperature_2m_mean: mean };
};

describe('Open-Meteo NWP Source (v4.0)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetchByGeo falls back to a normalized simulation when offline', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const sample = await openMeteo.fetchByGeo(30.5, 31.2);
    expect(sample).toBeDefined();
    expect(sample.latitude).toBe(30.5);
    expect(sample.longitude).toBe(31.2);
    expect(sample.temperature).toBeTypeOf('number');
    expect(sample.nwp_lead_hours).toBeGreaterThanOrEqual(24);
  });

  it('fetchForecast parses daily rows with lead hours', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ daily: daily(3) }),
    }));
    const rows = await openMeteo.fetchForecast(30.5, 31.2, 3);
    expect(rows.length).toBe(3);
    expect(rows[0].temperature).toBe(20);
    expect(rows[0].nwp_lead_hours).toBe(0);
    expect(rows[2].nwp_lead_hours).toBeGreaterThanOrEqual(48);
    expect(rows[0].precipitation).toBeNull();
  });

  it('fetchArchive parses ERA5 archive rows', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ daily: daily(2) }),
    }));
    const start = new Date(Date.UTC(2026, 0, 1));
    const end = new Date(Date.UTC(2026, 0, 2));
    const rows = await openMeteo.fetchArchive(30.5, 31.2, start, end);
    expect(rows.length).toBe(2);
    expect(rows[0].nwp_lead_hours).toBe(0);
  });

  it('fetchDailySeries routes a past window to the archive API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ daily: daily(2) }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const start = new Date(Date.UTC(2026, 0, 1));
    const end = new Date(Date.UTC(2026, 0, 2));
    const rows = await openMeteo.fetchDailySeries(30.5, 31.2, start, end);
    expect(rows.length).toBe(2);
    expect(fetchMock.mock.calls[0][0]).toContain('archive-api.open-meteo.com');
  });

  it('fetchDailySeries falls back to simulation rows on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const start = new Date(Date.UTC(2026, 0, 1));
    const end = new Date(Date.UTC(2026, 0, 5));
    const rows = await openMeteo.fetchDailySeries(30.5, 31.2, start, end);
    expect(rows.length).toBe(5);
    expect(rows[0].temperature).toBeTypeOf('number');
  });
});
