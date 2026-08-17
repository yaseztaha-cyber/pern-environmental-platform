/**
 * PERN AI Analysis Tools (v2)
 * Enriched, evidence-grounded sensor analysis.
 *
 * Every method fuses three layers:
 *   1. Deterministic statistical evidence (analysis-engine) — always available.
 *   2. LLM narrative & interpretation (llm-client) — grounded on that evidence.
 *   3. Curated citations (ai-references) — standards/guidelines per parameter.
 *
 * Results are cached (ai-cache) so repeated analysis is instant, and every
 * method degrades gracefully to a full deterministic result when the LLM is
 * unavailable, so the endpoints never fail.
 */

const db = require('../db');
const logger = require('../utils/logger');
const { callJSON } = require('./llm-client');
const { withCache, cacheKey } = require('./ai-cache');
const {
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
} = require('./analysis-engine');
const {
  referencesForSensor,
  referencesForDomain,
} = require('./ai-references');

async function loadHistory({ deviceId, sensor, limit }) {
  try {
    const rows = deviceId
      ? await db.getDeviceReadings(deviceId, limit)
      : await db.getRecentReadings(limit);
    if (!sensor) return { rows, values: [] };
    const values = rows
      .map(r => r.sensors?.[sensor])
      .filter(v => typeof v === 'number' && Number.isFinite(v));
    return { rows, values };
  } catch {
    return { rows: [], values: [] };
  }
}

function now() {
  return new Date().toISOString();
}

/* =====================================================================
 * 1) Anomaly Explanation
 * ===================================================================== */

async function explainAnomalyImpl({ sensor, value, previousValue, deviceId, context }) {
  const { values } = await loadHistory({ deviceId, sensor, limit: 60 });
  const history = values.slice(-20);

  const stats = computeSeriesStats(history);
  const z = zScoreAnomaly(value, history);
  const deviationPct = previousValue && isFinite(previousValue) && previousValue !== 0
    ? round(((value - previousValue) / Math.abs(previousValue)) * 100)
    : null;

  const trendDirection = stats?.direction || 'unknown';
  const evidence = {
    value: isFinite(value) ? round(value, 3) : value,
    previousValue: isFinite(previousValue) ? round(previousValue, 3) : previousValue,
    deviationPct,
    seriesStats: stats,
    zScore: z,
    dataPoints: history.length,
    threshold: SENSOR_THRESHOLDS[sensor] || null,
  };

  const riskLevel = deriveRiskLevel({
    worstStatus: assessSensorStatus(sensor, value)?.level || 'normal',
    trendDirection: trendDirection === 'increasing' ? 'increasing' : 'stable',
    volatility: stats?.volatility || 'low',
  });

  const references = [...referencesForSensor(sensor), ...referencesForDomain('anomaly')];

  const systemPrompt = `You are a sensor anomaly expert for environmental monitoring.
Return STRICT JSON only — no prose, no markdown:
{
  "explanation": "detailed explanation of the anomaly",
  "severity": "low|medium|high|critical",
  "possibleCauses": ["cause1", "cause2"],
  "environmentalFactors": ["factor1", "factor2"],
  "recommendedActions": [{"title": "action", "description": "why/how", "priority": "low|medium|high"}],
  "confidence": 0.0-1.0
}`;

  const userPrompt = `Sensor: ${sensor}
Current value: ${evidence.value}
Previous value: ${evidence.previousValue ?? 'N/A'}
Deviation from previous: ${deviationPct !== null ? deviationPct + '%' : 'N/A'}
Recent stats: ${JSON.stringify(stats)}
Z-score vs recent history: ${z ? `${z.zScore} (anomaly: ${z.isAnomaly})` : 'N/A'}
Device: ${deviceId || 'unknown'}
Context: ${JSON.stringify(context || {})}
Ground your explanation in the numbers above and cite only plausible causes.`;

  const { data, meta } = await callJSON({ system: systemPrompt, user: userPrompt, temperature: 0.2, maxTokens: 700 });

  if (!data || meta.error) {
    logger.info(`[AI] Anomaly explain fallback (${meta.error || 'empty'}): ${sensor}`);
    return {
      explanation: buildAnomalyFallback(sensor, value, evidence, riskLevel),
      severity: riskLevel === 'critical' ? 'critical' : riskLevel === 'high' ? 'high' : riskLevel === 'medium' ? 'medium' : 'low',
      possibleCauses: ['Local pollution or emission event', 'Sensor drift or calibration shift', 'Environmental condition change (weather, wind, temperature)'],
      environmentalFactors: stats?.direction === 'increasing' ? ['Rising trend in recent readings'] : ['Stable recent readings — event is likely sudden'],
      recommendedActions: buildFallbackActions(references, sensor, riskLevel),
      confidence: z ? round(Math.min(0.9, 0.6 + Math.min(z.zScore, 6) * 0.05), 2) : 0.6,
    };
  }

  return { ...data };
}

