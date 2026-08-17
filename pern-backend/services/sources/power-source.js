/**
 * NASA POWER Source Adapter (v4.0)
 * Keyless REST API for agriculture meteorology (temperature, precipitation,
 * humidity, wind) from NASA Prediction Of Worldwide Energy Resources.
 * Real HTTP fetch with simulated fallback when offline.
 * https://power.larc.nasa.gov/docs/
 */
const logger = require('../../utils/logger');

const BASE = 'https://power.larc.nasa.gov/api/temporal/daily/point';
const PARAMETERS = 'T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,RH2M,WS2M';
const COMMUNITY = 'AG';

function _yyyymmdd(d) {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function _simulate(lat, lng) {
  const desertFactor = Math.min(1, Math.max(0.2,
    (Math.abs(lat - 30) < 4 && Math.abs(lng - 31) < 4) ? 0.6 : 0.3
  ));
  return {
    temperature: 20 + desertFactor * 10,
    temperature_max: 24 + desertFactor * 12,
    temperature_min: 15 + desertFactor * 8,
    precipitation: 0.2 + (1 - desertFactor) * 8,
    humidity: 35 + desertFactor * 25,
    wind_speed: 2.5 + Math.random() * 3,
  };
}

function _normalize(lat, lng, ts, raw) {
  return {
    latitude: lat,
    longitude: lng,
    timestamp: ts,
    temperature: raw.temperature ?? null,
    temperature_max: raw.temperature_max ?? null,
    temperature_min: raw.temperature_min ?? null,
    precipitation: raw.precipitation ?? null,
    humidity: raw.humidity ?? null,
    wind_speed: raw.wind_speed ?? null,
  };
}

function _parseDayProperties(props) {
  const dayKeys = Object.keys(props);
  if (dayKeys.length === 0) return null;
  const lastDay = dayKeys[dayKeys.length - 1];
  const pick = (key) => {
    const series = props[key];
    return series && series[lastDay] != null ? parseFloat(series[lastDay]) : null;
  };
  return {
    temperature: pick('T2M'),
    temperature_max: pick('T2M_MAX'),
    temperature_min: pick('T2M_MIN'),
    precipitation: pick('PRECTOTCORR'),
    humidity: pick('RH2M'),
    wind_speed: pick('WS2M'),
  };
}

async function fetchDailySeries(lat, lng, start, end) {
  try {
    const qs = new URLSearchParams({
      parameters: PARAMETERS,
      community: COMMUNITY,
      longitude: String(lng),
      latitude: String(lat),
      start: _yyyymmdd(start),
      end: _yyyymmdd(end),
      format: 'JSON',
    });
    const res = await fetch(`${BASE}?${qs}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`POWER HTTP ${res.status}`);
    const body = await res.json();
    const props = body?.properties?.parameter;
    if (!props || typeof props !== 'object') throw new Error('POWER no parameters');
    const dayKeys = Object.keys(props.T2M || {}).sort();
    const rows = [];
    for (const day of dayKeys) {
      const pick = (key) => {
        const series = props[key];
        return series && series[day] != null ? parseFloat(series[day]) : null;
      };
      rows.push(_normalize(lat, lng, new Date(`${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`), {
        temperature: pick('T2M'),
        temperature_max: pick('T2M_MAX'),
        temperature_min: pick('T2M_MIN'),
        precipitation: pick('PRECTOTCORR'),
        humidity: pick('RH2M'),
        wind_speed: pick('WS2M'),
      }));
    }
    return rows;
  } catch (err) {
    logger.warn('[POWER] fetchDailySeries failed, falling back to simulation', { error: err.message });
    const now = new Date();
    const rows = [];
    for (let d = start; d <= end; d.setDate(d.getDate() + 1)) {
      rows.push(_normalize(lat, lng, new Date(d), _simulate(lat, lng)));
    }
    return rows;
  }
}

async function fetchByGeo(lat, lng) {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 7);
  const rows = await fetchDailySeries(lat, lng, start, end);
  const latest = rows[rows.length - 1];
  if (!latest) {
    const today = _normalize(lat, lng, new Date(), _simulate(lat, lng));
    return { ...today, precipitation_today: today.precipitation };
  }
  return {
    ...latest,
    precipitation_today: latest.precipitation,
  };
}

module.exports = {
  id: 'power',
  baseTrust: 0.90,
  frequencyMinutes: 60,
  isConfigured: () => true,
  fetchByGeo,
  fetchDailySeries,
};
