import type { ScientificAnalysis } from './scientific-core';
import { referencesForSensor, referencesForDomain, type SourceReference } from './ai-references';

export type InsightSeverity = 'info' | 'warning' | 'critical';
export type InsightCategory = 'anomaly' | 'trend' | 'degradation' | 'improvement' | 'threshold' | 'recommendation';

export interface AnalysisInsight {
  id: string;
  type: InsightCategory;
  severity: InsightSeverity;
  title: string;
  message: string;
  category: string;
  sensor?: string;
  value?: number;
  threshold?: number;
  previousValue?: number;
  references?: SourceReference[];
  timestamp: number;
}

export const SENSOR_THRESHOLDS: Record<string, { warn: number; crit: number; label: string; unit: string }> = {
  pm25: { warn: 35, crit: 55, label: 'PM2.5', unit: 'µg/m³' },
  pm10: { warn: 45, crit: 100, label: 'PM10', unit: 'µg/m³' },
  co2: { warn: 1000, crit: 2000, label: 'CO₂', unit: 'ppm' },
  co: { warn: 9, crit: 25, label: 'CO', unit: 'ppm' },
  no2: { warn: 53, crit: 100, label: 'NO₂', unit: 'ppb' },
  o3: { warn: 70, crit: 85, label: 'O₃', unit: 'ppb' },
  so2: { warn: 75, crit: 185, label: 'SO₂', unit: 'ppb' },
  tmp: { warn: 32, crit: 38, label: 'Temperature', unit: '°C' },
  hum: { warn: 75, crit: 90, label: 'Humidity', unit: '%' },
  ph: { warn: 6.5, crit: 5.5, label: 'pH', unit: '' },
  dO: { warn: 6, crit: 4, label: 'Dissolved O₂', unit: 'mg/L' },
  tds: { warn: 500, crit: 1000, label: 'TDS', unit: 'ppm' },
  mq: { warn: 0.5, crit: 0.8, label: 'Gas Sensor (MQ)', unit: '' },
  voc: { warn: 500, crit: 800, label: 'VOC', unit: 'ppb' },
  nh3: { warn: 25, crit: 50, label: 'Ammonia', unit: 'ppm' },
  sm: { warn: 70, crit: 90, label: 'Soil Moisture', unit: '%' },
  light: { warn: 100000, crit: 150000, label: 'Light', unit: 'lux' },
  tb: { warn: 25, crit: 50, label: 'Turbidity', unit: 'NTU' },
  wT: { warn: 28, crit: 35, label: 'Water Temp', unit: '°C' },
};

export function evaluateSensorLevel(key: string, value: number): 'normal' | 'warning' | 'critical' {
  const t = SENSOR_THRESHOLDS[key];
  if (!t || !isFinite(value)) return 'normal';
  const isBelow = key === 'ph' || key === 'dO';
  const exceedsCrit = isBelow ? value < t.crit : value > t.crit;
  const exceedsWarn = isBelow ? value < t.warn : value > t.warn;
  if (exceedsCrit) return 'critical';
  if (exceedsWarn) return 'warning';
  return 'normal';
}

// ==================== Current State Natural-Language Analyzer ====================
// Converts the latest live readings into a plain-language "what is happening now"
// summary (e.g. "the water is salty", "humidity is high") for the AI Engine page.

export interface CurrentStateFact {
  key: string;
  label: string;
  value: number;
  unit: string;
  level: 'normal' | 'warning' | 'critical';
  description: string;
}

export interface CurrentStateReport {
  headline: string;
  status: 'good' | 'fair' | 'poor' | 'critical';
  facts: CurrentStateFact[];
  attentionCount: number;
}

