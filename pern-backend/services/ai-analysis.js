/**
 * PERN AI Analysis Tools
 * Advanced sensor diagnostics, trend analysis, predictive maintenance, anomaly explanation
 */

const fetch = require('node-fetch');
const logger = require('../utils/logger');
const db = require('../db');
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.AI_MODEL || 'nvidia/nemotron-3-super-120b-a12b:free';

async function callLLM(systemPrompt, userPrompt, options = {}) {
  if (!OPENROUTER_API_KEY) {
    return 'AI analysis unavailable — OPENROUTER_API_KEY not configured';
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model || MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: options.temperature || 0.3,
        max_tokens: options.maxTokens || 600,
      }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } finally {
    clearTimeout(timeout);
  }
}

function parseJSON(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch { /* fall through */ }
  }
  return null;
}

class AIAnalysis {
  /**
   * Explain an anomaly in detail
   */
  async explainAnomaly({ sensor, value, previousValue, deviceId, context }) {
    let history = [];
    try {
      const rows = await db.getDeviceReadings(deviceId || 'all', 30);
      history = rows.filter(r => r.sensors?.[sensor]).map(r => ({
        value: r.sensors[sensor],
        time: r.recorded_at
      }));
      history = history.slice(-15);
    } catch { /* empty */ }

    const trend = history.length >= 2
      ? history[history.length - 1].value - history[0].value
      : 0;
    const trendDir = trend > 0 ? 'increasing' : trend < 0 ? 'decreasing' : 'stable';

    const systemPrompt = `You are a sensor anomaly expert for environmental monitoring.
Analyze the anomaly and return a JSON object:
{
  "explanation": "detailed explanation of the anomaly",
  "severity": "low|medium|high|critical",
  "possibleCauses": ["cause1", "cause2"],
  "environmentalFactors": ["factor1", "factor2"],
  "recommendedActions": ["action1", "action2"],
  "confidence": 0.0-1.0
}`;

    const userPrompt = `Sensor: ${sensor}
Current value: ${value}
Previous value: ${previousValue ?? 'N/A'}
Trend: ${trendDir} (${trend > 0 ? '+' : ''}${trend.toFixed(2)})
Device: ${deviceId || 'unknown'}
Recent history: ${JSON.stringify(history.map(h => h.value))}
Context: ${JSON.stringify(context || {})}`;

    const content = await callLLM(systemPrompt, userPrompt, { temperature: 0.2 });
    return parseJSON(content) || { explanation: content, severity: 'medium', possibleCauses: [], recommendedActions: [], confidence: 0.5 };
  }

  /**
   * Analyze sensor trends and provide insights
   */
  async analyzeTrend({ sensor, deviceId, period }) {
    let history = [];
    try {
      const rows = await db.getDeviceReadings(deviceId || 'all', 100);
      history = rows.filter(r => r.sensors?.[sensor]).map(r => r.sensors[sensor]);
    } catch { /* empty */ }

    if (history.length < 3) {
      return { insight: 'Insufficient data for trend analysis', trend: 'unknown', dataPoints: history.length };
    }

    const recent = history.slice(-20);
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const min = Math.min(...recent);
    const max = Math.max(...recent);
    const variance = recent.reduce((s, v) => s + (v - avg) ** 2, 0) / recent.length;
    const stdDev = Math.sqrt(variance);
    const cv = (stdDev / avg) * 100;

    const firstHalf = recent.slice(0, Math.floor(recent.length / 2));
    const secondHalf = recent.slice(Math.floor(recent.length / 2));
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    const direction = secondAvg > firstAvg * 1.05 ? 'increasing' : secondAvg < firstAvg * 0.95 ? 'decreasing' : 'stable';

    const systemPrompt = `You are an environmental data analyst.
Analyze the sensor trend data and provide actionable insights.
Return a JSON object:
{
  "insight": "detailed trend analysis",
  "direction": "increasing|decreasing|stable|cyclic",
  "anomalyDetected": true/false,
  "forecast": "what to expect in the next period",
  "recommendations": ["action1", "action2"]
}`;

    const userPrompt = `Sensor: ${sensor}
Period: last ${recent.length} readings
Direction: ${direction}
Average: ${avg.toFixed(2)}
Min: ${min.toFixed(2)}
Max: ${max.toFixed(2)}
Std Dev: ${stdDev.toFixed(2)}
Coefficient of Variation: ${cv.toFixed(1)}%
Data points: ${recent.length}
Recent values: ${JSON.stringify(recent.slice(-10))}`;

    const content = await callLLM(systemPrompt, userPrompt, { temperature: 0.2 });
    const parsed = parseJSON(content);
    return {
      ...parsed,
      direction,
      statistics: { avg: avg.toFixed(2), min, max, stdDev: stdDev.toFixed(2), cv: cv.toFixed(1), dataPoints: recent.length }
    };
  }

