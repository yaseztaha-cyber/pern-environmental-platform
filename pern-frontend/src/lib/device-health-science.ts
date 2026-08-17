/**
 * PERN Device Health — Scientific Mechanics & Metrology
 *
 * Pure, cited mathematics behind the device-health dashboard:
 *
 *   1. Trend analysis   — ordinary least squares (Gauss 1809), R² goodness of
 *                         fit (Moriasi et al. 2007), robust Theil–Sen slope
 *                         (Theil 1950; Sen 1968), EWMA smoothing (Roberts 1959).
 *   2. Prognostics      — linear degradation model + remaining useful life,
 *                         consistent with ISO 13381-1:2015 prognostics and the
 *                         condition-based maintenance review of Jardine et al. 2006.
 *   3. Signal model     — log-distance path loss (Friis 1946; ITU-R P.1238-11)
 *                         to translate RSSI into an estimated device distance.
 *   4. Metrology        — combined/expanded uncertainty after the GUM
 *                         (JCGM 100:2008) and VIM 3 (JCGM 200:2012).
 *
 * All functions are pure and unit-testable. Reference ids resolve through the
 * central citation database in ./ai-references.ts.
 */

import {
  referencesForDomain,
  referencesForSensor,
  type SourceReference,
} from './ai-references';

/* ════════════════════════════════════════════════════════════════════ */
/*  1. Trend analysis — OLS, R², Theil–Sen, EWMA                         */
/* ════════════════════════════════════════════════════════════════════ */

export interface LeastSquaresFit {
  slope: number;
  intercept: number;
  r2: number;
  n: number;
}

/**
 * Ordinary least-squares regression over (x, y) points with R² coefficient
 * of determination. Slope is per unit x. R² follows the model-evaluation
 * conventions of Moriasi et al. (2007).
 */
export function leastSquares(xs: number[], ys: number[]): LeastSquaresFit {
  const n = Math.min(xs.length, ys.length);
  if (n === 0) return { slope: 0, intercept: 0, r2: 0, n: 0 };
  const xMean = xs.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const yMean = ys.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - xMean;
    num += dx * (ys[i] - yMean);
    den += dx * dx;
  }
  const slope = den > 0 ? num / den : 0;
  const intercept = yMean - slope * xMean;
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) {
    ssRes += (ys[i] - (slope * xs[i] + intercept)) ** 2;
    ssTot += (ys[i] - yMean) ** 2;
  }
  const r2 = ssTot > 0 ? Math.max(0, Math.min(1, 1 - ssRes / ssTot)) : 1;
  return { slope, intercept, r2, n };
}

/**
 * Linear regression over evenly-spaced samples (index → value), used for
 * health-score and heap trends where samples are equally time-spaced.
 */
export function linearRegression(values: number[]): LeastSquaresFit {
  const xs = values.map((_, i) => i);
  return leastSquares(xs, values);
}

/**
 * Theil–Sen robust slope estimator (Theil 1950; Sen 1968): the median of all
 * pairwise slopes. Resistant to outliers that would pull OLS off course.
 */
export function theilSenSlope(values: number[]): number {
  const slopes: number[] = [];
  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      slopes.push((values[j] - values[i]) / (j - i));
    }
  }
  if (slopes.length === 0) return 0;
  const sorted = [...slopes].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Exponentially-weighted moving average (Roberts 1959; Montgomery 2009).
 * alpha ∈ (0, 1]; higher alpha reacts faster, lower alpha smooths more.
 */
export function ewma(values: number[], alpha = 0.3): number[] {
  if (values.length === 0) return [];
  const out: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    out.push(alpha * values[i] + (1 - alpha) * out[i - 1]);
  }
  return out;
}

/* ════════════════════════════════════════════════════════════════════ */
/*  2. Confidence scoring for trend & RUL estimates                      */
/* ════════════════════════════════════════════════════════════════════ */

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface ConfidenceVerdict {
  level: ConfidenceLevel;
  score: number;      // 0-100
  basis: string;      // human-readable justification
}

