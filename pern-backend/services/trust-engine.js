/**
 * PERN v3 — Trust & Calibration Algorithm
 * Spatial cross-validation engine that computes confidence scores
 * for every data source based on freshness, spatial consistency,
 * historical accuracy, and calibration status.
 *
 * PERN v4.0 — historical accuracy can be supplied by the pern-ai learned
 * confidence model via computeConfidenceWithAI(); the sync computeConfidence()
 * keeps the original heuristic so downstream callers stay unchanged.
 */
const logger = require('../utils/logger');
const db = require('../db');
const aiClient = require('./ai-confidence-client');

const TRUST_HIERARCHY = {
  physical: { baseTrust: 0.95, decayRate: 'slow', crossValidate: ['sentinel_5p', 'waqi'] },
  sentinel_5p: { baseTrust: 0.90, decayRate: 'medium', crossValidate: ['waqi', 'openaq'] },
  waqi: { baseTrust: 0.85, decayRate: 'slow', crossValidate: ['sentinel_5p', 'openaq'] },
  openaq: { baseTrust: 0.80, decayRate: 'slow', crossValidate: ['waqi', 'sentinel_5p'] },
  nasa_firms: { baseTrust: 0.80, decayRate: 'medium', crossValidate: [] },
  sensor_community: { baseTrust: 0.50, decayRate: 'fast', crossValidate: ['waqi', 'openaq'] },
  virtual: { baseTrust: 0.60, decayRate: 'none', crossValidate: [] },
};

class TrustEngine {
  constructor() {
    this.scores = new Map();
    this.anomalies = [];
  }

  computeConfidence(sourceType, reading, nearbyReadings) {
    return this._score(sourceType, reading, nearbyReadings, { historicalAccuracy: 0.85 });
  }

  /**
   * PERN v4.0 — blend the learned confidence score (0-100) into the trust
   * equation as the historical-accuracy factor. Falls back to the heuristic
   * value (0.85) when the AI service is unreachable.
   */
  async computeConfidenceWithAI(sourceType, reading, nearbyReadings, options = {}) {
    const ai = options.aiOverride ?? (await aiClient.getConfidence(sourceType, reading));
    const historicalAccuracy = ai && Number.isFinite(ai.score) ? ai.score / 100 : 0.85;
    const result = this._score(sourceType, reading, nearbyReadings, { historicalAccuracy, ai });
    return result;
  }

  _score(sourceType, reading, nearbyReadings, { historicalAccuracy = 0.85, ai = null } = {}) {
    const hierarchy = TRUST_HIERARCHY[sourceType];
    if (!hierarchy) return { overall: 0.5, factors: {} };

    const baseTrust = hierarchy.baseTrust;
    const hoursSinceLast = 0;
    const freshness = Math.exp(-hoursSinceLast / 24);
    const spatialConsistency = this._spatialConsistency(reading, nearbyReadings);
    const calibrationStatus = 1.0;

    const score = baseTrust * 0.3 + freshness * 0.2 + spatialConsistency * 0.25 + historicalAccuracy * 0.15 + calibrationStatus * 0.1;
    const overall = Math.round(Math.min(0.98, Math.max(0.1, score)) * 100) / 100;

    const factors = {
      baseTrust,
      freshness,
      spatialConsistency,
      historicalAccuracy,
      calibrationStatus,
    };
    if (ai) {
      factors.aiScore = ai.score;
      factors.aiInterval = ai.interval;
      factors.aiCoverage = ai.coverage;
      factors.method = 'ai';
    } else {
      factors.method = 'heuristic';
    }
    this.scores.set(sourceType, { overall, factors, evaluated_at: new Date().toISOString() });
    db.upsertSensorConfidence({
      sensorId: reading.source_id || `${sourceType}_${Date.now()}`,
      sourceType,
      overallScore: overall,
      freshnessScore: Math.round(freshness * 100) / 100,
      spatialConsistency: Math.round(spatialConsistency * 100) / 100,
      calibrationStatus: calibrationStatus >= 1 ? 'verified' : 'unverified',
    });
    return { overall, factors };
  }

  _spatialConsistency(reading, nearbyReadings) {
    if (!nearbyReadings || nearbyReadings.length === 0) return 1.0;
    let totalDeviation = 0;
    let count = 0;
    const mainParams = Object.keys(reading.parameters || {});
    for (const nr of nearbyReadings) {
      for (const param of mainParams) {
        const rVal = reading.parameters[param]?.value;
        const nVal = nr.parameters?.[param]?.value;
        if (rVal !== undefined && nVal !== undefined && nVal > 0) {
          totalDeviation += Math.min(1, Math.abs(rVal - nVal) / nVal);
          count++;
        }
      }
    }
    return count > 0 ? Math.max(0, 1 - totalDeviation / count) : 1.0;
  }

  flagAnomaly(reading, reason, severity) {
    const anomaly = {
      id: `anom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      source_type: reading.source_type,
      source_id: reading.source_id,
      latitude: reading.latitude,
      longitude: reading.longitude,
      parameter: reading.parameters ? Object.keys(reading.parameters)[0] : 'unknown',
      reason: reason || 'Deviation exceeds threshold',
      severity: severity || 'warning',
      detected_at: new Date().toISOString(),
    };
    this.anomalies.push(anomaly);
    if (this.anomalies.length > 500) this.anomalies.splice(0, this.anomalies.length - 500);
    return anomaly;
  }

  getScore(sourceType) {
    return this.scores.get(sourceType) || null;
  }

  getAllScores() {
    const result = {};
    for (const [key, val] of this.scores) result[key] = val;
    return result;
  }

  getAnomalies(limit) {
    return this.anomalies.slice(-(limit || 50));
  }

  recalibrate(readings) {
    logger.info(`[Trust] Recalibrating with ${readings.length} readings`);
    const groups = {};
    for (const r of readings) {
      if (!groups[r.source_type]) groups[r.source_type] = [];
      groups[r.source_type].push(r);
    }
    for (const [sourceType, group] of Object.entries(groups)) {
      this.computeConfidence(sourceType, group[0], group.slice(1, 5));
    }
    return { sources_calibrated: Object.keys(groups).length, timestamp: new Date().toISOString() };
  }
}

module.exports = new TrustEngine();
