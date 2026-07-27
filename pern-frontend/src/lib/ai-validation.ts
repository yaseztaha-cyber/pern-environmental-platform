/**
 * PERN AI Model Validation Utilities
 * 
 * These functions can be used for automated or manual validation
 * of the new AI models (EHI, Prediction, Confidence).
 */

import { calculateScientificEHI } from './scientific-ehi';
import { generateAdvancedPrediction } from './prediction-engine';
import { generateRecommendations } from './recommendation-engine';
import { generateConfidenceFactors, calculateStatisticalConfidence } from './confidence-scoring';

/**
 * Validate EHI calculation with known test cases
 */
export function validateEHI() {
  const testCases = [
    { name: 'Normal Conditions', readings: { pm25: 18, ph: 7.2, tds: 160, dO: 8.8, tmp: 27, hum: 52, co2: 420 }, expectedMin: 70 },
    { name: 'High PM2.5', readings: { pm25: 52, ph: 7.2, tds: 160, dO: 8.8, tmp: 27, hum: 52, co2: 420 }, expectedMax: 65 },
    { name: 'Poor Water Quality', readings: { pm25: 18, ph: 6.3, tds: 620, dO: 4.8, tmp: 27, hum: 52, co2: 420 }, expectedMax: 55 },
  ];

  console.log('=== EHI Validation ===');
  testCases.forEach(tc => {
    const result = calculateScientificEHI(tc.readings);
    const passed = 
      (tc.expectedMin === undefined || result.score >= tc.expectedMin) &&
      (tc.expectedMax === undefined || result.score <= tc.expectedMax);
    
    console.log(`${passed ? '✅' : '❌'} ${tc.name}: ${result.score} (${result.category})`);
  });
}

/**
 * Validate Prediction Engine
 */
export function validatePrediction() {
  console.log('\n=== Prediction Validation ===');
  
  const stableData = [68, 69, 70, 69, 71, 70, 72, 71, 70, 72, 71, 73];
  const result = generateAdvancedPrediction(stableData, 24);
  
  console.log(`Stable data prediction: ${result.value} (Confidence: ${result.confidence}%)`);
  console.log(`Expected: Value close to ~71 with confidence > 60`);
}

/**
 * Validate Recommendations
 */
export function validateRecommendations() {
  console.log('\n=== Recommendation Validation ===');
  
  const testData = {
    ehi: 48,
    pm25: 42,
    ph: 7.1,
    temperature: 34,
    humidity: 78,
    co2: 980,
    virtualSensors: [
      { name: 'AQI', value: 142, category: 'poor' },
      { name: 'WQI', value: 38, category: 'good' }
    ]
  };

  const recs = generateRecommendations(testData);
  console.log(`Generated ${recs.length} recommendations`);
  console.log('High priority recommendations:', recs.filter(r => r.priority === 'high').length);
}

/**
 * Validate Confidence Scoring
 */
export function validateConfidence() {
  console.log('\n=== Confidence Scoring Validation ===');
  
  const factors = generateConfidenceFactors(Date.now() - 3 * 60 * 1000, 11, 13, 0.72);
  const score = calculateStatisticalConfidence(factors);
  
  console.log(`Confidence Score: ${score}%`);
  console.log('Factors:', factors);
}

/**
 * Run all validations
 */
export function runAllValidations() {
  console.log('=== PERN AI Model Validation ===\n');
  validateEHI();
  validatePrediction();
  validateRecommendations();
  validateConfidence();
  console.log('\n=== Validation Complete ===');
}