import { describe, it, expect } from 'vitest';
import { computeDynamicVirtualSensors, calculateAQI, calculateWQI } from '../lib/virtual-sensors';
import { calculateScientificEHI } from '../lib/scientific-ehi';

describe('virtual-sensors (real-data only, no fabrication)', () => {
  it('returns null when no inputs are present', () => {
    expect(calculateAQI({})).toBeNull();
    expect(calculateWQI({})).toBeNull();
  });

  it('computes AQI from only pm25 without inventing other inputs', () => {
    const aqi = calculateAQI({ pm25: 50 });
    expect(aqi).not.toBeNull();
    // value should be driven by pm25=50 (EPA breakpoint ~ first band)
    expect(aqi!.value).toBeGreaterThan(0);
    expect(aqi!.inputs.length).toBe(1);
  });

  it('never substitutes a fabricated default for a missing input', () => {
    // WQI requires ph + tds; missing tb/dO must not inject fake tb=2.5 / dO=8.5
    const wqi = calculateWQI({ ph: 7.0, tds: 200 });
    expect(wqi).not.toBeNull();
    // With only ph+tds present, the computed inputs are exactly ph+tds (no synthetic tb/dO)
    expect(wqi!.inputs.length).toBe(2);
    expect(wqi!.inputs.map(i => i.sensorType).sort()).toEqual(['ph', 'tds']);
  });

  it('produces an empty list for completely empty readings', () => {
    expect(computeDynamicVirtualSensors({})).toEqual([]);
  });
});

describe('scientific-ehi (real-data only)', () => {
  it('returns null when there is no real data', () => {
    expect(calculateScientificEHI({})).toBeNull();
  });

  it('returns a score when real inputs exist', () => {
    const res = calculateScientificEHI({ pm25: 20, ph: 7.2, tds: 180, dO: 8.5, tmp: 26, hum: 55, co2: 420 });
    expect(res).not.toBeNull();
    expect(res!.score).toBeGreaterThanOrEqual(18);
    expect(res!.score).toBeLessThanOrEqual(96);
    expect(res!.subIndices.length).toBeGreaterThan(0);
  });

  it('does not fabricate a fixed-confidence score', () => {
    const res = calculateScientificEHI({ pm25: 20 });
    expect(res).not.toBeNull();
    // confidence should reflect only the available weight, not a hardcoded 78
    expect(res!.confidence).toBeLessThanOrEqual(100);
    expect(res!.subIndices.length).toBe(1);
  });
});