function buildAnomalyFallback(sensor, value, evidence, riskLevel) {
  const label = SENSOR_THRESHOLDS[sensor]?.label || sensor;
  const parts = [`${label} shows a significant deviation from recent baseline`];
  if (evidence.deviationPct !== null) parts.push(`(${evidence.deviationPct}% vs previous reading)`);
  if (evidence.zScore?.isAnomaly) parts.push(`(z=${evidence.zScore.zScore}, ${evidence.zScore.mean} ± ${evidence.zScore.stdDev})`);
  return `${parts.join(' ')}. Recommended: ${riskLevel === 'critical' ? 'immediate investigation' : 'verify sensor calibration and cross-check nearby sources'}.`;
}

function buildFallbackActions(references, sensor, riskLevel) {
  const actions = [];
  if (riskLevel === 'critical' || riskLevel === 'high') {
    actions.push({ title: `Verify ${sensor} sensor calibration immediately`, description: 'Cross-check against a reference monitor or nearby peer sensors.', priority: 'high' });
    actions.push({ title: 'Increase sampling frequency', description: 'Collect more data points to characterise the event.', priority: 'medium' });
  } else {
    actions.push({ title: `Re-check ${sensor} in the next cycle`, description: 'Confirm whether the deviation persists before acting.', priority: 'medium' });
    actions.push({ title: 'Cross-check nearby sources', description: 'Correlate with spatial neighbours to rule out a local event.', priority: 'low' });
  }
  actions.push({ title: 'Review applicable guidelines', description: references[0]?.title ? `See ${references[0].title} (${references[0].year}).` : 'Review the governing environmental standard.', priority: 'low' });
  return actions;
}

async function explainAnomaly(input) {
  const key = cacheKey(['explain-anomaly', input]);
  return withCache(key, 120000, () => explainAnomalyImpl(input));
}

/* =====================================================================
 * 2) Trend Analysis
 * ===================================================================== */

async function analyzeTrendImpl({ sensor, deviceId, period }) {
  const { values } = await loadHistory({ deviceId, sensor, limit: 200 });
  if (values.length < 3) {
    return {
      insight: 'Insufficient data for trend analysis',
      direction: 'unknown',
      riskLevel: 'low',
      dataPoints: values.length,
      statistics: computeSeriesStats(values),
      recommendations: [],
      references: referencesForSensor(sensor),
      generatedAt: now(),
    };
  }

  const recent = values.slice(-40);
  const stats = computeSeriesStats(recent);
  const fit = linearTrend(recent);
  const anomaly = zScoreAnomaly(stats.latest, recent.slice(0, -1));

  const riskLevel = deriveRiskLevel({
    worstStatus: assessSensorStatus(sensor, stats.latest)?.level || 'normal',
    trendDirection: fit?.direction === 'rising' ? 'increasing' : 'stable',
    volatility: stats?.volatility || 'low',
  });

  const evidence = { fit, anomaly, volatility: stats.volatility, riskLevel, seriesStats: stats };
  const references = [...referencesForSensor(sensor), ...referencesForDomain('forecast')];

  const systemPrompt = `You are an environmental data analyst.
Return STRICT JSON only — no prose, no markdown:
{
  "insight": "detailed trend analysis grounded in the statistics",
  "direction": "increasing|decreasing|stable|cyclic",
  "anomalyDetected": true/false,
  "forecast": {"value": 0, "lowerBound": 0, "upperBound": 0, "confidence": 0.0-1.0},
  "keyFindings": ["finding1", "finding2"],
  "recommendations": [{"title": "action", "description": "why/how", "priority": "low|medium|high"}],
  "confidence": 0.0-1.0
}`;

  const userPrompt = `Sensor: ${sensor}
Period: last ${recent.length} readings
Direction (deterministic): ${stats.direction}
Linear fit: slope=${fit?.slope}, R²=${fit?.r2}, trend=${fit?.direction}
Latest z-score: ${anomaly ? `${anomaly.zScore} (anomaly: ${anomaly.isAnomaly})` : 'N/A'}
Statistics: ${JSON.stringify(stats)}
Recent values: ${JSON.stringify(recent.slice(-10))}
Set forecast bounds from the observed volatility (stdDev=${stats.stdDev}).`;

  const { data, meta } = await callJSON({ system: systemPrompt, user: userPrompt, temperature: 0.2, maxTokens: 700 });

  if (!data || meta.error) {
    const delta = stats.latest - stats.first;
    const span = Math.max(stats.stdDev, Math.abs(delta), stats.avg * 0.05);
    return {
      insight: `${SENSOR_THRESHOLDS[sensor]?.label || sensor} is ${stats.direction} over the last ${recent.length} readings (avg ${stats.avg}, latest ${stats.latest}). Volatility is ${stats.volatility}.`,
      direction: stats.direction,
      dataPoints: recent.length,
      riskLevel,
      anomalyDetected: anomaly?.isAnomaly || false,
      forecast: {
        value: round(stats.latest + (fit?.slope || 0) * 6),
        lowerBound: round(stats.latest - span),
        upperBound: round(stats.latest + span),
        confidence: fit?.r2 != null ? round(0.4 + fit.r2 * 0.5, 2) : 0.5,
      },
      keyFindings: [
        `Average ${stats.avg}, ranging ${stats.min}–${stats.max}`,
        anomaly?.isAnomaly ? `Latest value deviates ${anomaly.zScore}σ from the baseline` : 'No significant anomaly in the latest reading',
      ],
      recommendations: [],
      confidence: 0.6,
    };
  }

  return { ...data };
}

