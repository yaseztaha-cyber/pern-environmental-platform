import { describe, it, expect } from 'vitest';
import {
  calculateAQI,
  calculateWQI,
  calculateEnvironmentalRisk,
  calculateThermalComfort,
  calculateIndoorAirScore,
  calculateCorrosionIndex,
  calculateBOD,
  calculateAgriculturalSuitability,
  calculateEutrophicationRisk,
  calculateHumanExposureIndex,
  computeDynamicVirtualSensors,
  downsampleTelemetryData,
} from '../lib/virtual-sensors';

describe('Virtual Sensor Mathematical Models', () => {
  it('should compute valid Air Quality Index (AQI) from PM2.5 and PM10', () => {
    const readings = { pm25: 15, pm10: 35 };
    const result = calculateAQI(readings);
    expect(result).not.toBeNull();
    expect(result?.id).toBe('aqi');
    expect(result?.value).toBeGreaterThan(0);
    expect(result?.confidence).toBeGreaterThan(0);
  });

  it('should compute valid Water Quality Index (WQI) from TDS, pH, Turbidity, DO', () => {
    const readings = { tds: 150, ph: 7.2, tur: 2.5, dO: 7.8 };
    const result = calculateWQI(readings);
    expect(result).not.toBeNull();
    expect(result?.id).toBe('wqi');
    expect(result?.value).toBeGreaterThanOrEqual(0);
    expect(result?.value).toBeLessThanOrEqual(100);
  });

  it('should compute Biological Oxygen Demand (BOD) accurately', () => {
    const result = calculateBOD({ dO: 6.5, wT: 22, ph: 7.4 });
    expect(result).not.toBeNull();
    expect(result?.id).toBe('bod');
    expect(result?.unit).toBe('mg/L');
  });

  it('should compute all 10 virtual sensors when complete telemetry is passed', () => {
    const fullTelemetry = {
      pm25: 12,
      pm10: 25,
      co2: 450,
      voc: 110,
      tmp: 24,
      hum: 50,
      tds: 180,
      ph: 7.1,
      tur: 1.8,
      dO: 8.0,
      sm: 40,
      mq: 0.15,
      wT: 20,
    };
    const results = computeDynamicVirtualSensors(fullTelemetry);
    expect(results.length).toBe(10);
  });

  it('should downsample large telemetry datasets correctly', () => {
    const largeDataset = Array.from({ length: 200 }, (_, i) => ({ id: i, value: i * 2 }));
    const downsampled = downsampleTelemetryData(largeDataset, 50);
    expect(downsampled.length).toBeLessThanOrEqual(52);
    expect(downsampled[0]).toEqual(largeDataset[0]);
    expect(downsampled[downsampled.length - 1]).toEqual(largeDataset[largeDataset.length - 1]);
  });
});
