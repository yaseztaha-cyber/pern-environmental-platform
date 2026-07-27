/**
 * PERN Backend - Real PostgreSQL Persistence with Organization Support
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { validateSensorData } = require('../middleware/validator');
const logger = require('../utils/logger');
const rateLimiter = require('../middleware/rate-limiter');
const { sanitizeInput } = require('../middleware/sanitize');

// Apply rate limiting to all persistence routes (40 requests per minute)
router.use(rateLimiter(60000, 40));
router.use(sanitizeInput);

// POST /api/persistence/rules - Save automation rules to DB (with organization)
router.post('/rules', async (req, res) => {
  try {
    const { rules, organizationId } = req.body;
    
    // Save each rule to database with organization context
    for (const rule of rules) {
      await db.saveAutomationRule({
        id: rule.id,
        name: rule.name,
        sensor: rule.sensor,
        operator: rule.operator,
        threshold: rule.threshold,
        action: JSON.stringify(rule.action),
        enabled: rule.enabled,
        organization_id: organizationId || 'default'
      });
    }
    
    logger.info('Automation rules saved', { count: rules.length, organizationId });
    // Audit log (best-effort, non-blocking)
    db.logAuditEvent({
      user_id: req.userId || 'anonymous',
      action: 'rules.batch_save',
      resource_type: 'automation_rule',
      resource_id: organizationId || 'default',
      details: { count: rules.length },
      ip_address: req.ip || '',
    }).catch(() => {});
    res.json({ success: true, count: rules.length });
  } catch (error) {
    logger.error('Error saving rules', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/persistence/rules - Load rules from DB
router.get('/rules', async (req, res) => {
  try {
    const rules = await db.getAutomationRules();
    
    // Parse action JSON
    const parsedRules = rules.map(rule => ({
      ...rule,
      action: typeof rule.action === 'string' ? JSON.parse(rule.action) : rule.action
    }));
    
    res.json(parsedRules.length > 0 ? parsedRules : []);
  } catch (error) {
    logger.error('Error loading rules', { error: error.message });
    res.json([]);
  }
});

// POST /api/persistence/readings - Save sensor reading
router.post('/readings', validateSensorData, async (req, res) => {
  try {
    await db.saveSensorReading(req.body);
    logger.info('Sensor reading saved', { device: req.body.device });
    // Audit log (best-effort, non-blocking)
    db.logAuditEvent({
      user_id: req.userId || 'anonymous',
      action: 'sensor.reading_save',
      resource_type: 'sensor_reading',
      resource_id: req.body.device || 'unknown',
      details: { device: req.body.device },
      ip_address: req.ip || '',
    }).catch(() => {});
    res.json({ success: true });
  } catch (error) {
    logger.error('Error saving reading', { error: error.message });
    res.status(500).json({ success: false });
  }
});

// GET /api/persistence/readings - Get historical readings with optional date range
router.get('/readings', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
    const { from, to, device } = req.query;

    if (from || to) {
      // Date range query from PostgreSQL
      const conditions = [];
      const params = [];
      let paramIdx = 1;

      if (from) {
        conditions.push(`created_at >= $${paramIdx++}`);
        params.push(new Date(from));
      }
      if (to) {
        conditions.push(`created_at <= $${paramIdx++}`);
        params.push(new Date(to));
      }
      if (device) {
        conditions.push(`device_id = $${paramIdx++}`);
        params.push(device);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const result = await db.pool.query(
        `SELECT * FROM sensor_readings ${where} ORDER BY created_at DESC LIMIT $${paramIdx}`,
        [...params, limit]
      );
      res.json(result.rows.map(r => ({ ...r, device: r.device_id || r.device })));
    } else {
      // Simple limit query (backward compatible)
      const readings = await db.getRecentReadings(limit);
      res.json(readings);
    }
  } catch (error) {
    logger.error('Error loading readings', { error: error.message });
    res.json([]);
  }
});

module.exports = router;