async function analyzeTrend(input) {
  const key = cacheKey(['analyze-trend', input]);
  return withCache(key, 60000, () => analyzeTrendImpl(input));
}

/* =====================================================================
 * 3) Predictive Maintenance
 * ===================================================================== */

async function predictMaintenanceImpl({ deviceId, deviceInfo, sensorHealth }) {
  let readings = [];
  try {
    const rows = await db.getDeviceReadings(deviceId, 50);
    readings = rows.map(r => r.sensors || {});
  } catch { /* empty */ }

  const sensorSummary = {};
  const assessments = [];
  if (readings.length > 0) {
    const keys = Object.keys(readings[readings.length - 1]);
    for (const key of keys) {
      const vals = readings.map(r => r[key]).filter(v => typeof v === 'number' && isFinite(v));
      if (vals.length > 0) {
        const stats = computeSeriesStats(vals);
        sensorSummary[key] = stats;
        const latest = vals[vals.length - 1];
        const assessment = assessSensorStatus(key, latest);
        if (assessment) assessments.push({ ...assessment, count: vals.length, volatility: stats.volatility });
      }
    }
  }

  const healthScore = computeHealthScore(assessments);
  const riskLevel = deriveRiskLevel({
    worstStatus: assessments.some(a => a.level === 'critical') ? 'critical' : assessments.some(a => a.level === 'warning') ? 'warning' : 'normal',
    trendDirection: 'stable',
    volatility: assessments.some(a => a.volatility === 'high') ? 'high' : 'low',
  });

  const references = referencesForDomain('sensors');
  const evidence = { sensorSummary, dataQuality: { readingsProcessed: readings.length, sensorsProfiled: Object.keys(sensorSummary).length }, healthScore };

  const systemPrompt = `You are a predictive maintenance expert for IoT sensor devices.
Return STRICT JSON only — no prose, no markdown:
{
  "overallHealth": "good|fair|poor|critical",
  "issues": [{"sensor": "name", "issue": "description", "urgency": "low|medium|high"}],
  "maintenanceSchedule": [{"task": "description", "dueIn": "timeframe", "priority": "low|medium|high"}],
  "predictedFailures": [{"component": "name", "probability": 0.0-1.0, "timeframe": "duration"}],
  "recommendations": [{"title": "action", "description": "why/how", "priority": "low|medium|high"}]
}`;

  const userPrompt = `Device: ${deviceId}
Device info: ${JSON.stringify(deviceInfo || {})}
Sensor health: ${JSON.stringify(sensorHealth || {})}
Deterministic health score: ${healthScore ?? 'N/A'} (0-100)
Detected critical/warning sensors: ${JSON.stringify(assessments.filter(a => a.level !== 'normal').map(a => a.sensor))}
Sensor statistics (last ${readings.length} readings): ${JSON.stringify(sensorSummary)}
Keep healthScore consistent with the deterministic value.`;

  const { data, meta } = await callJSON({ system: systemPrompt, user: userPrompt, temperature: 0.2, maxTokens: 800 });

  if (!data || meta.error) {
    const issues = assessments
      .filter(a => a.level !== 'normal')
      .map(a => ({ sensor: a.sensor, issue: a.detail, urgency: a.level === 'critical' ? 'high' : 'medium' }));
    const schedule = assessments.some(a => a.volatility === 'high')
      ? [{ task: 'Recalibrate unstable sensors', dueIn: 'within 1 week', priority: 'medium' }]
      : [];
    if (readings.length < 10) schedule.push({ task: 'Increase data capture to stabilise diagnostics', dueIn: 'immediately', priority: 'low' });
    return {
      overallHealth: healthScore >= 80 ? 'good' : healthScore >= 60 ? 'fair' : healthScore >= 40 ? 'poor' : 'critical',
      issues,
      maintenanceSchedule: schedule,
      predictedFailures: assessments.some(a => a.volatility === 'high')
        ? assessments.filter(a => a.volatility === 'high').map(a => ({ component: a.sensor, probability: round(0.4 + (a.cv || 30) / 100, 2), timeframe: '1–4 weeks' }))
        : [],
      recommendations: [],
    };
  }

  return { ...data };
}

