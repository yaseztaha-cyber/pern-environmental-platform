/**
 * PERN v3 — Unified Normalization Layer
 * Converts any external source payload into the standard schema consumed
 * by the Data Lake pipeline (external_readings table / ingestion engine).
 *
 * Standard schema:
 * {
 *   source_type: 'waqi' | 'openaq' | 'sensor_community' | 'nasa_firms' | 'sentinel_5p',
 *   source_id: string,
 *   latitude: number, longitude: number,
 *   timestamp: ISO string,
 *   parameters: { pm25: { value, unit, quality? }, ... },
 *   raw_response: object,
 *   source_quality: number (0-1),
 * }
 */
const UNITS = {
  pm25: 'ug/m3',
  pm10: 'ug/m3',
  o3: 'ppb',
  no2: 'ppb',
  so2: 'ppb',
  co: 'ppb',
  ch4: 'ppb',
  hcho: 'ppb',
  aerosol_index: '',
  aqi: '',
  temperature: 'C',
  humidity: '%',
  pressure: 'hPa',
  wind: 'kmh',
  frp: 'MW',
  brightness: 'K',
  confidence: '',
  co2: 'ppm',
};

function numeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = parseFloat(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function normalize(params) {
  const out = {};
  for (const [key, value] of Object.entries(params || {})) {
    if (['latitude', 'longitude', 'timestamp', 'source_id', 'source_type'].includes(key)) continue;
    const n = numeric(value);
    if (n !== null) out[key] = { value: n, unit: UNITS[key] || '' };
  }
  return out;
}

function normalizeReading(input) {
  const {
    source_type, source_id, latitude, longitude, timestamp,
    parameters = {}, raw_response = {}, source_quality = 0.5,
  } = input;
  return {
    source_type: source_type || 'unknown',
    source_id: source_id || `${source_type || 'unknown'}_${Date.now()}`,
    latitude: latitude ?? null,
    longitude: longitude ?? null,
    timestamp: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString(),
    parameters: normalize(parameters),
    raw_response: raw_response || {},
    source_quality: Math.max(0, Math.min(1, source_quality || 0.5)),
  };
}

/**
 * Persist-ready payload for the external_readings table.
 */
function toDBRow(reading, virtualSensorId) {
  return {
    sourceType: reading.source_type,
    sourceId: reading.source_id,
    virtualSensorId: virtualSensorId ?? null,
    timestamp: reading.timestamp,
    parameters: reading.parameters,
    rawResponse: reading.raw_response,
    dataQuality: reading.source_quality,
  };
}

module.exports = { normalize, normalizeReading, toDBRow, UNITS };
