const normalizer = require('../services/data-normalizer');
const globalIngestion = require('../services/global-ingestion');
const trustEngine = require('../services/trust-engine');
const complianceEngine = require('../services/compliance-engine');
const windEngine = require('../services/wind-engine');
const publicApi = require('../services/public-api');
const waqi = require('../services/sources/waqi-source');
const openaq = require('../services/sources/openaq-source');
const sensorCommunity = require('../services/sources/sensor-community-source');
const nasaFirms = require('../services/sources/nasa-firms-source');
const sentinel5p = require('../services/sources/sentinel5p-source');
const satelliteEngine = require('../services/satellite-engine');

describe('Data Normalizer', () => {
  it('should normalize raw values with units', () => {
    const normalized = normalizer.normalize({ pm25: 42.456, pm10: '78', o3: null, temperature: 22.1 });
    expect(normalized.pm25.value).toBe(42.46);
    expect(normalized.pm25.unit).toBe('ug/m3');
    expect(normalized.pm10.value).toBe(78);
    expect(normalized.o3).toBeUndefined();
  });

  it('should build a full normalized reading with provenance fields', () => {
    const reading = normalizer.normalizeReading({
      source_type: 'waqi', source_id: 's1', latitude: 30, longitude: 31,
      parameters: { pm25: 50, aqi: 75 }, source_quality: 0.85,
    });
    expect(reading.source_type).toBe('waqi');
    expect(reading.source_quality).toBe(0.85);
    expect(reading.parameters.aqi.value).toBe(75);
    expect(reading.timestamp).toBeDefined();
  });

  it('should exclude metadata keys from parameters', () => {
    const reading = normalizer.normalizeReading({
      source_type: 'openaq', source_id: 's2', latitude: 1, longitude: 2,
      parameters: { pm25: 10, latitude: 1, longitude: 2, timestamp: 'x' }, source_quality: 0.8,
    });
    expect(Object.keys(reading.parameters)).toEqual(['pm25']);
  });

  it('should produce a DB row via toDBRow', () => {
    const row = normalizer.toDBRow({ source_type: 'waqi', source_id: 's3', timestamp: '2026-01-01', parameters: { pm25: { value: 5, unit: 'ug/m3' } }, raw_response: {}, source_quality: 0.5 }, 7);
    expect(row.sourceType).toBe('waqi');
    expect(row.virtualSensorId).toBe(7);
    expect(row.dataQuality).toBe(0.5);
  });
});

describe('Source Adapters', () => {
  it('WAQI returns normalized params (simulated without key)', async () => {
    const data = await waqi.fetchByGeo(30.0444, 31.2357);
    expect(typeof data.pm25).toBe('number');
    expect(typeof data.aqi).toBe('number');
  });

  it('OpenAQ returns normalized params (simulated without key)', async () => {
    const data = await openaq.fetchLatest();
    expect(typeof data.pm25).toBe('number');
    expect(typeof data.o3).toBe('number');
  });

  it('Sensor.Community returns readings (fallback on failure)', async () => {
    const data = await sensorCommunity.fetchByCountry('ZZ');
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0].pm25).toBeDefined();
  });

  it('NASA FIRMS returns fire records (simulated without key)', async () => {
    const data = await nasaFirms.fetchFires(30, 31);
    expect(Array.isArray(data)).toBe(true);
    expect(data[0].frp).toBeDefined();
    expect(data[0].brightness).toBeDefined();
  });

  it('Sentinel-5P adapter simulates values when live fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const data = await sentinel5p.fetchSatelliteData(30.04, 31.24);
    expect(typeof data.no2).toBe('number');
    expect(typeof data.o3).toBe('number');
    expect(typeof data.ch4).toBe('number');
    vi.unstubAllGlobals();
  });

  it('Sentinel-5P adapter maps real hourly values', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        hourly: {
          time: ['2026-08-03T10:00', '2026-08-03T11:00'],
          nitrogen_dioxide: [null, 31.2],
          ozone: [null, 55.4],
          pm2_5: [null, 17.9],
        },
      }),
    }));
    const data = await sentinel5p.fetchSatelliteData(30.04, 31.24);
    expect(data.no2).toBe(31.2);
    expect(data.o3).toBe(55.4);
    expect(data.pm25).toBe(17.9);
    expect(data.latitude).toBe(30.04);
    vi.unstubAllGlobals();
  });
});

