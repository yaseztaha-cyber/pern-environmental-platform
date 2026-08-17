import { describe, it, expect } from 'vitest';
import {
  leastSquares,
  linearRegression,
  theilSenSlope,
  ewma,
  trendConfidence,
  rulConfidence,
  rssiToDistance,
  rssiBandLabel,
  measurementUncertainty,
  RSSI_BANDS,
  HEALTH_WEIGHTS,
  HEALTH_BANDS,
  healthModelRefs,
  signalModelRefs,
  memoryModelRefs,
  trendModelRefs,
  rulModelRefs,
  uncertaintyRefs,
  PATH_LOSS_MODEL,
} from './device-health-science';
import { getReference } from './ai-references';

describe('regression mechanics (device-health-science)', () => {
  it('returns R² = 1 and the true slope for perfectly linear data', () => {
    const ys = [10, 20, 30, 40, 50];
    const fit = linearRegression(ys);
    expect(fit.slope).toBeCloseTo(10, 6);
    expect(fit.r2).toBeCloseTo(1, 6);
    expect(fit.n).toBe(5);
  });

  it('returns a zero slope for a flat series', () => {
    const fit = linearRegression([7, 7, 7, 7]);
    expect(fit.slope).toBe(0);
    expect(fit.r2).toBeCloseTo(1, 6); // no residual variance → perfect fit
  });

  it('handles general (x, y) point clouds', () => {
    const fit = leastSquares([0, 1, 2, 3], [2, 4, 6, 8]);
    expect(fit.slope).toBeCloseTo(2, 6);
    expect(fit.intercept).toBeCloseTo(2, 6);
  });

  it('Theil–Sen slope equals OLS slope on clean monotonic data', () => {
    const values = [0, 5, 10, 15, 20];
    expect(theilSenSlope(values)).toBeCloseTo(5, 6);
  });

  it('Theil–Sen is more robust than OLS to a single outlier', () => {
    const clean = [0, 1, 2, 3, 4];
    const dirty = [0, 1, 2, 3, 40]; // one gross outlier at the end
    const olsClean = linearRegression(clean).slope;
    const olsDirty = linearRegression(dirty).slope;
    const senClean = theilSenSlope(clean);
    const senDirty = theilSenSlope(dirty);
    expect(senClean).toBeCloseTo(1, 6);
    expect(Math.abs(senDirty - senClean)).toBeLessThan(Math.abs(olsDirty - olsClean));
  });

  it('EWMA preserves length, anchors on the first sample and flattens noise', () => {
    const flat = ewma([5, 5, 5, 5]);
    expect(flat).toEqual([5, 5, 5, 5]);
    const noisy = [0, 10, 0, 10, 0];
    const smooth = ewma(noisy, 0.3);
    expect(smooth.length).toBe(noisy.length);
    expect(smooth[0]).toBe(noisy[0]);
    expect(smooth[1]).toBeCloseTo(0.3 * 10, 6);
  });
});

describe('confidence scoring (device-health-science)', () => {
  it('returns low confidence when too few samples exist', () => {
    expect(trendConfidence(0.9, 2).level).toBe('low');
  });

  it('returns high confidence for a strong fit with enough samples', () => {
    const v = trendConfidence(0.92, 12);
    expect(v.level).toBe('high');
    expect(v.score).toBe(90);
    expect(v.basis).toContain('R²');
  });

  it('degrades to low confidence for a weak fit', () => {
    const v = trendConfidence(0.1, 10);
    expect(v.level).toBe('low');
  });

  it('RUL confidence rewards a longer observation span', () => {
    const short = rulConfidence(0.85, 10, 0.5).score;
    const long = rulConfidence(0.85, 10, 48).score;
    expect(long).toBeGreaterThan(short);
  });

  it('RUL confidence stays bounded to 0-100', () => {
    expect(rulConfidence(0.99, 50, 500).score).toBeLessThanOrEqual(100);
  });
});

