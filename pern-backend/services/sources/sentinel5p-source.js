/**
 * Sentinel-5P source adapter — satellite-derived air quality (CAMS reanalysis)
 * via the Open-Meteo Air Quality API. Falls back to deterministic simulation
 * when the live endpoint is unavailable or ENABLE_REAL_DATA=false.
 */

const logger = require('../../utils/logger');

const ENDPOINT = 'https://air-quality-api.open-meteo.com/v1/air-quality';

const VARIABLES = [
  'nitrogen_dioxide', 'ozone', 'sulphur_dioxide', 'carbon_monoxide',
  'methane', 'pm2_5', 'pm10', 'aerosol_optical_depth',
];

function simulate(lat, lng) {
  const urbanFactor = Math.min(1, Math.max(0.1,
    (Math.abs(lat - 30) < 5 && Math.abs(lng - 31) < 3) ? 0.9 : 0.5
  ));
  return {
    pm25: 12 + urbanFactor * 30,
    pm10: 20 + urbanFactor * 50,
    no2: 15 + urbanFactor * 30,
    o3: 30 + (1 - urbanFactor) * 40,
    so2: 2 + urbanFactor * 12,
    co: 150 + urbanFactor * 200,
    ch4: 1400 + urbanFactor * 200,
    aerosol_index: urbanFactor * 1.2,
  };
}

async function fetchSatelliteData(lat, lng) {
  if (process.env.ENABLE_REAL_DATA === 'false') return simulate(lat, lng);
  try {
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lng),
      hourly: VARIABLES.join(','),
      past_days: '1',
      forecast_days: '1',
      timezone: 'UTC',
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(`${ENDPOINT}?${params.toString()}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      const hourly = body?.hourly;
      if (!hourly || !Array.isArray(hourly.time) || hourly.time.length === 0) {
        throw new Error('empty response');
      }
      const idx = hourly.time.length - 1;
      const out = { timestamp: `${hourly.time[idx]}:00Z`, latitude: lat, longitude: lng };
      const map = {
        nitrogen_dioxide: 'no2', ozone: 'o3', sulphur_dioxide: 'so2',
        carbon_monoxide: 'co', methane: 'ch4', pm2_5: 'pm25', pm10: 'pm10',
        aerosol_optical_depth: 'aerosol_index',
      };
      for (const [apiKey, shortKey] of Object.entries(map)) {
        const val = hourly[apiKey]?.[idx];
        if (typeof val === 'number' && Number.isFinite(val)) out[shortKey] = val;
      }
      return out;
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    logger.warn(`[Sentinel-5P] fetch failed, falling back to simulation: ${err.message}`);
    return simulate(lat, lng);
  }
}

module.exports = { fetchSatelliteData, simulate };
