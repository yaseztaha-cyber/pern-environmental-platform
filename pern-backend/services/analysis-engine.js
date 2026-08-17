/**
 * PERN Deterministic Analysis Engine
 * Stateless statistical core powering every backend AI analysis.
 * Produces the evidence (threshold status, series statistics, trend fit,
 * z-score anomalies, risk levels, health scores) that the LLM layers
 * narrative and citations on top of. Works with or without the LLM.
 */

// Default environmental thresholds (warn/crit). Mirrors the frontend's
// threshold table so backend assessments stay consistent with the UI.
const SENSOR_THRESHOLDS = {
  pm25: { warn: 35, crit: 55, unit: 'µg/m³', label: 'PM2.5', lowerIsBad: false },
  pm10: { warn: 45, crit: 100, unit: 'µg/m³', label: 'PM10', lowerIsBad: false },
  co2: { warn: 1000, crit: 2000, unit: 'ppm', label: 'CO₂', lowerIsBad: false },
  co: { warn: 9, crit: 25, unit: 'ppm', label: 'CO', lowerIsBad: false },
  no2: { warn: 53, crit: 100, unit: 'ppb', label: 'NO₂', lowerIsBad: false },
  o3: { warn: 70, crit: 85, unit: 'ppb', label: 'O₃', lowerIsBad: false },
  so2: { warn: 75, crit: 185, unit: 'ppb', label: 'SO₂', lowerIsBad: false },
  tmp: { warn: 32, crit: 38, unit: '°C', label: 'Temperature', lowerIsBad: false },
  hum: { warn: 75, crit: 90, unit: '%', label: 'Humidity', lowerIsBad: false },
  ph: { warn: 6.5, crit: 5.5, unit: '', label: 'pH', lowerIsBad: false, rangeCheck: true, warnHigh: 8.5, critHigh: 9.5 },
  dO: { warn: 6, crit: 4, unit: 'mg/L', label: 'Dissolved O₂', lowerIsBad: true },
  tds: { warn: 500, crit: 1000, unit: 'ppm', label: 'TDS', lowerIsBad: false },
  mq: { warn: 0.5, crit: 0.8, unit: '', label: 'Gas Sensor (MQ)', lowerIsBad: false },
  voc: { warn: 500, crit: 800, unit: 'ppb', label: 'VOC', lowerIsBad: false },
  nh3: { warn: 25, crit: 50, unit: 'ppm', label: 'Ammonia', lowerIsBad: false },
  sm: { warn: 70, crit: 90, unit: '%', label: 'Soil Moisture', lowerIsBad: false },
  light: { warn: 100000, crit: 150000, unit: 'lux', label: 'Light', lowerIsBad: false },
  tb: { warn: 25, crit: 50, unit: 'NTU', label: 'Turbidity', lowerIsBad: false },
  wT: { warn: 28, crit: 35, unit: '°C', label: 'Water Temp', lowerIsBad: false },
};

function round(n, digits = 2) {
  return Math.round(n * 10 ** digits) / 10 ** digits;
}

