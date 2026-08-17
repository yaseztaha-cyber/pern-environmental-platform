/**
 * PERN v3 — Public API Gateway
 * Rate-limited public endpoints (separate from internal /api), API key
 * registration, tiered access, and data provenance / attribution.
 */
const crypto = require('crypto');
const logger = require('../utils/logger');
const db = require('../db');

const TIERS = {
  free: { reqPerDay: 1000, delayHours: 24, singleRegion: false },
  starter: { reqPerDay: 10000, delayHours: 1, singleRegion: true },
  enterprise: { reqPerDay: Infinity, delayHours: 0, singleRegion: false },
};

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function generateApiKey() {
  return `pern_${crypto.randomBytes(24).toString('hex')}`;
}

class PublicAPI {
  constructor() {
    this.memoryKeys = new Map();
  }

  /**
   * Register a new API key. Falls back to in-memory registry when no DB.
   */
  async register({ name, email, tier = 'free' }) {
    const key = generateApiKey();
    const hash = sha256(key);
    const tierConfig = TIERS[tier] || TIERS.free;
    const record = {
      name, email: email || null, keyHash: hash, tier,
      quotaPerDay: tierConfig.reqPerDay,
    };
    const saved = await db.saveGlobalApiKey(record);
    if (saved) {
      return { api_key: key, tier, quota_per_day: tierConfig.reqPerDay, persisted: true };
    }
    // In-memory fallback (no DB available)
    this.memoryKeys.set(hash, { ...record, enabled: true, daily_requests: 0, created_at: new Date().toISOString() });
    return { api_key: key, tier, quota_per_day: tierConfig.reqPerDay, persisted: false };
  }

  async authenticate(rawKey) {
    if (!rawKey) return null;
    const hash = sha256(rawKey);
    let rec = await db.getGlobalApiKeyByHash(hash);
    if (!rec) rec = this.memoryKeys.get(hash) || null;
    if (!rec || rec.enabled === false) return null;
    const tierConfig = TIERS[rec.tier] || TIERS.free;
    if (rec.daily_requests >= tierConfig.reqPerDay) {
      return { error: 'quota_exceeded' };
    }
    db.incrementApiKeyUsage(hash);
    return { tier: rec.tier, name: rec.name };
  }

  async listKeys() {
    const dbKeys = await db.listGlobalApiKeys();
    const memKeys = Array.from(this.memoryKeys.values()).map(k => ({
      id: k.keyHash, name: k.name, email: k.email, tier: k.tier,
      enabled: k.enabled, daily_requests: k.daily_requests,
      quota_per_day: k.quotaPerDay, created_at: k.created_at,
    }));
    return [...dbKeys, ...memKeys];
  }

  async revoke(rawKey) {
    const hash = sha256(rawKey);
    const ok = await db.revokeGlobalApiKey(hash);
    if (this.memoryKeys.has(hash)) this.memoryKeys.delete(hash);
    return ok;
  }

  /**
   * Data provenance object attached to every public API response.
   */
  buildProvenance(sourceTypes, confidence) {
    return {
      sources: sourceTypes || ['unknown'],
      confidence_score: confidence ?? 0.5,
      last_calibrated: new Date().toISOString(),
      method: 'spatial_cross_validation_v1',
      attribution: 'Contains modified Copernicus Sentinel data 2026',
    };
  }

  /**
   * Wrap a payload with provenance metadata.
   */
  withProvenance(data, sourceTypes, confidence) {
    return { ...data, provenance: this.buildProvenance(sourceTypes, confidence) };
  }
}

module.exports = new PublicAPI();
module.exports.TIERS = TIERS;
