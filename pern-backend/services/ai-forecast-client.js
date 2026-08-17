/**
 * PERN v4.0 — AI Forecast Client
 * Calls the pern-ai ForecastEngine (POST /v1/forecast) for calibrated
 * multi-horizon (1/7/30-day) temperature forecasts with conditional-conformal
 * intervals. Never throws: on any failure it returns null so the caller can
 * degrade gracefully to the heuristic frontend forecast.
 */
const logger = require('../utils/logger');

const AI_URL = process.env.PERN_AI_URL || 'http://localhost:8000';
const TIMEOUT_MS = parseInt(process.env.PERN_AI_TIMEOUT_MS || '4000', 10);
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 50;

const cache = new Map();
let lastError = null;
let lastSuccessAt = null;

function key(input) {
  return `${input.latitude},${input.longitude}|${input.horizon}|${input.target_date}`;
}

async function getForecast(input = {}) {
  const lat = parseFloat(input.latitude);
  const lng = parseFloat(input.longitude);
  const horizon = Number(input.horizon);
  const target_date = input.target_date;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(horizon) || !target_date) {
    lastError = 'invalid forecast input (need latitude, longitude, horizon, target_date)';
    return null;
  }

  const cacheKey = key({ latitude: lat, longitude: lng, horizon, target_date });
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  try {
    const res = await fetch(`${AI_URL}/v1/forecast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latitude: lat,
        longitude: lng,
        horizon,
        target_date,
        obs_temperature: input.obs_temperature,
        nwp_temperature: input.nwp_temperature,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`pern-ai HTTP ${res.status}`);
    const data = await res.json();
    cache.set(cacheKey, { value: data, at: Date.now() });
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    lastError = null;
    lastSuccessAt = Date.now();
    return data;
  } catch (err) {
    lastError = err.message;
    logger.warn('[ForecastClient] pern-ai forecast unavailable', { error: err.message });
    return null;
  }
}

function resetCache() {
  cache.clear();
  lastError = null;
}

module.exports = {
  getForecast,
  resetCache,
  getLastError: () => lastError,
  getLastSuccessAt: () => lastSuccessAt,
};