  /**
   * Predictive maintenance analysis
   */
  async predictMaintenance({ deviceId, deviceInfo, sensorHealth }) {
    let readings = [];
    try {
      const rows = await db.getDeviceReadings(deviceId, 50);
      readings = rows.map(r => r.sensors || {});
    } catch { /* empty */ }

    const systemPrompt = `You are a predictive maintenance expert for IoT sensor devices.
Analyze device health and predict maintenance needs.
Return a JSON object:
{
  "overallHealth": "good|fair|poor|critical",
  "healthScore": 0-100,
  "issues": [{"sensor": "name", "issue": "description", "urgency": "low|medium|high"}],
  "maintenanceSchedule": [{"task": "description", "dueIn": "timeframe", "priority": "low|medium|high"}],
  "predictedFailures": [{"component": "name", "probability": 0.0-1.0, "timeframe": "duration"}],
  "recommendations": ["action1", "action2"]
}`;

    const sensorSummary = {};
    if (readings.length > 0) {
      const keys = Object.keys(readings[readings.length - 1]);
      for (const key of keys) {
        const vals = readings.map(r => r[key]).filter(v => v != null);
        if (vals.length > 0) {
          const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
          const stdDev = Math.sqrt(vals.reduce((s, v) => s + (v - avg) ** 2, 0) / vals.length);
          sensorSummary[key] = { avg: avg.toFixed(2), stdDev: stdDev.toFixed(2), count: vals.length };
        }
      }
    }

    const userPrompt = `Device: ${deviceId}
Device info: ${JSON.stringify(deviceInfo || {})}
Sensor health: ${JSON.stringify(sensorHealth || {})}
Sensor statistics (last ${readings.length} readings): ${JSON.stringify(sensorSummary)}`;

    const content = await callLLM(systemPrompt, userPrompt, { temperature: 0.2 });
    return parseJSON(content) || { overallHealth: 'unknown', healthScore: 0, issues: [], recommendations: [], predictedFailures: [] };
  }

  /**
   * Comprehensive sensor diagnostics
   */
  async diagnoseSensors({ deviceId, readings, thresholds }) {
    const systemPrompt = `You are a sensor diagnostics expert.
Analyze sensor readings and thresholds to diagnose issues.
Return a JSON object:
{
  "diagnosis": "overall diagnostic summary",
  "sensorStatus": [{"sensor": "name", "status": "normal|warning|critical", "detail": "explanation"}],
  "correlations": [{"sensors": ["s1", "s2"], "relationship": "description"}],
  "calibrationNeeded": ["sensor1"],
  "recommendations": ["action1", "action2"]
}`;

    const userPrompt = `Device: ${deviceId || 'unknown'}
Current readings: ${JSON.stringify(readings || {})}
Thresholds: ${JSON.stringify(thresholds || {})}`;

    const content = await callLLM(systemPrompt, userPrompt, { temperature: 0.2 });
    return parseJSON(content) || { diagnosis: content, sensorStatus: [], recommendations: [] };
  }
}

module.exports = new AIAnalysis();
