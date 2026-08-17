/**
 * Notifications Routes — notification preferences and sending
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const dispatcher = require('../services/notification-dispatcher');
const { requireRole, requireOwnership } = require('../middleware/rbac');
const rateLimiter = require('../middleware/rate-limiter');
const { sendError } = require('../middleware/error-handler');
const limiter = rateLimiter(60000, 30);

router.get('/preferences/:userId', async (req, res) => {
  try {
    const prefs = await db.getNotificationPreferences(req.params.userId);
    res.json(prefs);
  } catch { res.json([]); }
});

router.post('/preferences', limiter, async (req, res) => {
  try {
    await db.saveNotificationPreference(req.body);
    res.json({ success: true });
  } catch (err) { sendError(res, err); }
});

router.delete('/preferences/:userId/:channel', limiter, requireRole('admin', 'manager'), requireOwnership(req => req.params.userId), async (req, res) => {
  try {
    await db.deleteNotificationPreference(req.params.userId, req.params.channel);
    res.json({ success: true });
  } catch (err) { sendError(res, err); }
});

router.post('/send', limiter, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const results = await dispatcher.dispatch(req.body);
    res.json({ success: true, results });
  } catch (err) { sendError(res, err); }
});

router.get('/status', (req, res) => {
  res.json({ channels: dispatcher.getChannelStatus(), clients: dispatcher.getWsClientCount() });
});

router.get('/log', (req, res) => {
  res.json({ entries: dispatcher.getDispatchLog(parseInt(req.query.limit) || 50) });
});

module.exports = router;
