/**
 * OpenAQ Source Adapter (v3)
 * Government-aggregated air quality measurements.
 * Real HTTP fetch with optional OPENAQ_API_KEY, simulated fallback otherwise.
 * https://docs.openaq.org/
 */
const logger = require('../../utils/logger');

const API_KEY = process.env.OPENAQ_API_KEY || '';

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
    co: 200 + urbanFactor * 300,
  };
}

function _normalize(raw) {
  return {
    pm25: raw.pm25 ?? null,
    pm10: raw.pm10 ?? null,
    no2: raw.no2 ?? null,
    o3: raw.o3 ?? null,
    so2: raw.so2 ?? null,
    co: raw.co ?? null,
  };
}

async function fetchLatest(params = ['pm25', 'pm10', 'no2', 'o3'], country) {
  if (!API_KEY) {
    logger.debug('[OpenAQ] No API key, using simulated data');
    return _normalize(_simulate(30.0444, 31.2357));
  }
  try {
    const qs = new URLSearchParams({ limit: 1, sort: 'desc', parameter: params.join(',') });
    if (country) qs.set('country', country);
    const res = await fetch(`https://api.openaq.org/v3/latest?${qs}`, {
      headers: { 'X-API-Key': API_KEY },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`OpenAQ HTTP ${res.status}`);
    const body = await res.json();
    const results = body.results || [];
    if (results.length === 0) throw new Error('OpenAQ no results');
    return _normalize({
      pm25: results[0].value,
      pm10: results[1]?.value ?? null,
      no2: results[2]?.value ?? null,
      o3: results[3]?.value ?? null,
    });
  } catch (err) {
    logger.warn('[OpenAQ] fetch failed, falling back to simulation', { error: err.message });
    return _normalize(_simulate(30.0444, 31.2357));
  }
}

async function fetchByLocation(lat, lng, radiusKm = 50) {
  if (!API_KEY) {
    logger.debug('[OpenAQ] No API key, using simulated data');
    return { latitude: lat, longitude: lng, ..._normalize(_simulate(lat, lng)) };
  }
  try {
    const qs = new URLSearchParams({ limit: 5, sort: 'desc', radius: String(radiusKm * 1000) });
    const res = await fetch(`https://api.openaq.org/v3/locations?${qs}&coordinates=${lat},${lng}`, {
      headers: { 'X-API-Key': API_KEY },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`OpenAQ HTTP ${res.status}`);
    const body = await res.json();
    const loc = (body.results || [])[0];
    return loc
      ? { latitude: lat, longitude: lng, name: loc.name, ..._normalize({ pm25: loc.parameters?.find((p) => p.parameter === 'pm25')?.lastValue, pm10: loc.parameters?.find((p) => p.parameter === 'pm10')?.lastValue, no2: loc.parameters?.find((p) => p.parameter === 'no2')?.lastValue, o3: loc.parameters?.find((p) => p.parameter === 'o3')?.lastValue }) }
      : { latitude: lat, longitude: lng, ..._normalize(_simulate(lat, lng)) };
  } catch (err) {
    logger.warn('[OpenAQ] fetchByLocation failed, falling back to simulation', { error: err.message });
    return { latitude: lat, longitude: lng, ..._normalize(_simulate(lat, lng)) };
  }
}

module.exports = {
  id: 'openaq',
  baseTrust: 0.80,
  frequencyMinutes: 30,
  isConfigured: () => Boolean(API_KEY),
  fetchLatest,
  fetchByLocation,
};