/**
 * Qualitative confidence in a linear trend, driven by the fit R² and the
 * number of samples. Threshold bands follow model-evaluation practice
 * (Moriasi et al. 2007): R² ≥ 0.80 strong, 0.50–0.80 moderate, < 0.50 weak.
 */
export function trendConfidence(r2: number, samples: number): ConfidenceVerdict {
  const r2c = Math.max(0, Math.min(1, r2));
  if (samples < 3) return { level: 'low', score: 5, basis: 'Fewer than 3 samples — insufficient for a trend fit.' };
  let score: number;
  if (r2c >= 0.8 && samples >= 8) score = 90;
  else if (r2c >= 0.8) score = 80;
  else if (r2c >= 0.5 && samples >= 6) score = 65;
  else if (r2c >= 0.5) score = 55;
  else if (r2c >= 0.2) score = 35;
  else score = 15;
  const level: ConfidenceLevel = score >= 75 ? 'high' : score >= 45 ? 'medium' : 'low';
  return {
    level,
    score,
    basis: `Fit R² = ${r2c.toFixed(2)} over ${samples} samples.`,
  };
}

/**
 * Confidence in a remaining-useful-life estimate. RUL is an extrapolation
 * beyond the observed window, so confidence additionally depends on the
 * observation span (ISO 13381-1:2015 recommends documenting data sufficiency
 * for any prognostics claim).
 */
export function rulConfidence(r2: number, samples: number, spanHours: number): ConfidenceVerdict {
  const base = trendConfidence(r2, samples).score;
  const span = Math.max(0, spanHours);
  let score = base;
  if (span >= 24) score = Math.min(100, score + 10);
  else if (span >= 4) score = Math.min(100, score + 5);
  else if (span < 2) score = Math.max(5, score - 20);
  const level: ConfidenceLevel = score >= 75 ? 'high' : score >= 45 ? 'medium' : 'low';
  return {
    level,
    score,
    basis: `Degradation fitted over ${samples} samples spanning ${spanHours.toFixed(1)}h (R²=${r2.toFixed(2)}).`,
  };
}

/* ════════════════════════════════════════════════════════════════════ */
/*  3. Signal model — RSSI → distance (log-distance path loss)           */
/* ════════════════════════════════════════════════════════════════════ */

export interface PathLossModel {
  refDistanceMeters: number; // reference distance d₀
  refRssiDb: number;         // expected RSSI at d₀ (noise floor dependent)
  pathLossExponent: number;  // n (2.0 free space, 2–4 indoor per ITU-R P.1238)
}

export const PATH_LOSS_MODEL: PathLossModel = {
  refDistanceMeters: 1,
  refRssiDb: -45,
  pathLossExponent: 2.0,
};

/**
 * Estimated distance (m) from RSSI using the standard log-distance path-loss
 * model:  d = d₀ · 10^((P₀ − RSSI) / (10·n))
 * (Friis 1946; ITU-R P.1238-11). Clamped to a minimum of d₀/2.
 */
export function rssiToDistance(rssi: number | null, model: PathLossModel = PATH_LOSS_MODEL): number | null {
  if (rssi === null) return null;
  const loss = model.refRssiDb - rssi;
  if (loss < 0) return model.refDistanceMeters / 2;
  const meters = model.refDistanceMeters * Math.pow(10, loss / (10 * model.pathLossExponent));
  return Math.max(model.refDistanceMeters / 2, meters);
}

/**
 * Documented RSSI quality bands mapped from the 60 dBm usable window
 * (getRssiQuality maps −90…−30 dBm → 0…100, per IEEE 802.11 signal-strength
 * reporting practice).
 */
