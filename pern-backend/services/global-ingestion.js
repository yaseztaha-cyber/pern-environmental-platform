/**
 * PERN v3 — Global Data Lake Aggregator Engine
 * Background worker that fetches from all external sources in parallel,
 * normalizes to unified format, applies trust scoring, and stores results.
 */
const logger = require('../utils/logger');

const SOURCES = [
  { id: 'waqi', name: 'WAQI', url: 'https://api.waqi.info/feed/geo:{lat};{lng}/', priority: 1, frequency: 15, baseTrust: 0.85 },
  { id: 'openaq', name: 'OpenAQ', url: 'https://api.openaq.org/v2/latest', priority: 1, frequency: 30, baseTrust: 0.80 },
  { id: 'sensor_community', name: 'Sensor.Community', url: 'https://api.sensor.community/v1/data', priority: 3, frequency: 30, baseTrust: 0.50 },
  { id: 'nasa_firms', name: 'NASA FIRMS', url: 'https://firms.modaps.eosdis.nasa.gov/api/area/csv/', priority: 2, frequency: 180, baseTrust: 0.80 },
  { id: 'sentinel_5p', name: 'Sentinel-5P', url: 'https://dataspace.copernicus.eu/api', priority: 1, frequency: 360, baseTrust: 0.90 },
];

class GlobalIngestionEngine {
  constructor() {
    this.registry = new Map();
    this.workers = new Map();
    this.normalizedReadings = [];
    this.MAX_READINGS = 10000;
  }

  registerSource(source) {
    const id = source.id || `src_${Date.now()}`;
    const entry = {
      id, name: source.name, type: source.type || 'external',
      api_endpoint: source.url, country: source.country || 'global',
      active: true, priority: source.priority || 5,
      base_trust: source.baseTrust || 0.5,
      frequency_minutes: source.frequency || 60,
      last_fetch: null, created_at: new Date().toISOString(),
    };
    this.registry.set(id, entry);
    return entry;
  }

  getSource(id) { return this.registry.get(id) || null; }

  listSources(activeOnly) {
    const all = Array.from(this.registry.values());
    return activeOnly ? all.filter(s => s.active) : all;
  }

  async fetchFromSource(source, lat, lng) {
    const start = Date.now();
    try {
      // Simulated fetch — in production, call external API with rate limiting
      const data = this._simulateSourceData(source.id, lat, lng);
      source.last_fetch = new Date().toISOString();
      const normalized = this.normalizeReading(source.id, data, lat, lng);
      this.normalizedReadings.push(normalized);
      if (this.normalizedReadings.length > this.MAX_READINGS) {
        this.normalizedReadings.splice(0, this.normalizedReadings.length - this.MAX_READINGS);
      }
      logger.info(`[Ingestion] ${source.id} fetched in ${Date.now() - start}ms`);
      return normalized;
    } catch (err) {
      logger.error(`[Ingestion] ${source.id} failed: ${err.message}`);
      return null;
    }
  }

  _simulateSourceData(sourceId, lat, lng) {
    const urbanFactor = Math.min(1, Math.max(0.1,
      (Math.abs(lat - 30) < 5 && Math.abs(lng - 31) < 3) ? 0.9 : 0.5
    ));
    const base = { timestamp: new Date().toISOString(), latitude: lat, longitude: lng };
    switch (sourceId) {
      case 'waqi':
      case 'openaq':
        return { ...base, pm25: 15 + urbanFactor * 40, pm10: 25 + urbanFactor * 60, no2: 10 + urbanFactor * 30, o3: 30 + (1 - urbanFactor) * 40, so2: 2 + urbanFactor * 10, co: 200 + urbanFactor * 300, aqi: Math.round(20 + urbanFactor * 80) };
      case 'sensor_community':
        return { ...base, pm25: 12 + urbanFactor * 35, pm10: 20 + urbanFactor * 50, temperature: 22 + Math.random() * 8, humidity: 40 + Math.random() * 30 };
      case 'nasa_firms':
        return { ...base, frp: Math.random() * 50, brightness: 300 + Math.random() * 100, confidence: Math.random(), satellite: Math.random() > 0.5 ? 'VIIRS' : 'MODIS', daynight: Math.random() > 0.5 ? 'D' : 'N' };
      case 'sentinel_5p':
        return { ...base, no2: 15 + urbanFactor * 30, o3: 30 + (1 - urbanFactor) * 40, so2: 2 + urbanFactor * 12, co: 150 + urbanFactor * 200, ch4: 1800 + urbanFactor * 150, hcho: 0.5 + urbanFactor * 2 };
      default:
        return { ...base, pm25: 20, pm10: 30 };
    }
  }

  normalizeReading(sourceType, data, lat, lng) {
    const params = {};
    const paramDefs = {
      pm25: 'ug/m3', pm10: 'ug/m3', no2: 'ppb', o3: 'ppb', so2: 'ppb',
      co: 'ppb', ch4: 'ppb', hcho: 'ppb', aqi: '', temperature: 'C',
      humidity: '%', frp: 'MW', brightness: 'K', confidence: '',
      aerosol_index: '', co2: 'ppm',
    };
    for (const [key, unit] of Object.entries(paramDefs)) {
      if (data[key] !== undefined) {
        params[key] = { value: Math.round(data[key] * 100) / 100, unit };
      }
    }
    return {
      source_type: sourceType, source_id: `${sourceType}_${Date.now()}`,
      latitude: lat, longitude: lng, timestamp: data.timestamp || new Date().toISOString(),
      parameters: params, source_quality: SOURCES.find(s => s.id === sourceType)?.baseTrust || 0.5,
    };
  }

  async runGlobalScan(lat, lng) {
    const results = [];
    for (const sourceDef of SOURCES) {
      const source = this.registerSource(sourceDef);
      const data = await this.fetchFromSource(source, lat, lng);
      if (data) results.push(data);
    }
    return { sources_queried: SOURCES.length, sources_responded: results.length, readings: results, timestamp: new Date().toISOString() };
  }

  getStoredReadings(sourceType, limit) {
    let readings = this.normalizedReadings;
    if (sourceType) readings = readings.filter(r => r.source_type === sourceType);
    return readings.slice(-(limit || 100));
  }

  getStats() {
    const bySource = {};
    for (const r of this.normalizedReadings) {
      bySource[r.source_type] = (bySource[r.source_type] || 0) + 1;
    }
    return {
      total_readings: this.normalizedReadings.length,
      registered_sources: this.registry.size,
      by_source: bySource,
      last_run: new Date().toISOString(),
    };
  }
}

module.exports = new GlobalIngestionEngine();
