/**
 * PERN Prediction Model Validation
 * 
 * This module helps validate the accuracy of the prediction engine
 * by comparing predictions against actual future values (backtesting).
 */

import { generateAdvancedPrediction } from './prediction-engine';

export interface ValidationResult {
  horizon: number;
  predicted: number;
  actual: number;
  error: number;
  absoluteError: number;
  percentageError: number;
}

/**
 * Simple backtesting function
 * Takes historical data and tests how well the model predicts future values.
 */
export function backtestPrediction(
  historicalData: number[],
  testPoints: number = 5,
  horizonHours: number = 24
): ValidationResult[] {
  if (historicalData.length < testPoints + 5) {
    return [];
  }

  const results: ValidationResult[] = [];

  for (let i = 0; i < testPoints; i++) {
    const trainingData = historicalData.slice(0, historicalData.length - testPoints + i);
    const actualValue = historicalData[historicalData.length - testPoints + i];

    const prediction = generateAdvancedPrediction(trainingData, horizonHours);

    const error = prediction.value - actualValue;
    const absoluteError = Math.abs(error);
    const percentageError = actualValue !== 0 ? (absoluteError / actualValue) * 100 : 0;

    results.push({
      horizon: horizonHours,
      predicted: prediction.value,
      actual: actualValue,
      error: Math.round(error * 10) / 10,
      absoluteError: Math.round(absoluteError * 10) / 10,
      percentageError: Math.round(percentageError * 10) / 10
    });
  }

  return results;
}

/**
 * Calculate average prediction error from backtest results
 */
export function calculateAverageError(results: ValidationResult[]): number {
  if (results.length === 0) return 0;

  const totalError = results.reduce((sum, r) => sum + r.absoluteError, 0);
  return Math.round((totalError / results.length) * 10) / 10;
}

/**
 * Simple accuracy score (lower error = higher accuracy)
 */
export function calculateAccuracyScore(results: ValidationResult[]): number {
  if (results.length === 0) return 0;

  const avgError = calculateAverageError(results);
  // Rough scoring: error under 5 = 90+, error over 15 = below 70
  const score = Math.max(50, Math.min(95, 95 - (avgError * 3)));
  return Math.round(score);
}