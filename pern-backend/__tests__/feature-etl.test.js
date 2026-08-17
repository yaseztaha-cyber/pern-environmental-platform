const featureEtl = require('../services/feature-etl');
const power = require('../services/sources/power-source');

describe('Feature ETL (v4.0)', () => {
  it('should generate a grid of points over the Nile Delta bbox', () => {
    const pts = featureEtl.gridPoints();
    expect(Array.isArray(pts)).toBe(true);
    expect(pts.length).toBeGreaterThan(10);
    for (const [lat, lng] of pts) {
      expect(lat).toBeGreaterThanOrEqual(29.5);
      expect(lat).toBeLessThanOrEqual(31.8);
      expect(lng).toBeGreaterThanOrEqual(29.7);
      expect(lng).toBeLessThanOrEqual(32.5);
    }
  });

  it('should build a feature vector with derived time features', () => {
    const row = featureEtl.buildFeatureVector({
      sample: {
        latitude: 30.5,
        longitude: 31.2,
        timestamp: '2026-06-15T00:00:00Z',
        temperature: 28.456,
        precipitation: 0,
        humidity: 55,
      },
      featureGroup: 'agriculture',
      sourceId: 'power',
      snapshot: 'test',
    });
    expect(row.feature_group).toBe('agriculture');
    expect(row.latitude).toBe(30.5);
    expect(row.features.temperature).toBe(28.46);
    expect(row.features.month).toBe(6);
    expect(row.features.day_of_year).toBe(166);
    expect(row.features.day_of_week).toBe(1);
    expect(row.provenance).toEqual(['power']);
    expect(row.quality).toBe(0.9);
  });

  it('should expose a normalized simulation fallback from the POWER adapter', async () => {
    const sample = await power.fetchByGeo(30.5, 31.2);
    expect(sample).toBeDefined();
    expect(sample.temperature).toBeTypeOf('number');
    expect(sample.latitude).toBe(30.5);
    expect(sample.longitude).toBe(31.2);
  });
});
