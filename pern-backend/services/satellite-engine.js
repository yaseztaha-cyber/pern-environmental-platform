/**
 * PERN v3 — Sentinel-5P Satellite Integration Service
 * Fetches satellite-derived air-quality data from the Copernicus-backed
 * Open-Meteo Air Quality API (CAMS reanalysis) for any GPS coordinate.
 * Falls back to deterministic simulation when offline / ENABLE_REAL_DATA=false.
 */
const logger = require('../utils/logger');

const AQ_ENDPOINT = 'https://air-quality-api.open-meteo.com/v1/air-quality';

const VARIABLE_MAP = {
  nitrogen_dioxide: 'no2',
  ozone: 'o3',
  sulphur_dioxide: 'so2',
  carbon_monoxide: 'co',
  methane: 'ch4',
  pm2_5: 'pm25',
  aerosol_optical_depth: 'aerosol_index',
};

const UNITS = {
  no2: 'ug/m3', o3: 'ug/m3', so2: 'ug/m3', co: 'ug/m3',
  ch4: 'ug/m3', pm25: 'ug/m3', aerosol_index: '',
};

class SatelliteEngine {
  constructor() {
    this.virtualSensors = new Map();
    this.lastSource = 'sentinel_5p_simulated';
  }

  /** Generate realistic simulated satellite data for coordinates */
  _simulateData(lat, lng) {
    const urbanFactor = Math.min(1, Math.max(0.1,
      (Math.abs(lat - 30) < 5 && Math.abs(lng - 31) < 3) ? 0.9 :
      Math.abs(lat) > 40 ? 0.7 :
      Math.abs(lat) < 20 ? 0.3 : 0.5
    ));
    return {
      no2: { value: Math.round((15 + urbanFactor * 30 + Math.random() * 5) * 10) / 10, unit: 'ug/m3' },
      o3: { value: Math.round((30 + (1 - urbanFactor) * 40 + Math.random() * 8) * 10) / 10, unit: 'ug/m3' },
      so2: { value: Math.round((2 + urbanFactor * 12 + Math.random() * 2) * 10) / 10, unit: 'ug/m3' },
      co: { value: Math.round((150 + urbanFactor * 200 + Math.random() * 30) * 10) / 10, unit: 'ug/m3' },
      ch4: { value: Math.round((1400 + urbanFactor * 200 + Math.random() * 30) * 10) / 10, unit: 'ug/m3' },
      hcho: { value: Math.round((0.5 + urbanFactor * 2 + Math.random() * 0.4) * 100) / 100, unit: 'ug/m3' },
      aerosol_index: { value: Math.round((urbanFactor * 1.5 + Math.random() * 0.5) * 10) / 10, unit: '' },
    };
  }

  /** Fetch latest satellite-derived concentrations for a coordinate. */
  async _fetchReal(lat, lng) {
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lng),
      hourly: Object.keys(VARIABLE_MAP).join(','),
      past_days: '1',
      forecast_days: '1',
      timezone: 'UTC',
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(`${AQ_ENDPOINT}?${params.toString()}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      const hourly = body?.hourly;
      if (!hourly || !Array.isArray(hourly.time) || hourly.time.length === 0) {
        throw new Error('empty response');
      }
      const idx = hourly.time.length - 1;
      const output = {};
      for (const [apiKey, shortKey] of Object.entries(VARIABLE_MAP)) {
        const val = hourly[apiKey]?.[idx];
        if (typeof val === 'number' && Number.isFinite(val)) {
          output[shortKey] = { value: Math.round(val * 100) / 100, unit: UNITS[shortKey] };
        }
      }
      if (Object.keys(output).length === 0) throw new Error('no usable variables');
      return {
        parameters: output,
        fetched_at: `${hourly.time[idx]}:00Z`,
        model: body?.metadata?.model_name || 'CAMS global reanalysis',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async fetchSentinelData(lat, lng, date) {
    logger.info(`[Satellite] Fetching data for ${lat},${lng}`);
    if (process.env.ENABLE_REAL_DATA !== 'false') {
      try {
        const real = await this._fetchReal(lat, lng);
        this.lastSource = 'sentinel_5p_cams';
        return {
          latitude: lat, longitude: lng,
          timestamp: date || new Date(real.fetched_at).toISOString(),
          source: this.lastSource,
          parameters: real.parameters,
        };
      } catch (err) {
        logger.warn(`[Satellite] Real fetch failed, using simulation: ${err.message}`);
      }
    }
    this.lastSource = 'sentinel_5p_simulated';
    return {
      latitude: lat, longitude: lng, timestamp: date || new Date().toISOString(),
      source: this.lastSource,
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
      resolution: '0.25 deg x 0.25 deg (CAMS reanalysis)',
      parameters: ['NO2', 'O3', 'SO2', 'CO', 'CH4', 'PM2.5', 'Aerosol Index'],
      last_source: this.lastSource,
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
