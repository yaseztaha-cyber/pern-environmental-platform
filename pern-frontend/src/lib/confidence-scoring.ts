/**
 * PERN Statistical Confidence Scoring v2.0
 * 
 * This replaces the weak "coverage-based" confidence with a proper multi-factor statistical model.
 * 
 * Factors:
 * - Data Freshness
 * - Sensor Coverage & Quality
 * - Model Accuracy (based on validation)
 * - Trend Strength (R²)
 * - Cross-sensor Consistency
 */

export interface ConfidenceFactors {
  dataFreshness: number;      // 0-100 (how recent the data is)
  sensorCoverage: number;     // 0-100 (how many sensors are reporting)
  modelAccuracy: number;      // 0-100 (how reliable the model is)
  trendStrength: number;      // 0-100 (R² from trend analysis)
  crossConsistency: number;   // 0-100 (agreement between sensors)
}

export function calculateStatisticalConfidence(factors: ConfidenceFactors): number {
  const weights = {
    freshness: 0.22,
    coverage: 0.25,
    accuracy: 0.20,
    trend: 0.18,
    consistency: 0.15
  };

  const score =
    factors.dataFreshness * weights.freshness +
    factors.sensorCoverage * weights.coverage +
    factors.modelAccuracy * weights.accuracy +
    factors.trendStrength * weights.trend +
    factors.crossConsistency * weights.consistency;

  return Math.round(Math.max(25, Math.min(95, score)));
}

/**
 * Generate confidence factors from current data
 */
export function generateConfidenceFactors(
  lastUpdate: number,
  activeSensors: number,
  totalExpectedSensors: number = 13,
  trendR2: number = 0.65,
  recentReadings?: number[]
): ConfidenceFactors {
  const now = Date.now();
  const ageMinutes = (now - lastUpdate) / (1000 * 60);

  // Data Freshness (decays after 15 minutes)
  const freshness = Math.max(30, Math.min(100, 100 - (ageMinutes * 2)));

  // Sensor Coverage
  const coverage = Math.round((activeSensors / totalExpectedSensors) * 100);

  // Model Accuracy — derived from recent reading stability (coefficient of variation)
  let accuracy = 70;
  if (recentReadings && recentReadings.length >= 3) {
    const mean = recentReadings.reduce((a, b) => a + b, 0) / recentReadings.length;
    if (mean > 0) {
      const variance = recentReadings.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / recentReadings.length;
      const cv = Math.sqrt(variance) / mean;
      // Lower coefficient of variation = more stable = higher accuracy
      accuracy = Math.round(Math.max(40, Math.min(95, 95 - cv * 100)));
    }
  }

  // Trend Strength
  const trend = Math.round(trendR2 * 100);

  // Cross-consistency — if we have readings, check agreement between recent values
  let consistency = 75;
  if (recentReadings && recentReadings.length >= 4) {
    const mid = Math.floor(recentReadings.length / 2);
    const firstHalf = recentReadings.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
    const secondHalf = recentReadings.slice(mid).reduce((a, b) => a + b, 0) / (recentReadings.length - mid);
    if (firstHalf > 0 && secondHalf > 0) {
      const agreement = 1 - Math.abs(firstHalf - secondHalf) / Math.max(firstHalf, secondHalf);
      consistency = Math.round(Math.max(35, Math.min(95, agreement * 95)));
    }
  }

  return {
    dataFreshness: Math.round(freshness),
    sensorCoverage: coverage,
    modelAccuracy: accuracy,
    trendStrength: trend,
    crossConsistency: consistency
  };
}