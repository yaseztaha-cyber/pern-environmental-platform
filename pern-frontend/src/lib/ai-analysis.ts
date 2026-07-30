import type { ScientificAnalysis } from './scientific-core';

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
  timestamp: number;
}

const SENSOR_THRESHOLDS: Record<string, { warn: number; crit: number; label: string; unit: string }> = {
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

function checkThreshold(key: string, value: number): AnalysisInsight | null {
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

  if (insights.length === 0) {
    insights.push({
      id: `all-nominal-${Date.now()}`,
      type: 'improvement',
      severity: 'info',
      title: 'All parameters nominal',
      message: 'All sensor readings and derived indices are within acceptable ranges.',
      category: 'System Health',
      timestamp: Date.now(),
    });
  }

  return insights.sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });
}
