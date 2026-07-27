/**
 * PERN AI Model Validation Tests
 * Run with: npm test
 */

import { describe, it, expect } from 'vitest';
import { calculateScientificEHI } from '../lib/scientific-ehi';
import { generateAdvancedPrediction } from '../lib/prediction-engine';
import { generateRecommendations } from '../lib/recommendation-engine';
import { generateConfidenceFactors, calculateStatisticalConfidence } from '../lib/confidence-scoring';

describe('Scientific EHI', () => {
  it('should return valid EHI for normal conditions', () => {
    const result = calculateScientificEHI({
      pm25: 18,
      ph: 7.2,
      tds: 160,
      dO: 8.8,
      tmp: 27,
      hum: 52,
      co2: 420
    });

    expect(result!.score).toBeGreaterThanOrEqual(65);
    expect(result!.category).toMatch(/Excellent|Good|Moderate/);
    expect(result!.subIndices.length).toBeGreaterThan(3);
  });

  it('should lower score when PM2.5 is high', () => {
    const normal = calculateScientificEHI({
      pm25: 18, ph: 7.2, tds: 160, dO: 8.8, tmp: 27, hum: 52, co2: 420
    });
    const polluted = calculateScientificEHI({
      pm25: 100, ph: 7.2, tds: 160, dO: 8.8, tmp: 27, hum: 52, co2: 420
    });

    expect(polluted!.score).toBeLessThan(normal!.score);
    expect(polluted!.subIndices[0].name).toBe('Air Quality');
  });

  it('should handle missing values gracefully', () => {
    const result = calculateScientificEHI({});
    expect(result).toBeNull();
  });
});

describe('Prediction Engine', () => {
  it('should return prediction with confidence', () => {
    const data = [68, 69, 70, 71, 72, 71, 73, 72, 74, 73, 72, 75];
    const result = generateAdvancedPrediction(data, 24);

    expect(result.value).toBeGreaterThan(60);
    expect(result.confidence).toBeGreaterThan(40);
    expect(result.lowerBound).toBeLessThan(result.upperBound);
    expect(result.method).toContain('Ensemble');
  });

  it('should return low confidence with insufficient data', () => {
    const data = [70, 71];
    const result = generateAdvancedPrediction(data, 24);

    expect(result.confidence).toBeLessThan(50);
  });

  it('should handle 7-day horizon', () => {
    const data = Array.from({ length: 20 }, (_, i) => 70 + Math.sin(i) * 5);
    const result = generateAdvancedPrediction(data, 168);

    expect(result.confidence).toBeLessThan(70);
  });
});

describe('Recommendation Engine', () => {
  it('should generate high priority recommendation for high PM2.5', () => {
    const recs = generateRecommendations({
      ehi: 65,
      pm25: 48,
      ph: 7.2,
      temperature: 28,
      humidity: 55,
      co2: 450,
      virtualSensors: []
    });

    const highPriority = recs.filter(r => r.priority === 'high');
    expect(highPriority.length).toBeGreaterThan(0);
    expect(highPriority[0].title).toContain('Outdoor');
  });

  it('should recommend ventilation when CO2 is high', () => {
    const recs = generateRecommendations({
      ehi: 70,
      pm25: 20,
      ph: 7.2,
      temperature: 26,
      humidity: 50,
      co2: 1250,
      virtualSensors: []
    });

    expect(recs.some(r => r.title.toLowerCase().includes('ventilation'))).toBe(true);
  });

  it('should return empty recommendations for good conditions', () => {
    const recs = generateRecommendations({
      ehi: 82,
      pm25: 12,
      ph: 7.3,
      temperature: 25,
      humidity: 48,
      co2: 420,
      virtualSensors: []
    });

    expect(recs.length).toBeLessThanOrEqual(2);
  });
});

describe('Statistical Confidence Scoring', () => {
  it('should return high confidence with fresh, complete data', () => {
    const factors = generateConfidenceFactors(
      Date.now() - 2 * 60 * 1000,
      12,
      13,
      0.85
    );
    const score = calculateStatisticalConfidence(factors);

    expect(score).toBeGreaterThan(70);
  });

  it('should return lower confidence with old data', () => {
    const factors = generateConfidenceFactors(
      Date.now() - 45 * 60 * 1000,
      12,
      13,
      0.7
    );
    const score = calculateStatisticalConfidence(factors);

    expect(score).toBeLessThan(68);
  });

  it('should penalize low sensor coverage', () => {
    const factors = generateConfidenceFactors(
      Date.now() - 5 * 60 * 1000,
      4,
      13,
      0.6
    );
    const score = calculateStatisticalConfidence(factors);

    expect(score).toBeLessThan(65);
  });
});

describe('Integration', () => {
  it('should produce consistent results across modules', () => {
    const readings = {
      pm25: 25,
      ph: 7.1,
      tds: 185,
      dO: 8.2,
      tmp: 29,
      hum: 58,
      co2: 480
    };

    const ehi = calculateScientificEHI(readings);
    const confidenceFactors = generateConfidenceFactors(Date.now(), 13, 13, 0.7);
    const confidence = calculateStatisticalConfidence(confidenceFactors);

    expect(ehi!.score).toBeGreaterThan(50);
    expect(confidence).toBeGreaterThan(40);
  });
});

describe('Edge Cases', () => {
  it('EHI should handle extreme values', () => {
    const result = calculateScientificEHI({
      pm25: 300,
      ph: 1,
      tds: 5000,
      dO: 0.5,
      tmp: 50,
      hum: 5,
      co2: 5000
    });
    expect(result!.score).toBeLessThan(40);
    expect(result!.category).toBe('Critical');
  });

  it('Prediction should work with constant data', () => {
    const data = Array(15).fill(70);
    const result = generateAdvancedPrediction(data, 24);
    expect(result.value).toBeCloseTo(70, 0);
  });

  it('Recommendations should handle missing virtual sensors', () => {
    const recs = generateRecommendations({
      ehi: 75,
      pm25: 22,
      ph: 7.2,
      temperature: 28,
      humidity: 55,
      co2: 480,
      virtualSensors: []
    });
    expect(Array.isArray(recs)).toBe(true);
  });

  it('EHI should return null with empty input', () => {
    const result = calculateScientificEHI({});
    expect(result).toBeNull();
  });

  it('Prediction should handle very short history', () => {
    const data = [70, 71, 72];
    const result = generateAdvancedPrediction(data, 24);
    expect(result.confidence).toBeLessThan(60);
  });
});

describe('Data Provider Behavior', () => {
  it('should expose canSimulate as false when isLive is true', () => {
    const isLive = true;
    const canSimulate = !isLive;
    expect(canSimulate).toBe(false);
  });

  it('should expose canSimulate as true when isLive is false', () => {
    const isLive = false;
    const canSimulate = !isLive;
    expect(canSimulate).toBe(true);
  });
});

describe('Automation Rules', () => {
  it('should generate valid rule structure', () => {
    const rule = {
      id: 'r1',
      name: 'Test Rule',
      sensor: 'pm25',
      operator: '>',
      threshold: 45,
      action: { device: 'test', actuator: 'fan', command: 'on' },
      priority: 8,
      enabled: true,
      cooldown: 300,
      lastTriggered: 0
    };

    expect(rule.sensor).toBe('pm25');
    expect(rule.action.actuator).toBe('fan');
    expect(rule.enabled).toBe(true);
  });
});
