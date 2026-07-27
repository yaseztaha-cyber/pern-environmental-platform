/**
 * PERN Model Validation Service
 * 
 * Compares PERN's virtual sensors and predictions against real-world data (OpenAQ).
 */

import { fetchOpenAQData } from './openaq-service';

export interface ValidationResult {
  parameter: string;
  pernValue: number;
  realValue: number;
  difference: number;
  accuracy: number; // 0-100
}

/**
 * Compare PERN's PM2.5 reading with real OpenAQ data
 */
export async function validatePM25(pernPM25: number, city: string = 'Cairo'): Promise<ValidationResult | null> {
  const realData = await fetchOpenAQData(city);
  
  if (!realData || realData.pm25 === null) {
    return null;
  }

  const difference = Math.abs(pernPM25 - realData.pm25);
  const accuracy = Math.max(0, 100 - (difference / realData.pm25) * 100);

  return {
    parameter: 'PM2.5',
    pernValue: pernPM25,
    realValue: realData.pm25,
    difference: Math.round(difference * 10) / 10,
    accuracy: Math.round(accuracy)
  };
}

/**
 * Validate multiple parameters
 */
export async function validateAgainstRealData(
  pernData: { pm25: number; city?: string }
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];

  const pm25Result = await validatePM25(pernData.pm25, pernData.city);
  if (pm25Result) results.push(pm25Result);

  return results;
}

/**
 * Generate a validation report
 */
export async function generateValidationReport(pernData: { pm25: number; city?: string }) {
  const results = await validateAgainstRealData(pernData);

  if (results.length === 0) {
    return {
      success: false,
      message: 'No real-world data available for comparison'
    };
  }

  const avgAccuracy = results.reduce((sum, r) => sum + r.accuracy, 0) / results.length;

  return {
    success: true,
    results,
    averageAccuracy: Math.round(avgAccuracy),
    timestamp: new Date().toISOString()
  };
}