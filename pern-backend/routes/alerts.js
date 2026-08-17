/**
 * Alerts Routes — alert rules + alert history CRUD
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const rateLimiter = require('../middleware/rate-limiter');
const { requireRole } = require('../middleware/rbac');
const { sendError } = require('../middleware/error-handler');
const limiter = rateLimiter(60000, 40);

router.get('/rules', async (req, res) => {
  try {
    const rules = await db.getAlertRules(req.orgId);
    res.json(rules);
  } catch { res.json([]); }
});

router.post('/rules', limiter, async (req, res) => {
  const rule = {
    id: req.body.id || 'ar-' + Date.now(),
    name: req.body.name,
    sensor: req.body.sensor,
    operator: req.body.operator,
    threshold: req.body.threshold,
    severity: req.body.severity || 'warning',
    notification_channels: req.body.notification_channels || ['ntfy'],
    enabled: req.body.enabled !== false,
    organization_id: req.orgId || 'default',
  };
  try {
    await db.saveAlertRule(rule);
    res.json({ success: true, rule });
  } catch (err) { sendError(res, err); }
});

router.delete('/rules/:id', limiter, requireRole('admin', 'manager'), async (req, res) => {
  try {
    await db.deleteAlertRule(req.params.id);
    res.json({ success: true });
  } catch (err) { sendError(res, err); }
});

router.get('/history', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const history = await db.getAlertHistory({ limit, severity: req.query.severity, deviceId: req.query.device });
    res.json(history);
  } catch { res.json([]); }
});

router.post('/history/:id/acknowledge', limiter, async (req, res) => {
  try {
    await db.acknowledgeAlertHistory(req.params.id, req.userId || 'unknown');
    res.json({ success: true });
  } catch (err) { sendError(res, err); }
});

router.get('/stats', async (req, res) => {
  try {
    const total = await db.getAlertHistory({ limit: 10000 });
    const unacknowledged = total.filter(a => !a.acknowledged).length;
    const bySeverity = {};
    total.forEach(a => { bySeverity[a.severity] = (bySeverity[a.severity] || 0) + 1; });
    res.json({ total: total.length, unacknowledged, bySeverity });
  } catch { res.json({ total: 0, unacknowledged: 0, bySeverity: {} }); }
});

module.exports = router;