const STATE_DESCRIPTORS: Record<string, (value: number, level: 'warning' | 'critical') => string> = {
  tds: (v, lvl) => lvl === 'critical'
    ? `The water is very salty — TDS at ${v} ppm, above the 1000 ppm critical limit.`
    : `The water is getting salty — TDS at ${v} ppm, above the 500 ppm guideline.`,
  hum: (v, lvl) => lvl === 'critical'
    ? `Humidity is critically high at ${v}% — condensation and mold risk.`
    : `Humidity is high at ${v}% — above the 75% comfort guideline.`,
  tmp: (v, lvl) => lvl === 'critical'
    ? `It is very hot at ${v}°C — heat stress risk.`
    : `It is hot at ${v}°C — above the 32°C comfort guideline.`,
  ph: (v, lvl) => lvl === 'critical'
    ? `Water pH is critically low at ${v} — outside the safe range.`
    : `Water pH is off-target at ${v} — below the 6.5 guideline.`,
  dO: (v, lvl) => lvl === 'critical'
    ? `Dissolved oxygen is critically low at ${v} mg/L — aquatic life at risk.`
    : `Dissolved oxygen is low at ${v} mg/L — below the 6 mg/L guideline.`,
  wT: (v, lvl) => lvl === 'critical'
    ? `Water temperature is critically high at ${v}°C.`
    : `Water temperature is elevated at ${v}°C.`,
  tb: (v, lvl) => lvl === 'critical'
    ? `The water is very turbid at ${v} NTU — sediment load is high.`
    : `The water is turning turbid at ${v} NTU.`,
  pm25: (v, lvl) => lvl === 'critical'
    ? `The air is heavily polluted — PM2.5 at ${v} µg/m³.`
    : `The air is hazy — PM2.5 at ${v} µg/m³, above the WHO limit.`,
  co2: (v, lvl) => lvl === 'critical'
    ? `CO₂ is dangerously high at ${v} ppm — ventilate immediately.`
    : `CO₂ is elevated at ${v} ppm — stuffy indoor air.`,
  co: (v, lvl) => lvl === 'critical'
    ? `Carbon monoxide is at a dangerous level (${v} ppm).`
    : `Carbon monoxide is elevated at ${v} ppm.`,
  no2: (v, lvl) => lvl === 'critical'
    ? `NO₂ is high at ${v} ppb.`
    : `NO₂ is elevated at ${v} ppb.`,
  o3: (v, lvl) => lvl === 'critical'
    ? `Ozone is high at ${v} ppb.`
    : `Ozone is elevated at ${v} ppb.`,
  so2: (v, lvl) => lvl === 'critical'
    ? `SO₂ is high at ${v} ppb.`
    : `SO₂ is elevated at ${v} ppb.`,
  mq: (v, lvl) => lvl === 'critical'
    ? `Gas reading is high at ${v} — possible leak, ventilate.`
    : `Gas reading is elevated at ${v}.`,
  voc: (v, lvl) => lvl === 'critical'
    ? `VOCs are high at ${v} ppb — ventilate immediately.`
    : `VOCs are elevated at ${v} ppb.`,
  nh3: (v, lvl) => lvl === 'critical'
    ? `Ammonia is high at ${v} ppm.`
    : `Ammonia is elevated at ${v} ppm.`,
  sm: (v, lvl) => lvl === 'critical'
    ? `Soil moisture is saturated at ${v}% — drainage needed.`
    : `Soil is very moist at ${v}%.`,
  light: (_v, _lvl) => 'Light level is outside the preferred range.',
};

