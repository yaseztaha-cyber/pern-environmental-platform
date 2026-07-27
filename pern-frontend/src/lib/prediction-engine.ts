/**
 * PERN Advanced Prediction Engine
 * Holt's Double Exponential Smoothing + Weighted Moving Average + Holt-Winters + Ensemble
 */

export interface PredictionResult {
  value: number;
  upperBound: number;
  lowerBound: number;
  confidence: number;
  method: string;
  rSquared?: number;
}

// ==================== Double Exponential Smoothing (Holt's) ====================

export function doubleExponentialSmoothing(
  data: number[],
  alpha = 0.3,
  beta = 0.1
): number[] {
  if (data.length < 2) return [...data];

  let level = data[0];
  let trend = data[1] - data[0];
  const smoothed: number[] = [level];

  for (let i = 1; i < data.length; i++) {
    const prevLevel = level;
    level = alpha * data[i] + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
    smoothed.push(level + trend);
  }

  return smoothed;
}

// ==================== Weighted Moving Average ====================

export function weightedMovingAverage(data: number[], windowSize = 5): number[] {
  if (data.length < windowSize) return [...data];

  const weights = Array.from({ length: windowSize }, (_, i) => i + 1);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const result: number[] = [];

  for (let i = 0; i < data.length; i++) {
    if (i < windowSize - 1) {
      result.push(data[i]);
    } else {
      const window = data.slice(i - windowSize + 1, i + 1);
      const wma = window.reduce((sum, val, j) => sum + val * weights[j], 0) / totalWeight;
      result.push(wma);
    }
  }

  return result;
}

// ==================== Holt-Winters (Triple Exponential Smoothing) ====================

export function holtWinters(
  data: number[],
  alpha = 0.3,
  beta = 0.1,
  gamma = 0.2,
  seasonLength = 7
): { smoothed: number[]; forecast: (steps: number) => PredictionResult } {
  if (data.length < seasonLength * 2) {
    const smoothed = doubleExponentialSmoothing(data, alpha, beta);
    return {
      smoothed,
      forecast: (steps) => {
        const lastVal = smoothed[smoothed.length - 1] || 0;
        const trendVal = smoothed.length > 1 ? smoothed[smoothed.length - 1] - smoothed[smoothed.length - 2] : 0;
        const predicted = lastVal + trendVal * steps;
        return {
          value: Math.round(predicted * 10) / 10,
          upperBound: Math.round((predicted + Math.abs(predicted) * 0.2) * 10) / 10,
          lowerBound: Math.round((predicted - Math.abs(predicted) * 0.2) * 10) / 10,
          confidence: Math.max(30, 70 - steps * 0.5),
          method: "Holt's Double Exponential (fallback)",
        };
      }
    };
  }

  const seasonal: number[] = [];
  let level = data.slice(0, seasonLength).reduce((a, b) => a + b, 0) / seasonLength;
  let trend = (data.slice(seasonLength, seasonLength * 2).reduce((a, b) => a + b, 0) / seasonLength - level) / seasonLength;

  const firstSeasonAvg = level || 1;
  for (let i = 0; i < data.length; i++) {
    seasonal[i] = firstSeasonAvg > 0 ? data[i] / firstSeasonAvg : 1;
  }

  const smoothed: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const prevLevel = level;
    level = alpha * (data[i] / seasonal[i]) + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
    const seasonIdx = i % seasonLength;
    seasonal[i] = gamma * (data[i] / level) + (1 - gamma) * seasonal[seasonIdx];
    smoothed.push(level + trend);
  }

  return {
    smoothed,
    forecast: (steps) => {
      const predictions: number[] = [];
      for (let h = 1; h <= steps; h++) {
        const seasonIdx = (data.length + h - 1) % seasonLength;
        predictions.push((level + trend * h) * (seasonal[seasonIdx] || 1));
      }
      const predicted = predictions[0] || 0;
      const uncertainty = Math.abs(predicted) * 0.15 * Math.sqrt(steps);
      return {
        value: Math.round(predicted * 10) / 10,
        upperBound: Math.round((predicted + uncertainty) * 10) / 10,
        lowerBound: Math.round((predicted - uncertainty) * 10) / 10,
        confidence: Math.max(25, 75 - steps * 0.3),
        method: 'Holt-Winters Triple Exponential',
      };
    }
  };
}

// ==================== Ensemble Forecast ====================

export function predictWithSeasonality(
  data: number[],
  horizon: number,
  alpha = 0.3,
  beta = 0.1
): PredictionResult {
  const des = doubleExponentialSmoothing(data, alpha, beta);
  const wma = weightedMovingAverage(data, Math.min(5, data.length));
  const hw = holtWinters(data, alpha, beta, 0.2, Math.min(7, Math.floor(data.length / 2)));

  const lastDes = des[des.length - 1] || 0;
  const lastWma = wma[wma.length - 1] || 0;
  const hwResult = hw.forecast(horizon);

  const ensembleValue = lastDes * 0.35 + lastWma * 0.25 + hwResult.value * 0.4;

  const smoothed = des.slice(-20);
  const actual = data.slice(-20);
  const errors = actual.map((a, i) => a - (smoothed[i] || a));
  const rmse = Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / Math.max(1, errors.length));

  const mean = actual.reduce((a, b) => a + b, 0) / Math.max(1, actual.length);
  const ssRes = errors.reduce((s, e) => s + e * e, 0);
  const ssTot = actual.reduce((s, a) => s + (a - mean) * (a - mean), 0);
  const rSquared = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;

  const horizonScale = 1 + (horizon / 168) * 0.5;
  const uncertainty = rmse * 1.96 * horizonScale;

  return {
    value: Math.round(ensembleValue * 10) / 10,
    upperBound: Math.round((ensembleValue + uncertainty) * 10) / 10,
    lowerBound: Math.round((ensembleValue - uncertainty) * 10) / 10,
    confidence: calculateEnsembleConfidence(rSquared, data.length, rmse, horizon),
    method: 'Ensemble (DES + WMA + HW)',
    rSquared: Math.round(rSquared * 1000) / 1000,
  };
}

function calculateEnsembleConfidence(rSquared: number, dataLength: number, rmse: number, horizon: number): number {
  const rScore = Math.min(1, Math.max(0, rSquared)) * 30;
  const dScore = Math.min(30, dataLength * 1.5);
  const rmseScore = rmse > 0 ? Math.min(25, 25 / (1 + rmse / 10)) : 25;
  const horizonPenalty = Math.min(15, horizon * 0.1);
  return Math.round(Math.min(95, Math.max(25, rScore + dScore + rmseScore - horizonPenalty)));
}

// ==================== Advanced Prediction (main export) ====================

export function generateAdvancedPrediction(
  data: number[],
  horizon: number
): PredictionResult {
  if (data.length < 3) {
    const avg = data.length > 0 ? data.reduce((a, b) => a + b, 0) / data.length : 50;
    return {
      value: Math.round(avg * 10) / 10,
      upperBound: Math.round(avg * 1.2 * 10) / 10,
      lowerBound: Math.round(avg * 0.8 * 10) / 10,
      confidence: Math.max(20, 50 - data.length * 5),
      method: 'Insufficient Data (mean fallback)',
    };
  }

  return predictWithSeasonality(data, horizon);
}
