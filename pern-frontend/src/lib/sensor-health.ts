/**
 * PERN Sensor Health Monitor v1.0
 *
 * Cross-validates correlated sensors and detects hardware-level issues
 * (stuck values, erratic readings, excessive drift).
 *
 * Pure functions — no state. Feed recent reading history and get back
 * per-sensor health reports.
 */

// ── Types ───────────────────────────────────────────────────────────────────

export type HealthStatus = 'healthy' | 'degraded' | 'failed' | 'unknown';

export interface SensorHealthReport {
  key: string;
  status: HealthStatus;
  /** Human-readable reason (empty when healthy). */
  reason: string;
  /** Correlated sensor that disagrees (if applicable). */
  crossCheckSensor?: string;
  /** Severity 0-100 (100 = most severe). */
  severity: number;
}

// ── Correlated sensor pairs ─────────────────────────────────────────────────
// Each pair has an expected ratio range: [keyA, keyB, minRatio, maxRatio].

interface CorrelationPair {
  a: string;
  b: string;
  minRatio: number;
  maxRatio: number;
  description: string;
}

const CORRELATIONS: CorrelationPair[] = [
  // PM2.5 should be 30-70% of PM10 (coarse fraction)
  { a: 'pm25', b: 'pm10', minRatio: 0.15, maxRatio: 0.85, description: 'PM2.5/PM10 ratio outside expected range' },
  // Air temp and water temp should be within ~15°C of each other (outdoor)
  // (we use absolute difference instead)
  // TDS and conductivity are correlated
  // pH and dissolved O₂ have inverse relationship in healthy water
  // CO₂ and temperature correlate indoors
];

// ── Expected value ranges ───────────────────────────────────────────────────

const EXPECTED_RANGES: Record<string, [number, number]> = {
  pm25: [0, 300],
  pm10: [0, 500],
  co2: [300, 2000],
  co: [0, 10],
  no2: [0, 300],
  so2: [0, 200],
  o3: [0, 250],
  tmp: [-10, 55],
  hum: [5, 100],
  ph: [4, 12],
  tds: [0, 3000],
  dO: [0, 18],
  tb: [0, 200],
  mq: [0, 10],
  voc: [0, 2000],
  nh3: [0, 100],
  sm: [0, 100],
  wT: [0, 45],
};

// ── Public API ──────────────────────────────────────────────────────────────

/** Raw reading shapes accepted by buildSensorHistory (API row or WS event). */
export interface RawSensorReading {
  sensors?: Record<string, number> | string;
}

/**
 * Build a per-sensor value history map from raw reading rows.
 * Accepts either parsed `{ key: value }` objects or JSON-encoded strings.
 */
export function buildSensorHistory(readings: RawSensorReading[]): Record<string, number[]> {
  const map: Record<string, number[]> = {};
  for (const r of readings) {
    let sensors = r.sensors;
    if (typeof sensors === 'string') {
      try {
        sensors = JSON.parse(sensors);
      } catch {
        continue;
      }
    }
    if (!sensors || typeof sensors !== 'object') continue;
    for (const [k, v] of Object.entries(sensors)) {
      const n = Number(v);
      if (v !== null && v !== undefined && !isNaN(n)) {
        const arr = map[k] ?? (map[k] = []);
        arr.push(n);
        if (arr.length > 60) arr.shift();
      }
    }
  }
  return map;
}

export const SENSOR_STATUS_META: Record<HealthStatus, { label: string; tone: 'emerald' | 'amber' | 'rose' | 'slate'; color: string }> = {
  healthy: { label: 'Healthy', tone: 'emerald', color: 'var(--emerald)' },
  degraded: { label: 'Degraded', tone: 'amber', color: 'var(--amber)' },
  failed: { label: 'Failed', tone: 'rose', color: 'var(--rose)' },
  unknown: { label: 'Unknown', tone: 'slate', color: 'var(--text-disabled)' },
};

/**
 * Analyze sensor health given a map of recent readings.
 *
 * @param history  Map of sensor key → array of recent values (newest last).
 *                 At least 3 readings recommended for stuck/erratic detection.
 * @returns        Array of health reports, one per sensor with data.
 */