export function analyzeCurrentState(readings: Record<string, number>): CurrentStateReport {
  const facts: CurrentStateFact[] = [];

  for (const [key, value] of Object.entries(readings)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const t = SENSOR_THRESHOLDS[key];
    if (!t) continue;
    const level = evaluateSensorLevel(key, value);
    if (level === 'normal') continue;

    const describe = STATE_DESCRIPTORS[key];
    facts.push({
      key,
      label: t.label,
      value,
      unit: t.unit,
      level,
      description: describe
        ? describe(value, level === 'critical' ? 'critical' : 'warning')
        : `${t.label} is out of range at ${value}${t.unit}.`,
    });
  }

  const critical = facts.filter(f => f.level === 'critical');
  const warning = facts.filter(f => f.level === 'warning');

  let status: CurrentStateReport['status'] = 'good';
  if (critical.length > 0) status = 'critical';
  else if (warning.length > 0) status = warning.length >= 3 ? 'poor' : 'fair';

  const factsToPhrase = [...critical, ...warning].slice(0, 2);
  let headline: string;
  if (factsToPhrase.length === 0) {
    headline = 'All parameters are within recommended ranges right now.';
  } else if (factsToPhrase.length === 1) {
    headline = factsToPhrase[0].description;
  } else {
    const a = factsToPhrase[0].description;
    const b = factsToPhrase[1].description;
    headline = `${a} And ${b.charAt(0).toLowerCase()}${b.slice(1)}`;
  }

  return {
    headline,
    status,
    facts,
    attentionCount: facts.length,
  };
}

export function checkThreshold(key: string, value: number): AnalysisInsight | null {
  const t = SENSOR_THRESHOLDS[key];
  if (!t) return null;

  const isBelow = key === 'ph' || key === 'dO';
  const exceedsWarn = isBelow ? value < t.warn : value > t.warn;
  const exceedsCrit = isBelow ? value < t.crit : value > t.crit;

  if (!exceedsWarn) return null;

  return {
    id: `threshold-${key}-${Date.now()}`,
    type: 'threshold',
    severity: exceedsCrit ? 'critical' : 'warning',
    title: `${t.label} ${exceedsCrit ? 'Critical' : 'Warning'}`,
    message: `${t.label} is at ${value}${t.unit} ${exceedsCrit ? '— immediate action required' : `— above recommended threshold (${t.warn}${t.unit})`}.`,
    category: 'Environmental Threshold',
    sensor: key,
    value,
    threshold: exceedsCrit ? t.crit : t.warn,
    references: referencesForSensor(key),
    timestamp: Date.now(),
  };
}

function analyzePredictions(analysis: ScientificAnalysis): AnalysisInsight[] {
  const insights: AnalysisInsight[] = [];
  for (const sp of analysis.predictions) {
    const current = sp.prediction;
    if (current.rSquared !== undefined && current.rSquared < 0.3) {
      insights.push({
        id: `pred-lowr2-${sp.sensor}-${Date.now()}`,
        type: 'degradation',
        severity: 'warning',
        title: `Low prediction confidence for ${sp.sensor}`,
        message: `R² = ${current.rSquared.toFixed(2)}. Model reliability is low for ${sp.sensor} — fewer forecast updates recommended.`,
        category: 'Prediction Quality',
        sensor: sp.sensor,
        value: current.rSquared,
        threshold: 0.3,
        references: referencesForDomain('forecast'),
        timestamp: Date.now(),
      });
    }

    const range = current.upperBound - current.lowerBound;
    const relativeRange = current.value > 0 ? range / current.value : range;
    if (relativeRange > 0.5) {
      insights.push({
        id: `pred-wide-${sp.sensor}-${Date.now()}`,
        type: 'trend',
        severity: 'info',
        title: `High uncertainty in ${sp.sensor} forecast`,
        message: `24h prediction range spans ±${(range / 2).toFixed(1)} — consider more frequent sampling.`,
        category: 'Forecast Quality',
        sensor: sp.sensor,
        value: current.value,
        references: referencesForDomain('forecast'),
        timestamp: Date.now(),
      });
    }
  }
  return insights;
}