describe('Satellite Engine', () => {
  it('fetchSentinelData falls back to simulation on fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const result = await satelliteEngine.fetchSentinelData(30.04, 31.24);
    expect(result.source).toBe('sentinel_5p_simulated');
    expect(typeof result.parameters.no2.value).toBe('number');
    expect(result.parameters.no2.unit).toBe('ug/m3');
    vi.unstubAllGlobals();
  });

  it('fetchSentinelData uses real CAMS values when fetch succeeds', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        hourly: {
          time: ['2026-08-03T10:00', '2026-08-03T11:00'],
          nitrogen_dioxide: [null, 25.5],
          ozone: [null, 90.0],
          sulphur_dioxide: [null, 40.1],
          carbon_monoxide: [null, 190.0],
          methane: [null, 1500.0],
          pm2_5: [null, 20.0],
          aerosol_optical_depth: [null, 0.3],
        },
      }),
    }));
    const result = await satelliteEngine.fetchSentinelData(30.04, 31.24);
    expect(result.source).toBe('sentinel_5p_cams');
    expect(result.parameters.no2.value).toBe(25.5);
    expect(result.parameters.aerosol_index.value).toBe(0.3);
    expect(result.timestamp).toMatch(/^2026-08-03T11:00/);
    vi.unstubAllGlobals();
  });

  it('createVirtualSensor records a pin with latest values', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const sensor = await satelliteEngine.createVirtualSensor(31.2, 29.9, 'Test Pin');
    expect(sensor.source_type).toBe('sentinel_5p');
    expect(sensor.latest_values.no2.value).toBeDefined();
    expect(satelliteEngine.getVirtualSensor(sensor.id).id).toBe(sensor.id);
    vi.unstubAllGlobals();
  });

  it('getCoverage reports last source and params', () => {
    const coverage = satelliteEngine.getCoverage();
    expect(coverage.parameters).toContain('NO2');
    expect(coverage.resolution).toContain('CAMS');
  });
});

describe('Global Ingestion Engine', () => {
  it('should register sources and list them', () => {
    globalIngestion.registerSource({ id: 'test_src', name: 'Test', priority: 1 });
    const sources = globalIngestion.listSources();
    expect(sources.some(s => s.id === 'test_src')).toBe(true);
  });

  it('should run a full global scan', async () => {
    const result = await globalIngestion.runGlobalScan(30.0444, 31.2357);
    expect(result.sources_queried).toBeGreaterThanOrEqual(5);
    expect(result.readings.length).toBeGreaterThan(0);
    expect(result.readings[0].source_type).toBeDefined();
  });

  it('should store and retrieve normalized readings', async () => {
    await globalIngestion.runGlobalScan(30.0444, 31.2357);
    const stats = globalIngestion.getStats();
    expect(stats.total_readings).toBeGreaterThan(0);
    expect(stats.by_source.waqi).toBeGreaterThan(0);
    const waqiReadings = globalIngestion.getStoredReadings('waqi', 5);
    expect(waqiReadings.length).toBeGreaterThan(0);
    expect(waqiReadings.every(r => r.source_type === 'waqi')).toBe(true);
  });

  it('should start and stop the cron scheduler', () => {
    const count = globalIngestion.startScheduler();
    expect(count).toBeGreaterThan(0);
    expect(globalIngestion.getJobs().length).toBe(count);
    globalIngestion.stopScheduler();
    expect(globalIngestion.getJobs().length).toBe(0);
  });

  it('should expose MQTT client setter', () => {
    const mockMqtt = { publish: vi.fn() };
    globalIngestion.setMqttClient(mockMqtt);
    expect(globalIngestion.mqttClient).toBe(mockMqtt);
    globalIngestion.setMqttClient(null);
  });
});

