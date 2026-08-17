/**
 * CAMS Source Adapter (v4.0) — Phase 4
 * Copernicus Atmosphere Monitoring Service: global atmospheric composition
 * forecast (PM2.5, PM10, NO2, O3, SO2) for the AIR feature group.
 * Real HTTP fetch via the ADS API when CAMS_API_KEY is set, simulated
 * fallback otherwise (mirrors openaq-source.js).
 * https://ads.atmosphere.copernicus.eu (CAMS global composition forecasts)
 */
const logger = require('../../utils/logger');

const ADS_BASE = 'https://ads.atmosphere.copernicus.eu/api/v1';
const PARAMS = ['pm2p5', 'pm10', 'no2', 'o3', 'so2'];

function _apiKey() {
  return process.env.CAMS_API_KEY || '';
}

function _authHeader() {
  return `Basic ${Buffer.from(_apiKey()).toString('base64')}`;
}

function _simulate(lat, lng) {
  const urbanFactor = Math.min(1, Math.max(0.1,
    (Math.abs(lat - 30) < 5 && Math.abs(lng - 31) < 3) ? 0.9 : 0.5
  ));
  return {
    pm25: 15 + urbanFactor * 40,
    pm10: 25 + urbanFactor * 60,
    no2: 10 + urbanFactor * 30,
    o3: 30 + (1 - urbanFactor) * 40,
    so2: 2 + urbanFactor * 10,
  };
}

function _normalize(raw) {
  return {
    pm25: raw.pm25 ?? null,
    pm10: raw.pm10 ?? null,
    no2: raw.no2 ?? null,
    o3: raw.o3 ?? null,
    so2: raw.so2 ?? null,
  };
}

function _parsePayload(payload) {
  // CAMS forecast payloads key the species as `pm2p5`, `pm10`, `no2`, ...
  // taken over the grid point; map to the engine's pm25 naming and coerce.
  const src = payload || {};
  return {
    pm25: src.pm2p5 ?? null,
    pm10: src.pm10 ?? null,
    no2: src.no2 ?? null,
    o3: src.o3 ?? null,
    so2: src.so2 ?? null,
  };
}

async function _submitAndPoll(lat, lng) {
  // ADS is an asynchronous, key-gated job API. Submit a lightweight
  // composition request for the point, then poll until the data is ready.
  const init = await fetch(`${ADS_BASE}/retrieval`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': _authHeader() },
    body: JSON.stringify({
      dataset_id: 'cams_global_atmospheric_composition_forecasts',
      request: {
        type: 'forecast', format: 'json',
        date: new Date().toISOString().slice(0, 10),
        time: '00:00',
        variable: PARAMS.join(','),
        model: 'cams_global',
        leadtime_hour: '0',
        area: [lat + 0.5, lng - 0.5, lat - 0.5, lng + 0.5],
      },
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!init.ok) throw new Error(`CAMS ADS HTTP ${init.status}`);
  const job = await init.json();
  const jobId = job?.request_id;
  if (!jobId) throw new Error('CAMS ADS no job id');
  const payload = await _pollJob(jobId);
  return _parsePayload(payload);
}

async function _pollJob(jobId, maxTries = 20) {
  const pollMs = Number(process.env.CAMS_POLL_MS || 3000);
  for (let i = 0; i < maxTries; i++) {
    await new Promise((r) => setTimeout(r, pollMs));
    const res = await fetch(`${ADS_BASE}/jobs/${jobId}`, {
      headers: { 'Authorization': _authHeader() },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`CAMS ADS poll HTTP ${res.status}`);
    const job = await res.json();
    if (job?.status === 'successful') {
      const dataRes = await fetch(`${ADS_BASE}/jobs/${jobId}/results`, {
        headers: { 'Authorization': _authHeader() },
        signal: AbortSignal.timeout(15000),
      });
      if (!dataRes.ok) throw new Error(`CAMS ADS results HTTP ${dataRes.status}`);
      return dataRes.json();
    }
    if (job?.status === 'failed') throw new Error('CAMS ADS job failed');
  }
  throw new Error('CAMS ADS job timed out');
}

async function fetchByLocation(lat, lng) {
  if (!_apiKey()) {
    logger.debug('[CAMS] No API key, using simulated data');
    return { latitude: lat, longitude: lng, ..._normalize(_simulate(lat, lng)) };
  }
  try {
    const payload = await _submitAndPoll(lat, lng);
    return { latitude: lat, longitude: lng, ..._normalize(payload) };
  } catch (err) {
    logger.warn('[CAMS] fetchByLocation failed, falling back to simulation', { error: err.message });
    return { latitude: lat, longitude: lng, ..._normalize(_simulate(lat, lng)) };
  }
}

async function fetchLatest() {
  return fetchByLocation(30.0444, 31.2357);
}

module.exports = {
  id: 'cams',
  baseTrust: 0.85,
  frequencyMinutes: 60,
  isConfigured: () => Boolean(_apiKey()),
  fetchLatest,
  fetchByLocation,
};