function analyzeTrends(analysis: ScientificAnalysis): AnalysisInsight[] {
  const insights: AnalysisInsight[] = [];
  for (const st of analysis.trends ?? []) {
    if (st.trend.direction === 'rising') {
      insights.push({
        id: `trend-up-${st.sensor}-${Date.now()}`,
        type: 'trend',
        severity: 'warning',
        title: `${st.sensor} trending upward`,
        message: `${st.sensor} is rising (slope: ${st.trend.slope.toFixed(3)}/hr). Monitor closely if nearing unsafe thresholds.`,
        category: 'Trend Analysis',
        sensor: st.sensor,
        value: st.trend.slope,
        references: [...referencesForDomain('forecast'), ...referencesForSensor(st.sensor)],
        timestamp: Date.now(),
      });
    } else if (st.trend.direction === 'falling') {
      insights.push({
        id: `trend-down-${st.sensor}-${Date.now()}`,
        type: 'trend',
        severity: 'info',
        title: `${st.sensor} trending downward`,
        message: `${st.sensor} is decreasing (slope: ${st.trend.slope.toFixed(3)}/hr). This may indicate improvement — continue monitoring.`,
        category: 'Trend Analysis',
        sensor: st.sensor,
        value: st.trend.slope,
        references: [...referencesForDomain('forecast'), ...referencesForSensor(st.sensor)],
        timestamp: Date.now(),
      });
    }
  }
  return insights;
}

function analyzeAnomalies(analysis: ScientificAnalysis): AnalysisInsight[] {
  const insights: AnalysisInsight[] = [];
  for (const a of analysis.anomalies ?? []) {
    if (a.anomalyCount > 0) {
      insights.push({
        id: `anomaly-${a.sensor}-${Date.now()}`,
        type: 'anomaly',
        severity: a.anomalyCount > 2 ? 'critical' : 'warning',
        title: `Anomal${a.anomalyCount > 1 ? 'ies' : 'y'} detected in ${a.sensor}`,
        message: `${a.anomalyCount} anomalous ${a.anomalyCount === 1 ? 'reading' : 'readings'} in ${a.sensor} — possible sensor fault or environmental event.`,
        category: 'Anomaly Detection',
        sensor: a.sensor,
        value: a.anomalyCount,
        references: [...referencesForDomain('anomaly'), ...referencesForSensor(a.sensor)],
        timestamp: Date.now(),
      });
    }
  }
  return insights;
}

function analyzeCorrelations(analysis: ScientificAnalysis): AnalysisInsight[] {
  const insights: AnalysisInsight[] = [];
  for (const c of analysis.crossCorrelations ?? []) {
    if (Math.abs(c.coefficient) > 0.85) {
      const dir = c.coefficient > 0 ? 'positively' : 'negatively';
      insights.push({
        id: `corr-${c.sensorA}-${c.sensorB}-${Date.now()}`,
        type: 'trend',
        severity: 'info',
        title: `Strong ${dir} correlation`,
        message: `${c.sensorA} and ${c.sensorB} are strongly ${dir} correlated (r=${c.coefficient.toFixed(2)}). Changes in one may predict the other.`,
        category: 'Cross-Sensor Analysis',
        value: c.coefficient,
        references: referencesForDomain('correlation'),
        timestamp: Date.now(),
      });
    }
  }
  return insights;
}

function analyzeConfidence(analysis: ScientificAnalysis): AnalysisInsight[] {
  const insights: AnalysisInsight[] = [];
  const { confidenceFactors } = analysis;
  if (!confidenceFactors || analysis.confidence <= 0) return insights;

  if (confidenceFactors.sensorCoverage < 50) {
    insights.push({
      id: `cov-low-${Date.now()}`,
      type: 'degradation',
      severity: 'warning',
      title: 'Low sensor coverage',
      message: `Only ${confidenceFactors.sensorCoverage}% of expected sensors are reporting. Analysis quality is reduced.`,
      category: 'Data Quality',
      references: [...referencesForDomain('quality'), ...referencesForDomain('sensors')],
      timestamp: Date.now(),
    });
  }

  if (confidenceFactors.dataFreshness < 50) {
    insights.push({
      id: `stale-${Date.now()}`,
      type: 'degradation',
      severity: 'critical',
      title: 'Stale sensor data',
      message: 'Sensor data is stale — analysis may not reflect current conditions. Check device connectivity.',
      category: 'Data Quality',
      references: [...referencesForDomain('quality'), ...referencesForDomain('sensors')],
      timestamp: Date.now(),
    });
  }

  if (confidenceFactors.trendStrength > 80) {
    insights.push({
      id: `trend-strong-${Date.now()}`,
      type: 'trend',
      severity: 'info',
      title: 'Strong trend detected',
      message: 'Environmental conditions show a strong directional trend (R² > 0.8). Forecast reliability is high.',
      category: 'Trend Analysis',
      references: referencesForDomain('forecast'),
      timestamp: Date.now(),
    });
  }

  return insights;
}

