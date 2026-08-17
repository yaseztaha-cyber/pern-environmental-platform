/**
 * PERN AI Response Cache
 * Generic TTL cache for expensive AI analysis results, keyed by a stable
 * SHA-256 hash of the normalized inputs. Keeps LLM calls fast and cheap for
 * repeated/duplicate analysis requests.
 */

const crypto = require('crypto');

const MAX_ENTRIES = 500;
const cache = new Map();
const stats = { hits: 0, misses: 0 };

/**
 * Stable canonical serialization: sorted keys so semantically equal objects
 * produce identical keys regardless of property insertion order.
 */
function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map(k => `${JSON.stringify(k)}:${stableSerialize(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function cacheKey(parts) {
  return crypto.createHash('sha256').update(stableSerialize(parts)).digest('hex');
}

/**
 * Run `fn` and cache its object result under `key` for `ttlMs`.
 * Cached results are stamped with `cached: true`.
 */
async function withCache(key, ttlMs, fn) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    stats.hits++;
    return { ...hit.value, cached: true };
  }

  stats.misses++;
  const value = await fn();
  if (value && typeof value === 'object' && !value.error) {
    cache.set(key, { expiresAt: now + ttlMs, value });
    if (cache.size > MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      cache.delete(oldest);
    }
  }
  return { ...value, cached: false };
}

function getCacheStats() {
  return {
    size: cache.size,
    max: MAX_ENTRIES,
    hits: stats.hits,
    misses: stats.misses,
    hitRate: stats.hits + stats.misses > 0
      ? Math.round((stats.hits / (stats.hits + stats.misses)) * 100)
      : 0,
  };
}

function clearCache() {
  cache.clear();
}

module.exports = { withCache, cacheKey, getCacheStats, clearCache };
