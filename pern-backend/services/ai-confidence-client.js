/**
 * PERN v4.0 — AI Confidence Client
 * Talks to the pern-ai microservice (POST /v1/confidence) to obtain the
 * learned confidence score for a reading. Never throws: any failure returns
 * null so the caller can fall back to the heuristic trust engine.
 */
const logger = require('../utils/logger');

const AI_URL = process.env.PERN_AI_URL || 'http://localhost:8000';
const TIMEOUT_MS = parseInt(process.env.PERN_AI_TIMEOUT_MS || '4000', 10);
const CACHE_TTL_MS = 60 * 1000;
const CACHE_MAX = 200;

const cache = new Map();
let lastError = null;
let lastSuccessAt = null;

function _key(sourceType, reading) {
  return [sourceType, reading?.source_id, reading?.latitude, reading?.longitude].join('|');
}

function _featureGroup(sourceType) {
  return sourceType === 'power' || sourceType === 'physical' ? 'agriculture' : 'air';
}

function _buildFeatures(reading) {
  const features = {};
  for (const [key, val] of Object.entries(reading?.parameters || {})) {
    const n = val?.value ?? val;
    if (n !== undefined && n !== null && Number.isFinite(Number(n))) features[key] = Number(n);
  }
  return features;
}

function _fetchConfidence(sourceType, reading) {
  const body = {
    latitude: Number(reading?.latitude) || 30.0,
    longitude: Number(reading?.longitude) || 31.0,
    feature_group: _featureGroup(sourceType),
    features: _buildFeatures(reading),
    ts: reading?.timestamp ? new Date(reading.timestamp).toISOString() : undefined,
  };
  return fetch(`${AI_URL}/v1/confidence`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

async function getConfidence(sourceType, reading) {
  const key = _key(sourceType, reading);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  try {
    const res = await _fetchConfidence(sourceType, reading);
    if (!res.ok) throw new Error(`pern-ai HTTP ${res.status}`);
    const data = await res.json();
    if (data.method === 'unavailable') throw new Error(data.detail || 'pern-ai model unavailable');
    if (!Number.isFinite(data.score)) throw new Error('pern-ai returned no numeric score');

    const value = {
      score: data.score,
      interval: [data.lower, data.upper],
      coverage: data.coverage,
      model_version: data.model_version,
    };
    cache.set(key, { value, at: Date.now() });
    if (cache.size > CACHE_MAX) {
      const oldest = cache.keys().next().value;
      cache.delete(oldest);
    }
    lastError = null;
    lastSuccessAt = Date.now();
    return value;
  } catch (err) {
    lastError = err.message;
    logger.warn('[TrustEngine] AI confidence unavailable, using heuristic', { sourceType, error: err.message });
    return null;
  }
}

function resetCache() {
  cache.clear();
  lastError = null;
}

module.exports = {
  getConfidence,
  resetCache,
  getLastError: () => lastError,
  getLastSuccessAt: () => lastSuccessAt,
  _internal: { AI_URL, TIMEOUT_MS, CACHE_TTL_MS },
};
