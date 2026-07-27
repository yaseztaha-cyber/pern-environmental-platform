/**
 * PERN AI Tools Routes
 * Advanced AI capabilities (Rule Generation, Root Cause, Anomaly, Trend, Maintenance, Diagnostics)
 */

const express = require('express');
const router = express.Router();
const ruleGenerator = require('../services/rule-generator');
const rootCauseAnalyzer = require('../services/root-cause');
const aiAnalysis = require('../services/ai-analysis');
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

// AI Analysis Stats
router.get('/stats', (req, res) => {
  res.json({
    tools: ['generate-rule', 'root-cause', 'explain-anomaly', 'analyze-trend', 'predict-maintenance', 'diagnose-sensors'],
    model: process.env.AI_MODEL || 'nvidia/nemotron-3-super-120b-a12b:free',
    status: process.env.OPENROUTER_API_KEY ? 'configured' : 'unconfigured'
  });
});

module.exports = router;
