/**
 * PERN Sensor Pipeline v1.0
 *
 * Temporal smoothing (Exponential Moving Average) and outlier detection
 * (Modified Z-score via MAD) applied to every raw reading before it enters
 * the virtual-sensor computation layer.
 *
 * Design goals:
 * - Zero external dependencies — pure TypeScript.
 * - Stateful per sensor key — call `processReading()` for each MQTT message;
 *   the module tracks history internally.
 * - Non-destructive — returns both the smoothed value and a diagnostic flag
 *   so downstream code can choose to display or log the outlier status.
 */

// ── Config ──────────────────────────────────────────────────────────────────

/** Default EMA smoothing factor. Lower = more smoothing. */
const DEFAULT_EMA_ALPHA = 0.3;

/** Per-sensor alpha overrides — sensors with more noise get lower alpha. */
const SENSOR_ALPHA: Record<string, number> = {
  pm25: 0.25,
  mq: 0.2,
  voc: 0.2,
  co2: 0.35,
  ph: 0.4,
  tds: 0.3,
  dO: 0.35,
  tmp: 0.4,
  hum: 0.4,
  nh3: 0.2,
  wT: 0.35,
  tb: 0.3,
  sm: 0.3,
};

/** Valid physical ranges — values outside are clamped before smoothing. */
const SENSOR_RANGES: Record<string, [number, number]> = {
  ph: [0, 14],
  tds: [0, 5000],
  dO: [0, 20],
  tmp: [-40, 60],
  hum: [0, 100],
  co2: [300, 5000],
  pm25: [0, 500],
  mq: [0, 1],
  voc: [0, 1000],
  nh3: [0, 100],
  wT: [0, 100],
  tb: [0, 100],
  sm: [0, 100],
  light: [0, 200000],
};

/** Number of recent readings to keep for outlier detection. */
const HISTORY_WINDOW = 20;

/** Modified-Z-score threshold above which a reading is flagged as outlier. */
const OUTLIER_THRESHOLD = 3.5;

// ── Per-sensor state ────────────────────────────────────────────────────────

interface SensorState {
  /** Most recent EMA value. */
  ema: number | null;
  /** Ring buffer of recent raw values (capped at HISTORY_WINDOW). */
  history: number[];
}

const states = new Map<string, SensorState>();

function getState(key: string): SensorState {
  let s = states.get(key);
  if (!s) {
    s = { ema: null, history: [] };
    states.set(key, s);
  }
  return s;
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface PipelineResult {
  /** Smoothed (EMA) value. */
  value: number;
  /** Whether this reading was flagged as a statistical outlier. */
  isOutlier: boolean;
  /** Modified Z-score (for display / logging). */
  zScore: number;
}

/**
 * Feed a raw sensor reading through smoothing + outlier detection.
 *
 * @param key  Sensor key (e.g. "pm25", "ph").
 * @param raw  Raw numeric value from the device.
 * @returns    Smoothed value and diagnostic flags.
 */
export function processReading(key: string, raw: number): PipelineResult {
  const state = getState(key);
  const alpha = SENSOR_ALPHA[key] ?? DEFAULT_EMA_ALPHA;

  // ── Unit range clamping ──────────────────────────────────────────────
  let clamped = raw;
  const range = SENSOR_RANGES[key];
  if (range) {
    clamped = Math.max(range[0], Math.min(range[1], raw));
  }

  // ── Outlier detection (Modified Z-score via MAD) ──────────────────────
  let zScore = 0;
  let isOutlier = false;

  if (state.history.length >= 5) {
    const median = medianOf(state.history);
    const mad = medianAbsoluteDeviation(state.history, median);
    if (mad > 0) {
      zScore = 0.6745 * (clamped - median) / mad;
      isOutlier = Math.abs(zScore) > OUTLIER_THRESHOLD;
    }
  }

  // ── Temporal smoothing (EMA) — skip update for outliers ──────────────
  let value: number;
  if (isOutlier && state.ema !== null) {
    value = state.ema;
  } else {
    value = state.ema === null
      ? clamped
      : alpha * clamped + (1 - alpha) * state.ema;
    state.ema = value;
  }

  // ── Update history ring buffer ─────────────────────────────────────────
  state.history.push(clamped);
  if (state.history.length > HISTORY_WINDOW) {
    state.history.shift();
  }

  return {
    value: Math.round(value * 100) / 100,
    isOutlier,
    zScore: Math.round(zScore * 100) / 100,
  };
}

/**
 * Process a full batch of sensor readings (e.g. from one MQTT message).
 * Returns a map of smoothed values plus any outlier keys.
 */
export function processBatch(
  sensors: Record<string, number>
): {
  smoothed: Record<string, number>;
  outliers: string[];
} {
  const smoothed: Record<string, number> = {};
  const outliers: string[] = [];

  for (const [key, raw] of Object.entries(sensors)) {
    const result = processReading(key, raw);
    smoothed[key] = result.value;
    if (result.isOutlier) outliers.push(key);
  }

  return { smoothed, outliers };
}

/**
 * Reset all state (e.g. when switching devices or exiting Live Mode).
 */
export function resetPipeline(): void {
  states.clear();
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function medianOf(sorted: number[]): number {
  const s = [...sorted].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function medianAbsoluteDeviation(values: number[], median: number): number {
  const deviations = values.map(v => Math.abs(v - median));
  return medianOf(deviations);
}
