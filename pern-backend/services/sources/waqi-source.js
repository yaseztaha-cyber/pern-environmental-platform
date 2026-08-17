/**
 * WAQI Source Adapter (v3)
 * World Air Quality Index — government station network.
 * Real HTTP fetch when WAQI_API_KEY is set, deterministic simulation otherwise.
 * https://aqicn.org/api/
 */
const logger = require('../../utils/logger');

const API_KEY = process.env.WAQI_API_KEY || '';

function _simulate(lat, lng) {
  const urbanFactor = Math.min(1, Math.max(0.1,
    (Math.abs(lat - 30) < 5 && Math.abs(lng - 31) < 3) ? 0.9 : 0.5
  ));
  return {
    pm25: 15 + urbanFactor * 40,
    pm10: 25 + urbanFactor * 60,
    o3: 30 + (1 - urbanFactor) * 40,
    no2: 10 + urbanFactor * 30,
    so2: 2 + urbanFactor * 10,
    co: 200 + urbanFactor * 300,
    aqi: Math.round(20 + urbanFactor * 80),
    temperature: 22 + (1 - urbanFactor) * 8,
    humidity: 40 + urbanFactor * 30,
    pressure: 1000 + Math.round(Math.random() * 20),
    wind: Math.round(Math.random() * 20),
  };
}

function _normalize(raw) {
  return {
    pm25: raw.pm25 ?? null,
    pm10: raw.pm10 ?? null,
    o3: raw.o3 ?? null,
    no2: raw.no2 ?? null,
    so2: raw.so2 ?? null,
    co: raw.co ?? null,
    aqi: raw.aqi ?? null,
    temperature: raw.temperature ?? null,
    humidity: raw.humidity ?? null,
    pressure: raw.pressure ?? null,
    wind: raw.wind ?? null,
  };
}

async function fetchByGeo(lat, lng) {
  if (!API_KEY) {
    logger.debug('[WAQI] No API key, using simulated data');
    return _normalize(_simulate(lat, lng));
  }
  try {
    const res = await fetch(`https://api.waqi.info/feed/geo:${lat};${lng}/?token=${API_KEY}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`WAQI HTTP ${res.status}`);
    const body = await res.json();
    if (body.status !== 'ok' || !body.data) throw new Error(`WAQI status: ${body.status}`);
    const d = body.data;
    const iaqi = d.iaqi || {};
    const val = (k) => (iaqi[k] && iaqi[k].v != null ? iaqi[k].v : null);
    return {
      pm25: val('pm25'),
      pm10: val('pm10'),
      o3: val('o3'),
      no2: val('no2'),
      so2: val('so2'),
      co: val('co'),
      aqi: d.aqi ?? null,
      temperature: val('t'),
      humidity: val('h'),
      pressure: val('p'),
      wind: val('w'),
    };
  } catch (err) {
    logger.warn('[WAQI] fetch failed, falling back to simulation', { error: err.message });
    return _normalize(_simulate(lat, lng));
  }
}

async function fetchByCity(city) {
  if (!API_KEY) return fetchByGeo(30.0444, 31.2357);
  try {
    const res = await fetch(`https://api.waqi.info/feed/${encodeURIComponent(city)}/?token=${API_KEY}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`WAQI HTTP ${res.status}`);
    const body = await res.json();
    if (body.status !== 'ok' || !body.data) throw new Error(`WAQI status: ${body.status}`);
    const d = body.data;
    return {
      latitude: d.city?.geo?.[0] ?? null,
      longitude: d.city?.geo?.[1] ?? null,
      ..._normalize({ pm25: d.iaqi?.pm25?.v, pm10: d.iaqi?.pm10?.v, o3: d.iaqi?.o3?.v, no2: d.iaqi?.no2?.v, so2: d.iaqi?.so2?.v, co: d.iaqi?.co?.v, aqi: d.aqi, temperature: d.iaqi?.t?.v, humidity: d.iaqi?.h?.v, pressure: d.iaqi?.p?.v, wind: d.iaqi?.w?.v }),
    };
  } catch (err) {
    logger.warn('[WAQI] fetchByCity failed', { error: err.message });
    return fetchByGeo(30.0444, 31.2357);
  }
}

module.exports = {
  id: 'waqi',
  baseTrust: 0.85,
  frequencyMinutes: 15,
  isConfigured: () => Boolean(API_KEY),
  fetchByGeo,
  fetchByCity,
};
