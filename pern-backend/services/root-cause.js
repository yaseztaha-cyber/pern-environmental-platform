/**
 * PERN AI Root Cause Analysis Service
 * Analyzes sensor anomalies using LLM + historical data context
 */

const fetch = require('node-fetch');
const logger = require('../utils/logger');
const db = require('../db');
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.AI_RULE_MODEL || 'nvidia/nemotron-3-super-120b-a12b:free';

class RootCauseAnalyzer {
  async analyze({ alertId, sensor, value, threshold, history }) {
    if (!sensor) throw new Error('sensor is required');
    if (!OPENROUTER_API_KEY) {
      return { rootCause: 'AI analysis unavailable — OPENROUTER_API_KEY not configured', factors: [], confidence: 0, recommendations: [] };
    }

    let recentContext = [];
    try {
      const rows = await db.getRecentReadings(50);
      recentContext = rows.filter(r => r.sensors && r.sensors[sensor]).slice(0, 20);
    } catch { /* use empty context */ }

    const systemPrompt = `You are a root cause analysis expert for environmental sensors.
Given a sensor anomaly, analyze potential causes based on:
- Sensor behavior patterns
- Environmental factors
- Equipment issues
- External influences

Return a JSON object:
{
  "rootCause": "primary cause explanation",
  "factors": ["factor1", "factor2", ...],
  "confidence": 0.0-1.0,
  "recommendations": ["action1", "action2"]
}`;

    const userPrompt = `Anomaly detected:
- Sensor: ${sensor}
- Current value: ${value ?? 'N/A'}
- Threshold: ${threshold ?? 'N/A'}
- Recent readings: ${JSON.stringify(recentContext.map(r => r.sensors[sensor]).filter(Boolean).slice(-10))}

Provide root cause analysis.`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    let response;
    try {
      response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.3,
          max_tokens: 500,
        }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(`AI service HTTP ${response.status}: ${errBody.slice(0, 200)}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        return { rootCause: content, factors: [], confidence: 0, recommendations: [] };
      }
    }
    return { rootCause: content || 'Unable to determine root cause', factors: [], confidence: 0, recommendations: [] };
  }
}

module.exports = new RootCauseAnalyzer();
