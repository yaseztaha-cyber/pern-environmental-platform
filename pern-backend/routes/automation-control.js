/**
 * Automation Control Routes
 * Allows dynamic control of the Automation Engine
 */

const express = require('express');
const router = express.Router();
const automationEngine = require('../services/automation-engine');
const logger = require('../utils/logger');
const { sendError } = require('../middleware/error-handler');

// Reload rules from database
router.post('/reload-rules', async (req, res) => {
  try {
    await automationEngine.loadRulesFromDatabase();
    logger.info('Automation rules reloaded via API');
    res.json({ 
      success: true, 
      message: 'Rules reloaded successfully',
      activeRules: automationEngine.rules.length 
    });
  } catch (error) {
    logger.error('Failed to reload rules', { error: error.message });
    sendError(res, error);
  }
});

// Get current engine status
router.get('/status', (req, res) => {
  res.json({
    isRunning: automationEngine.isRunning,
    activeRules: automationEngine.rules.length,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;