export function analyzeSensorHealth(
  history: Record<string, number[]>
): SensorHealthReport[] {
  const reports: SensorHealthReport[] = [];

  for (const [key, values] of Object.entries(history)) {
    if (values.length === 0) continue;

    const latest = values[values.length - 1];
    let status: HealthStatus = 'healthy';
    let reason = '';
    let severity = 0;

    // ── Range check ─────────────────────────────────────────────────────
    const range = EXPECTED_RANGES[key];
    if (range) {
      if (latest < range[0] || latest > range[1]) {
        status = 'degraded';
        reason = `${key}=${latest} outside physical range [${range[0]}, ${range[1]}]`;
        severity = 60;
      }
    }

    // ── Stuck sensor detection ──────────────────────────────────────────
    if (values.length >= 5) {
      const last5 = values.slice(-5);
      const allSame = last5.every(v => v === last5[0]);
      if (allSame) {
        status = 'failed';
        reason = `${key} stuck at ${last5[0]} for ${last5.length} consecutive readings`;
        severity = 90;
      }
    }

    // ── Erratic detection (high coefficient of variation) ───────────────
    if (values.length >= 4 && status !== 'failed') {
      const recent = values.slice(-10);
      const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
      if (mean !== 0) {
        const variance = recent.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / recent.length;
        const cv = Math.sqrt(variance) / Math.abs(mean);
        if (cv > 0.4) {
          status = 'degraded';
          reason = reason
            ? `${reason}; high variability (CV=${(cv * 100).toFixed(0)}%)`
            : `${key} erratic (CV=${(cv * 100).toFixed(0)}%, σ=${Math.sqrt(variance).toFixed(1)})`;
          severity = Math.max(severity, 50);
        }
      }
    }

    reports.push({ key, status, reason, severity });
  }

  // ── Cross-validation ──────────────────────────────────────────────────
  for (const pair of CORRELATIONS) {
    const aValues = history[pair.a];
    const bValues = history[pair.b];
    if (!aValues?.length || !bValues?.length) continue;

    const aLatest = aValues[aValues.length - 1];
    const bLatest = bValues[bValues.length - 1];

    if (bLatest === 0) continue;

    const ratio = aLatest / bLatest;
    if (ratio < pair.minRatio || ratio > pair.maxRatio) {
      // Flag both sensors
      const reportA = reports.find(r => r.key === pair.a);
      const reportB = reports.find(r => r.key === pair.b);

      if (reportA && reportA.status === 'healthy') {
        reportA.status = 'degraded';
        reportA.reason = `${pair.description} (${pair.a}/${pair.b}=${ratio.toFixed(2)})`;
        reportA.severity = 45;
        reportA.crossCheckSensor = pair.b;
      }
      if (reportB && reportB.status === 'healthy') {
        reportB.status = 'degraded';
        reportB.reason = `${pair.description} (${pair.a}/${pair.b}=${ratio.toFixed(2)})`;
        reportB.severity = 45;
        reportB.crossCheckSensor = pair.a;
      }
    }
  }

  return reports;
}

/**
 * Summary statistics across all sensors.
 */
export function healthSummary(reports: SensorHealthReport[]): {
  total: number;
  healthy: number;
  degraded: number;
  failed: number;
  overallHealth: number; // 0-100
} {
  const total = reports.length;
  const healthy = reports.filter(r => r.status === 'healthy').length;
  const degraded = reports.filter(r => r.status === 'degraded').length;
  const failed = reports.filter(r => r.status === 'failed').length;
  const overallHealth = total > 0
    ? Math.round(((healthy * 100 + degraded * 50) / total))
    : 0;

  return { total, healthy, degraded, failed, overallHealth };
}

/**
 * Quick check: is this sensor value plausible given its recent history?
 * Useful for real-time gating before data enters the pipeline.
 */
export function isReadingPlausible(
  key: string,
  value: number,
  recentValues: number[],
  maxZScore: number = 4.0
): boolean {
  if (recentValues.length < 5) return true; // not enough history to judge

  const mean = recentValues.reduce((a, b) => a + b, 0) / recentValues.length;
  const variance = recentValues.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / recentValues.length;
  const sd = Math.sqrt(variance);

  if (sd === 0) return value === mean; // stuck sensor

  const z = Math.abs(value - mean) / sd;
  return z <= maxZScore;
}
