/**
 * PERN v4.0 — AI Benchmark Client
 * Reads the published tolerance-accuracy tables from the pern-ai microservice
 * (GET /v1/benchmark). Never throws: on any failure it returns null so the
 * caller can fall back to the shipped models/benchmark.json snapshot.
 */
const logger = require('../utils/logger');

const AI_URL = process.env.PERN_AI_URL || 'http://localhost:8000';
const TIMEOUT_MS = parseInt(process.env.PERN_AI_TIMEOUT_MS || '4000', 10);
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX = 10;

const cache = new Map();
let lastError = null;
let lastSuccessAt = null;

async function getBenchmark({ force = false } = {}) {
  const hit = cache.get('published');
  if (!force && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  try {
    const res = await fetch(`${AI_URL}/v1/benchmark`, {
      method: 'GET',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`pern-ai HTTP ${res.status}`);
    const data = await res.json();
    if (!data.available) throw new Error(data.detail || 'pern-ai benchmark unavailable');

    const value = {
      available: true,
      generated_utc: data.generated_utc,
      yardstick: data.yardstick,
      protocol: data.protocol,
      pern: data.pern,
      competitors: data.competitors,
    };
    cache.set('published', { value, at: Date.now() });
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    lastError = null;
    lastSuccessAt = Date.now();
    return value;
  } catch (err) {
    lastError = err.message;
    logger.warn('[BenchmarkClient] AI benchmark unavailable', { error: err.message });
    return null;
  }
}

function resetCache() {
  cache.clear();
  lastError = null;
}

module.exports = {
  getBenchmark,
  resetCache,
  getLastError: () => lastError,
  getLastSuccessAt: () => lastSuccessAt,
};
