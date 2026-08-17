/**
 * Open-Meteo NWP Source Adapter (v4.0) — Phase 2
 * Keyless NWP source for the AI engine:
 *   - live: Open-Meteo forecast API (16-day, GFS-seamless + friends)
 *   - training: Open-Meteo ERA5 archive (reanalysis "NWP proxy") for MOS fits
 * Real HTTP fetch with simulated fallback when offline.
 * https://open-meteo.com/en/docs
 */
const logger = require('../../utils/logger');

const BASE_FORECAST = 'https://api.open-meteo.com/v1/forecast';
const BASE_ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const DAILY_VARS = 'temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum';
const TIMEZONE = 'UTC';
const MAX_FORECAST_DAYS = 16;

function _yymmdd(d) {
  return d.toISOString().slice(0, 10);
}

function _daysBetween(a, b) {
  return Math.round((Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate())
    - Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate())) / 86400000);
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
  };
}

function _normalize(lat, lng, ts, raw, leadHours = 0) {
  return {
    latitude: lat,
    longitude: lng,
    timestamp: ts,
    temperature: raw.temperature ?? null,
    temperature_max: raw.temperature_max ?? null,
    temperature_min: raw.temperature_min ?? null,
    precipitation: raw.precipitation ?? null,
    humidity: null,
    wind_speed: null,
    nwp_lead_hours: leadHours,
  };
}

function _rowsFromDaily(lat, lng, daily, initTime) {
  const times = daily?.time || [];
  const mean = daily?.temperature_2m_mean || [];
  const max = daily?.temperature_2m_max || [];
  const min = daily?.temperature_2m_min || [];
  const prcp = daily?.precipitation_sum || [];
  const rows = [];
  for (let i = 0; i < times.length; i++) {
    const ts = new Date(`${times[i]}T00:00:00Z`);
    const leadHours = initTime
      ? Math.round((ts.getTime() - new Date(initTime).getTime()) / 3600000)
      : 0;
    rows.push(_normalize(lat, lng, ts, {
      temperature: mean[i] ?? null,
      temperature_max: max[i] ?? null,
      temperature_min: min[i] ?? null,
      precipitation: prcp[i] ?? null,
    }, Math.max(0, leadHours)));
  }
  return rows;
}

async function _getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  return res.json();
}

/** Live NWP forecast (lead 0..16 days) starting today. */
async function fetchForecast(lat, lng, days = 16) {
  const n = Math.max(1, Math.min(MAX_FORECAST_DAYS, Math.floor(days)));
  const qs = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    daily: DAILY_VARS,
    timezone: TIMEZONE,
    forecast_days: String(n),
  });
  const body = await _getJson(`${BASE_FORECAST}?${qs}`);
  const times = body?.daily?.time || [];
  const init = times.length ? new Date(`${times[0]}T00:00:00Z`) : null;
  return _rowsFromDaily(lat, lng, body?.daily, init);
}

/** ERA5 reanalysis daily series ("NWP proxy" for MOS training). */
async function fetchArchive(lat, lng, start, end) {
  const qs = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    start_date: _yymmdd(start),
    end_date: _yymmdd(end),
    daily: DAILY_VARS,
    timezone: TIMEZONE,
  });
  const body = await _getJson(`${BASE_ARCHIVE}?${qs}`);
  return _rowsFromDaily(lat, lng, body?.daily, null);
}

async function fetchDailySeries(lat, lng, start, end) {
  try {
    const today = new Date();
    if (end >= today) {
      // live forecast window (NWP as a forecast source)
      const rows = await fetchForecast(lat, lng, _daysBetween(today, end) + 1);
      if (rows.length) return rows;
    }
    if (end < today) {
      // past window: ERA5 archive for MOS training
      const rows = await fetchArchive(lat, lng, start, end);
      if (rows.length) return rows;
    }
    throw new Error('Open-Meteo empty response');
  } catch (err) {
    logger.warn('[Open-Meteo] fetchDailySeries failed, falling back to simulation',
      { error: err.message });
    const rows = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      rows.push(_normalize(lat, lng, new Date(d), _simulate(lat, lng)));
    }
    return rows;
  }
}

async function fetchByGeo(lat, lng) {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const rows = await fetchForecast(lat, lng, 2).catch(() => []);
  const lead1 = rows.find((r) => r.nwp_lead_hours >= 24 && r.nwp_lead_hours < 48);
  if (!lead1) {
    return _normalize(lat, lng, tomorrow, _simulate(lat, lng), 24);
  }
  return lead1;
}

module.exports = {
  id: 'open-meteo',
  baseTrust: 0.80,
  frequencyMinutes: 360,
  isConfigured: () => true,
  fetchByGeo,
  fetchDailySeries,
  fetchForecast,
  fetchArchive,
};
