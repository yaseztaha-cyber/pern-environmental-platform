/**
 * PERN Scientific Analysis Core v2.0
 *
 * Central orchestrator that runs the full scientific analysis pipeline:
 *   1. Environmental Health Index (EHI) via scientific-ehi.ts
 *   2. Time-series predictions via prediction-engine.ts
 *   3. Confidence scoring via confidence-scoring.ts
 *   4. Recommendations via recommendation-engine.ts
 *
 * All sub-modules reference established standards and peer-reviewed literature
 * — see individual module headers for detailed citations.
 *
 * Data flow:
 *   readings + history ─► scientific-ehi ─► EHI score + sub-indices
 *                       ├► prediction-engine ─► 24h ensemble forecasts
 *                       ├► confidence-scoring ─► multi-factor confidence
 *                       └► recommendation-engine ─► prioritized actions
 */

import { calculateScientificEHI, ScientificEHIResult } from './scientific-ehi';
import { generateAdvancedPrediction, PredictionResult, EnsembleWeights, detectAnomalies, detectTrendDirection, TrendInfo } from './prediction-engine';
import { generateRecommendations, Recommendation } from './recommendation-engine';
import { generateConfidenceFactors, calculateStatisticalConfidence } from './confidence-scoring';

export interface SensorPrediction {
  sensor: string;
  prediction: PredictionResult;
}

export interface SensorAnomaly {
  sensor: string;
  anomalyIndices: number[];
  anomalyCount: number;
}

export interface SensorTrend {
  sensor: string;
  trend: TrendInfo;
}

export interface CrossCorrelation {
  sensorA: string;
  sensorB: string;
  coefficient: number;
}

export interface ScientificAnalysis {
  ehi: ScientificEHIResult | null;
  confidence: number;
  confidenceFactors: {
    dataFreshness: number;
    sensorCoverage: number;
    modelAccuracy: number;
    trendStrength: number;
    crossConsistency: number;
  };
  predictions: SensorPrediction[];
  anomalies: SensorAnomaly[];
  trends: SensorTrend[];
  crossCorrelations: CrossCorrelation[];
  recommendations: Recommendation[];
  warnings: string[];
}

const PREDICTION_SENSORS = ['pm25', 'tmp', 'hum', 'co2', 'ph', 'tds', 'dO'] as const;

export function runScientificAnalysis(
  readings: Record<string, number>,
  history: Record<string, number[]> = {},
  lastUpdate: number = Date.now(),
  weights?: EnsembleWeights
): ScientificAnalysis {
  const warnings: string[] = [];
  const ehi = calculateScientificEHI(readings);

  const predictions: SensorPrediction[] = [];
  const activeKeys = Object.keys(readings);
  if (activeKeys.length === 0) {
    return {
      ehi: null,
      confidence: 0,
      confidenceFactors: { dataFreshness: 0, sensorCoverage: 0, modelAccuracy: 0, trendStrength: 0, crossConsistency: 0 },
      predictions: [],
      anomalies: [],
      trends: [],
      crossCorrelations: [],
      recommendations: [],
      warnings: ['No sensor readings available'],
    };
  }

  const anomalies: SensorAnomaly[] = [];
  const trends: SensorTrend[] = [];

  for (const sensor of PREDICTION_SENSORS) {
    if (readings[sensor] === undefined) continue;
    const sensorHistory = history[sensor];
    if (!sensorHistory || sensorHistory.length < 3) continue;
    try {
      const prediction = generateAdvancedPrediction(sensorHistory, 24, weights);
      predictions.push({ sensor, prediction });
    } catch {
      warnings.push(`Prediction failed for ${sensor}`);
    }

    const anomalyIndices = detectAnomalies(sensorHistory);
    if (anomalyIndices.length > 0) {
      anomalies.push({ sensor, anomalyIndices, anomalyCount: anomalyIndices.length });
    }

    trends.push({ sensor, trend: detectTrendDirection(sensorHistory) });
  }

  const crossCorrelations: CrossCorrelation[] = [];
  const sensorKeys = activeKeys.filter(k => history[k]?.length >= 5);
  for (let i = 0; i < sensorKeys.length; i++) {
    for (let j = i + 1; j < sensorKeys.length; j++) {
      const a = sensorKeys[i];
      const b = sensorKeys[j];
      const ha = history[a];
      const hb = history[b];
      if (!ha || !hb) continue;
      const len = Math.min(ha.length, hb.length);
      const aSlice = ha.slice(-len);
      const bSlice = hb.slice(-len);
      const aMean = aSlice.reduce((s, v) => s + v, 0) / len;
      const bMean = bSlice.reduce((s, v) => s + v, 0) / len;
      let num = 0, da2 = 0, db2 = 0;
      for (let k = 0; k < len; k++) {
        const da = aSlice[k] - aMean;
        const db = bSlice[k] - bMean;
        num += da * db;
        da2 += da * da;
        db2 += db * db;
      }
      const den = Math.sqrt(da2 * db2);
      if (den > 0) {
        crossCorrelations.push({ sensorA: a, sensorB: b, coefficient: num / den });
      }
    }
  }

  const totalExpectedSensors = 13;
  const activeSensors = activeKeys.length;
  const trendR2 = predictions.length > 0
    ? predictions.reduce((s, p) => s + (p.prediction.rSquared ?? 0.5), 0) / predictions.length
    : 0.5;
  const recentReadings = activeKeys.flatMap(k => history[k] ?? []).slice(-30);

  const confidenceFactors = generateConfidenceFactors(
    lastUpdate, activeSensors, totalExpectedSensors, trendR2,
    recentReadings.length > 0 ? recentReadings : undefined
  );
  const confidence = calculateStatisticalConfidence(confidenceFactors);

  const ehiValue = ehi?.score ?? 50;

  const recommendations = generateRecommendations({
    ehi: ehiValue,
    pm25: readings.pm25 ?? 0,
    ph: readings.ph ?? 7,
    temperature: readings.tmp ?? 25,
    humidity: readings.hum ?? 50,
    co2: readings.co2 ?? 400,
    tds: readings.tds,
    dissolvedOxygen: readings.dO,
    virtualSensors: ehi?.subIndices.map(s => ({
      name: s.name,
      value: s.value,
      category: s.value >= 80 ? 'good' : s.value >= 60 ? 'fair' : s.value >= 40 ? 'moderate' : s.value >= 20 ? 'poor' : 'critical',
    })) ?? [],
    hasRealData: Object.fromEntries(activeKeys.map(k => [k, true])),
  });

  return {
    ehi,
    confidence,
    confidenceFactors,
    predictions,
    anomalies,
    trends,
    crossCorrelations,
    recommendations,
    warnings,
  };
}
