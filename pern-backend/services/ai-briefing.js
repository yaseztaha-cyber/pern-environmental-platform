/**
 * PERN AI Health Briefing
 * A single unified snapshot of environmental health for the frontend.
 * Combines: latest readings, per-sensor threshold status, health score,
 * anomaly detection, regulatory compliance, data confidence, and a
 * deterministic (or LLM-narrated) summary with citations.
 */

const db = require('../db');
const logger = require('../utils/logger');
const { callJSON } = require('./llm-client');
const { withCache, cacheKey } = require('./ai-cache');
const complianceEngine = require('./compliance-engine');
const trustEngine = require('./trust-engine');
const {
  SENSOR_THRESHOLDS,
  assessSensorStatus,
  computeSeriesStats,
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

const COMPLIANCE_KEYS = new Set(['pm25', 'pm10', 'no2', 'so2', 'o3', 'co']);

async function getBriefingImpl({ deviceId, limit = 60, lat, lng, countryCode }) {
  const rows = deviceId
    ? await db.getDeviceReadings(deviceId, limit)
    : await db.getRecentReadings(limit);
  const rowsSafe = Array.isArray(rows) ? rows : [];

  const current = latestReadings(rowsSafe);
  const matrix = buildReadingMatrix(rowsSafe);
  const assessments = Object.entries(current)
    .map(([sensor, value]) => assessSensorStatus(sensor, value))
    .filter(Boolean);

  const healthScore = computeHealthScore(assessments);
  const worstStatus = assessments.some(a => a.level === 'critical') ? 'critical'
    : assessments.some(a => a.level === 'warning') ? 'warning' : 'normal';
  const risingKeys = Object.entries(matrix)
    .filter(([, v]) => v.length >= 8)
    .map(([sensor, v]) => ({ sensor, stats: computeSeriesStats(v) }))
    .filter(({ stats }) => stats.direction === 'increasing' && (stats.volatility === 'high' || stats.volatility === 'moderate'))
    .map(({ sensor, stats }) => ({ sensor, trend: stats.direction, volatility: stats.volatility, avg: stats.avg, latest: stats.latest }));

  const riskLevel = deriveRiskLevel({ worstStatus, trendDirection: risingKeys.length ? 'increasing' : 'stable', volatility: risingKeys.length ? 'high' : 'low' });

  const anomalies = [];
  for (const [sensor, values] of Object.entries(matrix)) {
    if (values.length >= 10) {
      const window = values.slice(0, -1);
      const z = zScoreAnomaly(values[values.length - 1], window);
      if (z?.isAnomaly) {
        anomalies.push({ sensor, zScore: z.zScore, mean: z.mean, stdDev: z.stdDev, value: values[values.length - 1] });
      }
    }
  }

  const cc = (countryCode || complianceEngine.detectCountry(lat, lng)) || 'US';
  const complianceInput = {};
  for (const [k, v] of Object.entries(current)) {
    if (COMPLIANCE_KEYS.has(k) && typeof v === 'number') complianceInput[k] = v;
  }
  const compliance = complianceEngine.checkCompliance(cc, complianceInput);

  const confidence = trustEngine.computeConfidence('physical', { parameters: Object.fromEntries(Object.entries(current).map(([k, v]) => [k, { value: v }])) }, []);

  const affected = assessments.filter(a => a.level !== 'normal').map(a => a.sensor);
  const references = (affected.length > 0
    ? affected.flatMap(s => referencesForSensor(s))
    : [...referencesForSensor('pm25'), ...referencesForSensor('co2')]
  ).slice(0, 6);

  const evidence = {
    healthScore,
    riskLevel,
    worstStatus,
    assessmentCount: assessments.length,
    anomalies: anomalies.length,
    risingSensors: risingKeys,
    compliance,
    confidence: confidence.overall,
    dataQuality: { readings: rowsSafe.length, sensors: assessments.length },
  };

  const systemPrompt = `You are an environmental health briefing officer.
Summarise this monitoring snapshot for a non-technical audience.
Return STRICT JSON only — no prose, no markdown:
{
  "summary": "2-3 sentence plain-language briefing",
  "headline": "short headline",
  "status": "good|fair|poor|critical",
  "highlights": ["positive finding"],
  "concerns": ["concern with sensor name and value"],
  "recommendedActions": [{"title": "action", "description": "why/how", "priority": "low|medium|high"}],
  "confidence": 0.0-1.0
}`;

  const userPrompt = `Latest readings: ${JSON.stringify(current)}
Per-sensor status: ${JSON.stringify(assessments)}
Deterministic health score: ${healthScore} (0-100)
Deterministic risk level: ${riskLevel}
Anomalies: ${JSON.stringify(anomalies)}
Compliance (${cc}): ${JSON.stringify(compliance)}
Sensor trends rising: ${JSON.stringify(risingKeys)}
Base every statement on these numbers. If no readings, say so.`;

  const { data, meta } = await callJSON({ system: systemPrompt, user: userPrompt, temperature: 0.3, maxTokens: 700 });

  const hasData = rowsSafe.length > 0;
  const llmNarrative = !hasData ? null : (!data || meta.error ? null : data);
  const summary = llmNarrative?.summary || buildDeterministicSummary({ assessments, anomalies, compliance, riskLevel, rowsSafe });
  const headline = llmNarrative?.headline || (!hasData
    ? 'Waiting for monitoring data'
    : healthScore >= 80 ? 'Your environment looks healthy' : healthScore >= 60 ? 'Minor attention needed' : healthScore >= 40 ? 'Conditions warrant attention' : 'Critical conditions detected');
  const status = llmNarrative?.status || (!hasData ? 'fair' : healthScore >= 80 ? 'good' : healthScore >= 60 ? 'fair' : healthScore >= 40 ? 'poor' : 'critical');

  return {
    generatedAt: new Date().toISOString(),
    status,
    headline,
    summary,
    healthScore,
    riskLevel,
    assessments,
    anomalies,
    risingSensors: risingKeys,
    compliance,
    confidence: {
      overall: confidence.overall,
      source: 'physical',
      note: anomalies.length > 0 ? 'Some readings deviate from recent baselines.' : 'Readings consistent with recent baselines.',
    },
    highlights: llmNarrative?.highlights || buildHighlights({ assessments, anomalies, compliance, rowsSafe }),
    concerns: llmNarrative?.concerns || buildConcerns({ assessments, anomalies, compliance }),
    recommendedActions: llmNarrative?.recommendedActions || buildBriefingActions({ assessments, anomalies, compliance, riskLevel }),
    dataQuality: { readings: rowsSafe.length, sensors: assessments.length },
    references,
    model: meta?.model || null,
    deterministic: !llmNarrative,
  };
}

function buildDeterministicSummary({ assessments, anomalies, compliance, riskLevel, rowsSafe }) {
  if (rowsSafe.length === 0) return 'No monitoring data is available yet. Connect a device to start receiving environmental health briefings.';
  const affected = assessments.filter(a => a.level !== 'normal');
  let text = `Across ${assessments.length} monitored parameters the environment scores ${riskLevel}.`;
  if (affected.length > 0) {
    text += ` Attention is needed on ${affected.map(a => a.label).join(', ')}.`;
  } else {
    text += ' All parameters are within their recommended ranges.';
  }
  if (anomalies.length > 0) {
    text += ` ${anomalies.length} recent reading${anomalies.length > 1 ? 's' : ''} deviated from the local baseline (${anomalies.map(a => a.sensor).join(', ')}).`;
  }
  if (compliance.exceedances?.length > 0) {
    text += ` Regulatory exceedance detected: ${compliance.exceedances.map(e => `${e.parameter} at ${e.exceeded_by}% over the ${compliance.authority} limit`).join('; ')}.`;
  }
  return text;
}

function buildHighlights({ assessments, compliance, rowsSafe }) {
  if (rowsSafe.length === 0) return [];
  const ok = assessments.filter(a => a.level === 'normal').map(a => `${a.label} within range (${a.value}${a.unit})`);
  const highlights = ok.slice(0, 2);
  if (compliance.compliant) highlights.push('No regulatory exceedances at the current location');
  return highlights;
}

function buildConcerns({ assessments, anomalies, compliance }) {
  const concerns = [];
  for (const a of assessments.filter(x => x.level !== 'normal')) {
    concerns.push(`${a.label} is ${a.level} (${a.value}${a.unit}; warning threshold ${a.threshold.warn}${a.unit})`);
  }
  for (const an of anomalies.slice(0, 2)) {
    concerns.push(`${an.sensor} deviates ${an.zScore}σ from its recent baseline (${an.value})`);
  }
  for (const e of (compliance.exceedances || []).slice(0, 2)) {
    concerns.push(`${e.parameter} exceeds the ${compliance.authority} limit by ${e.exceeded_by}%`);
  }
  return concerns.slice(0, 5);
}

function buildBriefingActions({ assessments, anomalies, compliance, riskLevel }) {
  const actions = [];
  const critical = assessments.filter(a => a.level === 'critical');
  const warnings = assessments.filter(a => a.level === 'warning');
  if (critical.length > 0) {
    actions.push({ title: `Investigate critical ${critical[0].label} reading`, description: `${critical[0].value}${critical[0].unit} is beyond the critical threshold. Verify the sensor and local conditions now.`, priority: 'high' });
  }
  if (anomalies.length > 0) {
    actions.push({ title: 'Verify anomalous sensor readings', description: `Cross-check ${anomalies.map(a => a.sensor).join(', ')} against peer devices or a reference monitor.`, priority: 'high' });
  }
  if (compliance.exceedances?.length > 0) {
    actions.push({ title: 'Document regulatory exceedance', description: `Log the ${compliance.exceedances.map(e => e.parameter).join(', ')} exceedance against the ${compliance.authority} framework.`, priority: 'medium' });
  }
  if (warnings.length > 0) {
    actions.push({ title: 'Monitor warning-level parameters', description: `Watch ${warnings.map(a => a.label).join(', ')}; they are near their warning thresholds.`, priority: 'medium' });
  }
  if (actions.length === 0 && riskLevel === 'low') {
    actions.push({ title: 'Maintain current monitoring cadence', description: 'No action required — all parameters are within range.', priority: 'low' });
  }
  return actions;
}

async function getBriefing(input = {}) {
  const key = cacheKey(['health-briefing', input]);
  return withCache(key, 60000, () => getBriefingImpl(input));
}

module.exports = { getBriefing };