async function predictMaintenance(input) {
  const key = cacheKey(['predict-maintenance', input]);
  return withCache(key, 300000, () => predictMaintenanceImpl(input));
}

/* =====================================================================
 * 4) Sensor Diagnostics
 * ===================================================================== */

async function diagnoseSensorsImpl({ deviceId, readings, thresholds }) {
  const currentReadings = readings?.sensorData ?? readings ?? {};
  const thresholdTable = thresholds || SENSOR_THRESHOLDS;

  const assessments = Object.entries(currentReadings)
    .map(([sensor, value]) => assessSensorStatus(sensor, value, thresholdTable))
    .filter(Boolean);

  const healthScore = computeHealthScore(assessments);
  const worst = assessments.some(a => a.level === 'critical') ? 'critical'
    : assessments.some(a => a.level === 'warning') ? 'warning' : 'normal';
  const riskLevel = deriveRiskLevel({ worstStatus: worst });

  const affected = assessments.filter(a => a.level !== 'normal').map(a => a.sensor);
  const references = affected.length > 0
    ? affected.flatMap(s => referencesForSensor(s))
    : referencesForDomain('sensors');

  const systemPrompt = `You are a sensor diagnostics expert.
Return STRICT JSON only — no prose, no markdown:
{
  "diagnosis": "overall diagnostic summary",
  "sensorStatus": [{"sensor": "name", "status": "normal|warning|critical", "detail": "explanation"}],
  "correlations": [{"sensors": ["s1", "s2"], "relationship": "description"}],
  "calibrationNeeded": ["sensor1"],
  "recommendations": [{"title": "action", "description": "why/how", "priority": "low|medium|high", "category": "category"}],
  "confidence": 0.0-1.0
}`;

  const userPrompt = `Device: ${deviceId || 'unknown'}
Current readings: ${JSON.stringify(currentReadings)}
Thresholds: ${JSON.stringify(thresholdTable)}
Deterministic risk level: ${riskLevel}
Deterministic health score: ${healthScore}
Deterministic assessments: ${JSON.stringify(assessments)}
Keep sensorStatus consistent with the deterministic assessments.`;

  const { data, meta } = await callJSON({ system: systemPrompt, user: userPrompt, temperature: 0.2, maxTokens: 800 });

  if (!data || meta.error) {
    return {
      diagnosis: assessments.length === 0
        ? 'No numeric readings provided for diagnosis.'
        : `${assessments.length} parameter(s) assessed. ${affected.length > 0 ? `Attention needed on: ${affected.join(', ')}.` : 'All parameters within acceptable ranges.'}`,
      sensorStatus: assessments.map(a => ({ sensor: a.sensor, status: a.status, detail: a.detail })),
      correlations: [],
      calibrationNeeded: affected.filter(s => ['pm25', 'pm10', 'co2', 'mq'].includes(s)),
      recommendations: [],
      confidence: 0.7,
    };
  }

  return { ...data };
}

async function diagnoseSensors(input) {
  const key = cacheKey(['diagnose-sensors', input]);
  return withCache(key, 30000, () => diagnoseSensorsImpl(input));
}

/* =====================================================================
 * Public helpers — merged envelope for all analysis methods
 * ===================================================================== */

async function enrich(method, result) {
  return {
    ...result,
    riskLevel: result.riskLevel || result.severity || 'medium',
    references: result.references || referencesForDomain('air'),
    healthScore: result.healthScore ?? computeHealthScoreFromResult(result),
    generatedAt: result.generatedAt || now(),
    model: result.model || null,
    cached: Boolean(result.cached),
  };
}

function computeHealthScoreFromResult(result) {
  if (Array.isArray(result.sensorStatus)) {
    return computeHealthScore(result.sensorStatus.map(s => ({ level: s.status === 'critical' ? 'critical' : s.status === 'warning' ? 'warning' : 'normal' })));
  }
  if (typeof result.healthScore === 'number') return result.healthScore;
  if (result.severity === 'critical') return 30;
  if (result.severity === 'high') return 50;
  if (result.severity === 'medium') return 70;
  return 90;
}

module.exports = new (class AIAnalysis {
  async explainAnomaly(input) { return enrich('explain-anomaly', await explainAnomaly(input)); }
  async analyzeTrend(input) { return enrich('analyze-trend', await analyzeTrend(input)); }
  async predictMaintenance(input) { return enrich('predict-maintenance', await predictMaintenance(input)); }
  async diagnoseSensors(input) { return enrich('diagnose-sensors', await diagnoseSensors(input)); }
})();