function analyzeEHI(ehi: NonNullable<ScientificAnalysis['ehi']>): AnalysisInsight[] {
  const insights: AnalysisInsight[] = [];

  const sorted = [...ehi.subIndices].sort((a, b) => a.value - b.value);
  const lowest = sorted[0];
  if (lowest && lowest.value < 40) {
    insights.push({
      id: `ehi-lowest-${Date.now()}`,
      type: 'degradation',
      severity: 'critical',
      title: `Critical: ${lowest.name}`,
      message: `${lowest.name} is the worst-performing sub-index at ${lowest.value}/100. This is the primary driver of the overall EHI.`,
      category: 'EHI Analysis',
      references: [...referencesForDomain('air'), ...referencesForDomain('water'), ...referencesForDomain('thermal')],
      timestamp: Date.now(),
    });
  }

  if (ehi.aqi !== undefined && ehi.aqi > 150) {
    insights.push({
      id: `aqi-high-${Date.now()}`,
      type: 'threshold',
      severity: 'critical',
      title: 'Unhealthy Air Quality',
      message: `Overall AQI is ${ehi.aqi} — unhealthy conditions. Refer to EPA category for specific health guidance.`,
      category: 'Air Quality',
      value: ehi.aqi,
      threshold: 150,
      references: referencesForDomain('air'),
      timestamp: Date.now(),
    });
  }

  if (ehi.wqi !== undefined && ehi.wqi < 50) {
    insights.push({
      id: `wqi-low-${Date.now()}`,
      type: 'degradation',
      severity: 'critical',
      title: 'Poor Water Quality',
      message: `NSF WQI is ${ehi.wqi}/100 — water quality is poor. Investigate contributing parameters.`,
      category: 'Water Quality',
      value: ehi.wqi,
      threshold: 50,
      references: referencesForDomain('water'),
      timestamp: Date.now(),
    });
  }

  return insights;
}

export function generateAnalysis(
  analysis: ScientificAnalysis,
  readings: Record<string, number>
): AnalysisInsight[] {
  const insights: AnalysisInsight[] = [];

  for (const [key, value] of Object.entries(readings)) {
    const threshold = checkThreshold(key, value);
    if (threshold) insights.push(threshold);
  }

  if (analysis.ehi) {
    insights.push(...analyzeEHI(analysis.ehi));
  }

  insights.push(...analyzePredictions(analysis));
  insights.push(...analyzeConfidence(analysis));
  insights.push(...analyzeTrends(analysis));
  insights.push(...analyzeAnomalies(analysis));
  insights.push(...analyzeCorrelations(analysis));

  if (insights.length === 0) {
    insights.push({
      id: `all-nominal-${Date.now()}`,
      type: 'improvement',
      severity: 'info',
      title: 'All parameters nominal',
      message: 'All sensor readings and derived indices are within acceptable ranges.',
      category: 'System Health',
      references: [...referencesForDomain('air'), ...referencesForDomain('water'), ...referencesForDomain('thermal')],
      timestamp: Date.now(),
    });
  }

  return insights.sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });
}
