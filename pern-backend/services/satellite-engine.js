/**
 * PERN v3 — Sentinel-5P Satellite Integration Service
 * Simulates satellite-derived environmental data at any GPS coordinate.
 * Real implementation would use Copernicus Data Space Ecosystem API.
 */
const logger = require('../utils/logger');

class SatelliteEngine {
  constructor() {
    this.virtualSensors = new Map();
  }

  /** Generate realistic simulated satellite data for coordinates */
  _simulateData(lat, lng) {
    const urbanFactor = Math.min(1, Math.max(0.1,
      (Math.abs(lat - 30) < 5 && Math.abs(lng - 31) < 3) ? 0.9 :
      Math.abs(lat) > 40 ? 0.7 :
      Math.abs(lat) < 20 ? 0.3 : 0.5
    ));
    return {
      no2: { value: Math.round((15 + urbanFactor * 30 + Math.random() * 5) * 10) / 10, unit: 'ppb' },
      o3: { value: Math.round((30 + (1 - urbanFactor) * 40 + Math.random() * 8) * 10) / 10, unit: 'ppb' },
      so2: { value: Math.round((2 + urbanFactor * 12 + Math.random() * 2) * 10) / 10, unit: 'ppb' },
      co: { value: Math.round((150 + urbanFactor * 200 + Math.random() * 30) * 10) / 10, unit: 'ppb' },
      ch4: { value: Math.round((1800 + urbanFactor * 150 + Math.random() * 20) * 10) / 10, unit: 'ppb' },
      hcho: { value: Math.round((0.5 + urbanFactor * 2 + Math.random() * 0.4) * 100) / 100, unit: 'ppb' },
      aerosol_index: { value: Math.round((urbanFactor * 1.5 + Math.random() * 0.5) * 10) / 10, unit: '' },
    };
  }

  async fetchSentinelData(lat, lng, date) {
    logger.info(`[Satellite] Fetching data for ${lat},${lng}`);
    return {
      latitude: lat, longitude: lng, timestamp: date || new Date().toISOString(),
      source: 'sentinel_5p_simulated',
      parameters: this._simulateData(lat, lng),
    };
  }

  async createVirtualSensor(lat, lng, name) {
    const id = `vs_s5p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const data = await this.fetchSentinelData(lat, lng);
    const sensor = {
      id, name: name || `Sentinel Pin @ ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      latitude: lat, longitude: lng, source_type: 'sentinel_5p',
      parameters: Object.keys(data.parameters),
      latest_values: data.parameters,
      created_at: new Date().toISOString(),
      last_reading_at: data.timestamp,
      active: true,
    };
    this.virtualSensors.set(id, sensor);
    logger.info(`[Satellite] Created virtual sensor ${id} at ${lat},${lng}`);
    return sensor;
  }

  getVirtualSensor(sensorId) {
    return this.virtualSensors.get(sensorId) || null;
  }

  listVirtualSensors(region, type) {
    const all = Array.from(this.virtualSensors.values());
    if (region) return all.filter(s => s.name.toLowerCase().includes(region.toLowerCase()));
    if (type) return all.filter(s => s.source_type === type);
    return all;
  }

  async scheduleRegionalScan(bounds, interval) {
    const sensors = [];
    const latStep = (bounds.north - bounds.south) / 5;
    const lngStep = (bounds.east - bounds.west) / 5;
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        const lat = bounds.south + latStep * (i + 0.5);
        const lng = bounds.west + lngStep * (j + 0.5);
        const sensor = await this.createVirtualSensor(lat, lng, `Grid ${i}x${j}`);
        sensors.push(sensor);
      }
    }
    return { sensors, interval_minutes: interval || 360, grid: '5x5' };
  }

  getCoverage() {
    return {
      total_sensors: this.virtualSensors.size,
      resolution: '0.01 deg x 0.01 deg (simulated)',
      parameters: ['NO2', 'O3', 'SO2', 'CO', 'CH4', 'HCHO', 'Aerosol Index'],
      last_scan: new Date().toISOString(),
    };
  }

  transformToReading(virtualSensor, data) {
    const params = {};
    for (const [key, val] of Object.entries(data.parameters || {})) {
      params[key] = { value: val.value, unit: val.unit };
    }
    return {
      source_type: 'sentinel_5p',
      source_id: virtualSensor.id,
      latitude: virtualSensor.latitude,
      longitude: virtualSensor.longitude,
      timestamp: data.timestamp,
      parameters: params,
      source_quality: 0.90,
    };
  }
}

module.exports = new SatelliteEngine();