function isNumeric(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Assess a single sensor value against thresholds.
 * @returns {null | { sensor, status, value, threshold, deviationPct, unit, label, detail }}
 */
function assessSensorStatus(sensor, value, thresholds = SENSOR_THRESHOLDS) {
  if (!isNumeric(value)) return null;
  const t = thresholds[sensor] || thresholds[String(sensor).toLowerCase()];
  if (!t) return null;

  let status = 'normal';
  let deviationPct = 0;

  if (t.rangeCheck) {
    if (value <= t.crit || value >= t.critHigh) status = 'critical';
    else if (value < t.warn || value > t.warnHigh) status = 'warning';
    const nearest = value < 7 ? t.warn : t.warnHigh;
    deviationPct = round(((Math.abs(value - nearest)) / nearest) * 100);
  } else if (t.lowerIsBad) {
    if (value < t.crit) status = 'critical';
    else if (value < t.warn) status = 'warning';
    deviationPct = t.warn > 0 ? round(((t.warn - value) / t.warn) * 100) : 0;
  } else {
    if (value > t.crit) status = 'critical';
    else if (value > t.warn) status = 'warning';
    deviationPct = t.warn > 0 ? round(((value - t.warn) / t.warn) * 100) : 0;
  }

  const level = status === 'critical' ? 'critical' : status === 'warning' ? 'warning' : 'normal';
  return {
    sensor,
    status,
    level,
    value: round(value, 3),
    threshold: { warn: t.warn, crit: t.crit },
    deviationPct,
    unit: t.unit,
    label: t.label,
    detail: level === 'normal'
      ? `${t.label} within acceptable range (${value}${t.unit})`
      : `${t.label} at ${value}${t.unit} — ${level === 'critical' ? 'critical level' : 'above recommended threshold'} (warn ${t.warn}${t.unit})`,
  };
}

/** Series statistics: central tendency, spread, direction, extremes. */
function computeSeriesStats(values) {
  const v = (values || []).filter(isNumeric);
  if (v.length === 0) return null;
  const sum = v.reduce((a, b) => a + b, 0);
  const avg = sum / v.length;
  const min = Math.min(...v);
  const max = Math.max(...v);
  const variance = v.reduce((s, x) => s + (x - avg) ** 2, 0) / v.length;
  const stdDev = Math.sqrt(variance);
  const cv = avg !== 0 ? (stdDev / Math.abs(avg)) * 100 : 0;
  const first = v[0];
  const latest = v[v.length - 1];
  const half = Math.max(1, Math.floor(v.length / 2));
  const firstAvg = v.slice(0, half).reduce((a, b) => a + b, 0) / half;
  const secondAvg = v.slice(half).reduce((a, b) => a + b, 0) / (v.length - half);
  const delta = latest - first;
  const direction = secondAvg > firstAvg * 1.05 ? 'increasing'
    : secondAvg < firstAvg * 0.95 ? 'decreasing' : 'stable';

  return {
    count: v.length,
    avg: round(avg, 2),
    min: round(min, 2),
    max: round(max, 2),
    stdDev: round(stdDev, 2),
    cv: round(cv, 1),
    first: round(first, 2),
    latest: round(latest, 2),
    delta: round(delta, 2),
    direction,
    volatility: cv > 30 ? 'high' : cv > 15 ? 'moderate' : 'low',
  };
}

/** Ordinary least squares linear fit over index positions. */
function linearTrend(values) {
  const v = (values || []).filter(isNumeric);
  if (v.length < 3) return null;
  const n = v.length;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) {
    sx += i; sy += v[i]; sxy += i * v[i]; sxx += i * i;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  const ssTot = v.reduce((s, x) => s + (x - (sy / n)) ** 2, 0);
  const ssRes = v.reduce((s, x, i) => s + (x - (slope * i + intercept)) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;
  return {
    slope: round(slope, 4),
    intercept: round(intercept, 2),
    r2: round(Math.max(0, Math.min(1, r2)), 3),
    direction: slope > 0 ? 'rising' : slope < 0 ? 'falling' : 'stable',
  };
}

/** Stateless z-score anomaly check against a reference window. */
function zScoreAnomaly(value, windowValues) {
  const v = (windowValues || []).filter(isNumeric);
  if (!isNumeric(value) || v.length < 10) return null;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const stdDev = Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / v.length);
  if (stdDev === 0) return null;
  const z = Math.abs((value - mean) / stdDev);
  return {
    zScore: round(z, 2),
    mean: round(mean, 2),
    stdDev: round(stdDev, 2),
    isAnomaly: z > 3,
  };
}

/** Derive an overall risk level from the worst status and trend pressure. */
function deriveRiskLevel({ worstStatus = 'normal', trendDirection = 'stable', volatility = 'low' }) {
  const rank = { normal: 0, warning: 1, critical: 2 };
  let level = rank[worstStatus] === 2 ? 'critical' : rank[worstStatus] === 1 ? 'high' : 'low';
  if (level === 'high' && trendDirection === 'increasing') level = 'critical';
  if (level === 'low' && (trendDirection === 'increasing' || volatility === 'high')) level = 'medium';
  return level;
}

/** Composite 0–100 health score from per-sensor assessments. */
function computeHealthScore(assessments) {
  if (!Array.isArray(assessments) || assessments.length === 0) return null;
  let score = 100;
  let weighted = 0;
  for (const a of assessments) {
    if (!a) continue;
    weighted += a.level === 'critical' ? 35 : a.level === 'warning' ? 15 : 0;
  }
  score = Math.round(score - weighted);
  return Math.max(0, Math.min(100, score));
}

/** Build per-sensor time series from DB rows ({ sensors: {...}, recorded_at }). */
function buildReadingMatrix(rows) {
  const series = {};
  for (const row of (rows || [])) {
    const sensors = row.sensors || row.readings || {};
    for (const [key, value] of Object.entries(sensors)) {
      if (!isNumeric(value)) continue;
      if (!series[key]) series[key] = [];
      series[key].push({ value, time: row.recorded_at || row.created_at || null });
    }
  }
  const result = {};
  for (const [key, pts] of Object.entries(series)) {
    result[key] = pts.map(p => p.value);
  }
  return result;
}

/** Flatten the latest non-null reading per sensor across the most recent rows. */
function latestReadings(rows) {
  const result = {};
  for (let i = (rows || []).length - 1; i >= 0; i--) {
    const sensors = rows[i].sensors || rows[i].readings || {};
    for (const [key, value] of Object.entries(sensors)) {
      if (isNumeric(value) && result[key] === undefined) result[key] = value;
    }
  }
  return result;
}

module.exports = {
  SENSOR_THRESHOLDS,
  assessSensorStatus,
  computeSeriesStats,
  linearTrend,
  zScoreAnomaly,
  deriveRiskLevel,
  computeHealthScore,
  buildReadingMatrix,
  latestReadings,
  round,
};