describe('signal model & metrology (device-health-science)', () => {
  it('maps null RSSI to null distance', () => {
    expect(rssiToDistance(null)).toBeNull();
  });

  it('returns the reference distance when RSSI equals the reference level', () => {
    expect(rssiToDistance(PATH_LOSS_MODEL.refRssiDb)).toBeCloseTo(PATH_LOSS_MODEL.refDistanceMeters, 6);
  });

  it('stronger signal ⇒ shorter estimated distance', () => {
    const near = rssiToDistance(-50)!;
    const far = rssiToDistance(-80)!;
    expect(near).toBeLessThan(far);
  });

  it('higher path-loss exponent ⇒ shorter distance for a given RSSI loss', () => {
    const low = rssiToDistance(-75, { ...PATH_LOSS_MODEL, pathLossExponent: 2.0 })!;
    const high = rssiToDistance(-75, { ...PATH_LOSS_MODEL, pathLossExponent: 3.5 })!;
    expect(high).toBeLessThan(low);
  });

  it('labels RSSI bands correctly', () => {
    expect(rssiBandLabel(-30)).toBe('Excellent');
    expect(rssiBandLabel(-40)).toBe('Good');
    expect(rssiBandLabel(-65)).toBe('Fair');
    expect(rssiBandLabel(-75)).toBe('Weak');
    expect(rssiBandLabel(-95)).toBe('Very weak');
    expect(rssiBandLabel(null)).toBe('Unknown');
  });

  it('computes GUM type-B uncertainty with rectangular distribution', () => {
    const u = measurementUncertainty(100, 10, 2);
    expect(u.standardUncertainty).toBeCloseTo(100 * 0.1 / Math.sqrt(3), 6);
    expect(u.expandedUncertainty).toBeCloseTo(2 * u.standardUncertainty, 6);
    expect(u.interval[0]).toBeCloseTo(100 - u.expandedUncertainty, 6);
    expect(u.interval[1]).toBeCloseTo(100 + u.expandedUncertainty, 6);
    expect(u.coverage).toBe(2);
  });
});

describe('model metadata & reference traceability (device-health-science)', () => {
  it('weights sum to 1 and label the three subsystems', () => {
    const total = HEALTH_WEIGHTS.reduce((s, w) => s + w.weight, 0);
    expect(total).toBeCloseTo(1, 6);
    expect(HEALTH_WEIGHTS.map(w => w.key)).toEqual(['rssi', 'heap', 'uptime']);
  });

  it('health bands are sorted high-to-low and cover the full range', () => {
    expect(HEALTH_BANDS[0].label).toBe('Excellent');
    expect(HEALTH_BANDS[HEALTH_BANDS.length - 1].label).toBe('Critical');
    for (let i = 0; i < HEALTH_BANDS.length - 1; i++) {
      expect(HEALTH_BANDS[i].min).toBeGreaterThan(HEALTH_BANDS[i + 1].min);
    }
  });

  it('RSSI bands are non-overlapping and partition the range', () => {
    expect(RSSI_BANDS.length).toBe(5);
    for (const b of RSSI_BANDS) expect(b.min).toBeLessThan(b.max);
  });

  it('every curated reference resolves to a real entry in the citation database', () => {
    const all = [
      ...healthModelRefs(),
      ...signalModelRefs(),
      ...memoryModelRefs(),
      ...trendModelRefs(),
      ...rulModelRefs(),
      ...uncertaintyRefs(),
    ];
    expect(all.length).toBeGreaterThan(0);
    for (const r of all) {
      expect(getReference(r.id)).toBeDefined();
      expect(r.title.length).toBeGreaterThan(0);
    }
  });

  it('the signal model exposes the IEEE 802.11 and Friis citations', () => {
    const ids = signalModelRefs().map(r => r.id);
    expect(ids).toContain('friis-1946');
    expect(ids).toContain('itu-p1238');
    expect(ids).toContain('ieee-80211');
  });

  it('the prognostics domain includes ISO 13381-1 and the Jardine review', () => {
    const ids = rulModelRefs().map(r => r.id);
    expect(ids).toContain('iso-13381');
    expect(ids).toContain('jardine-2006');
  });
});
