/**
 * PERN AI Tools Routes
 * Advanced AI capabilities (Rule Generation, Root Cause, Anomaly, Trend, Maintenance, Diagnostics)
 */

const express = require('express');
const router = express.Router();
const ruleGenerator = require('../services/rule-generator');
const rootCauseAnalyzer = require('../services/root-cause');
const aiAnalysis = require('../services/ai-analysis');
const aiBriefing = require('../services/ai-briefing');
const aiCopilot = require('../services/ai-copilot');
const aiForecastClient = require('../services/ai-forecast-client');
const llmClient = require('../services/llm-client');
const aiCache = require('../services/ai-cache');
const rateLimiter = require('../middleware/rate-limiter');
const logger = require('../utils/logger');

router.use(rateLimiter(60000, 15));

// Natural Language → Automation Rule
router.post('/generate-rule', async (req, res) => {
  try {
    const { text, context } = req.body;
    if (!text || typeof text !== 'string' || text.length < 10) {
      return res.status(400).json({ error: 'Text must be at least 10 characters' });
    }
    logger.info('Generating automation rule from text', { textLength: text.length });
    const result = await ruleGenerator.generateRuleFromText(text, context || {});
    res.json(result);
  } catch (error) {
    logger.error('Rule generation error', { error: error.message });
    res.status(500).json({ error: 'Failed to generate rule' });
  }
});

// Root Cause Analysis
router.post('/root-cause', async (req, res) => {
  try {
    const result = await rootCauseAnalyzer.analyze(req.body || {});
    res.json(result);
  } catch (error) {
    logger.error('[AI] Root cause analysis error', { error: error.message });
    res.status(500).json({ error: 'Root cause analysis failed' });
  }
});

// Anomaly Explanation
router.post('/explain-anomaly', async (req, res) => {
  try {
    const result = await aiAnalysis.explainAnomaly(req.body || {});
    res.json(result);
  } catch (error) {
    logger.error('[AI] Anomaly explanation error', { error: error.message });
    res.status(500).json({ error: 'Anomaly explanation failed' });
  }
});

// Trend Analysis
router.post('/analyze-trend', async (req, res) => {
  try {
    const result = await aiAnalysis.analyzeTrend(req.body || {});
    res.json(result);
  } catch (error) {
    logger.error('[AI] Trend analysis error', { error: error.message });
    res.status(500).json({ error: 'Trend analysis failed' });
  }
});

// Calibrated multi-horizon temperature forecast (PERN ForecastEngine).
// Proxies POST /v1/forecast on the pern-ai microservice; 503s when it is
// unavailable so the frontend degrades to the heuristic forecast.
router.post('/forecast', async (req, res) => {
  try {
    const result = await aiForecastClient.getForecast(req.body || {});
    if (!result) {
      return res.status(503).json({ available: false, detail: 'PERN forecast engine unavailable' });
    }
    res.json({ available: true, ...result });
  } catch (error) {
    logger.error('[AI] PERN forecast error', { error: error.message });
    res.status(500).json({ error: 'PERN forecast failed' });
  }
});

// Predictive Maintenance
router.post('/predict-maintenance', async (req, res) => {
  try {
    const result = await aiAnalysis.predictMaintenance(req.body || {});
    res.json(result);
  } catch (error) {
    logger.error('[AI] Predictive maintenance error', { error: error.message });
    res.status(500).json({ error: 'Predictive maintenance failed' });
  }
});

// Sensor Diagnostics
router.post('/diagnose-sensors', async (req, res) => {
  try {
    const result = await aiAnalysis.diagnoseSensors(req.body || {});
    res.json(result);
  } catch (error) {
    logger.error('[AI] Sensor diagnostics error', { error: error.message });
    res.status(500).json({ error: 'Sensor diagnostics failed' });
  }
});

// Unified AI Health Briefing
router.post('/health-briefing', async (req, res) => {
  try {
    const result = await aiBriefing.getBriefing(req.body || {});
    res.json(result);
  } catch (error) {
    logger.error('[AI] Health briefing error', { error: error.message });
    res.status(500).json({ error: 'Health briefing failed' });
  }
});

// AI Copilot — tool-grounded Q&A over live platform data
router.post('/copilot', async (req, res) => {
  try {
    const result = await aiCopilot.runCopilot(req.body || {});
    res.json(result);
  } catch (error) {
    logger.error('[AI] Copilot error', { error: error.message });
    res.status(500).json({ error: 'Copilot request failed' });
  }
});

// AI Copilot — SSE streaming variant (deterministic answer streams instantly)
router.post('/copilot/stream', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const send = (type, payload) => res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`);
  send('start', { question: req.body?.question || '' });

  const onChunk = (text) => send('chunk', { content: text });

  try {
    const result = await aiCopilot.streamCopilot({ ...(req.body || {}), onChunk });
    send('done', { result });
  } catch (error) {
    logger.error('[AI] Copilot stream error', { error: error.message });
    send('error', { error: error.message || 'Copilot stream failed' });
  } finally {
    res.end();
  }
});

// AI Analysis Stats
router.get('/stats', (req, res) => {
  const usage = llmClient.getUsage();
  res.json({
    tools: ['generate-rule', 'root-cause', 'explain-anomaly', 'analyze-trend', 'predict-maintenance', 'diagnose-sensors', 'health-briefing', 'copilot', 'forecast'],
    model: process.env.AI_MODEL || 'nvidia/nemotron-3-super-120b-a12b:free',
    status: process.env.OPENROUTER_API_KEY ? 'configured' : 'unconfigured',
    configured: llmClient.configured,
    usage,
    cache: aiCache.getCacheStats(),
  });
});

module.exports = router;