export const RSSI_BANDS: Array<{ min: number; max: number; label: string }> = [
  { min: -30, max: Infinity, label: 'Excellent' },
  { min: -60, max: -30, label: 'Good' },
  { min: -70, max: -60, label: 'Fair' },
  { min: -80, max: -70, label: 'Weak' },
  { min: -Infinity, max: -80, label: 'Very weak' },
];

export function rssiBandLabel(rssi: number | null): string {
  if (rssi === null) return 'Unknown';
  return RSSI_BANDS.find(b => rssi >= b.min && rssi < b.max)?.label ?? 'Very weak';
}

/* ════════════════════════════════════════════════════════════════════ */
/*  4. Metrology — measurement uncertainty (GUM, JCGM 100:2008)          */
/* ════════════════════════════════════════════════════════════════════ */

export interface UncertaintyResult {
  standardUncertainty: number;
  expandedUncertainty: number;
  expandedPercent: number;
  interval: [number, number];
  coverage: number; // k-factor used
}

/**
 * Type-B standard uncertainty for a reading with a declared relative accuracy
 * (percent of reading). Assumes a rectangular (uniform) distribution over
 * ±accuracy, so u = value·pct/100 / √3. Expanded uncertainty applies a
 * coverage factor k (k = 2 → ≈95% confidence, GUM clause 6.2).
 */
export function measurementUncertainty(
  value: number,
  accuracyPct: number,
  k = 2,
): UncertaintyResult {
  const absError = Math.abs(value) * (accuracyPct / 100);
  const standard = absError / Math.sqrt(3);
  const expanded = standard * k;
  const expandedPercent = (expanded / (Math.abs(value) || 1)) * 100;
  return {
    standardUncertainty: standard,
    expandedUncertainty: expanded,
    expandedPercent,
    interval: [value - expanded, value + expanded],
    coverage: k,
  };
}

/* ════════════════════════════════════════════════════════════════════ */
/*  5. Health model metadata + curated source lookups                    */
/* ════════════════════════════════════════════════════════════════════ */

export const HEALTH_WEIGHTS = [
  { key: 'rssi', label: 'Signal', weight: 0.40, note: 'Connectivity dominates — a lost link means no data at all (IEEE 802.11; ITU-R P.1238).' },
  { key: 'heap', label: 'Memory', weight: 0.35, note: 'Free heap constrains firmware stability; leak risk grows as heap shrinks (ESP32 TRM; ESP-IDF heap docs).' },
  { key: 'uptime', label: 'Uptime', weight: 0.25, note: 'Sustained uptime indicates a stable, non-resetting node (ISO 17359 condition monitoring).' },
] as const;

export const HEALTH_BANDS = [
  { min: 90, label: 'Excellent', color: '#34d399' },
  { min: 75, label: 'Good', color: '#2dd4bf' },
  { min: 60, label: 'Fair', color: '#fbbf24' },
  { min: 40, label: 'Poor', color: '#fb923c' },
  { min: 0, label: 'Critical', color: '#fb7185' },
] as const;

/** Curated sources for the composite health-score model. */
export function healthModelRefs(): SourceReference[] {
  return [
    ...referencesForDomain('device-health'),
    ...referencesForSensor('rssi'),
    ...referencesForSensor('heap'),
  ];
}

/** Curated sources for the RSSI / signal-strength model. */
export function signalModelRefs(): SourceReference[] {
  return referencesForDomain('network');
}

/** Curated sources for memory-health & leak detection. */
export function memoryModelRefs(): SourceReference[] {
  return referencesForSensor('heap');
}

/** Curated sources for trend statistics. */
export function trendModelRefs(): SourceReference[] {
  return referencesForDomain('trend');
}

/** Curated sources for prognostics / RUL. */
export function rulModelRefs(): SourceReference[] {
  return referencesForDomain('prognostics');
}

/** Curated sources for measurement uncertainty & metrology. */
export function uncertaintyRefs(): SourceReference[] {
  return referencesForDomain('metrology');
}