describe('Trust Engine', () => {
  it('should compute a confidence score within bounds', () => {
    const { overall, factors } = trustEngine.computeConfidence('waqi', { source_id: 's1', parameters: { pm25: { value: 40 } } }, []);
    expect(overall).toBeGreaterThan(0);
    expect(overall).toBeLessThanOrEqual(0.98);
    expect(factors.baseTrust).toBe(0.85);
  });

  it('should penalize spatial inconsistency', () => {
    const base = trustEngine.computeConfidence('sensor_community', { source_id: 's2', parameters: { pm25: { value: 10 } } }, []);
    const far = trustEngine.computeConfidence('sensor_community', { source_id: 's3', parameters: { pm25: { value: 10 } } }, [{ parameters: { pm25: { value: 200 } } }]);
    expect(far.overall).toBeLessThan(base.overall);
  });

  it('should flag and list anomalies', () => {
    trustEngine.flagAnomaly({ source_type: 'openaq', source_id: 'a1', latitude: 1, longitude: 2, parameters: { pm25: { value: 5 } } }, 'test reason');
    const anomalies = trustEngine.getAnomalies(10);
    expect(anomalies.length).toBeGreaterThan(0);
    expect(anomalies[anomalies.length - 1].reason).toBe('test reason');
  });

  it('should recalibrate across source types', () => {
    const result = trustEngine.recalibrate([
      { source_type: 'waqi', source_id: 'w1', parameters: { pm25: { value: 10 } } },
      { source_type: 'openaq', source_id: 'o1', parameters: { pm25: { value: 12 } } },
    ]);
    expect(result.sources_calibrated).toBe(2);
  });
});

describe('Compliance Engine', () => {
  it('should expose 20 country frameworks', () => {
    expect(complianceEngine.listFrameworks().length).toBe(20);
  });

  it('should detect country from coordinates (bbox)', () => {
    expect(complianceEngine.detectCountry(30.04, 31.23)).toBe('EG');
    expect(complianceEngine.detectCountry(40.7, -74.0)).toBe('US');
  });

  it('should check compliance and report exceedances', () => {
    const result = complianceEngine.checkCompliance('EG', { pm25: 120, pm10: 60 });
    expect(result.compliant).toBe(false);
    expect(result.exceedances.length).toBe(1);
    expect(result.exceedances[0].parameter).toBe('pm25');
  });

  it('should be compliant when under limits', () => {
    const result = complianceEngine.checkCompliance('US', { pm25: 20, no2: 30 });
    expect(result.compliant).toBe(true);
    expect(result.exceedances).toEqual([]);
  });

  it('should generate a report and track history', () => {
    const report = complianceEngine.generateReport('org1', 30, 31, { pm25: 90 });
    expect(report.location.country_code).toBe('EG');
    expect(report.compliance.exceedances.length).toBe(1);
    expect(complianceEngine.getStats().total_reports).toBeGreaterThan(0);
  });

  it('should compute trends', () => {
    complianceEngine.generateReport('org1', 30, 31, { pm25: 90 });
    complianceEngine.generateReport('org1', 30, 31, { pm25: 20 });
    const trends = complianceEngine.getTrends('EG', 7);
    expect(trends.total_reports).toBeGreaterThan(0);
    expect(trends.top_exceedances).toBeDefined();
  });

  it('should seed frameworks without DB (no-op)', async () => {
    const seeded = await complianceEngine.seedFrameworks();
    expect(typeof seeded).toBe('number');
  });

  it('should generate a PDF report buffer', async () => {
    const pdf = await complianceEngine.generatePdfReport('org1', 30, 31, { pm25: 120 });
    expect(Buffer.isBuffer(pdf.buffer)).toBe(true);
    expect(pdf.buffer.length).toBeGreaterThan(1000);
    expect(pdf.report.summary).toContain('exceedance');
  });
});

describe('Wind Engine', () => {
  it('should fetch a forecast with hourly data', async () => {
    const data = await windEngine.fetchForecast(30.0444, 31.2357);
    expect(data.hourly.length).toBeGreaterThan(0);
    expect(data.hourly[0].wind_speed).toBeDefined();
    expect(data.hourly[0].wind_direction).toBeDefined();
  });

  it('should calculate a forward plume path', () => {
    const path = windEngine.calculatePlumePath(30, 31, 'PM2.5', 12);
    expect(path.trajectory.length).toBe(12);
    expect(path.trajectory[0].concentration).toBeGreaterThan(path.trajectory[11].concentration);
  });

  it('should detect and store plume events', () => {
    const event = windEngine.detectPlumeEvents(30, 31, { pm25: 150 });
    expect(event.severity).toBe('critical');
    expect(windEngine.getPlumeEvents().length).toBeGreaterThan(0);
  });
});

describe('Public API Gateway', () => {
  it('should register and authenticate a key (in-memory fallback)', async () => {
    const reg = await publicApi.register({ name: 'researcher', tier: 'free' });
    expect(reg.api_key).toMatch(/^pern_/);
    const auth = await publicApi.authenticate(reg.api_key);
    expect(auth.tier).toBe('free');
  });

  it('should reject invalid keys', async () => {
    const auth = await publicApi.authenticate('pern_invalid_key');
    expect(auth).toBeNull();
  });

  it('should revoke keys', async () => {
    const reg = await publicApi.register({ name: 'revoke-me' });
    const revoked = await publicApi.revoke(reg.api_key);
    const auth = await publicApi.authenticate(reg.api_key);
    expect(auth).toBeNull();
  });

  it('should list registered keys', async () => {
    await publicApi.register({ name: 'list-me' });
    const keys = await publicApi.listKeys();
    expect(keys.length).toBeGreaterThan(0);
  });

  it('should build provenance with attribution', () => {
    const prov = publicApi.buildProvenance(['sentinel_5p', 'waqi'], 0.87);
    expect(prov.method).toBe('spatial_cross_validation_v1');
    expect(prov.attribution).toContain('Copernicus');
    expect(prov.confidence_score).toBe(0.87);
  });

  it('should wrap payloads with provenance', () => {
    const wrapped = publicApi.withProvenance({ value: 1 }, ['waqi'], 0.5);
    expect(wrapped.value).toBe(1);
    expect(wrapped.provenance.sources).toEqual(['waqi']);
  });

  it('should reject when quota exceeded', async () => {
    const reg = await publicApi.register({ name: 'quota-test', tier: 'free' });
    const hash = require('crypto').createHash('sha256').update(reg.api_key).digest('hex');
    const db = require('../db');
    if (publicApi.memoryKeys.has(hash)) {
      publicApi.memoryKeys.get(hash).daily_requests = 1000;
    } else if (db.pool) {
      try {
        await db.pool.query(`UPDATE global_api_keys SET daily_requests = 1000 WHERE key_hash = $1`, [hash]);
      } catch (e) { /* no DB — fall through */ }
    }
    const auth = await publicApi.authenticate(reg.api_key);
    expect(auth.error).toBe('quota_exceeded');
  });
});

describe('Data Retention', () => {
  const retentionService = require('../services/data-retention');

  it('should expose the v3.1 global retention rules', () => {
    expect(retentionService.RETENTION_RULES).toEqual([
      { table: 'external_readings', column: 'timestamp', days: 90 },
      { table: 'sensor_confidence_scores', column: 'last_evaluated_at', days: 30 },
      { table: 'wind_trajectories', column: 'created_at', days: 7 },
      { table: 'plume_events', column: 'detected_at', days: 90 },
    ]);
  });

  it('should run the global purge without DB (no-op summary)', async () => {
    const summary = await require('../db').runRetention(retentionService.RETENTION_RULES);
    expect(typeof summary).toBe('object');
    expect(typeof summary.external_readings).toBe('number');
    expect(typeof summary.wind_trajectories).toBe('number');
  });

  it('should start and stop the scheduler safely', () => {
    retentionService.start(60000);
    retentionService.start(60000); // idempotent
    retentionService.stop();
    expect(() => retentionService.stop()).not.toThrow();
  });
});
